import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { createRequestContext } from "../auth/context.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  OpaqueIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import { ObjectCodecRegistry } from "../contracts/objects.ts";
import { openDevelopmentTargetCatalog } from "../discovery/catalog.ts";
import { DevelopmentTargetCodec } from "../discovery/development-target.ts";
import { inspectDevelopmentSourceIdentity } from "../discovery/source-identity.ts";
import {
  TARGET_EVENT_MAX_EVENTS_PER_TARGET,
  TARGET_HISTORY_MAX_TARGETS,
} from "../discovery/target-limits.ts";
import {
  createInspectionDevelopmentTargetCandidateBridge,
  type InspectionSourceCandidateFacts,
} from "../discovery/trusted-candidate.ts";
import { RuntimeError } from "../errors.ts";
import { createEventFeed } from "../events/feed.ts";
import { openRuntimeStore } from "../persistence/store.ts";
import { createWorkbenchService } from "./workbench-service.ts";
import { createDevelopmentTargetService } from "./development-target-service.ts";

const temporaryRoots: string[] = [];
const objectId = ObjectIdSchema.parse("t".repeat(32));
const targetId = TargetIdSchema.parse("t".repeat(32));
const principalId = PrincipalIdSchema.parse("p".repeat(32));
const bbContextId = BbContextIdSchema.parse("b".repeat(32));

async function issueInspectionCandidate(value: InspectionSourceCandidateFacts) {
  const source = Object.freeze({ ...value });
  const transition = Object.freeze({ transition: true });
  const identity = await inspectDevelopmentSourceIdentity(value.canonicalRoot);
  let active = false;
  return createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (candidate !== source) throw new RuntimeError("invalid_request");
      active = true;
      try {
        return await consumer(transition);
      } finally {
        active = false;
      }
    },
    readSourceCandidateTransition(candidate) {
      if (candidate !== transition || !active) {
        throw new RuntimeError("invalid_request");
      }
      return {
        ...value,
        directoryIdentity: {
          canonicalRoot: identity.canonicalRoot,
          device: identity.device,
          inode: identity.inode,
        },
        manifestIdentity: identity.manifest,
      };
    },
  }).issue(source);
}

async function makeFixture() {
  const temporaryRoot = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryRoot, "bb-mate-development-target-"),
  );
  temporaryRoots.push(parent);
  const pluginRoot = path.join(parent, "plugin");
  await fs.mkdir(pluginRoot);
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
  );
  return {
    dataRoot: path.join(parent, "data"),
    pluginRoot: await fs.realpath(pluginRoot),
  };
}

function context() {
  return createRequestContext({
    id: principalId,
    kind: "supervisor",
    scopes: ["targets:read", "targets:write"],
    revoked: false,
    bbContextId,
  });
}

function candidateInput(canonicalRoot: string) {
  return {
    rootKey: OpaqueIdSchema.parse("r".repeat(32)),
    rootKind: "current-project" as const,
    canonicalRoot,
    target: {
      displayName: "Notes",
      displayPath: "plugins/notes",
      sourceKind: "workspace-discovered" as const,
      manifest: {
        pluginId: "notes",
        packageName: "bb-plugin-notes",
        version: "1.2.3",
        hasServer: true,
        hasApp: true,
      },
      native: { status: "absent" as const, observedAt: 1_000 },
      capabilities: { fixture: true, harness: false, live: false },
    },
  };
}

async function candidate(canonicalRoot: string) {
  const input = candidateInput(canonicalRoot);
  return issueInspectionCandidate({
    rootKey: input.rootKey,
    rootKind: input.rootKind,
    canonicalRoot: input.canonicalRoot,
    displayName: input.target.displayName,
    displayPath: input.target.displayPath,
    packageName: input.target.manifest.packageName,
    version: input.target.manifest.version,
    pluginId: input.target.manifest.pluginId,
    hasServer: input.target.manifest.hasServer,
    hasApp: input.target.manifest.hasApp,
  });
}

