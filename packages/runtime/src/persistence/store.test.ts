import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

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
  type ObjectBindings,
} from "../contracts/objects.ts";
import { openRuntimeStore } from "./store.ts";

const temporaryRoots: string[] = [];
const bindings: ObjectBindings = {
  principalId: PrincipalIdSchema.parse("p".repeat(32)),
  bbContextId: BbContextIdSchema.parse("b".repeat(32)),
  targetId: TargetIdSchema.parse("t".repeat(32)),
};

async function makeDataRoot(): Promise<string> {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryDirectory, "bb-mate-store-"),
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

describe("RuntimeStore", () => {
  test("creates and retrieves a codec-validated object", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", {
        body: z.string(),
        resolved: z.boolean(),
      }),
    ]);
    const store = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => 1_000,
      id: () => objectId,
    });

    try {
      const created = store.createObject({
        kind: "annotation",
        bindings,
        payload: { resolved: false, body: "Tighten spacing" },
      });

      expect(created).toEqual({
        schemaVersion: 1,
        id: objectId,
        kind: "annotation",
        bindings,
        revision: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        payload: { body: "Tighten spacing", resolved: false },
      });
      expect(store.getObject({ id: objectId, bindings })).toEqual(created);
    } finally {
      store.close();
    }
  });

  test("does not retrieve an object through a different security binding", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    const store = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => 1_000,
      id: () => objectId,
    });
    const sessionBindings: ObjectBindings = {
      ...bindings,
      sessionId: SessionIdSchema.parse("s".repeat(32)),
    };

    try {
      store.createObject({
        kind: "annotation",
        bindings: sessionBindings,
        payload: { body: "Private" },
      });

      const mismatches: ObjectBindings[] = [
        {
          ...sessionBindings,
          principalId: PrincipalIdSchema.parse("q".repeat(32)),
        },
        {
          ...sessionBindings,
          bbContextId: BbContextIdSchema.parse("c".repeat(32)),
        },
        { ...sessionBindings, targetId: TargetIdSchema.parse("u".repeat(32)) },
        {
          ...sessionBindings,
          sessionId: SessionIdSchema.parse("r".repeat(32)),
        },
        bindings,
      ];
      for (const mismatched of mismatches) {
        expect(
          store.getObject({ id: objectId, bindings: mismatched }),
        ).toBeUndefined();
      }
      expect(
        store.getObject({ id: objectId, bindings: sessionBindings }),
      ).toBeDefined();
    } finally {
      store.close();
    }
  });

  test("updates through an optimistic revision and rejects a stale writer", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    let now = 1_000;
    const store = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => now,
      id: () => objectId,
    });

    try {
      store.createObject({
        kind: "annotation",
        bindings,
        payload: { body: "Before" },
      });
      now = 2_000;

      const updated = store.updateObject({
        id: objectId,
        bindings,
        expectedRevision: 1,
        payload: { body: "After" },
      });

      expect(updated).toMatchObject({
        revision: 2,
        createdAt: 1_000,
        updatedAt: 2_000,
        payload: { body: "After" },
      });
      expect(() =>
        store.updateObject({
          id: objectId,
          bindings,
          expectedRevision: 1,
          payload: { body: "Stale" },
        }),
      ).toThrow(expect.objectContaining({ code: "conflict" }));
      expect(store.getObject({ id: objectId, bindings })).toEqual(updated);
    } finally {
      store.close();
    }
  });

  test("stores canonical payload bytes separately from security bindings", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const store = await openRuntimeStore({
      dataRoot,
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { a: z.string(), z: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => objectId,
    });
    store.createObject({
      kind: "annotation",
      bindings,
      payload: { z: "last", a: "first" },
    });
    store.close();

    const database = new Database(path.join(dataRoot, "workbench.sqlite3"), {
      readonly: true,
    });
    const row = database
      .query(
        `
        SELECT payload_json, principal_id, bb_context_id, target_id
        FROM runtime_objects
        WHERE id = ?
      `,
      )
      .get(objectId);
    database.close();

    expect(row).toEqual({
      payload_json: '{"a":"first","z":"last"}',
      principal_id: bindings.principalId,
      bb_context_id: bindings.bbContextId,
      target_id: bindings.targetId,
    });
  });

  test("reopens durable objects from the same explicit data root", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    const first = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => 1_000,
      id: () => objectId,
    });
    const created = first.createObject({
      kind: "annotation",
      bindings,
      payload: { body: "Durable" },
    });
    first.close();

    const reopened = await openRuntimeStore({ dataRoot, codecs });
    try {
      expect(reopened.getObject({ id: objectId, bindings })).toEqual(created);
    } finally {
      reopened.close();
    }
  });

  test("maps an injected object ID collision to a stable conflict", async () => {
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => objectId,
    });

    try {
      store.createObject({
        kind: "annotation",
        bindings,
        payload: { body: "First" },
      });
      expect(() =>
        store.createObject({
          kind: "annotation",
          bindings,
          payload: { body: "Collision" },
        }),
      ).toThrow(expect.objectContaining({ code: "conflict" }));
      expect(store.pullEvents({ bindings }).events).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});
