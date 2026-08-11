import { describe, expect, test } from "bun:test";

import { createRequestContext } from "../auth/context.ts";
import { createRuntimeHttpHandler } from "./handler.test-support.ts";

const context = createRequestContext({
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  kind: "plugin-adapter",
  scopes: ["runtime:read"],
  revoked: false,
  bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
});

function capabilitiesRequest(): Request {
  return new Request("http://127.0.0.1:41721/v2/capabilities", {
    headers: {
      host: "127.0.0.1:41721",
      origin: "http://127.0.0.1:41721",
    },
  });
}

describe("runtime HTTP concurrency", () => {
  test("admits at most 32 concurrent requests by default", async () => {
    let authenticationCalls = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reachedCapacity!: () => void;
    const atCapacity = new Promise<void>((resolve) => {
      reachedCapacity = resolve;
    });
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        if (authenticationCalls === 32) reachedCapacity();
        if (authenticationCalls <= 32) await held;
        return context;
      },
    });

    const admitted = Array.from({ length: 32 }, () =>
      handle(capabilitiesRequest()),
    );
    await atCapacity;

    const excess = await handle(capabilitiesRequest());
    expect(excess.status).toBe(503);
    expect(await excess.json()).toEqual({
      error: { code: "conflict", message: "Resource conflict" },
    });
    expect(excess.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(excess.headers.get("cache-control")).toBe("no-store");
    expect(excess.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:41721",
    );
    expect(authenticationCalls).toBe(32);

    const hostileHost = await handle(
      new Request("http://127.0.0.1:41721/v2/capabilities", {
        headers: { host: "localhost:41721" },
      }),
    );
    expect(hostileHost.status).toBe(400);

    release();
    expect((await Promise.all(admitted)).map(({ status }) => status)).toEqual(
      Array.from({ length: 32 }, () => 200),
    );
  });
});