async function candidateNamed(canonicalRoot: string, displayName: string) {
  const input = candidateInput(canonicalRoot);
  return issueInspectionCandidate({
    rootKey: input.rootKey,
    rootKind: input.rootKind,
    canonicalRoot: input.canonicalRoot,
    displayName,
    displayPath: input.target.displayPath,
    packageName: input.target.manifest.packageName,
    version: input.target.manifest.version,
    pluginId: input.target.manifest.pluginId,
    hasServer: input.target.manifest.hasServer,
    hasApp: input.target.manifest.hasApp,
  });
}

async function indexedCandidate(canonicalRoot: string, index: number) {
  return issueInspectionCandidate({
    rootKey: OpaqueIdSchema.parse(index.toString(36).padStart(32, "r")),
    rootKind: "current-project",
    canonicalRoot,
    displayName: `Plugin ${index}`,
    displayPath: `plugins/plugin-${index}`,
    packageName: `bb-plugin-${index}`,
    version: "1.0.0",
    pluginId: `plugin-${index}`,
    hasServer: true,
    hasApp: false,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("DevelopmentTargetService", () => {
  test("retires targets absent from a complete snapshot and reopens their stable identity", async () => {
    const fixture = await makeFixture();
    let now = 1_000;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => now,
    });
    const service = createDevelopmentTargetService(catalog);

    const [created] = await service.refreshFromCompleteSnapshot(context(), [
      await candidate(fixture.pluginRoot),
    ]);
    expect(created?.id).toBe(targetId);

    now = 2_000;
    expect(await service.refreshFromCompleteSnapshot(context(), [])).toEqual(
      [],
    );
    expect(service.listTargets(context())).toEqual([]);
    expect(() => service.getTarget(context(), targetId)).toThrow(
      new RuntimeError("not_found"),
    );
    catalog.close();

    now = 3_000;
    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("u".repeat(32)),
      clock: () => now,
    });
    try {
      const restored = await createDevelopmentTargetService(
        reopened,
      ).refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      expect(restored?.id).toBe(targetId);
      expect(restored?.revision).toBe(3);
      expect(restored?.updatedAt).toBe(3_000);

      const database = new Database(
        path.join(fixture.dataRoot, "workbench.sqlite3"),
        { readonly: true },
      );
      try {
        expect(
          database
            .query("SELECT event_type FROM runtime_events ORDER BY sequence")
            .all(),
        ).toEqual([
          { event_type: "object.created" },
          { event_type: "target.retired" },
          { event_type: "target.reopened" },
        ]);
      } finally {
        database.close();
      }
    } finally {
      reopened.close();
    }
  });

  test("does not retire known targets when complete-snapshot validation fails", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const [created] = await service.refreshFromCompleteSnapshot(context(), [
        await candidate(fixture.pluginRoot),
      ]);
      const issued = await candidate(fixture.pluginRoot);

      await expect(
        service.refreshFromCompleteSnapshot(context(), [
          { ...issued } as never,
        ]),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(service.listTargets(context())).toEqual([created]);

      const database = new Database(
        path.join(fixture.dataRoot, "workbench.sqlite3"),
        { readonly: true },
      );
      try {
        expect(
          database
            .query("SELECT event_type FROM runtime_events ORDER BY sequence")
            .all(),
        ).toEqual([{ event_type: "object.created" }]);
      } finally {
        database.close();
      }
    } finally {
      catalog.close();
    }
  });

  test("rolls back complete-snapshot retirement when its audit event fails", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    try {
      const service = createDevelopmentTargetService(catalog);
      const [created] = await service.refreshFromCompleteSnapshot(context(), [
        await candidate(fixture.pluginRoot),
      ]);
      database.exec(`
        CREATE TRIGGER test_fail_retirement_event
        BEFORE INSERT ON runtime_events
        WHEN NEW.event_type = 'target.retired'
        BEGIN
          SELECT RAISE(ABORT, 'injected retirement event failure');
        END
      `);

      await expect(
        service.refreshFromCompleteSnapshot(context(), []),
      ).rejects.toMatchObject({ code: "internal" });
      expect(service.listTargets(context())).toEqual([created]);
      expect(
        database.query("SELECT * FROM development_target_retirements").all(),
      ).toEqual([]);
      expect(
        database
          .query("SELECT event_type FROM runtime_events ORDER BY sequence")
          .all(),
      ).toEqual([{ event_type: "object.created" }]);
    } finally {
      database.close();
      catalog.close();
    }
  });

  test("fails closed when a retired target is made active without a reopen event", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const service = createDevelopmentTargetService(catalog);
    await service.refreshFromCompleteSnapshot(context(), [
      await candidate(fixture.pluginRoot),
    ]);
    await service.refreshFromCompleteSnapshot(context(), []);
    catalog.close();

    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    database.exec("DELETE FROM development_target_retirements");
    database.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot: fixture.dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
  });

  test("retires removals before enforcing the persistent 128-target snapshot capacity", async () => {
    const fixture = await makeFixture();
    const parent = path.dirname(fixture.pluginRoot);
    const roots: string[] = [];
    for (let index = 0; index <= 128; index += 1) {
      const pluginRoot = path.join(parent, `capacity-${index}`);
      await fs.mkdir(pluginRoot);
      await fs.writeFile(
        path.join(pluginRoot, "package.json"),
        JSON.stringify({ name: `bb-plugin-${index}`, version: "1.0.0" }),
      );
      roots.push(await fs.realpath(pluginRoot));
    }
    let nextId = 0;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse((nextId++).toString(36).padStart(32, "i")),
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const initial = await Promise.all(
        roots.slice(0, 128).map(indexedCandidate),
      );
      const created = await service.refreshFromCompleteSnapshot(
        context(),
        initial,
      );
      expect(created).toHaveLength(128);

      const overCapacity = await Promise.all(roots.map(indexedCandidate));
      await expect(
        service.refreshFromCompleteSnapshot(context(), overCapacity),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(service.listTargets(context())).toHaveLength(128);
      expect(service.getTarget(context(), created[0]!.id)).toEqual(created[0]!);

      const replacement = await Promise.all(
        roots
          .slice(1, 129)
          .map((root, offset) => indexedCandidate(root, offset + 1)),
      );
      const refreshed = await service.refreshFromCompleteSnapshot(
        context(),
        replacement,
      );
      expect(refreshed).toHaveLength(128);
      expect(service.listTargets(context())).toHaveLength(128);
      expect(() => service.getTarget(context(), created[0]!.id)).toThrow(
        new RuntimeError("not_found"),
      );
      expect(
        refreshed.some((target) => target.manifest.pluginId === "plugin-128"),
      ).toBe(true);

      await expect(
        service.refreshFromTrustedCandidate(
          context(),
          await indexedCandidate(roots[0]!, 0),
        ),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(service.listTargets(context())).toHaveLength(128);
      expect(() => service.getTarget(context(), created[0]!.id)).toThrow(
        new RuntimeError("not_found"),
      );

      const database = new Database(
        path.join(fixture.dataRoot, "workbench.sqlite3"),
      );
      try {
        const eventCountBeforeRepeat = database
          .query<{ count: number }, []>(
            "SELECT COUNT(*) AS count FROM runtime_events",
          )
          .get()!.count;
        const repeated = await Promise.all(
          roots
            .slice(1, 129)
            .map((root, offset) => indexedCandidate(root, offset + 1)),
        );
        const unchanged = await service.refreshFromCompleteSnapshot(
          context(),
          repeated,
        );
        expect(unchanged.map((target) => [target.id, target.revision])).toEqual(
          refreshed.map((target) => [target.id, target.revision]),
        );
        expect(
          database.query("SELECT COUNT(*) AS count FROM runtime_events").get(),
        ).toEqual({ count: eventCountBeforeRepeat });
      } finally {
        database.close();
      }
    } finally {
      catalog.close();
    }
  });

  test("bounds retained unique-root history without disturbing the last active snapshot", async () => {
    const fixture = await makeFixture();
    const parent = path.dirname(fixture.pluginRoot);
    const roots: string[] = [];
    for (let index = 0; index <= TARGET_HISTORY_MAX_TARGETS; index += 1) {
      const pluginRoot = path.join(parent, `history-${index}`);
      await fs.mkdir(pluginRoot);
      await fs.writeFile(
        path.join(pluginRoot, "package.json"),
        JSON.stringify({ name: `bb-plugin-${index}`, version: "1.0.0" }),
      );
      roots.push(await fs.realpath(pluginRoot));
    }
    let nextId = 0;
    let now = 1_000;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse((nextId++).toString(36).padStart(32, "h")),
      clock: () => now++,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      let firstTargetId: string | undefined;
      let secondTargetId: string | undefined;
      let activeTargetId: string | undefined;
      for (let index = 0; index < TARGET_HISTORY_MAX_TARGETS; index += 1) {
        const [target] = await service.refreshFromCompleteSnapshot(context(), [
          await indexedCandidate(roots[index]!, index),
        ]);
        if (index === 0) firstTargetId = target!.id;
        if (index === 1) secondTargetId = target!.id;
        activeTargetId = target!.id;
      }
      const purgedTargetId = TargetIdSchema.parse(firstTargetId);
      const retainedSecondTargetId = TargetIdSchema.parse(secondTargetId);
      const retainedActiveTargetId = TargetIdSchema.parse(activeTargetId);

      const database = new Database(
        path.join(fixture.dataRoot, "workbench.sqlite3"),
      );
      const feed = createEventFeed(database);
      const purgedBindings = {
        principalId,
        bbContextId,
        targetId: purgedTargetId,
      };
      const retainedBindings = {
        principalId,
        bbContextId,
        targetId: retainedSecondTargetId,
      };
      const purgedCursor = feed.pull({ bindings: purgedBindings }).nextCursor!;
      const retainedCursor = feed.pull({
        bindings: retainedBindings,
      }).nextCursor!;
      database.exec(`
        CREATE TRIGGER test_fail_retained_history_compaction
        BEFORE DELETE ON runtime_objects
        WHEN OLD.id = '${purgedTargetId}'
        BEGIN
          SELECT RAISE(ABORT, 'injected retained-history failure');
        END
      `);

      await expect(
        service.refreshFromCompleteSnapshot(context(), [
          await indexedCandidate(
            roots[TARGET_HISTORY_MAX_TARGETS]!,
            TARGET_HISTORY_MAX_TARGETS,
          ),
        ]),
      ).rejects.toMatchObject({ code: "internal" });
      expect(service.listTargets(context()).map((target) => target.id)).toEqual(
        [retainedActiveTargetId],
      );
      expect(
        feed.pull({ bindings: purgedBindings, cursor: purgedCursor }),
      ).toEqual({ events: [], nextCursor: purgedCursor });
      expect(
        feed.pull({ bindings: retainedBindings, cursor: retainedCursor }),
      ).toEqual({ events: [], nextCursor: retainedCursor });
      expect(() =>
        database
          .query("DELETE FROM runtime_events WHERE object_id = ?")
          .run(purgedTargetId),
      ).toThrow();
      expect(
        database
          .query("SELECT COUNT(*) AS count FROM development_target_sources")
          .get(),
      ).toEqual({ count: TARGET_HISTORY_MAX_TARGETS });
      expect(
        database
          .query("SELECT COUNT(*) AS count FROM development_target_retirements")
          .get(),
      ).toEqual({ count: TARGET_HISTORY_MAX_TARGETS - 1 });
      database.exec("DROP TRIGGER test_fail_retained_history_compaction");

      const [cycled] = await service.refreshFromCompleteSnapshot(context(), [
        await indexedCandidate(
          roots[TARGET_HISTORY_MAX_TARGETS]!,
          TARGET_HISTORY_MAX_TARGETS,
        ),
      ]);
      expect(cycled!.id).not.toBe(activeTargetId);
      expect(service.listTargets(context()).map((target) => target.id)).toEqual(
        [cycled!.id],
      );

      try {
        expect(
          database.query("SELECT COUNT(*) AS count FROM runtime_objects").get(),
        ).toEqual({ count: TARGET_HISTORY_MAX_TARGETS });
        expect(() =>
          feed.pull({ bindings: purgedBindings, cursor: purgedCursor }),
        ).toThrow(new RuntimeError("invalid_request"));
        expect(
          feed.pull({ bindings: retainedBindings, cursor: retainedCursor }),
        ).toEqual({ events: [], nextCursor: retainedCursor });
      } finally {
        database.close();
      }

      const reopenedCatalog = await openDevelopmentTargetCatalog({
        dataRoot: fixture.dataRoot,
        id: () => ObjectIdSchema.parse("z".repeat(32)),
        clock: () => 2_000,
      });
      try {
        const reopenedService = createDevelopmentTargetService(reopenedCatalog);
        const [reopened] = await reopenedService.refreshFromCompleteSnapshot(
          context(),
          [await indexedCandidate(roots[1]!, 1)],
        );
        expect(reopened!.id).toBe(retainedSecondTargetId);
        expect(reopenedService.listTargets(context())).toHaveLength(1);
      } finally {
        reopenedCatalog.close();
      }
    } finally {
      catalog.close();
    }
  }, 60_000);

  test("bounds changed-event history while expiring only old cursors", async () => {
    const fixture = await makeFixture();
    let now = 1_000;
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => now++,
    });
    const service = createDevelopmentTargetService(catalog);
    await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    await service.refreshFromCompleteSnapshot(context(), []);
    await service.refreshFromCompleteSnapshot(context(), [
      await candidate(fixture.pluginRoot),
    ]);
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    const feed = createEventFeed(database);
    const bindings = { principalId, bbContextId, targetId };
    const oldCursor = feed.pull({ bindings }).nextCursor!;
    try {
      for (
        let index = 0;
        index < TARGET_EVENT_MAX_EVENTS_PER_TARGET;
        index += 1
      ) {
        await service.refreshFromTrustedCandidate(
          context(),
          await candidateNamed(fixture.pluginRoot, `Notes ${index}`),
        );
      }
      let recentCursor: string | undefined;
      for (;;) {
        const page = feed.pull({
          bindings,
          ...(recentCursor === undefined ? {} : { cursor: recentCursor }),
        });
        if (page.events.length === 0) break;
        recentCursor = page.nextCursor;
      }
      for (let index = 0; index < 10; index += 1) {
        await service.refreshFromTrustedCandidate(
          context(),
          await candidateNamed(fixture.pluginRoot, `Recent ${index}`),
        );
      }

      expect(() => feed.pull({ bindings, cursor: oldCursor })).toThrow(
        new RuntimeError("invalid_request"),
      );
      const recent = feed.pull({ bindings, cursor: recentCursor! });
      expect(recent.events).toHaveLength(10);
      expect(
        database
          .query(
            "SELECT COUNT(*) AS count FROM runtime_events WHERE object_id = ?",
          )
          .get(objectId),
      ).toEqual({ count: TARGET_EVENT_MAX_EVENTS_PER_TARGET });
      expect(
        database
          .query<{ event_type: string }, [string]>(
            `SELECT DISTINCT event_type FROM runtime_events
             WHERE object_id = ? ORDER BY event_type`,
          )
          .all(objectId)
          .map(({ event_type }) => event_type),
      ).toEqual([
        "object.created",
        "object.updated",
        "target.reopened",
        "target.retired",
      ]);
      expect(
        feed
          .pull({ bindings })
          .events.every(({ type }) => type === "object.updated"),
      ).toBe(true);
      const checkpoint = database
        .query<{ expired_through_sequence: number }, [string]>(
          `SELECT expired_through_sequence
           FROM development_target_event_retention WHERE object_id = ?`,
        )
        .get(objectId)!;
      expect(() =>
        database
          .query(
            "DELETE FROM development_target_event_retention WHERE object_id = ?",
          )
          .run(objectId),
      ).toThrow();
      let purgeCheckpointChanges = 0;
      expect(() =>
        database.transaction(() => {
          database
            .query("DELETE FROM development_target_sources WHERE object_id = ?")
            .run(objectId);
          purgeCheckpointChanges = database
            .query(
              "DELETE FROM development_target_event_retention WHERE object_id = ?",
            )
            .run(objectId).changes;
          throw new Error("rollback checkpoint purge tracer");
        })(),
      ).toThrow("rollback checkpoint purge tracer");
      expect(purgeCheckpointChanges).toBe(1);
      expect(
        database
          .query(
            "SELECT COUNT(*) AS count FROM development_target_event_retention WHERE object_id = ?",
          )
          .get(objectId),
      ).toEqual({ count: 1 });
      expect(() =>
        database
          .query(
            `UPDATE development_target_event_retention
             SET expired_through_sequence = ? WHERE object_id = ?`,
          )
          .run(checkpoint.expired_through_sequence - 1, objectId),
      ).toThrow();
      expect(() =>
        database
          .query(
            `UPDATE development_target_event_retention
             SET principal_id = 'wrong-principal' WHERE object_id = ?`,
          )
          .run(objectId),
      ).toThrow();
      expect(() => feed.pull({ bindings, cursor: oldCursor })).toThrow(
        new RuntimeError("invalid_request"),
      );
    } finally {
      database.close();
      catalog.close();
    }

    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
    });
    try {
      expect(
        createDevelopmentTargetService(reopened).listTargets(context()),
      ).toHaveLength(1);
    } finally {
      reopened.close();
    }

    const floorTamper = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    floorTamper
      .query(
        `UPDATE development_target_event_retention
         SET principal_id = ?, expired_through_sequence = (
           SELECT MAX(sequence) FROM runtime_events WHERE object_id = ?
         )`,
      )
      .run(principalId, objectId);
    floorTamper.close();
    await expect(
      openDevelopmentTargetCatalog({ dataRoot: fixture.dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
  });

  test("persists and reopens one self-bound target while keeping its root private", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const service = createDevelopmentTargetService(catalog);

    const created = await service.refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    expect(created.id).toBe(targetId);
    expect(created.revision).toBe(1);
    expect(service.listTargets(context())).toEqual([created]);
    expect(
      catalog.resolvePrivate({
        principalId,
        bbContextId,
        id: ObjectIdSchema.parse(created.id),
      }),
    ).toEqual({
      canonicalRoot: fixture.pluginRoot,
      rootKey: OpaqueIdSchema.parse("r".repeat(32)),
      rootKind: "current-project",
    });
    expect(JSON.stringify(created)).not.toContain(fixture.pluginRoot);
    expect(JSON.stringify(created)).not.toContain("r".repeat(32));
    expect(JSON.stringify(created)).not.toContain(principalId);
    expect(JSON.stringify(created)).not.toContain(bbContextId);
    catalog.close();

    const reopened = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => ObjectIdSchema.parse("u".repeat(32)),
      clock: () => 2_000,
    });
    try {
      const refreshed = await createDevelopmentTargetService(
        reopened,
      ).refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      expect(refreshed.id).toBe(targetId);
      expect(refreshed.revision).toBe(2);
      expect(refreshed.updatedAt).toBe(2_000);
    } finally {
      reopened.close();
    }
  });

  test("default-denies unscoped and target-bound credentials and does not enumerate across subjects", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const created = await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      expect(service.getTarget(context(), created.id)).toEqual(created);

      const unscoped = createRequestContext({
        id: principalId,
        kind: "mcp-client",
        scopes: [],
        revoked: false,
        bbContextId,
      });
      expect(() => service.listTargets(unscoped)).toThrow(
        new RuntimeError("forbidden"),
      );

      const targetBound = createRequestContext({
        id: principalId,
        kind: "plugin-adapter",
        scopes: ["targets:read"],
        revoked: false,
        bbContextId,
        targetId: TargetIdSchema.parse(objectId),
      });
      expect(() => service.listTargets(targetBound)).toThrow(
        new RuntimeError("forbidden"),
      );

      const revoked = createRequestContext({
        id: principalId,
        kind: "browser-session",
        scopes: ["targets:read"],
        revoked: true,
        bbContextId,
      });
      expect(() => service.listTargets(revoked)).toThrow(
        new RuntimeError("unauthenticated"),
      );

      const otherSubject = createRequestContext({
        id: PrincipalIdSchema.parse("q".repeat(32)),
        kind: "supervisor",
        scopes: ["targets:read"],
        revoked: false,
        bbContextId,
      });
      expect(service.listTargets(otherSubject)).toEqual([]);
      expect(() => service.getTarget(otherSubject, created.id)).toThrow(
        new RuntimeError("not_found"),
      );
    } finally {
      catalog.close();
    }
  });

  test("rejects raw path DTOs and cloned capabilities before catalog mutation", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      const issued = await candidate(fixture.pluginRoot);
      for (const forged of [
        candidateInput(fixture.pluginRoot),
        { ...issued },
        Object.create(issued) as unknown,
        Object.fromEntries(Object.entries(issued)),
      ]) {
        await expect(
          service.refreshFromTrustedCandidate(context(), forged as never),
        ).rejects.toMatchObject({ code: "invalid_request" });
      }
      const originalRoot = `${fixture.pluginRoot}-original`;
      await fs.rename(fixture.pluginRoot, originalRoot);
      await fs.mkdir(fixture.pluginRoot);
      await expect(
        service.refreshFromTrustedCandidate(context(), issued),
      ).rejects.toMatchObject({ code: "invalid_request" });
      expect(service.listTargets(context())).toEqual([]);
    } finally {
      catalog.close();
    }
  });

  test("uses optimistic revisions when refreshing a known source root", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const service = createDevelopmentTargetService(catalog);
      await service.refreshFromTrustedCandidate(
        context(),
        await candidate(fixture.pluginRoot),
      );
      const refreshed = await service.refreshFromTrustedCandidate(
        context(),
        await candidateNamed(fixture.pluginRoot, "Notes refreshed"),
        { expectedRevision: 1 },
      );
      expect(refreshed.revision).toBe(2);
      await expect(
        service.refreshFromTrustedCandidate(
          context(),
          await candidate(fixture.pluginRoot),
          { expectedRevision: 1 },
        ),
      ).rejects.toEqual(new RuntimeError("conflict"));
      expect(service.getTarget(context(), objectId)).toEqual(refreshed);
    } finally {
      catalog.close();
    }
  });

  test("rolls back public, private, and event writes atomically", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
    );
    try {
      database.exec(`
        CREATE TRIGGER test_fail_target_event
        BEFORE INSERT ON runtime_events
        BEGIN
          SELECT RAISE(ABORT, 'injected failure');
        END
      `);
      await expect(
        createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
          context(),
          await candidate(fixture.pluginRoot),
        ),
      ).rejects.toMatchObject({ code: "internal" });
      expect(catalog.list({ principalId, bbContextId })).toEqual([]);
      expect(database.query("SELECT * FROM runtime_objects").all()).toEqual([]);
      expect(
        database.query("SELECT * FROM development_target_sources").all(),
      ).toEqual([]);
      expect(database.query("SELECT * FROM runtime_events").all()).toEqual([]);
      database.exec("DROP TRIGGER test_fail_target_event");
    } finally {
      database.close();
      catalog.close();
    }
  });

  test("stores the canonical root privately and emits only a redacted event", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    await createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    catalog.close();

    const database = new Database(
      path.join(fixture.dataRoot, "workbench.sqlite3"),
      { readonly: true },
    );
    try {
      const publicRow = database
        .query<{ payload_json: string }, []>(
          "SELECT payload_json FROM runtime_objects",
        )
        .get()!;
      const privateRow = database
        .query<
          { canonical_root: string; root_key: string; root_kind: string },
          []
        >(
          "SELECT canonical_root, root_key, root_kind FROM development_target_sources",
        )
        .get()!;
      const eventRow = database.query("SELECT * FROM runtime_events").get()!;

      expect(privateRow).toEqual({
        canonical_root: fixture.pluginRoot,
        root_key: "r".repeat(32),
        root_kind: "current-project",
      });
      expect(publicRow.payload_json).not.toContain(fixture.pluginRoot);
      expect(publicRow.payload_json).not.toContain("r".repeat(32));
      expect(JSON.stringify(eventRow)).not.toContain(fixture.pluginRoot);
      expect(JSON.stringify(eventRow)).not.toContain("r".repeat(32));
    } finally {
      database.close();
    }
  });

  test("fails closed without repairing a target whose private source row is missing", async () => {
    const fixture = await makeFixture();
    const catalog = await openDevelopmentTargetCatalog({
      dataRoot: fixture.dataRoot,
      id: () => objectId,
      clock: () => 1_000,
    });
    await createDevelopmentTargetService(catalog).refreshFromTrustedCandidate(
      context(),
      await candidate(fixture.pluginRoot),
    );
    catalog.close();

    const databasePath = path.join(fixture.dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DELETE FROM development_target_sources");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({
        dataRoot: fixture.dataRoot,
        id: () => ObjectIdSchema.parse("u".repeat(32)),
        clock: () => 2_000,
      }),
    ).rejects.toMatchObject({ code: "corrupt_data" });

    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect.query("SELECT COUNT(*) AS count FROM runtime_objects").get(),
      ).toEqual({ count: 1 });
      expect(
        inspect
          .query("SELECT COUNT(*) AS count FROM development_target_sources")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      inspect.close();
    }
  });

  test("leaves the generic object service target-bound", async () => {
    const fixture = await makeFixture();
    const store = await openRuntimeStore({
      dataRoot: fixture.dataRoot,
      codecs: new ObjectCodecRegistry([DevelopmentTargetCodec]),
      id: () => objectId,
      clock: () => 1_000,
    });
    try {
      const targetBound = createRequestContext({
        id: principalId,
        kind: "plugin-adapter",
        scopes: ["targets:read", "targets:write"],
        revoked: false,
        bbContextId,
        targetId: TargetIdSchema.parse("z".repeat(32)),
      });
      expect(() =>
        createWorkbenchService(store).createObject(targetBound, {
          kind: "development-target",
          payload: candidateInput(fixture.pluginRoot).target,
        }),
      ).toThrow(new RuntimeError("invalid_request"));
      expect(() =>
        createWorkbenchService(store).getObject(targetBound, {
          id: objectId,
          kind: "development-target",
        }),
      ).toThrow(new RuntimeError("invalid_request"));
      expect(() =>
        createWorkbenchService(store).updateObject(targetBound, {
          id: objectId,
          kind: "development-target",
          expectedRevision: 1,
          payload: candidateInput(fixture.pluginRoot).target,
        }),
      ).toThrow(new RuntimeError("invalid_request"));
    } finally {
      store.close();
    }
  });
});
