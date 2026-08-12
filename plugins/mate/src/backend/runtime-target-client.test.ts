import { describe, expect, test } from "bun:test";
import {
  BatchProjectTargetAdmissionResponseSchema,
  DevelopmentTargetListResponseSchema,
} from "@bb-mate/runtime/supervision";
import { createServer } from "node:http";

import {
  createRuntimeTargetClient,
  type RuntimeJsonRequest,
} from "./runtime-target-client.ts";

const response = DevelopmentTargetListResponseSchema.parse({
  schemaVersion: 1,
  state: "ready" as const,
  targets: [
    {
      schemaVersion: 1,
      kind: "development-target",
      id: "t".repeat(32),
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      displayName: "Example",
      displayPath: "example",
      sourceKind: "workspace-discovered",
      manifest: {
        pluginId: "example",
        packageName: "bb-plugin-example",
        version: "1.0.0",
        hasServer: true,
        hasApp: true,
      },
      native: { status: "absent", observedAt: 1 },
      capabilities: { fixture: false, harness: false, live: false },
    },
  ],
});

const batchResponse = BatchProjectTargetAdmissionResponseSchema.parse({
  schemaVersion: 2,
  state: "ready",
  projects: [
    {
      projectKey: "p".repeat(32),
      state: "ready",
      targets: response.targets,
    },
  ],
});

describe("private runtime target client", () => {
  test("sends the exact runtime admission content type with no Origin", async () => {
    let captured:
      | { headers: Record<string, string | string[] | undefined>; body: string }
      | undefined;
    const server = createServer((request, responseWriter) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        captured = {
          headers: request.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        };
        responseWriter.writeHead(200, {
          "content-type": "application/json;charset=utf-8",
        });
        responseWriter.end(JSON.stringify(batchResponse));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error();
      const client = createRuntimeTargetClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        token: Buffer.alloc(32, 5),
      });
      await client.admitProjects({
        inventoryState: "complete",
        projects: [
          { projectKey: "p".repeat(32), sourcePath: "/Users/test/plugin" },
        ],
      });
      expect(captured).toEqual({
        headers: expect.objectContaining({
          authorization: `Bearer ${Buffer.alloc(32, 5).toString("base64url")}`,
          "content-length": "144",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          schemaVersion: 2,
          inventoryState: "complete",
          projects: [
            {
              projectKey: "p".repeat(32),
              sourcePath: "/Users/test/plugin",
            },
          ],
        }),
      });
      expect(captured?.headers.origin).toBeUndefined();
      client.dispose();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("uses only the fixed v2 loopback routes and bearer header", async () => {
    const requests: RuntimeJsonRequest[] = [];
    const token = Buffer.alloc(32, 7);
    const client = createRuntimeTargetClient({
      baseUrl: "http://127.0.0.1:41721",
      token,
      request: async (request) => {
        requests.push(request);
        return request.method === "GET" ? response : batchResponse;
      },
    });

    await expect(client.list()).resolves.toEqual(response);
    await expect(
      client.admitProjects({
        inventoryState: "complete",
        projects: [
          { projectKey: "p".repeat(32), sourcePath: "/Users/test/plugin" },
        ],
      }),
    ).resolves.toEqual(batchResponse);
    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:41721/v2/targets",
        method: "GET",
        authorization: `Bearer ${token.toString("base64url")}`,
        body: undefined,
        timeoutMs: 2_000,
      },
      {
        url: "http://127.0.0.1:41721/v2/targets/admit",
        method: "POST",
        authorization: `Bearer ${token.toString("base64url")}`,
        body: {
          schemaVersion: 2,
          inventoryState: "complete",
          projects: [
            {
              projectKey: "p".repeat(32),
              sourcePath: "/Users/test/plugin",
            },
          ],
        },
        timeoutMs: 30_000,
      },
    ]);
    client.dispose();
  });

  test("accepts the largest schema-bounded batch response", async () => {
    const boundedText = "\u0001";
    const targets = Array.from({ length: 128 }, (_, index) => ({
      ...response.targets[0]!,
      id: index.toString(36).padStart(32, "0"),
      displayName: boundedText.repeat(128),
      displayPath: boundedText.repeat(256),
      manifest: {
        ...response.targets[0]!.manifest,
        packageName: boundedText.repeat(214),
        version: boundedText.repeat(64),
      },
    }));
    const largest = BatchProjectTargetAdmissionResponseSchema.parse({
      schemaVersion: 2,
      state: "ready",
      projects: [{ projectKey: "p".repeat(32), state: "ready", targets }],
    });
    expect(Buffer.byteLength(JSON.stringify(largest))).toBeGreaterThan(
      256 * 1024,
    );
    const server = createServer((_request, responseWriter) => {
      responseWriter.writeHead(200, {
        "content-type": "application/json;charset=utf-8",
      });
      responseWriter.end(JSON.stringify(largest));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error();
      const client = createRuntimeTargetClient({
        baseUrl: `http://127.0.0.1:${address.port}`,
        token: Buffer.alloc(32, 6),
      });
      await expect(
        client.admitProjects({
          inventoryState: "complete",
          projects: [
            { projectKey: "p".repeat(32), sourcePath: "/Users/test/plugin" },
          ],
        }),
      ).resolves.toEqual(largest);
      client.dispose();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("rejects unknown response fields and erases its retained token", async () => {
    const token = Buffer.alloc(32, 9);
    const retained = Buffer.from(token);
    const client = createRuntimeTargetClient({
      baseUrl: "http://127.0.0.1:41721",
      token: retained,
      request: async () => ({ ...response, baseUrl: "http://private" }),
    });
    await expect(client.list()).rejects.toThrow(
      "Runtime target request failed",
    );
    client.dispose();
    expect(retained.equals(Buffer.alloc(32))).toBe(true);
  });

  test("rejects a batch response that does not match the requested project keys", async () => {
    const client = createRuntimeTargetClient({
      baseUrl: "http://127.0.0.1:41721",
      token: Buffer.alloc(32, 4),
      request: async () => ({
        ...batchResponse,
        projects: [
          {
            ...batchResponse.projects[0]!,
            projectKey: "q".repeat(32),
          },
        ],
      }),
    });
    await expect(
      client.admitProjects({
        inventoryState: "complete",
        projects: [
          { projectKey: "p".repeat(32), sourcePath: "/Users/test/plugin" },
        ],
      }),
    ).rejects.toThrow("Runtime target request failed");
    client.dispose();
  });
});
