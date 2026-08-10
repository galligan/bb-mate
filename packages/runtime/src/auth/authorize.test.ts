import { describe, expect, test } from "bun:test";

import { authorize } from "./authorize.ts";
import { createRequestContext, type RequestContext } from "./context.ts";
import { RuntimeError } from "../errors.ts";
import {
  BbContextIdSchema,
  PrincipalIdSchema,
  SessionIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";

const principalId = PrincipalIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const bbContextId = BbContextIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
const targetId = TargetIdSchema.parse("cccccccccccccccccccccccccccccccc");
const sessionId = SessionIdSchema.parse("dddddddddddddddddddddddddddddddd");

describe("authorization", () => {
  test("authorizes a scoped credential for its exact security subject and bindings", () => {
    const context = createRequestContext({
      id: principalId,
      kind: "browser-session",
      scopes: ["annotations:read"],
      revoked: false,
      bbContextId,
      targetId,
      sessionId,
    });

    expect(
      authorize(context, {
        scope: "annotations:read",
        resource: { principalId, bbContextId, targetId, sessionId },
      }),
    ).toBe(context);
  });

  test("does not let a session-bound credential broaden access to target-level objects", () => {
    const context = createRequestContext({
      id: principalId,
      kind: "mcp-client",
      scopes: ["annotations:read"],
      revoked: false,
      bbContextId,
      targetId,
      sessionId,
    });

    expect(() =>
      authorize(context, {
        scope: "annotations:read",
        resource: { principalId, bbContextId, targetId },
      }),
    ).toThrow(new RuntimeError("not_found"));
  });

  test("treats missing, forged, and revoked credentials as unauthenticated", () => {
    const revoked = createRequestContext({
      id: principalId,
      kind: "plugin-adapter",
      scopes: ["runtime:read"],
      revoked: true,
      bbContextId,
    });
    const forged = {
      principal: revoked.principal,
    } as unknown as RequestContext;

    for (const context of [undefined, forged, revoked]) {
      expect(() => authorize(context, { scope: "runtime:read" })).toThrow(
        new RuntimeError("unauthenticated"),
      );
    }
  });

  test("rejects cloned contexts even when their private runtime keys are copied", () => {
    const valid = createRequestContext({
      id: principalId,
      kind: "browser-session",
      scopes: ["annotations:read"],
      revoked: false,
      bbContextId,
      targetId,
      sessionId,
    });
    const elevatedPrincipal = {
      ...valid.principal,
      scopes: ["annotations:write"] as const,
    };
    const spreadClone = {
      ...valid,
      principal: elevatedPrincipal,
    } as unknown as RequestContext;
    const inheritedClone = Object.create(valid, {
      principal: {
        value: elevatedPrincipal,
        enumerable: true,
        writable: true,
        configurable: true,
      },
    }) as RequestContext;
    const reflectedClone = Object.fromEntries(
      Reflect.ownKeys(valid).map((key) => [
        key,
        key === "principal" ? elevatedPrincipal : Reflect.get(valid, key),
      ]),
    ) as unknown as RequestContext;

    for (const clone of [spreadClone, inheritedClone, reflectedClone]) {
      expect(() => authorize(clone, { scope: "annotations:write" })).toThrow(
        new RuntimeError("unauthenticated"),
      );
    }
    expect(authorize(valid, { scope: "annotations:read" })).toBe(valid);
  });

  test("default-denies missing scopes and does not enumerate binding mismatches", () => {
    const context = createRequestContext({
      id: principalId,
      kind: "browser-session",
      scopes: ["annotations:read"],
      revoked: false,
      bbContextId,
      targetId,
      sessionId,
    });
    const otherPrincipalId = PrincipalIdSchema.parse("e".repeat(32));
    const otherBbContextId = BbContextIdSchema.parse("e".repeat(32));
    const otherTargetId = TargetIdSchema.parse("e".repeat(32));
    const otherSessionId = SessionIdSchema.parse("e".repeat(32));

    expect(() => authorize(context, { scope: "annotations:write" })).toThrow(
      new RuntimeError("forbidden"),
    );

    for (const resource of [
      { principalId: otherPrincipalId, bbContextId, targetId, sessionId },
      { principalId, bbContextId: otherBbContextId, targetId, sessionId },
      { principalId, bbContextId, targetId: otherTargetId, sessionId },
      { principalId, bbContextId, targetId, sessionId: otherSessionId },
    ]) {
      expect(() =>
        authorize(context, { scope: "annotations:read", resource }),
      ).toThrow(new RuntimeError("not_found"));
    }
  });
});
