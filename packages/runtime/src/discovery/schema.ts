import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";

import {
  RUNTIME_EVENTS_NO_DELETE_TRIGGER,
  verifyRuntimeEventSchema,
} from "../events/schema.ts";
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

const HOST_OBSERVATIONS_TABLE = `CREATE TABLE development_target_host_observations (
    object_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    runtime_instance_id TEXT NOT NULL CHECK (length(runtime_instance_id) = 32),
    hostname TEXT NOT NULL CHECK (
      length(hostname) BETWEEN 1 AND 253
      AND instr(hostname, ':') = 0
      AND instr(hostname, '/') = 0
      AND instr(hostname, '@') = 0
    ),
    bb_host_id TEXT CHECK (
      bb_host_id IS NULL OR (
        length(bb_host_id) BETWEEN 1 AND 128
        AND instr(bb_host_id, ':') = 0
        AND instr(bb_host_id, '/') = 0
        AND instr(bb_host_id, '@') = 0
      )
    ),
    bb_host_name TEXT CHECK (
      bb_host_name IS NULL OR (
        length(bb_host_name) BETWEEN 1 AND 128
        AND instr(bb_host_name, ':') = 0
        AND instr(bb_host_name, '/') = 0
        AND instr(bb_host_name, '@') = 0
      )
    ),
    bb_host_is_server INTEGER CHECK (bb_host_is_server IS NULL OR bb_host_is_server IN (0, 1)),
    observed_at INTEGER NOT NULL CHECK (observed_at >= 0),
    FOREIGN KEY (object_id) REFERENCES runtime_objects(id) ON DELETE RESTRICT,
    CHECK (
      (bb_host_id IS NULL AND bb_host_name IS NULL AND bb_host_is_server IS NULL)
      OR
      (bb_host_id IS NOT NULL AND bb_host_name IS NOT NULL AND bb_host_is_server IS NOT NULL)
    )
  ) STRICT`;

const HOST_OBSERVATIONS_INDEX = `CREATE INDEX development_target_host_observations_context
    ON development_target_host_observations (principal_id, bb_context_id, object_id)`;

const LEGACY_HOSTS_NO_DELETE_TRIGGER = `CREATE TRIGGER development_target_host_observations_no_delete
    BEFORE DELETE ON development_target_host_observations
    BEGIN
      SELECT RAISE(ABORT, 'development target host observations are append-only');
    END`;

export const DEVELOPMENT_TARGET_HOSTS_NO_DELETE_TRIGGER = `CREATE TRIGGER development_target_host_observations_no_delete
    BEFORE DELETE ON development_target_host_observations
    WHEN NOT EXISTS (
      SELECT 1
      FROM development_target_retirements r
      WHERE r.object_id = OLD.object_id
        AND r.principal_id = OLD.principal_id
        AND r.bb_context_id = OLD.bb_context_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'retained development target host observations are append-only');
    END`;

const HOST_OBSERVATION_BASE_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  {
    type: "table",
    name: "development_target_host_observations",
    sql: HOST_OBSERVATIONS_TABLE,
  },
  {
    type: "index",
    name: "development_target_host_observations_context",
    sql: HOST_OBSERVATIONS_INDEX,
  },
];
const HOST_OBSERVATION_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  ...HOST_OBSERVATION_BASE_SCHEMA_ENTRIES,
  {
    type: "trigger",
    name: "development_target_host_observations_no_delete",
    sql: DEVELOPMENT_TARGET_HOSTS_NO_DELETE_TRIGGER,
  },
];
const LEGACY_HOST_OBSERVATION_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  ...HOST_OBSERVATION_BASE_SCHEMA_ENTRIES,
  {
    type: "trigger",
    name: "development_target_host_observations_no_delete",
    sql: LEGACY_HOSTS_NO_DELETE_TRIGGER,
  },
];
const HOST_OBSERVATION_SCHEMA = `${HOST_OBSERVATIONS_TABLE};\n${HOST_OBSERVATIONS_INDEX};\n${LEGACY_HOSTS_NO_DELETE_TRIGGER};`;

function verifyDevelopmentTargetHostBaseSchema(database: Database): void {
  try {
    verifyOwnedSchema(
      database,
      "development_target_host_observations",
      LEGACY_HOST_OBSERVATION_SCHEMA_ENTRIES,
    );
  } catch {
    verifyDevelopmentTargetHostSchema(database);
  }
}

export function verifyDevelopmentTargetHostSchema(database: Database): void {
  verifyOwnedSchema(
    database,
    "development_target_host_observations",
    HOST_OBSERVATION_SCHEMA_ENTRIES,
  );
}

const RETIREMENTS_TABLE = `CREATE TABLE development_target_retirements (
    object_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    retired_at INTEGER NOT NULL CHECK (retired_at >= 0),
    revision INTEGER NOT NULL CHECK (revision > 0),
    FOREIGN KEY (object_id) REFERENCES runtime_objects(id) ON DELETE RESTRICT
  ) STRICT`;

const RETIREMENTS_INDEX = `CREATE INDEX development_target_retirements_context
    ON development_target_retirements (principal_id, bb_context_id, object_id)`;

