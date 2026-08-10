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
import { openRuntimeStore } from "../persistence/store.ts";

const temporaryRoots: string[] = [];
const bindings: ObjectBindings = {
  principalId: PrincipalIdSchema.parse("p".repeat(32)),
  bbContextId: BbContextIdSchema.parse("b".repeat(32)),
  targetId: TargetIdSchema.parse("t".repeat(32)),
};

async function makeDataRoot(): Promise<string> {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryDirectory, "bb-mate-events-"),
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

describe("RuntimeStore event feed", () => {
  test("pulls a minimal event after an object mutation", async () => {
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
        payload: { body: "Must not enter the event log" },
      });

      const page = store.pullEvents({ bindings });

      expect(page.events).toEqual([
        {
          cursor: expect.stringMatching(/^v1_[0-9a-z]+$/u),
          type: "object.created",
          objectId,
          objectKind: "annotation",
          revision: 1,
          occurredAt: 1_000,
        },
      ]);
      expect(JSON.stringify(page)).not.toContain("Must not enter");
      expect(JSON.stringify(page)).not.toContain(bindings.principalId);
      expect(JSON.stringify(page)).not.toContain(bindings.bbContextId);
      expect(JSON.stringify(page)).not.toContain(bindings.targetId);
    } finally {
      store.close();
    }
  });

  test("rolls back an object update when its event cannot be appended", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    let now = 1_000;
    const first = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => now,
      id: () => objectId,
    });
    first.createObject({
      kind: "annotation",
      bindings,
      payload: { body: "Original" },
    });
    first.close();

    now = 2_000;
    const reopened = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => now,
    });
    const database = new Database(path.join(dataRoot, "workbench.sqlite3"));
    database.exec(`
      CREATE TRIGGER injected_event_failure
      BEFORE INSERT ON runtime_events
      BEGIN
        SELECT RAISE(ABORT, 'injected event failure');
      END
    `);
    database.close();

    try {
      expect(() =>
        reopened.updateObject({
          id: objectId,
          bindings,
          expectedRevision: 1,
          payload: { body: "Must roll back" },
        }),
      ).toThrow(expect.objectContaining({ code: "internal" }));
      expect(reopened.getObject({ id: objectId, bindings })).toMatchObject({
        revision: 1,
        updatedAt: 1_000,
        payload: { body: "Original" },
      });
    } finally {
      reopened.close();
    }
  });

  test("rolls back an object creation when its event cannot be appended", async () => {
    const dataRoot = await makeDataRoot();
    const objectId = ObjectIdSchema.parse("o".repeat(32));
    const codecs = new ObjectCodecRegistry([
      defineObjectCodec("annotation", { body: z.string() }),
    ]);
    (await openRuntimeStore({ dataRoot, codecs })).close();
    const reopened = await openRuntimeStore({
      dataRoot,
      codecs,
      clock: () => 1_000,
      id: () => objectId,
    });
    const database = new Database(path.join(dataRoot, "workbench.sqlite3"));
    database.exec(`
      CREATE TRIGGER injected_create_event_failure
      BEFORE INSERT ON runtime_events
      BEGIN
        SELECT RAISE(ABORT, 'injected event failure');
      END
    `);
    database.close();

    try {
      expect(() =>
        reopened.createObject({
          kind: "annotation",
          bindings,
          payload: { body: "Must roll back" },
        }),
      ).toThrow(expect.objectContaining({ code: "internal" }));
      expect(reopened.getObject({ id: objectId, bindings })).toBeUndefined();
    } finally {
      reopened.close();
    }
  });

  test("pages by cursor and enforces the maximum pull size", async () => {
    let nextId = 1;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => ObjectIdSchema.parse((nextId++).toString(36).padStart(32, "0")),
    });

    try {
      for (const body of ["one", "two", "three"]) {
        store.createObject({ kind: "annotation", bindings, payload: { body } });
      }

      const first = store.pullEvents({ bindings, limit: 2 });
      expect(first.events).toHaveLength(2);
      expect(first.nextCursor).toBe(first.events[1]!.cursor);
      const second = store.pullEvents({
        bindings,
        cursor: first.nextCursor,
        limit: 2,
      });
      expect(second.events).toHaveLength(1);
      expect(second.events[0]!.objectId).toBe(
        ObjectIdSchema.parse("3".padStart(32, "0")),
      );
      expect(() => store.pullEvents({ bindings, limit: 101 })).toThrow(
        expect.objectContaining({ code: "invalid_request" }),
      );
    } finally {
      store.close();
    }
  });

  test("isolates events and cursors by every security binding", async () => {
    let nextId = 1;
    const store = await openRuntimeStore({
      dataRoot: await makeDataRoot(),
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => ObjectIdSchema.parse((nextId++).toString(36).padStart(32, "0")),
    });
    const variants: ObjectBindings[] = [
      bindings,
      { ...bindings, principalId: PrincipalIdSchema.parse("q".repeat(32)) },
      { ...bindings, bbContextId: BbContextIdSchema.parse("c".repeat(32)) },
      { ...bindings, targetId: TargetIdSchema.parse("u".repeat(32)) },
      { ...bindings, sessionId: SessionIdSchema.parse("s".repeat(32)) },
    ];

    try {
      variants.forEach((variant, index) => {
        store.createObject({
          kind: "annotation",
          bindings: variant,
          payload: { body: `private-${index}` },
        });
      });

      for (const variant of variants) {
        expect(store.pullEvents({ bindings: variant }).events).toHaveLength(1);
      }
      const foreignCursor = store.pullEvents({
        bindings: variants[1]!,
      }).nextCursor!;
      expect(() =>
        store.pullEvents({ bindings, cursor: foreignCursor }),
      ).toThrow(expect.objectContaining({ code: "invalid_request" }));
      expect(() =>
        store.pullEvents({ bindings, cursor: "not-a-cursor" }),
      ).toThrow(expect.objectContaining({ code: "invalid_request" }));
    } finally {
      store.close();
    }
  });

  test("keeps the durable event ledger append-only", async () => {
    const dataRoot = await makeDataRoot();
    const store = await openRuntimeStore({
      dataRoot,
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => ObjectIdSchema.parse("o".repeat(32)),
    });
    store.createObject({
      kind: "annotation",
      bindings,
      payload: { body: "Immutable event" },
    });
    store.close();

    const database = new Database(path.join(dataRoot, "workbench.sqlite3"));
    expect(() =>
      database.exec("UPDATE runtime_events SET revision = 2"),
    ).toThrow("runtime events are append-only");
    expect(() => database.exec("DELETE FROM runtime_events")).toThrow(
      "runtime events are append-only",
    );
    expect(
      database.query("SELECT COUNT(*) AS count FROM runtime_events").get(),
    ).toEqual({
      count: 1,
    });
    database.close();
  });

  test("fails closed when a persisted event is invalid", async () => {
    const dataRoot = await makeDataRoot();
    const store = await openRuntimeStore({
      dataRoot,
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
      clock: () => 1_000,
      id: () => ObjectIdSchema.parse("o".repeat(32)),
    });
    store.createObject({
      kind: "annotation",
      bindings,
      payload: { body: "Valid first" },
    });
    store.close();
    const database = new Database(path.join(dataRoot, "workbench.sqlite3"));
    database.exec(`
      DROP TRIGGER runtime_events_no_update;
      UPDATE runtime_events SET event_type = 'secret.payload.leak';
      CREATE TRIGGER runtime_events_no_update
        BEFORE UPDATE ON runtime_events
        BEGIN
          SELECT RAISE(ABORT, 'runtime events are append-only');
        END;
    `);
    database.close();

    const reopened = await openRuntimeStore({
      dataRoot,
      codecs: new ObjectCodecRegistry([
        defineObjectCodec("annotation", { body: z.string() }),
      ]),
    });
    try {
      expect(() => reopened.pullEvents({ bindings })).toThrow(
        expect.objectContaining({ code: "corrupt_data" }),
      );
    } finally {
      reopened.close();
    }
  });
});
