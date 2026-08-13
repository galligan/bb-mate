import { createHash } from "node:crypto";
import type { RuntimeMigration } from "../persistence/migrations.ts";
import type { SqliteDatabase } from "../persistence/sqlite.ts";
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

const LEGACY_EVENTS_NO_DELETE_TRIGGER = `CREATE TRIGGER runtime_events_no_delete
    BEFORE DELETE ON runtime_events
    BEGIN
      SELECT RAISE(ABORT, 'runtime events are append-only');
    END`;

export const RUNTIME_EVENTS_NO_DELETE_TRIGGER = `CREATE TRIGGER runtime_events_no_delete
    BEFORE DELETE ON runtime_events
    WHEN EXISTS (
      SELECT 1 FROM runtime_objects o WHERE o.id = OLD.object_id
    )
    AND (
      NOT EXISTS (
        SELECT 1
        FROM development_target_event_retention r
        WHERE r.object_id = OLD.object_id
          AND r.principal_id = OLD.principal_id
          AND r.bb_context_id = OLD.bb_context_id
          AND r.expired_through_sequence >= OLD.sequence
      )
      OR OLD.sequence = (
        SELECT MAX(latest.sequence)
        FROM runtime_events latest
        WHERE latest.object_id = OLD.object_id
          AND latest.event_type = OLD.event_type
      )
    )
    BEGIN
      SELECT RAISE(ABORT, 'retained runtime events are append-only');
    END`;

const EVENT_BASE_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  { type: "table", name: "runtime_events", sql: EVENTS_TABLE },
  { type: "index", name: "runtime_events_pull", sql: EVENTS_INDEX },
  { type: "trigger", name: "runtime_events_no_update", sql: EVENTS_NO_UPDATE },
];
const EVENT_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  ...EVENT_BASE_SCHEMA_ENTRIES,
  {
    type: "trigger",
    name: "runtime_events_no_delete",
    sql: RUNTIME_EVENTS_NO_DELETE_TRIGGER,
  },
];
const LEGACY_EVENT_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  ...EVENT_BASE_SCHEMA_ENTRIES,
  {
    type: "trigger",
    name: "runtime_events_no_delete",
    sql: LEGACY_EVENTS_NO_DELETE_TRIGGER,
  },
];
export const EVENT_MIGRATION_SQL = [
  EVENTS_TABLE,
  EVENTS_INDEX,
  EVENTS_NO_UPDATE,
  LEGACY_EVENTS_NO_DELETE_TRIGGER,
].join(";\n");

function verifyRuntimeEventBaseSchema(database: SqliteDatabase): void {
  try {
    verifyOwnedSchema(database, "runtime_events", LEGACY_EVENT_SCHEMA_ENTRIES);
  } catch {
    verifyRuntimeEventSchema(database);
  }
}

export function verifyRuntimeEventSchema(database: SqliteDatabase): void {
  verifyOwnedSchema(database, "runtime_events", EVENT_SCHEMA_ENTRIES);
}

export const EVENT_MIGRATIONS: readonly RuntimeMigration[] = [
  {
    version: 2,
    checksum: createHash("sha256").update(EVENT_MIGRATION_SQL).digest("hex"),
    apply(database) {
      database.exec(EVENT_MIGRATION_SQL);
    },
    verify(database) {
      verifyRuntimeEventBaseSchema(database);
    },
  },
];
