import { describe, expect, test } from "bun:test";
import { DevelopmentTargetListResponseSchema } from "@bb-mate/runtime/supervision";
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
        responseWriter.end(
          JSON.stringify({
            schemaVersion: 1,
            state: "ready",
            targets: [],
          }),
        );
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
      await client.admit("/Users/test/plugin");
      expect(captured).toEqual({
        headers: expect.objectContaining({
          authorization: `Bearer ${Buffer.alloc(32, 5).toString("base64url")}`,
          "content-length": "53",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          schemaVersion: 1,
          sourcePath: "/Users/test/plugin",
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
        return response;
      },
    });

    await expect(client.list()).resolves.toEqual(response);
    await expect(client.admit("/Users/test/plugin")).resolves.toEqual(response);
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
        body: { schemaVersion: 1, sourcePath: "/Users/test/plugin" },
        timeoutMs: 10_000,
      },
    ]);
    client.dispose();
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
});
