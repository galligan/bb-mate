import { describe, expect, test } from "bun:test";

import { createRequestContext } from "../auth/context.ts";
import { createRuntimeHttpHandler } from "./handler.test-support.ts";

const URL = "http://127.0.0.1:41721";
const HOST = "127.0.0.1:41721";
const context = createRequestContext({
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  kind: "plugin-adapter",
  scopes: ["runtime:read"],
  revoked: false,
  bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
});

function request(
  path: string,
  init: RequestInit = {},
  host: string | null = HOST,
): Request {
  const headers = new Headers(init.headers);
  if (host !== null) headers.set("host", host);
  if (!headers.has("origin")) headers.set("origin", URL);
  return new Request(`${URL}${path}`, { ...init, headers });
}

describe("runtime loopback HTTP transport policy", () => {
  test("rejects every Host value except the exact assigned authority", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const hostileHosts = [
      null,
      "localhost:41721",
      "[::1]:41721",
      "0.0.0.0:41721",
      "192.168.1.40:41721",
      "user@127.0.0.1:41721",
      "127.0.0.1:41722",
      "127.0.0.1:41721, evil.example",
      "127.0.0.1:41721, 127.0.0.1:41721",
    ];
    for (const host of hostileHosts) {
      const response = await handle(request("/healthz", {}, host));
      expect(response.status, host ?? "missing Host").toBe(400);
      expect(await response.json()).toEqual({
        error: { code: "invalid_request", message: "Invalid request" },
      });
    }
  });

  test("rejects requests whose URL is not the exact managed origin", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const hostileUrls = [
      "http://localhost:41721/healthz",
      "http://[::1]:41721/healthz",
      "http://0.0.0.0:41721/healthz",
      "http://192.168.1.40:41721/healthz",
      "https://127.0.0.1:41721/healthz",
      "http://127.0.0.1:41722/healthz",
      "http://user@127.0.0.1:41721/healthz",
    ];
    for (const url of hostileUrls) {
      const response = await handle(
        new Request(url, { headers: { host: HOST } }),
      );
      expect(response.status, url).toBe(400);
    }
  });

  test("accepts only the exact managed Origin and never wildcard CORS", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const allowed = await handle(
      request("/healthz", { headers: { origin: URL } }),
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(URL);
    expect(allowed.headers.get("vary")).toBe("Origin");

    for (const origin of [
      "null",
      "http://localhost:41721",
      "http://[::1]:41721",
      "http://0.0.0.0:41721",
      "http://192.168.1.40:41721",
      "https://127.0.0.1:41721",
      "http://user@127.0.0.1:41721",
      `${URL}, https://evil.example`,
      "not an origin",
    ]) {
      const response = await handle(
        request("/healthz", { headers: { origin } }),
      );
      expect(response.status, origin).toBe(403);
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
    }
  });

  test("rejects hostile Host and Origin before valid authentication", async () => {
    let authenticationCalls = 0;
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        return context;
      },
    });
    const hostileHost = await handle(
      request("/v2/capabilities", {}, "localhost:41721"),
    );
    const hostileOrigin = await handle(
      request("/v2/capabilities", {
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(hostileHost.status).toBe(400);
    expect(hostileOrigin.status).toBe(403);
    expect(authenticationCalls).toBe(0);
  });

  test("rejects bodies beyond 256 KiB whether declared or streamed", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const declared = await handle(
      request("/healthz", {
        method: "POST",
        headers: { "content-length": "262145" },
        body: "{}",
      }),
    );
    const streamed = await handle(
      request("/healthz", {
        method: "POST",
        body: "x".repeat(262_145),
      }),
    );

    expect(declared.status).toBe(413);
    expect(streamed.status).toBe(413);
    expect(await streamed.json()).toEqual({
      error: { code: "invalid_request", message: "Invalid request" },
    });
  });

  test("rejects every Content-Encoding, including identity", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    for (const encoding of ["gzip", "br", "identity", "gzip, br"]) {
      const response = await handle(
        request("/healthz", {
          method: "POST",
          headers: { "content-encoding": encoding },
          body: "{}",
        }),
      );
      expect(response.status, encoding).toBe(415);
    }
  });

  test("validates Content-Length and accepts the exact 256 KiB boundary", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    for (const contentLength of ["-1", "+1", "1.5", "1, 1", "1e2"]) {
      const response = await handle(
        request("/healthz", {
          method: "POST",
          headers: { "content-length": contentLength },
          body: "x",
        }),
      );
      expect(response.status, contentLength).toBe(400);
    }

    const boundary = await handle(
      request("/healthz", {
        method: "POST",
        headers: { "content-length": "262144" },
        body: "x".repeat(262_144),
      }),
    );
    expect(boundary.status).toBe(405);
  });

  test("turns request-stream failures into a redacted invalid request", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("private transport diagnostic");
      },
    });
    const response = await handle(
      request("/healthz", {
        method: "POST",
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_request", message: "Invalid request" },
    });
  });

  test("requires a concrete assigned TCP port", () => {
    for (const port of [0, -1, 65_536, 41_721.5, Number.NaN]) {
      expect(() => createRuntimeHttpHandler({ port }), String(port)).toThrow(
        "Runtime HTTP port must be an integer from 1 through 65535",
      );
    }
  });
});