const RETIREMENT_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  {
    type: "table",
    name: "development_target_retirements",
    sql: RETIREMENTS_TABLE,
  },
  {
    type: "index",
    name: "development_target_retirements_context",
    sql: RETIREMENTS_INDEX,
  },
];
const RETIREMENT_SCHEMA = `${RETIREMENTS_TABLE};\n${RETIREMENTS_INDEX};`;

const RETENTION_GUARD_MIGRATION = `DROP TRIGGER runtime_events_no_delete;
DROP TRIGGER development_target_host_observations_no_delete;
${RUNTIME_EVENTS_NO_DELETE_TRIGGER};
${DEVELOPMENT_TARGET_HOSTS_NO_DELETE_TRIGGER};`;

const PROJECT_SCOPES_TABLE = `CREATE TABLE development_target_project_scopes (
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    canonical_root TEXT NOT NULL,
    PRIMARY KEY (principal_id, bb_context_id, canonical_root)
  ) STRICT`;

const PROJECT_SCOPE_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  {
    type: "table",
    name: "development_target_project_scopes",
    sql: PROJECT_SCOPES_TABLE,
  },
];

const EVENT_RETENTION_TABLE = `CREATE TABLE development_target_event_retention (
    object_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    bb_context_id TEXT NOT NULL,
    expired_through_sequence INTEGER NOT NULL CHECK (expired_through_sequence > 0),
    FOREIGN KEY (object_id) REFERENCES runtime_objects(id) ON DELETE RESTRICT
  ) STRICT`;

const EVENT_RETENTION_NO_DELETE_TRIGGER = `CREATE TRIGGER development_target_event_retention_no_delete
    BEFORE DELETE ON development_target_event_retention
    WHEN EXISTS (
      SELECT 1 FROM development_target_sources s
      WHERE s.object_id = OLD.object_id
        AND s.principal_id = OLD.principal_id
        AND s.bb_context_id = OLD.bb_context_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'retained development target event checkpoints are append-only');
    END`;

const EVENT_RETENTION_MONOTONIC_TRIGGER = `CREATE TRIGGER development_target_event_retention_monotonic
    BEFORE UPDATE ON development_target_event_retention
    WHEN NEW.object_id != OLD.object_id
      OR NEW.principal_id != OLD.principal_id
      OR NEW.bb_context_id != OLD.bb_context_id
      OR NEW.expired_through_sequence < OLD.expired_through_sequence
    BEGIN
      SELECT RAISE(ABORT, 'development target event checkpoints are monotonic');
    END`;

const EVENT_RETENTION_SCHEMA = `${EVENT_RETENTION_TABLE};
${EVENT_RETENTION_NO_DELETE_TRIGGER};
${EVENT_RETENTION_MONOTONIC_TRIGGER};`;

const EVENT_RETENTION_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
  {
    type: "table",
    name: "development_target_event_retention",
    sql: EVENT_RETENTION_TABLE,
  },
  {
    type: "trigger",
    name: "development_target_event_retention_no_delete",
    sql: EVENT_RETENTION_NO_DELETE_TRIGGER,
  },
  {
    type: "trigger",
    name: "development_target_event_retention_monotonic",
    sql: EVENT_RETENTION_MONOTONIC_TRIGGER,
  },
];

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
  {
    version: 4,
    checksum: createHash("sha256")
      .update(HOST_OBSERVATION_SCHEMA)
      .digest("hex"),
    apply(database) {
      database.exec(HOST_OBSERVATION_SCHEMA);
    },
    verify(database) {
      verifyDevelopmentTargetHostBaseSchema(database);
    },
  },
  {
    version: 5,
    checksum: createHash("sha256").update(RETIREMENT_SCHEMA).digest("hex"),
    apply(database) {
      database.exec(RETIREMENT_SCHEMA);
    },
    verify(database) {
      verifyOwnedSchema(
        database,
        "development_target_retirements",
        RETIREMENT_SCHEMA_ENTRIES,
      );
    },
  },
  {
    version: 6,
    checksum: createHash("sha256")
      .update(RETENTION_GUARD_MIGRATION)
      .digest("hex"),
    apply(database) {
      database.exec(RETENTION_GUARD_MIGRATION);
    },
    verify(database) {
      verifyRuntimeEventSchema(database);
      verifyDevelopmentTargetHostSchema(database);
    },
  },
  {
    version: 7,
    checksum: createHash("sha256").update(PROJECT_SCOPES_TABLE).digest("hex"),
    apply(database) {
      database.exec(PROJECT_SCOPES_TABLE);
    },
    verify(database) {
      verifyOwnedSchema(
        database,
        "development_target_project_scopes",
        PROJECT_SCOPE_SCHEMA_ENTRIES,
      );
    },
  },
  {
    version: 8,
    checksum: createHash("sha256").update(EVENT_RETENTION_SCHEMA).digest("hex"),
    apply(database) {
      database.exec(EVENT_RETENTION_SCHEMA);
    },
    verify(database) {
      verifyOwnedSchema(
        database,
        "development_target_event_retention",
        EVENT_RETENTION_SCHEMA_ENTRIES,
      );
    },
  },
];
