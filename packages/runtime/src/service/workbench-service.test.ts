import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import { createRequestContext } from "../auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import {
  defineObjectCodec,
  ObjectCodecRegistry,
} from "../contracts/objects.ts";
import { openRuntimeStore } from "../persistence/store.ts";
import { createWorkbenchService } from "./workbench-service.ts";

const temporaryRoots: string[] = [];

async function makeDataRoot(): Promise<string> {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-plugin-studio-service-"),
  );
  temporaryRoots.push(parent);
  return path.join(parent, "data");
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("WorkbenchService", () => {
  test("creates a codec-validated object with bindings derived from its request context", async () => {
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const principalId = PrincipalIdSchema.parse("p".repeat(32));
    const bbContextId = BbContextIdSchema.parse("b".repeat(32));
    const targetId = TargetIdSchema.parse("t".repeat(32));
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => objectId,
    });
    const service = createWorkbenchService(store);
    const context = createRequestContext({
      id: principalId,
      kind: "browser-session",
      scopes: ["annotations:write"],
      revoked: false,
      bbContextId,
      targetId,
    });

    try {
      expect(
        service.createObject(context, {
          kind: "annotation",
          payload: { body: "Tighten spacing" },
        }),
      ).toEqual({
        schemaVersion: 1,
        id: objectId,
        kind: "annotation",
        bindings: { principalId, bbContextId, targetId },
        revision: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        payload: { body: "Tighten spacing" },
      });
    } finally {
      store.close();
    }
  });

  test("gets an object through its kind-specific read scope", async () => {
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      id: () => objectId,
    });
    const service = createWorkbenchService(store);
    const context = createRequestContext({
      id: PrincipalIdSchema.parse("p".repeat(32)),
      kind: "browser-session",
      scopes: ["annotations:read", "annotations:write"],
      revoked: false,
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse("t".repeat(32)),
    });

    try {
      const created = service.createObject(context, {
        kind: "annotation",
        payload: { body: "Private" },
      });
      expect(
        service.getObject(context, { id: objectId, kind: "annotation" }),
      ).toEqual(created);
    } finally {
      store.close();
    }
  });

  test("updates through an optimistic revision and preserves the original kind", async () => {
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    let now = 1_000;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => now,
      id: () => objectId,
    });
    const service = createWorkbenchService(store);
    const context = createRequestContext({
      id: PrincipalIdSchema.parse("p".repeat(32)),
      kind: "browser-session",
      scopes: ["annotations:read", "annotations:write"],
      revoked: false,
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse("t".repeat(32)),
    });

    try {
      service.createObject(context, {
        kind: "annotation",
        payload: { body: "Before" },
      });
      now = 2_000;

      expect(
        service.updateObject(context, {
          id: objectId,
          kind: "annotation",
          expectedRevision: 1,
          payload: { body: "After" },
        }),
      ).toMatchObject({
        id: objectId,
        kind: "annotation",
        revision: 2,
        createdAt: 1_000,
        updatedAt: 2_000,
        payload: { body: "After" },
      });
      expect(() =>
        service.updateObject(context, {
          id: objectId,
          kind: "annotation",
          expectedRevision: 1,
          payload: { body: "Stale" },
        }),
      ).toThrow(expect.objectContaining({ code: "conflict" }));
    } finally {
      store.close();
    }
  });

  test("pulls bounded minimal events for the verified context", async () => {
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    let now = 1_000;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => now,
      id: () => objectId,
    });
    const service = createWorkbenchService(store);
    const context = createRequestContext({
      id: PrincipalIdSchema.parse("p".repeat(32)),
      kind: "mcp-client",
      scopes: ["annotations:write", "events:read"],
      revoked: false,
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse("t".repeat(32)),
    });

    try {
      service.createObject(context, {
        kind: "annotation",
        payload: { body: "Before" },
      });
      now = 2_000;
      service.updateObject(context, {
        id: objectId,
        kind: "annotation",
        expectedRevision: 1,
        payload: { body: "After" },
      });

      const first = service.pullEvents(context, { limit: 1 });
      expect(first).toEqual({
        events: [
          {
            cursor: "v1_1",
            type: "object.created",
            objectId,
            objectKind: "annotation",
            revision: 1,
            occurredAt: 1_000,
          },
        ],
        nextCursor: "v1_1",
      });
      expect(
        service.pullEvents(context, {
          cursor: first.nextCursor,
          limit: 1,
        }),
      ).toEqual({
        events: [
          {
            cursor: "v1_2",
            type: "object.updated",
            objectId,
            objectKind: "annotation",
            revision: 2,
            occurredAt: 2_000,
          },
        ],
        nextCursor: "v1_2",
      });
    } finally {
      store.close();
    }
  });

  test("reopens deterministic objects, revisions, and event cursors from SQLite", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    let now = 1_000;
    const context = createRequestContext({
      id: PrincipalIdSchema.parse("p".repeat(32)),
      kind: "mcp-client",
      scopes: ["annotations:read", "annotations:write", "events:read"],
      revoked: false,
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse("t".repeat(32)),
    });
    const firstStore = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => now,
      id: () => objectId,
    });
    const firstService = createWorkbenchService(firstStore);
    firstService.createObject(context, {
      kind: "annotation",
      payload: { body: "Before" },
    });
    now = 2_000;
    const updated = firstService.updateObject(context, {
      id: objectId,
      kind: "annotation",
      expectedRevision: 1,
      payload: { body: "After" },
    });
    const events = firstService.pullEvents(context, {});
    firstStore.close();

    const reopenedStore = await openRuntimeStore({ dataRoot, codecs });
    const reopenedService = createWorkbenchService(reopenedStore);
    try {
      expect(
        reopenedService.getObject(context, {
          id: objectId,
          kind: "annotation",
        }),
      ).toEqual(updated);
      expect(reopenedService.pullEvents(context, {})).toEqual(events);
    } finally {
      reopenedStore.close();
    }
  });
});
