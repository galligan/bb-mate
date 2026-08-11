import { describe, expect, test } from "bun:test";

import { createRequestContext } from "../auth/context.ts";
import type { PrincipalKind } from "../auth/principals.ts";
import {
  BbContextIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
} from "../contracts/ids.ts";
import { RUNTIME_CAPABILITIES } from "../supervision/protocol.ts";
import type {
  BatchProjectTargetAdmissionRequest,
  BatchProjectTargetAdmissionResponse,
  DevelopmentTargetListResponse,
} from "../supervision/targets.ts";
import {
  createRuntimeHttpHandler,
  type RuntimeTargetController,
} from "./handler.ts";

const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));
const instanceId = OpaqueIdSchema.parse("i".repeat(32));
const projectKey = OpaqueIdSchema.parse("a".repeat(32));
const targetResponse: DevelopmentTargetListResponse = {
  schemaVersion: 1,
  state: "ready",
  targets: [],
};
const admissionResponse: BatchProjectTargetAdmissionResponse = {
  schemaVersion: 2,
  state: "ready",
  projects: [{ projectKey, state: "ready", targets: [] }],
};

function context(
  kind: PrincipalKind = "supervisor",
  overrides: Record<string, unknown> = {},
) {
  return createRequestContext({
    id: principalId,
    kind,
    scopes: ["runtime:read", "targets:read", "targets:write"],
    revoked: false,
    bbContextId,
    ...overrides,
  });
}

function controller(
  calls: BatchProjectTargetAdmissionRequest[] = [],
): RuntimeTargetController {
  return {
    principalId,
    bbContextId,
    admit(_context, input) {
      calls.push(input);
      return admissionResponse;
    },
    list() {
      return targetResponse;
    },
  };
}

function handler(
  requestContext = context(),
  targets: RuntimeTargetController = controller(),
) {
  return createRuntimeHttpHandler({
    port: 41_721,
    identity: {
      runtimeVersion: "0.1.0",
      instanceId,
      capabilities: RUNTIME_CAPABILITIES,
    },
    authenticate: async () => requestContext,
    targets,
  });
}

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", "127.0.0.1:41721");
  return new Request(`http://127.0.0.1:41721${path}`, { ...init, headers });
}

