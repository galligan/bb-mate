import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { openDevelopmentTargetCatalog } from "../discovery/catalog.ts";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("development-target source schema attestation", () => {
  test("upgrades legacy append-only guards to parent-lifetime retention guards", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-target-retention-upgrade-"),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    (await openDevelopmentTargetCatalog({ dataRoot })).close();

    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const legacy = new Database(databasePath);
    legacy.exec(`
      DROP TABLE development_target_project_scopes;
      DROP TABLE development_target_event_retention;
      DROP TRIGGER runtime_events_no_delete;
      DROP TRIGGER development_target_host_observations_no_delete;
      CREATE TRIGGER runtime_events_no_delete
        BEFORE DELETE ON runtime_events
        BEGIN
          SELECT RAISE(ABORT, 'runtime events are append-only');
        END;
      CREATE TRIGGER development_target_host_observations_no_delete
        BEFORE DELETE ON development_target_host_observations
        BEGIN
          SELECT RAISE(ABORT, 'development target host observations are append-only');
        END;
      DELETE FROM runtime_migrations WHERE version IN (6, 7, 8);
    `);
    legacy.close();

    (await openDevelopmentTargetCatalog({ dataRoot })).close();
    const inspect = new Database(databasePath, { readonly: true });
    try {
      const triggerSql = inspect
        .query<{ name: string; sql: string }, []>(
          `
          SELECT name, sql FROM sqlite_schema
          WHERE name IN (
            'runtime_events_no_delete',
            'development_target_host_observations_no_delete'
          )
          ORDER BY name
        `,
        )
        .all();
      expect(triggerSql[0]?.sql).toContain("development_target_retirements");
      expect(triggerSql[1]?.sql).toContain("runtime_objects");
      expect(
        inspect
          .query(
            "SELECT name FROM sqlite_schema WHERE name = 'development_target_project_scopes'",
          )
          .get(),
      ).toEqual({ name: "development_target_project_scopes" });
      expect(
        inspect
          .query(
            "SELECT name FROM sqlite_schema WHERE name = 'development_target_event_retention'",
          )
          .get(),
      ).toEqual({ name: "development_target_event_retention" });
      expect(
        inspect
          .query("SELECT MAX(version) AS version FROM runtime_migrations")
          .get(),
      ).toEqual({ version: 8 });
    } finally {
      inspect.close();
    }
  });

  test("creates a strict private host-observation table with no topology fields", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-target-host-schema-"),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    (await openDevelopmentTargetCatalog({ dataRoot })).close();

    const database = new Database(path.join(dataRoot, "workbench.sqlite3"), {
      readonly: true,
    });
    try {
      expect(
        database
          .query<{ name: string }, []>(
            "SELECT name FROM pragma_table_info('development_target_host_observations') ORDER BY cid",
          )
          .all()
          .map(({ name }) => name),
      ).toEqual([
        "object_id",
        "principal_id",
        "bb_context_id",
        "runtime_instance_id",
        "hostname",
        "bb_host_id",
        "bb_host_name",
        "bb_host_is_server",
        "observed_at",
      ]);
      expect(
        database
          .query<{ sql: string }, []>(
            "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'development_target_host_observations'",
          )
          .get()!.sql,
      ).toContain("STRICT");
    } finally {
      database.close();
    }
  });

  test("rejects a missing private-source index without recreating it", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-target-schema-"),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    (await openDevelopmentTargetCatalog({ dataRoot })).close();

    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DROP INDEX development_target_sources_context");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });

    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect
          .query(
            "SELECT name FROM sqlite_schema WHERE name = 'development_target_sources_context'",
          )
          .get(),
      ).toBeNull();
    } finally {
      inspect.close();
    }
  });

  test("rejects a missing private-host no-delete trigger without recreating it", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-target-host-attestation-"),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    (await openDevelopmentTargetCatalog({ dataRoot })).close();

    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DROP TRIGGER development_target_host_observations_no_delete");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });

    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect
          .query(
            "SELECT name FROM sqlite_schema WHERE name = 'development_target_host_observations_no_delete'",
          )
          .get(),
      ).toBeNull();
    } finally {
      inspect.close();
    }
  });

  test("rejects a missing event-retention guard without recreating it", async () => {
    const temporaryRoot = await fs.realpath(os.tmpdir());
    const parent = await fs.mkdtemp(
      path.join(temporaryRoot, "bb-mate-target-retention-guard-"),
    );
    temporaryRoots.push(parent);
    const dataRoot = path.join(parent, "data");
    (await openDevelopmentTargetCatalog({ dataRoot })).close();

    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DROP TRIGGER development_target_event_retention_no_delete");
    tamper.close();

    await expect(
      openDevelopmentTargetCatalog({ dataRoot }),
    ).rejects.toMatchObject({ code: "corrupt_data" });

    const inspect = new Database(databasePath, { readonly: true });
    try {
      expect(
        inspect
          .query(
            "SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'development_target_event_retention_no_delete'",
          )
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      inspect.close();
    }
  });
});
