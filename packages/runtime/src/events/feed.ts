import { ObjectIdSchema, type ObjectId } from "../contracts/ids.ts";
import {
  ObjectKindSchema,
  type ObjectBindings,
  type ObjectEnvelope,
  type ObjectKind,
} from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import type { SqliteBindings, SqliteDatabase } from "../persistence/sqlite.ts";
import {
  adaptQuerySqliteDatabase,
  type QuerySqliteDatabase,
} from "../persistence/sqlite.ts";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const CURSOR_PATTERN = /^v1_([0-9a-z]+)$/u;

export type ObjectEventType =
  | "object.created"
  | "object.updated"
  | "target.native-reconciled"
  | "target.reopened"
  | "target.retired";

export interface ObjectEvent {
  readonly cursor: string;
  readonly type: ObjectEventType;
  readonly objectId: ObjectId;
  readonly objectKind: ObjectKind;
  readonly revision: number;
  readonly occurredAt: number;
}

export interface PullEventsInput {
  readonly bindings: ObjectBindings;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface EventPage {
  readonly events: readonly ObjectEvent[];
  readonly nextCursor?: string;
}

interface EventRow {
  readonly sequence: number;
  readonly event_type: string;
  readonly object_id: string;
  readonly object_kind: string;
  readonly revision: number;
  readonly occurred_at: number;
}

function parseEventRow(row: EventRow): ObjectEvent {
  if (
    !Number.isSafeInteger(row.sequence) ||
    row.sequence < 1 ||
    (row.event_type !== "object.created" &&
      row.event_type !== "object.updated" &&
      row.event_type !== "target.native-reconciled" &&
      row.event_type !== "target.reopened" &&
      row.event_type !== "target.retired") ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !Number.isSafeInteger(row.occurred_at) ||
    row.occurred_at < 0
  ) {
    throw new RuntimeError("corrupt_data");
  }
  return {
    cursor: encodeCursor(row.sequence),
    type: row.event_type,
    objectId: ObjectIdSchema.parse(row.object_id),
    objectKind: ObjectKindSchema.parse(row.object_kind),
    revision: row.revision,
    occurredAt: row.occurred_at,
  };
}

export interface EventFeed {
  append(type: ObjectEventType, envelope: ObjectEnvelope): void;
  pull(input: PullEventsInput): EventPage;
}

function encodeCursor(sequence: number): string {
  return `v1_${sequence.toString(36)}`;
}

function decodeCursor(cursor: string): number {
  const match = CURSOR_PATTERN.exec(cursor);
  const sequence = match ? Number.parseInt(match[1]!, 36) : Number.NaN;
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    encodeCursor(sequence) !== cursor
  ) {
    throw new RuntimeError("invalid_request");
  }
  return sequence;
}

export function createEventFeed(
  input: SqliteDatabase | QuerySqliteDatabase,
): EventFeed {
  const database = adaptQuerySqliteDatabase(input as QuerySqliteDatabase);
  const insert = database.query(`
    INSERT INTO runtime_events (
      event_type, object_id, object_kind, revision, occurred_at,
      principal_id, bb_context_id, target_id, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ownsCursor = database.query<{ found: number }, SqliteBindings>(`
    SELECT 1 AS found
    FROM runtime_events e
    WHERE e.sequence = ?
      AND e.principal_id = ?
      AND e.bb_context_id = ?
      AND e.target_id = ?
      AND e.session_id IS ?
      AND NOT EXISTS (
        SELECT 1
        FROM development_target_event_retention r
        WHERE r.object_id = e.object_id
          AND r.principal_id = e.principal_id
          AND r.bb_context_id = e.bb_context_id
          AND r.expired_through_sequence >= e.sequence
      )
  `);
  const select = database.query<EventRow, SqliteBindings>(`
    SELECT sequence, event_type, object_id, object_kind, revision, occurred_at
    FROM runtime_events e
    WHERE e.sequence > ?
      AND e.principal_id = ?
      AND e.bb_context_id = ?
      AND e.target_id = ?
      AND e.session_id IS ?
      AND NOT EXISTS (
        SELECT 1
        FROM development_target_event_retention r
        WHERE r.object_id = e.object_id
          AND r.principal_id = e.principal_id
          AND r.bb_context_id = e.bb_context_id
          AND r.expired_through_sequence >= e.sequence
      )
    ORDER BY e.sequence
    LIMIT ?
  `);

  return {
    append(type, envelope) {
      insert.run(
        type,
        envelope.id,
        envelope.kind,
        envelope.revision,
        envelope.updatedAt,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
        envelope.bindings.targetId,
        envelope.bindings.sessionId ?? null,
      );
    },
    pull(input) {
      const limit = input.limit ?? DEFAULT_PAGE_SIZE;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
        throw new RuntimeError("invalid_request");
      }

      const after = input.cursor ? decodeCursor(input.cursor) : 0;
      let events: ObjectEvent[];
      try {
        if (
          input.cursor &&
          !ownsCursor.get(
            after,
            input.bindings.principalId,
            input.bindings.bbContextId,
            input.bindings.targetId,
            input.bindings.sessionId ?? null,
          )
        ) {
          throw new RuntimeError("invalid_request");
        }
        events = select
          .all(
            after,
            input.bindings.principalId,
            input.bindings.bbContextId,
            input.bindings.targetId,
            input.bindings.sessionId ?? null,
            limit,
          )
          .map(parseEventRow);
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        throw new RuntimeError("corrupt_data", { cause: error });
      }

      return {
        events,
        ...(events.length > 0
          ? { nextCursor: events[events.length - 1]!.cursor }
          : input.cursor
            ? { nextCursor: input.cursor }
            : {}),
      };
    },
  };
}
