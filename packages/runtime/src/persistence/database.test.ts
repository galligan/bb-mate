import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { openRuntimeDatabase } from "./database.ts";
import type { RuntimeMigration } from "./migrations.ts";

const temporaryRoots: string[] = [];

async function makeParent(): Promise<string> {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(
    path.join(temporaryDirectory, "bb-plugin-studio-runtime-"),
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

describe("openRuntimeDatabase", () => {
  test("requires an explicit absolute data root", async () => {
    for (const dataRoot of ["", "."]) {
      await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
        code: "invalid_request",
      });
    }
  });

  test("creates a private data root and rollback-journal database", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");

    const store = await openRuntimeDatabase({ dataRoot });

    try {
      expect((await fs.stat(dataRoot)).mode & 0o777).toBe(0o700);
      expect((await fs.stat(store.databasePath)).mode & 0o777).toBe(0o600);
      expect(
        store.database.query("PRAGMA journal_mode").get() as {
          journal_mode: string;
        },
      ).toEqual({ journal_mode: "delete" });
      expect(store.database.query("PRAGMA foreign_keys").get()).toEqual({
        foreign_keys: 1,
      });
      expect(store.database.query("PRAGMA busy_timeout").get()).toEqual({
        timeout: 5_000,
      });
      expect(store.database.query("PRAGMA synchronous").get()).toEqual({
        synchronous: 2,
      });
    } finally {
      store.close();
    }
  });

  test("rejects a symlink data root without writing through it", async () => {
    const parent = await makeParent();
    const outside = path.join(parent, "outside");
    const dataRoot = path.join(parent, "data");
    await fs.mkdir(outside);
    await fs.symlink(outside, dataRoot);

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(await fs.readdir(outside)).toEqual([]);
  });

  test("rejects a symlinked data-root ancestor without writing through it", async () => {
    const parent = await makeParent();
    const outside = path.join(parent, "outside");
    const alias = path.join(parent, "alias");
    await fs.mkdir(outside, { mode: 0o700 });
    await fs.symlink(outside, alias);

    await expect(
      openRuntimeDatabase({ dataRoot: path.join(alias, "data") }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(await fs.readdir(outside)).toEqual([]);
  });

  test("fails closed instead of repairing an unsafe existing data root", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    await fs.mkdir(dataRoot, { mode: 0o755 });

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect((await fs.stat(dataRoot)).mode & 0o777).toBe(0o755);
    expect(await fs.readdir(dataRoot)).toEqual([]);
  });

  test("fails closed instead of repairing an unsafe existing database", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    await fs.writeFile(databasePath, "do not replace", { mode: 0o644 });

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect((await fs.stat(databasePath)).mode & 0o777).toBe(0o644);
    expect(await fs.readFile(databasePath, "utf8")).toBe("do not replace");
  });

  test("rejects a symlink database without touching its target", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    const outside = path.join(parent, "outside.sqlite3");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    await fs.writeFile(outside, "outside", { mode: 0o600 });
    await fs.symlink(outside, databasePath);

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(await fs.readFile(outside, "utf8")).toBe("outside");
  });

  test("rejects a symlink SQLite sidecar without touching its target", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    (await openRuntimeDatabase({ dataRoot })).close();
    const outside = path.join(parent, "outside-journal");
    await fs.writeFile(outside, "outside", { mode: 0o600 });
    await fs.symlink(outside, path.join(dataRoot, "workbench.sqlite3-journal"));

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(await fs.readFile(outside, "utf8")).toBe("outside");
  });

  test("rejects WAL and shared-memory sidecars without touching them", async () => {
    for (const suffix of ["-wal", "-shm"]) {
      const parent = await makeParent();
      const dataRoot = path.join(parent, "data");
      (await openRuntimeDatabase({ dataRoot })).close();
      const sidecarPath = path.join(dataRoot, `workbench.sqlite3${suffix}`);
      const bytes = Buffer.from(`unexpected${suffix}`);
      await fs.writeFile(sidecarPath, bytes, { mode: 0o600 });

      await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
        code: "invalid_request",
      });
      expect(await fs.readFile(sidecarPath)).toEqual(bytes);
    }
  });

  test("rejects a permissive or hard-linked rollback journal", async () => {
    const permissiveParent = await makeParent();
    const permissiveRoot = path.join(permissiveParent, "data");
    (await openRuntimeDatabase({ dataRoot: permissiveRoot })).close();
    const permissiveJournal = path.join(
      permissiveRoot,
      "workbench.sqlite3-journal",
    );
    await fs.writeFile(permissiveJournal, "permissive", { mode: 0o644 });
    await expect(
      openRuntimeDatabase({ dataRoot: permissiveRoot }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect((await fs.stat(permissiveJournal)).mode & 0o777).toBe(0o644);

    const linkedParent = await makeParent();
    const linkedRoot = path.join(linkedParent, "data");
    (await openRuntimeDatabase({ dataRoot: linkedRoot })).close();
    const outside = path.join(linkedParent, "outside-journal");
    await fs.writeFile(outside, "linked", { mode: 0o600 });
    await fs.link(outside, path.join(linkedRoot, "workbench.sqlite3-journal"));
    await expect(
      openRuntimeDatabase({ dataRoot: linkedRoot }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(await fs.readFile(outside, "utf8")).toBe("linked");
    expect((await fs.stat(outside)).nlink).toBe(2);
  });

  test("rejects WAL mode before a pending migration can write", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    const walDatabase = new Database(databasePath, { create: true });
    expect(walDatabase.query("PRAGMA journal_mode = WAL").get()).toEqual({
      journal_mode: "wal",
    });
    walDatabase.close();
    await fs.chmod(databasePath, 0o600);
    const migration: RuntimeMigration = {
      version: 1,
      checksum: "must-not-write-in-wal",
      apply(database) {
        database.exec("CREATE TABLE forbidden_wal_write (value TEXT)");
      },
    };
    const before = await fs.readFile(databasePath);

    await expect(
      openRuntimeDatabase({ dataRoot, migrations: [migration] }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    expect(await fs.readFile(databasePath)).toEqual(before);
    expect(await fs.readdir(dataRoot)).toEqual(["workbench.sqlite3"]);
  });

  test("keeps new paths private under a permissive process umask", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    const moduleUrl = new URL("./database.ts", import.meta.url).href;
    const subprocess = Bun.spawn(
      [
        process.execPath,
        "-e",
        `process.umask(0); const { openRuntimeDatabase } = await import(${JSON.stringify(moduleUrl)}); const store = await openRuntimeDatabase({ dataRoot: process.argv[1] }); store.close();`,
        dataRoot,
      ],
      { stderr: "pipe", stdout: "pipe" },
    );

    const exitCode = await subprocess.exited;
    expect(await new Response(subprocess.stderr).text()).toBe("");
    expect(exitCode).toBe(0);
    expect((await fs.stat(dataRoot)).mode & 0o777).toBe(0o700);
    expect(
      (await fs.stat(path.join(dataRoot, "workbench.sqlite3"))).mode & 0o777,
    ).toBe(0o600);
  });

  test("reports corruption without deleting or replacing the database", async () => {
    const parent = await makeParent();
    const dataRoot = path.join(parent, "data");
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const corruptBytes = Buffer.from("this is not sqlite");
    await fs.mkdir(dataRoot, { mode: 0o700 });
    await fs.writeFile(databasePath, corruptBytes, { mode: 0o600 });

    await expect(openRuntimeDatabase({ dataRoot })).rejects.toMatchObject({
      code: "corrupt_data",
    });
    expect(await fs.readFile(databasePath)).toEqual(corruptBytes);
  });
});
