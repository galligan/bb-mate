import type { ObjectId } from "../contracts/ids.ts";
import { openRuntimeDatabase } from "../persistence/database.ts";
import { RUNTIME_MIGRATIONS } from "../persistence/runtime-migrations.ts";
import { adaptQuerySqliteDatabase } from "../persistence/sqlite.ts";
import {
  createDevelopmentTargetCatalog,
  type DevelopmentTargetCatalog,
} from "./catalog.ts";

export interface OpenDevelopmentTargetCatalogOptions {
  readonly dataRoot: string;
  readonly clock?: () => number;
  readonly id?: () => ObjectId;
}

/** Filesystem/Bun adapter retained for the standalone runtime. */
export async function openDevelopmentTargetCatalog(
  options: OpenDevelopmentTargetCatalogOptions,
): Promise<DevelopmentTargetCatalog> {
  const runtimeDatabase = await openRuntimeDatabase({
    dataRoot: options.dataRoot,
    migrations: RUNTIME_MIGRATIONS,
  });
  try {
    return createDevelopmentTargetCatalog({
      database: adaptQuerySqliteDatabase(runtimeDatabase.database),
      clock: options.clock,
      id: options.id,
      dispose: runtimeDatabase.close,
    });
  } catch (error) {
    runtimeDatabase.close();
    throw error;
  }
}
