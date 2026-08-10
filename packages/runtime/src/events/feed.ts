import type { Database, SQLQueryBindings } from "bun:sqlite";

import { ObjectIdSchema, type ObjectId } from "../contracts/ids.ts";
import {
  ObjectKindSchema,
  type ObjectBindings,
  type ObjectEnvelope,
  type ObjectKind,
} from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const CURSOR_PATTERN = /^v1_([0-9a-z]+)$/u;

export type ObjectEventType =
  "object.created" | "object.updated" | "target.native-reconciled";

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
      row.event_type !== "target.native-reconciled") ||
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

export function createEventFeed(database: Database): EventFeed {
  const insert = database.query(`
    INSERT INTO runtime_events (
      event_type, object_id, object_kind, revision, occurred_at,
      principal_id, bb_context_id, target_id, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const ownsCursor = database.query<{ found: number }, SQLQueryBindings[]>(`
    SELECT 1 AS found
    FROM runtime_events
    WHERE sequence = ?
      AND principal_id = ?
      AND bb_context_id = ?
      AND target_id = ?
      AND session_id IS ?
  `);
  const select = database.query<EventRow, SQLQueryBindings[]>(`
    SELECT sequence, event_type, object_id, object_kind, revision, occurred_at
    FROM runtime_events
    WHERE sequence > ?
      AND principal_id = ?
      AND bb_context_id = ?
      AND target_id = ?
      AND session_id IS ?
    ORDER BY sequence
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
