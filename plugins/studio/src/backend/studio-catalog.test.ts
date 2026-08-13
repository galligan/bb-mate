import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInspectionDevelopmentTargetCandidateBridge,
  inspectDevelopmentSourceIdentity,
  ObjectIdSchema,
  OpaqueIdSchema,
  RuntimeError,
  type InspectionSourceCandidateFacts,
} from "@bb-plugin-studio/runtime/catalog";

import {
  openStudioCatalog,
  STUDIO_CATALOG_CONTEXT_ID,
  STUDIO_CATALOG_PRINCIPAL_ID,
} from "./studio-catalog.ts";

const temporaryRoots: string[] = [];

function migrate(database: Database, statements: string[]) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _bb_migrations (
      id INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    ) STRICT
  `);
  const applied = database.query("SELECT 1 FROM _bb_migrations WHERE id = ?");
  const record = database.query(
    "INSERT INTO _bb_migrations (id, applied_at) VALUES (?, ?)",
  );
  database.transaction(() => {
    statements.forEach((statement, index) => {
      if (applied.get(index)) return;
      database.exec(statement);
      record.run(index, index + 1);
    });
  })();
}

function createHostDatabase(database: Database) {
  return {
    exec: (sql: string) => database.exec(sql),
    prepare: (sql: string) => database.query(sql),
    transaction: <Result>(operation: () => Result) =>
      database.transaction(operation),
    pragma(source: string, options?: { simple?: boolean }) {
      const row = database.query(`PRAGMA ${source}`).get() as
        Record<string, unknown> | undefined;
      return options?.simple && row ? Object.values(row)[0] : row;
    },
  };
}

function createStorage(database: Database) {
  const hostDatabase = createHostDatabase(database);
  return {
    hostDatabase,
    storage: {
      database: () => hostDatabase as never,
      migrate(_database: never, statements: string[]) {
        migrate(database, statements);
      },
    },
  };
}

function createInspectionHarness() {
  const issuedFacts = new WeakMap<object, InspectionSourceCandidateFacts>();
  const activeTransitions = new WeakMap<object, unknown>();
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    clock: () => 1_000,
    async consumeIssuedSourceCandidate(candidate, consumer) {
      if (typeof candidate !== "object" || candidate === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = issuedFacts.get(candidate);
      if (!value) throw new RuntimeError("invalid_request");
      issuedFacts.delete(candidate);
      const identity = await inspectDevelopmentSourceIdentity(
        value.canonicalRoot,
      );
      const transition = Object.freeze({ transition: true });
      activeTransitions.set(transition, {
        ...value,
        directoryIdentity: {
          canonicalRoot: identity.canonicalRoot,
          device: identity.device,
          inode: identity.inode,
        },
        manifestIdentity: identity.manifest,
      });
      try {
        return await consumer(transition);
      } finally {
        activeTransitions.delete(transition);
      }
    },
    readSourceCandidateTransition(transition) {
      if (typeof transition !== "object" || transition === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = activeTransitions.get(transition);
      if (!value) throw new RuntimeError("invalid_request");
      return value;
    },
  });
  return {
    bridge,
    issue(value: InspectionSourceCandidateFacts) {
      const candidate = Object.freeze({ ...value });
      issuedFacts.set(candidate, candidate);
      return bridge.issue(candidate);
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("Studio catalog on bb-owned storage", () => {
  test("proves the adapter and reload lifecycle against real better-sqlite3", async () => {
    const proof = Bun.spawn(
      [
        "node",
        "--experimental-strip-types",
        fileURLToPath(
          new URL("./studio-catalog.better-sqlite3-proof.ts", import.meta.url),
        ),
      ],
      { stderr: "pipe", stdout: "pipe" },
    );
    const [exitCode, stderr] = await Promise.all([
      proof.exited,
      new Response(proof.stderr).text(),
    ]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
  });

  test("uses bb migrations, enables foreign keys, and preserves the host journal mode", async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "studio-bb-storage-"),
    );
    temporaryRoots.push(root);
    const database = new Database(path.join(root, "data.db"), {
      create: true,
      strict: true,
    });
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA foreign_keys = OFF");
    const { hostDatabase, storage } = createStorage(database);
    let migrationCalls = 0;

    const catalog = openStudioCatalog({
      ...storage,
      migrate(_db, statements) {
        migrationCalls += 1;
        migrate(database, statements);
      },
    });

    expect(migrationCalls).toBe(1);
    expect(hostDatabase.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(hostDatabase.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(
      database
        .query(
          "SELECT name FROM sqlite_schema WHERE name = 'runtime_migrations'",
        )
        .get(),
    ).toBeNull();

    catalog.close();
    expect(database.query("SELECT 1 AS value").get()).toEqual({ value: 1 });
    database.close();
  });

  test("preserves target identity, revision, and history across a bb-style reload", async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "studio-bb-reload-"),
    );
    temporaryRoots.push(root);
    const pluginRoot = path.join(root, "plugin");
    await fs.mkdir(pluginRoot);
    await fs.writeFile(
      path.join(pluginRoot, "package.json"),
      JSON.stringify({ name: "bb-plugin-notes", version: "1.2.3" }),
    );
    const facts = {
      rootKey: OpaqueIdSchema.parse("r".repeat(32)),
      rootKind: "current-project" as const,
      canonicalRoot: await fs.realpath(pluginRoot),
      displayName: "Notes",
      displayPath: "plugins/notes",
      packageName: "bb-plugin-notes",
      version: "1.2.3",
      pluginId: "notes",
      hasServer: true,
      hasApp: true,
    };
    const databasePath = path.join(root, "data.db");
    const firstDatabase = new Database(databasePath, {
      create: true,
      strict: true,
    });
    const firstCatalog = openStudioCatalog(
      createStorage(firstDatabase).storage,
      {
        id: () => ObjectIdSchema.parse("t".repeat(32)),
        clock: () => 1_000,
      },
    );
    const firstInspection = createInspectionHarness();
    const first = await firstCatalog.refresh({
      principalId: STUDIO_CATALOG_PRINCIPAL_ID,
      bbContextId: STUDIO_CATALOG_CONTEXT_ID,
      candidate: await firstInspection.issue(facts),
    });
    const secondInspection = createInspectionHarness();
    const second = await firstCatalog.refresh({
      principalId: STUDIO_CATALOG_PRINCIPAL_ID,
      bbContextId: STUDIO_CATALOG_CONTEXT_ID,
      candidate: await secondInspection.issue(facts),
    });
    expect(second).toMatchObject({ id: first.id, revision: 2 });

    firstCatalog.close();
    expect(firstDatabase.query("SELECT 1").get()).not.toBeNull();
    firstDatabase.close();
    expect(() =>
      firstCatalog.list({
        principalId: STUDIO_CATALOG_PRINCIPAL_ID,
        bbContextId: STUDIO_CATALOG_CONTEXT_ID,
      }),
    ).toThrow();

    const reloadedDatabase = new Database(databasePath, { strict: true });
    const reloadedCatalog = openStudioCatalog(
      createStorage(reloadedDatabase).storage,
    );
    expect(
      reloadedCatalog.list({
        principalId: STUDIO_CATALOG_PRINCIPAL_ID,
        bbContextId: STUDIO_CATALOG_CONTEXT_ID,
      }),
    ).toEqual([second]);
    expect(
      reloadedDatabase
        .query(
          "SELECT COUNT(*) AS count FROM runtime_events WHERE object_id = ?",
        )
        .get(first.id),
    ).toEqual({ count: 2 });
    reloadedDatabase.close();
  });

  test("fails closed when bb storage contains a tampered catalog schema", async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "studio-bb-tamper-"),
    );
    temporaryRoots.push(root);
    const database = new Database(path.join(root, "data.db"), {
      create: true,
      strict: true,
    });
    const storage = createStorage(database).storage;
    openStudioCatalog(storage).close();
    database.exec("DROP INDEX development_target_sources_context");

    expect(() => openStudioCatalog(storage)).toThrow(
      expect.objectContaining({ code: "corrupt_data" }),
    );
    database.close();
  });

  test("does not expose a catalog when bb rejects its migration transaction", () => {
    const database = new Database(":memory:", { strict: true });
    const { hostDatabase } = createStorage(database);
    const failure = new Error("migration rolled back");

    expect(() =>
      openStudioCatalog({
        database: () => hostDatabase as never,
        migrate() {
          throw failure;
        },
      }),
    ).toThrow(failure);
    expect(
      database
        .query("SELECT name FROM sqlite_schema WHERE name = 'runtime_objects'")
        .get(),
    ).toBeNull();
    database.close();
  });
});