describe("runtime supervisor target routes", () => {
  test("admits one strict bounded project batch and returns only the grouped controller projection", async () => {
    const calls: BatchProjectTargetAdmissionRequest[] = [];
    const response = await handler(
      context(),
      controller(calls),
    )(
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 2,
          inventoryState: "complete" as const,
          projects: [
            {
              projectKey: "a".repeat(32),
              sourcePath: "/private/source-plugin",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 2,
      state: "ready",
      projects: [{ projectKey, state: "ready", targets: [] }],
    });
    expect(calls).toEqual([
      {
        schemaVersion: 2,
        inventoryState: "complete" as const,
        projects: [
          {
            projectKey,
            sourcePath: "/private/source-plugin",
          },
        ],
      },
    ]);
  });

  test("rejects a controller response that does not group every requested key in order", async () => {
    const mismatched: RuntimeTargetController = {
      ...controller(),
      admit: () => ({
        schemaVersion: 2,
        state: "ready",
        projects: [{ projectKey: "b".repeat(32), state: "ready", targets: [] }],
      }),
    };
    const response = await handler(
      context(),
      mismatched,
    )(
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 2,
          inventoryState: "complete" as const,
          projects: [
            { projectKey: "a".repeat(32), sourcePath: "/private/source" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(500);
  });

  test("passes request cancellation to target admission", async () => {
    let observedSignal: AbortSignal | undefined;
    let observedResolve!: () => void;
    const observed = new Promise<void>((resolve) => {
      observedResolve = resolve;
    });
    const cancellation = new AbortController();
    const cancellable: RuntimeTargetController = {
      ...controller(),
      admit: (_context, _input, signal) => {
        observedSignal = signal;
        observedResolve();
        return new Promise((resolve) =>
          signal?.addEventListener("abort", () => resolve(admissionResponse), {
            once: true,
          }),
        );
      },
    };
    const response = handler(
      context(),
      cancellable,
    )(
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 2,
          inventoryState: "complete" as const,
          projects: [
            { projectKey: "a".repeat(32), sourcePath: "/private/source" },
          ],
        }),
        signal: cancellation.signal,
      }),
    );
    await observed;
    cancellation.abort();

    expect((await response).status).toBe(200);
    expect(observedSignal?.aborted).toBe(true);
  });

  test("lists the authorized global catalog without accepting an Origin", async () => {
    const response = await handler()(request("/v2/targets"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(targetResponse);

    const browserOrigin = await handler()(
      request("/v2/targets", {
        headers: { origin: "http://127.0.0.1:41721" },
      }),
    );
    expect(browserOrigin.status).toBe(403);
  });

  test("default-denies non-supervisors, wrong bindings, bound contexts, and missing scopes", async () => {
    const deniedContexts = [
      context("browser-session"),
      context("plugin-adapter"),
      context("mcp-client"),
      context("supervisor", { id: "q".repeat(32) }),
      context("supervisor", { bbContextId: "c".repeat(32) }),
      context("supervisor", { targetId: "t".repeat(32) }),
      createRequestContext({
        id: principalId,
        kind: "supervisor",
        scopes: ["runtime:read", "targets:read"],
        revoked: false,
        bbContextId,
      }),
    ];

    for (const denied of deniedContexts) {
      const response = await handler(denied)(
        request("/v2/targets/admit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schemaVersion: 2,
            inventoryState: "complete" as const,
            projects: [
              {
                projectKey: "a".repeat(32),
                sourcePath: "/private/source",
              },
            ],
          }),
        }),
      );
      expect(response.status).toBe(403);
    }

    const revoked = context("supervisor", { revoked: true });
    expect((await handler(revoked)(request("/v2/targets"))).status).toBe(401);
  });

  test("requires target-read separately from target-write", async () => {
    const writer = createRequestContext({
      id: principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:write"],
      revoked: false,
      bbContextId,
    });
    const reader = createRequestContext({
      id: principalId,
      kind: "supervisor",
      scopes: ["runtime:read", "targets:read"],
      revoked: false,
      bbContextId,
    });

    expect((await handler(writer)(request("/v2/targets"))).status).toBe(403);
    expect(
      (
        await handler(reader)(
          request("/v2/targets/admit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              schemaVersion: 2,
              inventoryState: "complete" as const,
              projects: [
                {
                  projectKey: "a".repeat(32),
                  sourcePath: "/private/source",
                },
              ],
            }),
          }),
        )
      ).status,
    ).toBe(403);
  });

  test("rejects malformed, oversized, encoded, query, and wrong-method requests before controller mutation", async () => {
    const calls: BatchProjectTargetAdmissionRequest[] = [];
    const handle = handler(context(), controller(calls));
    const attacks = [
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}",
      }),
      request("/v2/targets/admit?source=/private", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      request("/v2/targets/admit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
        body: "{}",
      }),
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schemaVersion: 2,
          inventoryState: "complete" as const,
          projects: [
            {
              projectKey: "a".repeat(32),
              sourcePath: `/${"x".repeat(1_025)}`,
            },
          ],
        }),
      }),
      request("/v2/targets", { method: "POST", body: "{}" }),
      request("/v2/targets/admit", { method: "GET" }),
    ];

    for (const attack of attacks) {
      const response = await handle(attack);
      expect([400, 404, 405, 415]).toContain(response.status);
    }
    expect(calls).toEqual([]);

    const huge = await handle(
      request("/v2/targets/admit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(256 * 1024 + 1),
      }),
    );
    expect(huge.status).toBe(413);
    expect(calls).toEqual([]);
  });

  test("requires capability truth to match target-controller composition", () => {
    expect(() =>
      createRuntimeHttpHandler({
        port: 41_721,
        identity: {
          runtimeVersion: "0.1.0",
          instanceId,
          capabilities: RUNTIME_CAPABILITIES,
        },
      }),
    ).toThrow("Invalid runtime HTTP identity");

    expect(() =>
      createRuntimeHttpHandler({
        port: 41_721,
        identity: {
          runtimeVersion: "0.1.0",
          instanceId,
          capabilities: { ...RUNTIME_CAPABILITIES, targets: false },
        },
        targets: controller(),
      }),
    ).toThrow("Invalid runtime HTTP identity");
  });
});
