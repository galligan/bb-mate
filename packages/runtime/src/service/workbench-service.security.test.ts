import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import { createRequestContext, type RequestContext } from "../auth/context.ts";
import type { AuthenticatedPrincipal } from "../auth/principals.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  SessionIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import {
  defineObjectCodec,
  ObjectCodecRegistry,
} from "../contracts/objects.ts";
import { openRuntimeStore } from "../persistence/store.ts";
import { createWorkbenchService } from "./workbench-service.ts";

const temporaryRoots: string[] = [];
const objectId = ObjectIdSchema.parse("o".repeat(32));
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));
const targetId = TargetIdSchema.parse("t".repeat(32));
const sessionId = SessionIdSchema.parse("s".repeat(32));

async function makeDataRoot(): Promise<string> {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-mate-service-security-"),
  );
  temporaryRoots.push(parent);
  return path.join(parent, "data");
}

function context(
  overrides: Partial<AuthenticatedPrincipal> = {},
): RequestContext {
  return createRequestContext({
    id: principalId,
    kind: "browser-session",
    scopes: [
      "annotations:read",
      "annotations:write",
      "captures:read",
      "captures:write",
      "events:read",
    ],
    revoked: false,
    bbContextId,
    targetId,
    sessionId,
    ...overrides,
  });
}

async function openFixture() {
  const store = await openRuntimeStore({
    dataRoot: await makeDataRoot(),
    codecs: new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
      defineObjectCodec("capture", { label: z.string() }),
    ]),
    id: () => objectId,
  });
  return { store, service: createWorkbenchService(store) };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("WorkbenchService security", () => {
  test("rejects authority fields from every caller DTO", async () => {
    const { store, service } = await openFixture();
    const requestContext = context();
    const authorityFields = {
      principal: { id: PrincipalIdSchema.parse("q".repeat(32)) },
      bindings: { principalId, bbContextId, targetId, sessionId },
      bbContextId,
      targetId,
      sessionId,
      auth: "caller-token",
    };
    const operations = [
      (extra: object) =>
        service.createObject(requestContext, {
          kind: "annotation",
          payload: { body: "Private" },
          ...extra,
        }),
      (extra: object) =>
        service.getObject(requestContext, {
          id: objectId,
          kind: "annotation",
          ...extra,
        }),
      (extra: object) =>
        service.updateObject(requestContext, {
          id: objectId,
          kind: "annotation",
          expectedRevision: 1,
          payload: { body: "Changed" },
          ...extra,
        }),
      (extra: object) => service.pullEvents(requestContext, extra),
    ];

    try {
      for (const operation of operations) {
        for (const [key, value] of Object.entries(authorityFields)) {
          expect(() => operation({ [key]: value })).toThrow(
            expect.objectContaining({ code: "invalid_request" }),
          );
        }
      }
    } finally {
      store.close();
    }
  });

  test("isolates reads, writes, and events by subject, bb context, target, and session", async () => {
    const { store, service } = await openFixture();
    const owner = context();

    try {
      service.createObject(owner, {
        kind: "annotation",
        payload: { body: "Private" },
      });
      const mismatches = [
        context({ id: PrincipalIdSchema.parse("q".repeat(32)) }),
        context({ bbContextId: BbContextIdSchema.parse("c".repeat(32)) }),
        context({ targetId: TargetIdSchema.parse("u".repeat(32)) }),
        context({ sessionId: SessionIdSchema.parse("r".repeat(32)) }),
        context({ sessionId: undefined }),
      ];

      for (const mismatched of mismatches) {
        expect(() =>
          service.getObject(mismatched, {
            id: objectId,
            kind: "annotation",
          }),
        ).toThrow(expect.objectContaining({ code: "not_found" }));
        expect(() =>
          service.updateObject(mismatched, {
            id: objectId,
            kind: "annotation",
            expectedRevision: 1,
            payload: { body: "Stolen" },
          }),
        ).toThrow(expect.objectContaining({ code: "not_found" }));
        expect(service.pullEvents(mismatched, {})).toEqual({ events: [] });
      }
    } finally {
      store.close();
    }
  });

  test("authorizes the supplied kind before lookup and hides kind mismatches", async () => {
    const { store, service } = await openFixture();
    const owner = context();

    try {
      service.createObject(owner, {
        kind: "annotation",
        payload: { body: "Private" },
      });

      expect(() =>
        service.getObject(owner, { id: objectId, kind: "capture" }),
      ).toThrow(expect.objectContaining({ code: "not_found" }));
      expect(() =>
        service.updateObject(owner, {
          id: objectId,
          kind: "capture",
          expectedRevision: 1,
          payload: { label: "Wrong kind" },
        }),
      ).toThrow(expect.objectContaining({ code: "not_found" }));

      const missingCaptureScope = context({ scopes: ["annotations:read"] });
      expect(() =>
        service.getObject(missingCaptureScope, {
          id: objectId,
          kind: "capture",
        }),
      ).toThrow(expect.objectContaining({ code: "forbidden" }));
    } finally {
      store.close();
    }
  });
});
