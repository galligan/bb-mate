import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { z } from "zod";

import {
  defineObjectCodec,
  ObjectCodecRegistry,
} from "../contracts/objects.ts";
import { openRuntimeStore } from "./store.ts";

const temporaryRoots: string[] = [];

async function makeDataRoot(): Promise<string> {
  const temporaryDirectory = await fs.realpath(os.tmpdir());
  const parent = await fs.mkdtemp(
    path.join(temporaryDirectory, "bb-plugin-studio-schema-"),
  );
  temporaryRoots.push(parent);
  return path.join(parent, "data");
}

function codecs(): ObjectCodecRegistry {
  return new ObjectCodecRegistry([
    defineObjectCodec("annotation", { body: z.string() }),
  ]);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { force: true, recursive: true })),
  );
});

describe("runtime schema attestation", () => {
  test("rejects a missing append-only trigger without repairing it", async () => {
    const dataRoot = await makeDataRoot();
    (await openRuntimeStore({ dataRoot, codecs: codecs() })).close();
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DROP TRIGGER runtime_events_no_delete");
    tamper.close();

    await expect(
      openRuntimeStore({ dataRoot, codecs: codecs() }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_schema WHERE name = 'runtime_events_no_delete'",
        )
        .get(),
    ).toBeNull();
    inspect.close();
  });

  test("rejects a missing security-binding index without recreating it", async () => {
    const dataRoot = await makeDataRoot();
    (await openRuntimeStore({ dataRoot, codecs: codecs() })).close();
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("DROP INDEX runtime_objects_bindings");
    tamper.close();

    await expect(
      openRuntimeStore({ dataRoot, codecs: codecs() }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect
        .query(
          "SELECT name FROM sqlite_schema WHERE name = 'runtime_objects_bindings'",
        )
        .get(),
    ).toBeNull();
    inspect.close();
  });

  test("rejects an altered object table without rewriting it", async () => {
    const dataRoot = await makeDataRoot();
    (await openRuntimeStore({ dataRoot, codecs: codecs() })).close();
    const databasePath = path.join(dataRoot, "workbench.sqlite3");
    const tamper = new Database(databasePath);
    tamper.exec("ALTER TABLE runtime_objects ADD COLUMN injected TEXT");
    tamper.close();

    await expect(
      openRuntimeStore({ dataRoot, codecs: codecs() }),
    ).rejects.toMatchObject({ code: "corrupt_data" });
    const inspect = new Database(databasePath, { readonly: true });
    expect(
      inspect.query("PRAGMA table_info(runtime_objects)").all(),
    ).toContainEqual(expect.objectContaining({ name: "injected" }));
    inspect.close();
  });
});
