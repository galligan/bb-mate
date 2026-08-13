import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { RuntimeError } from "../errors.ts";
import { openRuntimeDatabase } from "./database.ts";
import type { RuntimeMigration } from "./migrations.ts";

const temporaryRoots: string[] = [];

async function makeParent(): Promise<string> {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(
    path.join(temporaryDirectory, "bb-plugin-studio-migrations-"),
  );
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("runtime migrations", () => {
  test("applies pending numbered migrations in order", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const migrations: readonly RuntimeMigration[] = [
      {
        version: 1,
        checksum: "create-records-v1",
        apply(database) {
          database.exec("CREATE TABLE records (value TEXT NOT NULL)");
        },
      },
      {
        version: 2,
        checksum: "seed-records-v2",
        apply(database) {
          database.exec("INSERT INTO records VALUES ('ordered')");
        },
      },
    ];
    const store = await openRuntimeDatabase({ dataRoot, migrations });

    try {
      expect(store.database.query("SELECT value FROM records").all()).toEqual([
        { value: "ordered" },
      ]);
    } finally {
      store.close();
    }
  });

  test("reopens without reapplying completed migrations", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const migrations: readonly RuntimeMigration[] = [
      {
        version: 1,
        checksum: "create-and-seed-v1",
        apply(database) {
          database.exec(`
            CREATE TABLE records (value TEXT NOT NULL);
            INSERT INTO records VALUES ('once');
          `);
        },
      },
    ];
    (await openRuntimeDatabase({ dataRoot, migrations })).close();
    const reopened = await openRuntimeDatabase({ dataRoot, migrations });

    try {
      expect(
        reopened.database.query("SELECT value FROM records").all(),
      ).toEqual([{ value: "once" }]);
    } finally {
      reopened.close();
    }
  });

  test("rejects checksum drift in an applied migration", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const original: RuntimeMigration = {
      version: 1,
      checksum: "original-v1",
      apply(database) {
        database.exec("CREATE TABLE records (value TEXT NOT NULL)");
      },
    };
    (await openRuntimeDatabase({ dataRoot, migrations: [original] })).close();

    await expect(
      openRuntimeDatabase({
        dataRoot,
        migrations: [{ ...original, checksum: "rewritten-v1" }],
      }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
  });

  test("rejects a database created by a newer schema", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const migrations: readonly RuntimeMigration[] = [
      {
        version: 1,
        checksum: "v1",
        apply(database) {
          database.exec("CREATE TABLE records (value TEXT NOT NULL)");
        },
      },
      {
        version: 2,
        checksum: "v2",
        apply(database) {
          database.exec("ALTER TABLE records ADD COLUMN detail TEXT");
        },
      },
    ];
    (await openRuntimeDatabase({ dataRoot, migrations })).close();

    await expect(
      openRuntimeDatabase({ dataRoot, migrations: migrations.slice(0, 1) }),
    ).rejects.toMatchObject({ code: "unsupported_schema" });
  });

  test("reports an incompatible migration ledger as corrupt data", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    const incompatible = new Database(databasePath, { create: true });
    incompatible.exec("CREATE TABLE runtime_migrations (unexpected TEXT)");
    incompatible.close();
    await fs.chmod(databasePath, 0o600);

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "corrupt_data",
    });
    expect((await fs.stat(databasePath)).isFile()).toBeTrue();
  });

  test("does not initialize a missing ledger in an existing database", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    const foreign = new Database(databasePath, { create: true });
    foreign.exec("CREATE TABLE foreign_data (value TEXT)");
    foreign.close();
    await fs.chmod(databasePath, 0o600);

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "corrupt_data",
    });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_schema WHERE name = 'runtime_migrations'",
        )
        .get(),
    ).toBeNull();
    expect(
      inspect
        .query("SELECT name FROM sqlite_schema WHERE name = 'foreign_data'")
        .get(),
    ).toEqual({ name: "foreign_data" });
    inspect.close();
  });

  test("rolls back a failed migration without recording it", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const first: RuntimeMigration = {
      version: 1,
      checksum: "records-v1",
      apply(database) {
        database.exec("CREATE TABLE records (value TEXT NOT NULL)");
      },
    };
    const failing: RuntimeMigration = {
      version: 2,
      checksum: "failing-v2",
      apply(database) {
        database.exec("INSERT INTO records VALUES ('must roll back')");
        throw new Error("injected migration failure");
      },
    };

    await expect(
      openRuntimeDatabase({ dataRoot, migrations: [first, failing] }),
    ).rejects.toThrow("injected migration failure");
    const reopened = await openRuntimeDatabase({
      dataRoot,
      migrations: [first],
    });
    try {
      expect(reopened.database.query("SELECT * FROM records").all()).toEqual(
        [],
      );
    } finally {
      reopened.close();
    }
  });

  test("rejects a migration list that is not consecutively numbered", async () => {
    await expect(
      openRuntimeDatabase({
        dataRoot: path.join(await makeParent(), "data"),
        migrations: [{ version: 2, checksum: "skipped-v1", apply() {} }],
      }),
    ).rejects.toThrow("Migration versions must be consecutive starting at 1");
  });

  test("rejects a gapped applied migration ledger without backfilling it", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const migrations: readonly RuntimeMigration[] = [
      {
        version: 1,
        checksum: "v1",
        apply(database) {
          database.exec("CREATE TABLE first_table (value TEXT)");
        },
      },
      {
        version: 2,
        checksum: "v2",
        apply(database) {
          database.exec("CREATE TABLE forbidden_backfill (value TEXT)");
        },
      },
      {
        version: 3,
        checksum: "v3",
        apply(database) {
          database.exec("CREATE TABLE third_table (value TEXT)");
        },
      },
    ];
    (
      await openRuntimeDatabase({
        dataRoot,
        migrations: migrations.slice(0, 1),
      })
    ).close();
    const tamper = new Database(databasePath);
    tamper
      .query(
        "INSERT INTO runtime_migrations (version, checksum) VALUES (3, 'v3')",
      )
      .run();
    tamper.close();

    await expect(
      openRuntimeDatabase({ dataRoot, migrations }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath);
    expect(
      inspect
        .query("SELECT version FROM runtime_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }, { version: 3 }]);
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_master WHERE name = 'forbidden_backfill'",
        )
        .get(),
    ).toBeNull();
    inspect.close();
  });

  test("attests applied schema before writing a pending migration", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const first: RuntimeMigration = {
      version: 1,
      checksum: "attested-v1",
      apply(database) {
        database.exec("CREATE TABLE protected_table (value TEXT)");
      },
      verify(database) {
        const columns = database
          .query("PRAGMA table_info(protected_table)")
          .all() as { name: string }[];
        if (columns.map(({ name }) => name).join(",") !== "value") {
          throw new RuntimeError("corrupt_data");
        }
      },
    };
    const second: RuntimeMigration = {
      version: 2,
      checksum: "must-not-run-v2",
      apply(database) {
        database.exec("CREATE TABLE forbidden_pending_write (value TEXT)");
      },
    };
    (await openRuntimeDatabase({ dataRoot, migrations: [first] })).close();
    const tamper = new Database(databasePath);
    tamper.exec("ALTER TABLE protected_table ADD COLUMN injected TEXT");
    tamper.close();

    await expect(
      openRuntimeDatabase({ dataRoot, migrations: [first, second] }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_schema WHERE name = 'forbidden_pending_write'",
        )
        .get(),
    ).toBeNull();
    expect(
      inspect
        .query("SELECT version FROM runtime_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }]);
    inspect.close();
  });

  test("rolls back a pending migration when its attestation fails", async () => {
    const dataRoot = path.join(await makeParent(), "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const first: RuntimeMigration = {
      version: 1,
      checksum: "base-v1",
      apply(database) {
        database.exec("CREATE TABLE base_table (value TEXT)");
      },
    };
    const failing: RuntimeMigration = {
      version: 2,
      checksum: "unattested-v2",
      apply(database) {
        database.exec("CREATE TABLE unattested_table (value TEXT)");
      },
      verify() {
        throw new RuntimeError("corrupt_data");
      },
    };
    (await openRuntimeDatabase({ dataRoot, migrations: [first] })).close();

    await expect(
      openRuntimeDatabase({ dataRoot, migrations: [first, failing] }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect
        .query("SELECT name FROM sqlite_schema WHERE name = 'unattested_table'")
        .get(),
    ).toBeNull();
    expect(
      inspect
        .query("SELECT version FROM runtime_migrations ORDER BY version")
        .all(),
    ).toEqual([{ version: 1 }]);
    inspect.close();
  });
});
