import { describe, expect, test } from "bun:test";

import { createRequestContext } from "../auth/context.ts";
import type { PrincipalKind } from "../auth/principals.ts";
import { createRuntimeHttpHandler } from "./handler.ts";

const principalId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const bbContextId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function runtimeReader(kind: PrincipalKind) {
  return createRequestContext({
    id: principalId,
    kind,
    scopes: ["runtime:read"],
    revoked: false,
    bbContextId,
  });
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("host", "127.0.0.1:41721");
  return new Request(`http://127.0.0.1:41721${path}`, { ...init, headers });
}

describe("runtime loopback HTTP routes", () => {
  test("serves the constant health document without authentication", async () => {
    let authenticationCalls = 0;
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        throw new Error("health must not authenticate");
      },
    });
    const response = await handle(
      request("/healthz", {
        headers: { authorization: "Bearer ignored-on-health" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(authenticationCalls).toBe(0);
  });

  test("serves HEAD health with the GET headers and no response body", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const response = await handle(request("/healthz", { method: "HEAD" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json;charset=utf-8",
    );
    expect(await response.text()).toBe("");
  });

  test("rejects preflight and mutation methods on both read-only routes", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    for (const path of ["/healthz", "/v1/capabilities"]) {
      for (const method of ["OPTIONS", "POST", "PUT", "PATCH", "DELETE"]) {
        const response = await handle(
          request(path, {
            method,
            headers: { origin: "http://127.0.0.1:41721" },
          }),
        );
        expect(response.status, `${method} ${path}`).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD");
        expect(response.headers.has("access-control-allow-methods")).toBe(
          false,
        );
      }
    }
  });

  test("returns a typed, redacted error for unknown routes", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const response = await handle(
      request("/secrets/private-key?token=do-not-reflect", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Resource not found" },
    });
  });

  test("serves the honest capabilities document to an authorized principal", async () => {
    const context = runtimeReader("browser-session");
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => context,
    });
    const response = await handle(
      request("/v1/capabilities", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      apiVersion: 1,
      capabilities: {
        browserBootstrap: false,
        targets: false,
        sessions: false,
        annotations: false,
        captures: false,
        comparisons: false,
        pluginBriefs: false,
        reviews: false,
        events: false,
        artifacts: false,
        mcp: false,
      },
    });
  });

  test("returns redacted errors for missing or insufficient authentication", async () => {
    const unauthenticated = createRuntimeHttpHandler({ port: 41_721 });
    const missing = await unauthenticated(
      request("/v1/capabilities", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      error: { code: "unauthenticated", message: "Authentication required" },
    });

    const insufficientContext = createRequestContext({
      id: principalId,
      kind: "plugin-adapter",
      scopes: ["targets:read"],
      revoked: false,
      bbContextId,
    });
    const insufficient = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => insufficientContext,
    });
    const denied = await insufficient(
      request("/v1/capabilities", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: { code: "forbidden", message: "Operation not permitted" },
    });
  });

  test("allows absent Origin only for authenticated non-browser adapters", async () => {
    const browser = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => runtimeReader("browser-session"),
    });
    const browserResponse = await browser(request("/v1/capabilities"));
    expect(browserResponse.status).toBe(403);

    for (const kind of [
      "plugin-adapter",
      "mcp-client",
      "supervisor",
    ] as const) {
      const adapter = createRuntimeHttpHandler({
        port: 41_721,
        authenticate: async () => runtimeReader(kind),
      });
      expect((await adapter(request("/v1/capabilities"))).status, kind).toBe(
        200,
      );
    }
  });

  test("authenticates absent-Origin callers before unknown-route disclosure", async () => {
    const unknown = () => request("/v1/not-a-route");
    const unauthenticated = createRuntimeHttpHandler({ port: 41_721 });
    const missing = await unauthenticated(unknown());
    expect(missing.status).toBe(401);

    const browser = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => runtimeReader("browser-session"),
    });
    const browserDenied = await browser(unknown());
    expect(browserDenied.status).toBe(403);

    const adapter = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => runtimeReader("plugin-adapter"),
    });
    const absent = await adapter(unknown());
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({
      error: { code: "not_found", message: "Resource not found" },
    });
  });

  test("authenticates absent-Origin callers before method disclosure", async () => {
    const preflight = () => request("/v1/not-a-route", { method: "OPTIONS" });
    const unauthenticated = createRuntimeHttpHandler({ port: 41_721 });
    expect((await unauthenticated(preflight())).status).toBe(401);

    const browser = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => runtimeReader("browser-session"),
    });
    expect((await browser(preflight())).status).toBe(403);

    const adapter = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => runtimeReader("plugin-adapter"),
    });
    const disclosed = await adapter(preflight());
    expect(disclosed.status).toBe(405);
    expect(disclosed.headers.get("allow")).toBe("GET, HEAD");
  });

  test("authenticates HEAD capabilities and returns no response body", async () => {
    let authenticationCalls = 0;
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        return runtimeReader("plugin-adapter");
      },
    });
    const response = await handle(
      request("/v1/capabilities", { method: "HEAD" }),
    );

    expect(response.status).toBe(200);
    expect(authenticationCalls).toBe(1);
    expect(response.headers.get("content-type")).toBe(
      "application/json;charset=utf-8",
    );
    expect(await response.text()).toBe("");
  });

  test("keeps typed authentication failures bodyless for HEAD", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const response = await handle(
      request("/v1/capabilities", { method: "HEAD" }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(
      "application/json;charset=utf-8",
    );
    expect(await response.text()).toBe("");
  });

  test("does not broaden either constant route with query parameters", async () => {
    let authenticationCalls = 0;
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        return runtimeReader("plugin-adapter");
      },
    });
    for (const path of ["/healthz?verbose=true", "/v1/capabilities?all=true"]) {
      expect(
        (
          await handle(
            request(path, {
              headers: { origin: "http://127.0.0.1:41721" },
            }),
          )
        ).status,
        path,
      ).toBe(404);
    }
    expect(authenticationCalls).toBe(0);
  });

  test("redacts unexpected authentication failures", async () => {
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        throw new Error("Bearer secret-and-private-path");
      },
    });
    const response = await handle(
      request("/v1/capabilities", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal", message: "Internal error" },
    });
  });
});
