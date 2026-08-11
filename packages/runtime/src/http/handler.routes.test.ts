import { describe, expect, test } from "bun:test";

import { createRequestContext } from "../auth/context.ts";
import { createRuntimeHttpHandler } from "./handler.test-support.ts";

const principal = createRequestContext({
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  kind: "plugin-adapter",
  scopes: ["runtime:read"],
  revoked: false,
  bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
});

describe("runtime HTTP route inventory", () => {
  test("keeps every deferred V1 surface absent", async () => {
    let authenticationCalls = 0;
    const handle = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        authenticationCalls += 1;
        return principal;
      },
    });
    const absentRoutes = [
      ["GET", "/"],
      ["GET", "/index.html"],
      ["GET", "/assets/app.js"],
      ["POST", "/bootstrap"],
      ["POST", "/v1/bootstrap"],
      ["POST", "/v1/browser-credentials/mint"],
      ["POST", "/v1/browser-credentials/redeem"],
      ["GET", "/v1/targets"],
      ["POST", "/v1/targets/from-path"],
      ["GET", "/v1/targets/target-id/path"],
      ["GET", "/v1/filesystem"],
      ["POST", "/v1/objects"],
      ["PATCH", "/v1/objects/object-id"],
      ["POST", "/v1/sessions"],
      ["GET", "/v1/sessions/session-id"],
      ["PATCH", "/v1/sessions/session-id/state"],
      ["GET", "/v1/sessions/session-id/annotations"],
      ["POST", "/v1/sessions/session-id/annotations"],
      ["GET", "/v1/annotations/annotation-id"],
      ["POST", "/v1/sessions/session-id/captures"],
      ["GET", "/v1/captures/capture-id"],
      ["POST", "/v1/comparisons"],
      ["GET", "/v1/comparisons/comparison-id"],
      ["POST", "/v1/briefs"],
      ["GET", "/v1/briefs/brief-id"],
      ["GET", "/v1/events"],
      ["GET", "/v1/events/sse"],
      ["GET", "/mcp"],
      ["POST", "/mcp"],
      ["POST", "/v1/mcp"],
      ["POST", "/v1/artifacts"],
      ["GET", "/v1/artifacts/artifact-id"],
      ["POST", "/v1/url-fetch"],
      ["POST", "/v1/proxy"],
      ["POST", "/v1/shell"],
      ["POST", "/v1/eval"],
      ["GET", "/v1/secrets"],
      ["POST", "/v1/secrets"],
      ["POST", "/v1/retention"],
      ["DELETE", "/v1/delete-all"],
      ["POST", "/v1/import"],
      ["GET", "/v1/export"],
      ["DELETE", "/v1/data"],
      ["POST", "/v1/supervisor/start"],
      ["POST", "/v1/tools/build"],
      ["POST", "/v1/native/install"],
      ["GET", "/v1/remote"],
    ] as const;

    for (const [method, path] of absentRoutes) {
      const response = await handle(
        new Request(`http://127.0.0.1:41721${path}`, {
          method,
          headers: {
            host: "127.0.0.1:41721",
            origin: "http://127.0.0.1:41721",
            ...(method === "POST" || method === "PATCH"
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(method === "POST" || method === "PATCH" ? { body: "{}" } : {}),
        }),
      );
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Resource not found" },
      });
    }
    expect(authenticationCalls).toBe(0);
  });

  test("does not expose WebSocket or event-stream transports", async () => {
    const handle = createRuntimeHttpHandler({ port: 41_721 });
    const websocket = await handle(
      new Request("http://127.0.0.1:41721/v1/events", {
        headers: {
          host: "127.0.0.1:41721",
          origin: "http://127.0.0.1:41721",
          connection: "Upgrade",
          upgrade: "websocket",
        },
      }),
    );
    const eventStream = await handle(
      new Request("http://127.0.0.1:41721/v1/events", {
        headers: {
          host: "127.0.0.1:41721",
          origin: "http://127.0.0.1:41721",
          accept: "text/event-stream",
        },
      }),
    );

    expect(websocket.status).toBe(404);
    expect(eventStream.status).toBe(404);
  });
});
