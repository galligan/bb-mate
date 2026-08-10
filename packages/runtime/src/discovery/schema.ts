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

const HOST_OBSERVATIONS_NO_DELETE = `CREATE TRIGGER development_target_host_observations_no_delete
    BEFORE DELETE ON development_target_host_observations
    BEGIN
      SELECT RAISE(ABORT, 'development target host observations are append-only');
    END`;

const HOST_OBSERVATION_SCHEMA_ENTRIES: readonly ExpectedSchemaEntry[] = [
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
  {
    type: "trigger",
    name: "development_target_host_observations_no_delete",
    sql: HOST_OBSERVATIONS_NO_DELETE,
  },
];
const HOST_OBSERVATION_SCHEMA = `${HOST_OBSERVATIONS_TABLE};\n${HOST_OBSERVATIONS_INDEX};\n${HOST_OBSERVATIONS_NO_DELETE};`;

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
      verifyOwnedSchema(
        database,
        "development_target_host_observations",
        HOST_OBSERVATION_SCHEMA_ENTRIES,
      );
    },
  },
];
