import { expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { BbContextIdSchema, PrincipalIdSchema } from "../contracts/ids.ts";
import { openRuntimeDatabase } from "../persistence/database.ts";
import { RUNTIME_MIGRATIONS } from "../persistence/runtime-migrations.ts";
import { adaptQuerySqliteDatabase } from "../persistence/sqlite.ts";
import { createDevelopmentTargetCatalog } from "./catalog.ts";

test("constructs a catalog around a caller-owned migrated database", async () => {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "studio-catalog-database-"),
  );
  const database = await openRuntimeDatabase({
    dataRoot: path.join(root, "data"),
    migrations: RUNTIME_MIGRATIONS,
  });
  let disposed = false;

  try {
    const catalog = createDevelopmentTargetCatalog({
      database: adaptQuerySqliteDatabase(database.database),
      dispose: () => {
        disposed = true;
      },
    });

    expect(
      catalog.list({
        principalId: PrincipalIdSchema.parse("p".repeat(32)),
        bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      }),
    ).toEqual([]);

    catalog.close();
    expect(disposed).toBe(true);
  } finally {
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
