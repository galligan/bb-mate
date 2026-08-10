import type { SQLQueryBindings } from "bun:sqlite";

import type { ObjectId } from "../contracts/ids.ts";
import { createOpaqueId } from "../contracts/ids.ts";
import {
  canonicalJson,
  type JsonValue,
  type ObjectBindings,
  type ObjectCodecRegistry,
  type ObjectEnvelope,
  type ObjectKind,
} from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import {
  createEventFeed,
  type EventPage,
  type PullEventsInput,
} from "../events/feed.ts";
import { openRuntimeDatabase } from "./database.ts";
import { RUNTIME_MIGRATIONS } from "./runtime-migrations.ts";

export interface OpenRuntimeStoreOptions {
  readonly dataRoot: string;
  readonly codecs: ObjectCodecRegistry;
  readonly clock?: () => number;
  readonly id?: () => ObjectId;
}

export interface CreateObjectInput {
  readonly kind: ObjectKind;
  readonly bindings: ObjectBindings;
  readonly payload: unknown;
}

export interface GetObjectInput {
  readonly id: ObjectId;
  readonly bindings: ObjectBindings;
}

export interface UpdateObjectInput extends GetObjectInput {
  readonly expectedRevision: number;
  readonly payload: unknown;
}

interface ObjectRow {
  readonly id: string;
  readonly kind: ObjectKind;
  readonly principal_id: string;
  readonly bb_context_id: string;
  readonly target_id: string;
  readonly session_id: string | null;
  readonly revision: number;
  readonly created_at: number;
  readonly updated_at: number;
  readonly payload_json: string;
}

function throwStorageError(error: unknown): never {
  if (error instanceof RuntimeError) throw error;
  throw new RuntimeError("internal", { cause: error });
}

export interface RuntimeStore {
  createObject(input: CreateObjectInput): ObjectEnvelope;
  getObject(input: GetObjectInput): ObjectEnvelope | undefined;
  updateObject(input: UpdateObjectInput): ObjectEnvelope;
  pullEvents(input: PullEventsInput): EventPage;
  close(): void;
}

export async function openRuntimeStore(
  options: OpenRuntimeStoreOptions,
): Promise<RuntimeStore> {
  const runtimeDatabase = await openRuntimeDatabase({
    dataRoot: options.dataRoot,
    migrations: RUNTIME_MIGRATIONS,
  });
  const { database } = runtimeDatabase;
  const clock = options.clock ?? Date.now;
  const id = options.id ?? createOpaqueId;
  const eventFeed = createEventFeed(database);

  const insertObject = database.query(`
    INSERT INTO runtime_objects (
      id, kind, principal_id, bb_context_id, target_id, session_id,
      revision, created_at, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectObject = database.query<ObjectRow, SQLQueryBindings[]>(`
    SELECT
      id, kind, principal_id, bb_context_id, target_id, session_id,
      revision, created_at, updated_at, payload_json
    FROM runtime_objects
    WHERE id = ?
      AND principal_id = ?
      AND bb_context_id = ?
      AND target_id = ?
      AND session_id IS ?
  `);
  const updateObject = database.query(`
    UPDATE runtime_objects
    SET revision = ?, updated_at = ?, payload_json = ?
    WHERE id = ?
      AND principal_id = ?
      AND bb_context_id = ?
      AND target_id = ?
      AND session_id IS ?
      AND revision = ?
  `);
  const persistCreation = database.transaction((envelope: ObjectEnvelope) => {
    insertObject.run(
      envelope.id,
      envelope.kind,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
      envelope.bindings.targetId,
      envelope.bindings.sessionId ?? null,
      envelope.revision,
      envelope.createdAt,
      envelope.updatedAt,
      canonicalJson(envelope.payload),
    );
    eventFeed.append("object.created", envelope);
  });
  const persistUpdate = database.transaction(
    (envelope: ObjectEnvelope, expectedRevision: number) => {
      const result = updateObject.run(
        envelope.revision,
        envelope.updatedAt,
        canonicalJson(envelope.payload),
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
        envelope.bindings.targetId,
        envelope.bindings.sessionId ?? null,
        expectedRevision,
      );
      if (result.changes !== 1) throw new RuntimeError("conflict");
      eventFeed.append("object.updated", envelope);
    },
  );

  function parseRow(row: ObjectRow): ObjectEnvelope {
    try {
      const envelope = options.codecs.parse({
        schemaVersion: 1,
        id: row.id,
        kind: row.kind,
        bindings: {
          principalId: row.principal_id,
          bbContextId: row.bb_context_id,
          targetId: row.target_id,
          ...(row.session_id === null ? {} : { sessionId: row.session_id }),
        },
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        payload: JSON.parse(row.payload_json) as JsonValue,
      });
      if (row.payload_json !== canonicalJson(envelope.payload)) {
        throw new RuntimeError("corrupt_data");
      }
      return envelope;
    } catch (error) {
      throw new RuntimeError("corrupt_data", { cause: error });
    }
  }

  return {
    createObject(input) {
      const now = clock();
      const envelope = options.codecs.parse({
        schemaVersion: 1,
        id: id(),
        kind: input.kind,
        bindings: input.bindings,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        payload: input.payload,
      });

      try {
        persistCreation(envelope);
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
        ) {
          throw new RuntimeError("conflict", { cause: error });
        }
        throwStorageError(error);
      }

      return envelope;
    },
    getObject(input) {
      try {
        const row = selectObject.get(
          input.id,
          input.bindings.principalId,
          input.bindings.bbContextId,
          input.bindings.targetId,
          input.bindings.sessionId ?? null,
        );
        return row ? parseRow(row) : undefined;
      } catch (error) {
        throwStorageError(error);
      }
    },
    updateObject(input) {
      try {
        const existing = selectObject.get(
          input.id,
          input.bindings.principalId,
          input.bindings.bbContextId,
          input.bindings.targetId,
          input.bindings.sessionId ?? null,
        );
        if (!existing) throw new RuntimeError("not_found");

        const envelope = options.codecs.parse({
          ...parseRow(existing),
          revision: input.expectedRevision + 1,
          updatedAt: clock(),
          payload: input.payload,
        });
        persistUpdate(envelope, input.expectedRevision);
        return envelope;
      } catch (error) {
        throwStorageError(error);
      }
    },
    pullEvents: eventFeed.pull,
    close: runtimeDatabase.close,
  };
}
