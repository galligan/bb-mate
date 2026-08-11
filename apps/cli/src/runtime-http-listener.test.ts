import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import {
  createOpaqueId,
  createRequestContext,
  createRuntimeHttpHandler,
} from "@bb-mate/runtime";
import { RUNTIME_CAPABILITIES } from "@bb-mate/runtime/supervision";
import { listenRuntimeHttp } from "./runtime-http-listener.ts";

async function rawRequest(
  port: number,
  target: string,
  init: {
    readonly method?: string;
    readonly host?: string;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
) {
  const socket = connect({ host: "127.0.0.1", port });
  const chunks: Buffer[] = [];
  socket.on("data", (chunk) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
  );
  const closed = new Promise<void>((resolve, reject) => {
    socket.once("close", () => resolve());
    socket.once("error", reject);
  });
  const headers = Object.entries(init.headers ?? {})
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .join("");
  socket.once("connect", () =>
    socket.write(
      `${init.method ?? "GET"} ${target} HTTP/1.1\r\nHost: ${init.host ?? `127.0.0.1:${port}`}\r\n${headers}Connection: close\r\n\r\n`,
    ),
  );
  await closed;
  return Buffer.concat(chunks).toString("utf8");
}

describe("runtime HTTP listener", () => {
  test("rejects encoded-dot route aliases before Request normalization", async () => {
    const token = Buffer.alloc(32, 7).toString("base64url");
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const listener = await listenRuntimeHttp((request) => handler!(request));
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: RUNTIME_CAPABILITIES,
      },
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? createRequestContext({
              id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              kind: "supervisor",
              scopes: ["runtime:read"],
              revoked: false,
              bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            })
          : undefined,
    });

    try {
      const health = await rawRequest(listener.port, "/%2e%2e/healthz");
      const capabilities = await rawRequest(
        listener.port,
        "/v1/%2e%2e/v1/capabilities",
        { headers: { Authorization: `Bearer ${token}` } },
      );

      for (const response of [health, capabilities]) {
        expect(response).toStartWith("HTTP/1.1 400");
        expect(response.toLowerCase()).toContain("cache-control: no-store");
        expect(response.toLowerCase()).toContain(
          "x-content-type-options: nosniff",
        );
      }
    } finally {
      await listener.stop();
    }
  });

  test("rejects non-origin-form targets without broadening canonical routes", async () => {
    const listener = await listenRuntimeHttp(async () =>
      Response.json({ reached: true }),
    );
    try {
      for (const target of [
        `http://127.0.0.1:${listener.port}/healthz`,
        "//evil.example/healthz",
        "/\\evil.example/healthz",
        "/healthz#fragment",
      ]) {
        const response = await rawRequest(listener.port, target);
        expect(response, target).toStartWith("HTTP/1.1 400");
        expect(response, target).not.toContain('"reached":true');
      }
      const asterisk = await rawRequest(listener.port, "*", {
        method: "OPTIONS",
      });
      const authority = await rawRequest(
        listener.port,
        `127.0.0.1:${listener.port}`,
        { method: "CONNECT" },
      );
      expect(asterisk).toStartWith("HTTP/1.1 400");
      expect(asterisk).not.toContain('"reached":true');
      expect(authority).toBe("");

      const canonical = await rawRequest(listener.port, "/healthz");
      expect(canonical).toStartWith("HTTP/1.1 200");
      expect(canonical).toContain('"reached":true');
    } finally {
      await listener.stop();
    }
  });

  test("preserves runtime Host, Origin, auth, headers, and body policies", async () => {
    const token = Buffer.alloc(32, 7).toString("base64url");
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const listener = await listenRuntimeHttp((request) => handler!(request));
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: RUNTIME_CAPABILITIES,
      },
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? createRequestContext({
              id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              kind: "supervisor",
              scopes: ["runtime:read"],
              revoked: false,
              bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            })
          : undefined,
    });

    try {
      const health = await rawRequest(listener.port, "/healthz", {
        headers: { Origin: `http://127.0.0.1:${listener.port}` },
      });
      const capabilities = await rawRequest(listener.port, "/v1/capabilities", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hostileHost = await rawRequest(listener.port, "/healthz", {
        host: "evil.example",
      });
      const hostileOrigin = await rawRequest(listener.port, "/healthz", {
        headers: { Origin: "http://evil.example" },
      });
      const oversized = await rawRequest(listener.port, "/v1/capabilities", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Length": String(256 * 1024 + 1),
        },
      });

      expect(health).toStartWith("HTTP/1.1 200");
      expect(capabilities).toStartWith("HTTP/1.1 200");
      expect(capabilities).toContain('"runtimeVersion":"0.1.0-alpha.2"');
      expect(hostileHost).toStartWith("HTTP/1.1 400");
      expect(hostileOrigin).toStartWith("HTTP/1.1 403");
      expect(oversized).toStartWith("HTTP/1.1 413");
      for (const response of [
        health,
        capabilities,
        hostileHost,
        hostileOrigin,
        oversized,
      ]) {
        expect(response.toLowerCase()).toContain("cache-control: no-store");
        expect(response.toLowerCase()).toContain(
          "x-content-type-options: nosniff",
        );
        expect(response).not.toContain(token);
      }
    } finally {
      await listener.stop();
    }
  });
});
