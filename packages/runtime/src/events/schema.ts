import { createHash } from "node:crypto";

import type { RuntimeMigration } from "../persistence/migrations.ts";
import {
  verifyOwnedSchema,
  type ExpectedSchemaEntry,
} from "../persistence/schema-verification.ts";

const EVENTS_TABLE = `CREATE TABLE runtime_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    object_kind TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    occurred_at INTEGER NOT NULL CHECK (occurred_at >= 0),
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    session_id TEXT
  ) STRICT`;

const EVENTS_INDEX = `CREATE INDEX runtime_events_pull
    ON runtime_events (
      principal_id,
      bb_context_id,
      target_id,
      session_id,
      sequence
    )`;

const EVENTS_NO_UPDATE = `CREATE TRIGGER runtime_events_no_update
    BEFORE UPDATE ON runtime_events
    BEGIN
      SELECT RAISE(ABORT, 'runtime events are append-only');
    END`;

const EVENTS_NO_DELETE = `CREATE TRIGGER runtime_events_no_delete
    BEFORE DELETE ON runtime_events
    BEGIN
      SELECT RAISE(ABORT, 'runtime events are append-only');
    END`;

const EVENT_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  { type: "table", name: "runtime_events", sql: EVENTS_TABLE },
  { type: "index", name: "runtime_events_pull", sql: EVENTS_INDEX },
  { type: "trigger", name: "runtime_events_no_update", sql: EVENTS_NO_UPDATE },
  { type: "trigger", name: "runtime_events_no_delete", sql: EVENTS_NO_DELETE },
];
const EVENTS_SCHEMA = [
  EVENTS_TABLE,
  EVENTS_INDEX,
  EVENTS_NO_UPDATE,
  EVENTS_NO_DELETE,
].join(";\n");

export const EVENT_MIGRATIONS: readonly RuntimeMigration[] = [
  {
    version: 2,
    checksum: createHash("sha256").update(EVENTS_SCHEMA).digest("hex"),
    apply(database) {
      database.exec(EVENTS_SCHEMA);
    },
    verify(database) {
      verifyOwnedSchema(database, "runtime_events", EVENT_SCHEMA_ENTRIES);
    },
  },
];
