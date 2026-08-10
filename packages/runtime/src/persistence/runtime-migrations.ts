import { DEVELOPMENT_TARGET_MIGRATIONS } from "../discovery/schema.ts";
import { EVENT_MIGRATIONS } from "../events/schema.ts";
import type { RuntimeMigration } from "./migrations.ts";
import { OBJECT_MIGRATIONS } from "./schema.ts";

export const RUNTIME_MIGRATIONS: readonly RuntimeMigration[] = [
  ...OBJECT_MIGRATIONS,
  ...EVENT_MIGRATIONS,
  ...DEVELOPMENT_TARGET_MIGRATIONS,
];
