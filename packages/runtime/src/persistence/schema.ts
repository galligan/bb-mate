import { createHash } from "node:crypto";

import type { RuntimeMigration } from "./migrations.ts";
import {
  verifyOwnedSchema,
  type ExpectedSchemaEntry,
} from "./schema-verification.ts";

const OBJECTS_TABLE = `CREATE TABLE runtime_objects (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    session_id TEXT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    payload_json TEXT NOT NULL
  ) STRICT`;

const OBJECTS_INDEX = `CREATE INDEX runtime_objects_bindings
    ON runtime_objects (
      principal_id,
      bb_context_id,
      target_id,
      session_id,
      id
    )`;

const OBJECT_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  { type: "table", name: "runtime_objects", sql: OBJECTS_TABLE },
  { type: "index", name: "runtime_objects_bindings", sql: OBJECTS_INDEX },
];
const OBJECTS_SCHEMA = `${OBJECTS_TABLE};\n${OBJECTS_INDEX};`;

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export const OBJECT_MIGRATIONS: readonly RuntimeMigration[] = [
  {
    version: 1,
    checksum: checksum(OBJECTS_SCHEMA),
    apply(database) {
      database.exec(OBJECTS_SCHEMA);
    },
    verify(database) {
      verifyOwnedSchema(database, "runtime_objects", OBJECT_SCHEMA_ENTRIES);
    },
  },
];
