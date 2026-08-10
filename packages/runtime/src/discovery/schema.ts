import { createHash } from "node:crypto";

import type { RuntimeMigration } from "../persistence/migrations.ts";
import {
  verifyOwnedSchema,
  type ExpectedSchemaEntry,
} from "../persistence/schema-verification.ts";

const SOURCES_TABLE = `CREATE TABLE development_target_sources (
    object_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    root_key TEXT NOT NULL,
    root_kind TEXT NOT NULL CHECK (root_kind IN ('current-project', 'explicit', 'pinned')),
    canonical_root TEXT NOT NULL,
    FOREIGN KEY (object_id) REFERENCES runtime_objects(id) ON DELETE RESTRICT,
    UNIQUE (principal_id, bb_context_id, canonical_root)
  ) STRICT`;

const SOURCES_INDEX = `CREATE INDEX development_target_sources_context
    ON development_target_sources (principal_id, bb_context_id, object_id)`;

const SOURCE_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  {
    type: "table",
    name: "development_target_sources",
    sql: SOURCES_TABLE,
  },
  {
    type: "index",
    name: "development_target_sources_context",
    sql: SOURCES_INDEX,
  },
];
const SOURCE_SCHEMA = `${SOURCES_TABLE};\n${SOURCES_INDEX};`;

export const DEVELOPMENT_TARGET_MIGRATIONS: readonly RuntimeMigration[] = [
  {
    version: 3,
    checksum: createHash("sha256").update(SOURCE_SCHEMA).digest("hex"),
    apply(database) {
      database.exec(SOURCE_SCHEMA);
    },
    verify(database) {
      verifyOwnedSchema(
        database,
        "development_target_sources",
        SOURCE_SCHEMA_ENTRIES,
      );
    },
  },
];
