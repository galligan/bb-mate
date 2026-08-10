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
});
