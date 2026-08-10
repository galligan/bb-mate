import type { Database, SQLQueryBindings } from "bun:sqlite";

import type { BbContextId, ObjectId, PrincipalId } from "../contracts/ids.ts";
import { canonicalJson, type JsonValue } from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import { createEventFeed } from "../events/feed.ts";
import { createDevelopmentTargetIntegrityCheck } from "./catalog-integrity.ts";
import {
  parseDevelopmentTargetEnvelope,
  type DevelopmentTargetEnvelope,
} from "./development-target.ts";
import {
  parsePrivateDevelopmentTargetSource,
  type PrivateDevelopmentTargetSource,
} from "./private-source.ts";
import type { TrustedDevelopmentTargetCandidate } from "./trusted-candidate.ts";

interface ObjectRow {
  readonly id: string;
  readonly kind: string;
  readonly principal_id: string;
  readonly bb_context_id: string;
  readonly target_id: string;
  readonly session_id: string | null;
  readonly revision: number;
  readonly created_at: number;
  readonly updated_at: number;
  readonly payload_json: string;
}

interface PrivateRow {
  readonly canonical_root: string;
  readonly root_key: string;
  readonly root_kind: string;
}

function parseRow(row: ObjectRow): DevelopmentTargetEnvelope {
  try {
    const envelope = parseDevelopmentTargetEnvelope({
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

export interface DevelopmentTargetCatalogStorage {
  assertIntegrity(): void;
  findByRoot(
    principalId: PrincipalId,
    bbContextId: BbContextId,
    canonicalRoot: string,
  ): DevelopmentTargetEnvelope | undefined;
  list(
    principalId: PrincipalId,
    bbContextId: BbContextId,
  ): readonly DevelopmentTargetEnvelope[];
  get(
    principalId: PrincipalId,
    bbContextId: BbContextId,
    id: ObjectId,
  ): DevelopmentTargetEnvelope | undefined;
  resolvePrivate(
    principalId: PrincipalId,
    bbContextId: BbContextId,
    id: ObjectId,
  ): PrivateDevelopmentTargetSource | undefined;
  persistCreation(
    envelope: DevelopmentTargetEnvelope,
    candidate: TrustedDevelopmentTargetCandidate,
  ): void;
  persistUpdate(
    envelope: DevelopmentTargetEnvelope,
    candidate: TrustedDevelopmentTargetCandidate,
    expectedRevision: number,
  ): void;
}

export function createDevelopmentTargetCatalogStorage(
  database: Database,
): DevelopmentTargetCatalogStorage {
  const eventFeed = createEventFeed(database);
  const assertIntegrity = createDevelopmentTargetIntegrityCheck(database);
  const selectByRoot = database.query<ObjectRow, SQLQueryBindings[]>(`
    SELECT o.*
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE s.principal_id = ? AND s.bb_context_id = ? AND s.canonical_root = ?
  `);
  const selectList = database.query<ObjectRow, SQLQueryBindings[]>(`
    SELECT o.*
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE s.principal_id = ? AND s.bb_context_id = ?
    ORDER BY o.created_at, o.id
  `);
  const selectById = database.query<ObjectRow, SQLQueryBindings[]>(`
    SELECT o.*
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE o.id = ? AND s.principal_id = ? AND s.bb_context_id = ?
  `);
  const selectPrivate = database.query<PrivateRow, SQLQueryBindings[]>(`
    SELECT canonical_root, root_key, root_kind
    FROM development_target_sources
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const insertObject = database.query(`
    INSERT INTO runtime_objects (
      id, kind, principal_id, bb_context_id, target_id, session_id,
      revision, created_at, updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
  `);
  const insertPrivate = database.query(`
    INSERT INTO development_target_sources (
      object_id, principal_id, bb_context_id, root_key, root_kind, canonical_root
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateObject = database.query(`
    UPDATE runtime_objects
    SET revision = ?, updated_at = ?, payload_json = ?
    WHERE id = ? AND principal_id = ? AND bb_context_id = ?
      AND target_id = ? AND session_id IS NULL AND revision = ?
  `);
  const updatePrivate = database.query(`
    UPDATE development_target_sources
    SET root_key = ?, root_kind = ?
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);

  const persistCreation = database.transaction(
    (
      envelope: DevelopmentTargetEnvelope,
      candidate: TrustedDevelopmentTargetCandidate,
    ) => {
      insertObject.run(
        envelope.id,
        envelope.kind,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
        envelope.bindings.targetId,
        envelope.revision,
        envelope.createdAt,
        envelope.updatedAt,
        canonicalJson(envelope.payload),
      );
      insertPrivate.run(
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
        candidate.rootKey,
        candidate.rootKind,
        candidate.canonicalRoot,
      );
      eventFeed.append("object.created", envelope);
    },
  );
  const persistUpdate = database.transaction(
    (
      envelope: DevelopmentTargetEnvelope,
      candidate: TrustedDevelopmentTargetCandidate,
      expectedRevision: number,
    ) => {
      const result = updateObject.run(
        envelope.revision,
        envelope.updatedAt,
        canonicalJson(envelope.payload),
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
        envelope.bindings.targetId,
        expectedRevision,
      );
      if (result.changes !== 1) throw new RuntimeError("conflict");
      const privateResult = updatePrivate.run(
        candidate.rootKey,
        candidate.rootKind,
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
      if (privateResult.changes !== 1) {
        throw new RuntimeError("corrupt_data");
      }
      eventFeed.append("object.updated", envelope);
    },
  );

  return {
    assertIntegrity,
    findByRoot(principalId, bbContextId, canonicalRoot) {
      const row = selectByRoot.get(principalId, bbContextId, canonicalRoot);
      return row ? parseRow(row) : undefined;
    },
    list(principalId, bbContextId) {
      return selectList.all(principalId, bbContextId).map(parseRow);
    },
    get(principalId, bbContextId, id) {
      const row = selectById.get(id, principalId, bbContextId);
      return row ? parseRow(row) : undefined;
    },
    resolvePrivate(principalId, bbContextId, id) {
      const row = selectPrivate.get(id, principalId, bbContextId);
      return row
        ? parsePrivateDevelopmentTargetSource({
            canonicalRoot: row.canonical_root,
            rootKey: row.root_key,
            rootKind: row.root_kind,
          })
        : undefined;
    },
    persistCreation,
    persistUpdate,
  };
}
