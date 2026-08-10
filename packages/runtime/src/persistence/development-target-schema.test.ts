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
});
