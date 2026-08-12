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
import {
  TARGET_EVENT_MAX_EVENTS_PER_TARGET,
  TARGET_HISTORY_MAX_TARGETS,
  TARGET_LIST_MAX_TARGETS,
} from "./target-limits.ts";
import {
  parsePrivateHostObservation,
  type PrivateHostObservation,
} from "./private-host-observation.ts";

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

interface PrivateHostRow {
  readonly runtime_instance_id: string;
  readonly hostname: string;
  readonly bb_host_id: string | null;
  readonly bb_host_name: string | null;
  readonly bb_host_is_server: number | null;
  readonly observed_at: number;
}

function parsePrivateHostRow(row: PrivateHostRow): PrivateHostObservation {
  try {
    return parsePrivateHostObservation({
      runtimeInstanceId: row.runtime_instance_id,
      hostname: row.hostname,
      ...(row.bb_host_id === null &&
      row.bb_host_name === null &&
      row.bb_host_is_server === null
        ? {}
        : {
            bbHost: {
              id: row.bb_host_id,
              name: row.bb_host_name,
              isServer:
                row.bb_host_is_server === 1
                  ? true
                  : row.bb_host_is_server === 0
                    ? false
                    : row.bb_host_is_server,
            },
          }),
      observedAt: row.observed_at,
    });
  } catch (error) {
    throw new RuntimeError("corrupt_data", { cause: error });
  }
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
  resolvePrivateHostObservation(
    principalId: PrincipalId,
    bbContextId: BbContextId,
    id: ObjectId,
  ): PrivateHostObservation | undefined;
  persistCreation(
    envelope: DevelopmentTargetEnvelope,
    candidate: TrustedDevelopmentTargetCandidate,
  ): void;
  persistUpdate(
    envelope: DevelopmentTargetEnvelope,
    candidate: TrustedDevelopmentTargetCandidate,
    expectedRevision: number,
  ): void;
  persistNativeReconciliation(
    envelope: DevelopmentTargetEnvelope,
    observation: PrivateHostObservation,
    expectedRevision: number,
  ): void;
  listIncludingRetired(
    principalId: PrincipalId,
    bbContextId: BbContextId,
  ): readonly {
    readonly envelope: DevelopmentTargetEnvelope;
    readonly retired: boolean;
  }[];
  listProjectScopes(
    principalId: PrincipalId,
    bbContextId: BbContextId,
  ): readonly string[];
  persistCompleteSnapshot(input: {
    readonly present: readonly {
      readonly envelope: DevelopmentTargetEnvelope;
      readonly candidate: TrustedDevelopmentTargetCandidate;
      readonly previousRevision?: number;
      readonly reopened: boolean;
      readonly unchanged: boolean;
    }[];
    readonly retired: readonly {
      readonly envelope: DevelopmentTargetEnvelope;
      readonly previousRevision: number;
    }[];
    readonly scopeSnapshot?: {
      readonly principalId: PrincipalId;
      readonly bbContextId: BbContextId;
      readonly currentSourceRoots: readonly string[];
    };
  }): void;
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
      AND NOT EXISTS (
        SELECT 1 FROM development_target_retirements r
        WHERE r.object_id = o.id
      )
    ORDER BY o.created_at, o.id
  `);
  const selectAll = database.query<
    ObjectRow & { readonly retired: number },
    SQLQueryBindings[]
  >(`
    SELECT o.*, CASE WHEN r.object_id IS NULL THEN 0 ELSE 1 END AS retired
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    LEFT JOIN development_target_retirements r ON r.object_id = o.id
    WHERE s.principal_id = ? AND s.bb_context_id = ?
    ORDER BY o.created_at, o.id
  `);
  const selectCount = database.query<
    { readonly count: number },
    SQLQueryBindings[]
  >(`
    SELECT COUNT(*) AS count
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE s.principal_id = ? AND s.bb_context_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM development_target_retirements r
        WHERE r.object_id = o.id
      )
  `);
  const selectHistoryCount = database.query<
    { readonly count: number },
    SQLQueryBindings[]
  >(`
    SELECT COUNT(*) AS count
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE s.principal_id = ? AND s.bb_context_id = ?
  `);
  const selectById = database.query<ObjectRow, SQLQueryBindings[]>(`
    SELECT o.*
    FROM runtime_objects o
    INNER JOIN development_target_sources s ON s.object_id = o.id
    WHERE o.id = ? AND s.principal_id = ? AND s.bb_context_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM development_target_retirements r
        WHERE r.object_id = o.id
      )
  `);
  const selectPrivate = database.query<PrivateRow, SQLQueryBindings[]>(`
    SELECT canonical_root, root_key, root_kind
    FROM development_target_sources
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const selectPrivateHost = database.query<PrivateHostRow, SQLQueryBindings[]>(`
    SELECT runtime_instance_id, hostname, bb_host_id, bb_host_name,
      bb_host_is_server, observed_at
    FROM development_target_host_observations
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const selectProjectScopes = database.query<
    { readonly canonical_root: string },
    SQLQueryBindings[]
  >(`
    SELECT canonical_root
    FROM development_target_project_scopes
    WHERE principal_id = ? AND bb_context_id = ?
    ORDER BY canonical_root
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
  const insertPrivateHost = database.query(`
    INSERT INTO development_target_host_observations (
      object_id, principal_id, bb_context_id, runtime_instance_id, hostname,
      bb_host_id, bb_host_name, bb_host_is_server, observed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updatePrivateHost = database.query(`
    UPDATE development_target_host_observations
    SET runtime_instance_id = ?, hostname = ?, bb_host_id = ?,
      bb_host_name = ?, bb_host_is_server = ?, observed_at = ?
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const deleteProjectScopes = database.query(`
    DELETE FROM development_target_project_scopes
    WHERE principal_id = ? AND bb_context_id = ?
  `);
  const insertProjectScope = database.query(`
    INSERT INTO development_target_project_scopes (
      principal_id, bb_context_id, canonical_root
    ) VALUES (?, ?, ?)
  `);
  const insertRetirement = database.query(`
    INSERT INTO development_target_retirements (
      object_id, principal_id, bb_context_id, retired_at, revision
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const deleteRetirement = database.query(`
    DELETE FROM development_target_retirements
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const selectRetirement = database.query<
    { readonly found: number },
    SQLQueryBindings[]
  >(`
    SELECT 1 AS found
    FROM development_target_retirements
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const selectOldestRetired = database.query<
    { readonly object_id: string },
    SQLQueryBindings[]
  >(`
    SELECT object_id
    FROM development_target_retirements
    WHERE principal_id = ? AND bb_context_id = ?
    ORDER BY retired_at, object_id
    LIMIT ?
  `);
  const deleteTargetEvents = database.query(`
    DELETE FROM runtime_events
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const deleteTargetHost = database.query(`
    DELETE FROM development_target_host_observations
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const deleteTargetRetirement = database.query(`
    DELETE FROM development_target_retirements
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const deleteTargetSource = database.query(`
    DELETE FROM development_target_sources
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);
  const deleteTargetObject = database.query(`
    DELETE FROM runtime_objects
    WHERE id = ? AND principal_id = ? AND bb_context_id = ?
      AND kind = 'development-target'
  `);
  const selectTargetEvents = database.query<
    { readonly sequence: number; readonly event_type: string },
    SQLQueryBindings[]
  >(`
    SELECT sequence, event_type
    FROM runtime_events
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
    ORDER BY sequence DESC
  `);
  const upsertEventRetention = database.query(`
    INSERT INTO development_target_event_retention (
      object_id, principal_id, bb_context_id, expired_through_sequence
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(object_id) DO UPDATE SET
      expired_through_sequence = MAX(
        development_target_event_retention.expired_through_sequence,
        excluded.expired_through_sequence
      )
  `);
  const deleteExpiredTargetEvents = database.query(`
    DELETE FROM runtime_events
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
      AND sequence <= ?
      AND sequence NOT IN (
        SELECT MAX(latest.sequence)
        FROM runtime_events latest
        WHERE latest.object_id = ?
          AND latest.principal_id = ?
          AND latest.bb_context_id = ?
        GROUP BY latest.event_type
      )
  `);
  const deleteTargetEventRetention = database.query(`
    DELETE FROM development_target_event_retention
    WHERE object_id = ? AND principal_id = ? AND bb_context_id = ?
  `);

  function compactTargetEvents(envelope: DevelopmentTargetEnvelope): void {
    const events = selectTargetEvents.all(
      envelope.id,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
    );
    if (events.length <= TARGET_EVENT_MAX_EVENTS_PER_TARGET) return;

    const anchors = new Set<number>();
    const anchoredTypes = new Set<string>();
    for (const event of events) {
      if (!anchoredTypes.has(event.event_type)) {
        anchoredTypes.add(event.event_type);
        anchors.add(event.sequence);
      }
    }
    const retained = new Set(anchors);
    let visibleCount = 0;
    for (const event of events) {
      const nextSize = retained.has(event.sequence)
        ? retained.size
        : retained.size + 1;
      if (nextSize > TARGET_EVENT_MAX_EVENTS_PER_TARGET) break;
      retained.add(event.sequence);
      visibleCount += 1;
    }
    const firstExpired = events[visibleCount];
    if (!firstExpired) throw new RuntimeError("corrupt_data");
    upsertEventRetention.run(
      envelope.id,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
      firstExpired.sequence,
    );
    deleteExpiredTargetEvents.run(
      envelope.id,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
      firstExpired.sequence,
      envelope.id,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
    );
    const retainedCount = selectTargetEvents.all(
      envelope.id,
      envelope.bindings.principalId,
      envelope.bindings.bbContextId,
    ).length;
    if (retainedCount > TARGET_EVENT_MAX_EVENTS_PER_TARGET) {
      throw new RuntimeError("corrupt_data");
    }
  }
  function compactRetainedHistory(
    principalId: PrincipalId,
    bbContextId: BbContextId,
  ): void {
    const historyCount = selectHistoryCount.get(
      principalId,
      bbContextId,
    )?.count;
    if (historyCount === undefined) {
      throw new RuntimeError("corrupt_data");
    }
    const identityExcess = Math.max(
      0,
      historyCount - TARGET_HISTORY_MAX_TARGETS,
    );
    if (identityExcess === 0) return;

    const purged = selectOldestRetired.all(
      principalId,
      bbContextId,
      identityExcess,
    );
    if (purged.length !== identityExcess) {
      throw new RuntimeError("conflict");
    }

    for (const { object_id: objectId } of purged) {
      deleteTargetHost.run(objectId, principalId, bbContextId);
      deleteTargetSource.run(objectId, principalId, bbContextId);
      deleteTargetRetirement.run(objectId, principalId, bbContextId);
      deleteTargetEventRetention.run(objectId, principalId, bbContextId);
      const result = deleteTargetObject.run(objectId, principalId, bbContextId);
      if (result.changes !== 1) throw new RuntimeError("corrupt_data");
      deleteTargetEvents.run(objectId, principalId, bbContextId);
    }
    assertIntegrity();

    const finalHistoryCount = selectHistoryCount.get(
      principalId,
      bbContextId,
    )?.count;
    if (
      finalHistoryCount === undefined ||
      finalHistoryCount > TARGET_HISTORY_MAX_TARGETS
    ) {
      throw new RuntimeError("conflict");
    }
  }

  const persistCreation = database.transaction(
    (
      envelope: DevelopmentTargetEnvelope,
      candidate: TrustedDevelopmentTargetCandidate,
    ) => {
      const existingCount = selectCount.get(
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
      if (!existingCount || existingCount.count >= TARGET_LIST_MAX_TARGETS) {
        throw new RuntimeError("conflict");
      }
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
      compactTargetEvents(envelope);
      compactRetainedHistory(
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
    },
  );
  const persistUpdate = database.transaction(
    (
      envelope: DevelopmentTargetEnvelope,
      candidate: TrustedDevelopmentTargetCandidate,
      expectedRevision: number,
    ) => {
      const retired = selectRetirement.get(
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
      if (retired) {
        const existingCount = selectCount.get(
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
        );
        if (!existingCount || existingCount.count >= TARGET_LIST_MAX_TARGETS) {
          throw new RuntimeError("conflict");
        }
      }
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
      if (retired) {
        const retirementResult = deleteRetirement.run(
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
        );
        if (retirementResult.changes !== 1) {
          throw new RuntimeError("corrupt_data");
        }
        eventFeed.append("target.reopened", envelope);
      } else {
        eventFeed.append("object.updated", envelope);
      }
      compactTargetEvents(envelope);
      compactRetainedHistory(
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
    },
  );
  const persistNativeReconciliation = database.transaction(
    (
      envelope: DevelopmentTargetEnvelope,
      observation: PrivateHostObservation,
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

      const existing = selectPrivateHost.get(
        envelope.id,
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
      const values = [
        observation.runtimeInstanceId,
        observation.hostname,
        observation.bbHost?.id ?? null,
        observation.bbHost?.name ?? null,
        observation.bbHost === undefined
          ? null
          : observation.bbHost.isServer
            ? 1
            : 0,
        observation.observedAt,
      ] as const;
      if (existing) {
        const privateResult = updatePrivateHost.run(
          ...values,
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
        );
        if (privateResult.changes !== 1) {
          throw new RuntimeError("corrupt_data");
        }
      } else {
        insertPrivateHost.run(
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
          ...values,
        );
      }
      eventFeed.append("target.native-reconciled", envelope);
      compactTargetEvents(envelope);
      compactRetainedHistory(
        envelope.bindings.principalId,
        envelope.bindings.bbContextId,
      );
    },
  );
  const persistCompleteSnapshot = database.transaction(
    (input: {
      readonly present: readonly {
        readonly envelope: DevelopmentTargetEnvelope;
        readonly candidate: TrustedDevelopmentTargetCandidate;
        readonly previousRevision?: number;
        readonly reopened: boolean;
        readonly unchanged: boolean;
      }[];
      readonly retired: readonly {
        readonly envelope: DevelopmentTargetEnvelope;
        readonly previousRevision: number;
      }[];
      readonly scopeSnapshot?: {
        readonly principalId: PrincipalId;
        readonly bbContextId: BbContextId;
        readonly currentSourceRoots: readonly string[];
      };
    }) => {
      const sample = input.present[0]?.envelope ?? input.retired[0]?.envelope;
      const activeCount = sample
        ? selectCount.get(
            sample.bindings.principalId,
            sample.bindings.bbContextId,
          )?.count
        : 0;
      const activatedCount = input.present.filter(
        (entry) =>
          entry.previousRevision === undefined || entry.reopened === true,
      ).length;
      const projectedActiveCount =
        (activeCount ?? Number.NaN) - input.retired.length + activatedCount;
      if (
        !Number.isSafeInteger(projectedActiveCount) ||
        projectedActiveCount < 0 ||
        projectedActiveCount > TARGET_LIST_MAX_TARGETS
      ) {
        throw new RuntimeError("conflict");
      }

      for (const entry of input.retired) {
        const envelope = entry.envelope;
        const result = updateObject.run(
          envelope.revision,
          envelope.updatedAt,
          canonicalJson(envelope.payload),
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
          envelope.bindings.targetId,
          entry.previousRevision,
        );
        if (result.changes !== 1) throw new RuntimeError("conflict");
        insertRetirement.run(
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
          envelope.updatedAt,
          envelope.revision,
        );
        eventFeed.append("target.retired", envelope);
        compactTargetEvents(envelope);
      }

      for (const entry of input.present) {
        const envelope = entry.envelope;
        if (entry.unchanged) continue;
        if (entry.previousRevision === undefined) {
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
            entry.candidate.rootKey,
            entry.candidate.rootKind,
            entry.candidate.canonicalRoot,
          );
          eventFeed.append("object.created", envelope);
          compactTargetEvents(envelope);
          continue;
        }

        const result = updateObject.run(
          envelope.revision,
          envelope.updatedAt,
          canonicalJson(envelope.payload),
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
          envelope.bindings.targetId,
          entry.previousRevision,
        );
        if (result.changes !== 1) throw new RuntimeError("conflict");
        const privateResult = updatePrivate.run(
          entry.candidate.rootKey,
          entry.candidate.rootKind,
          envelope.id,
          envelope.bindings.principalId,
          envelope.bindings.bbContextId,
        );
        if (privateResult.changes !== 1) {
          throw new RuntimeError("corrupt_data");
        }
        if (entry.reopened) {
          const retirementResult = deleteRetirement.run(
            envelope.id,
            envelope.bindings.principalId,
            envelope.bindings.bbContextId,
          );
          if (retirementResult.changes !== 1) {
            throw new RuntimeError("corrupt_data");
          }
          eventFeed.append("target.reopened", envelope);
        } else {
          eventFeed.append("object.updated", envelope);
        }
        compactTargetEvents(envelope);
      }
      if (sample) {
        compactRetainedHistory(
          sample.bindings.principalId,
          sample.bindings.bbContextId,
        );
      }
      if (input.scopeSnapshot) {
        deleteProjectScopes.run(
          input.scopeSnapshot.principalId,
          input.scopeSnapshot.bbContextId,
        );
        for (const sourceRoot of input.scopeSnapshot.currentSourceRoots) {
          insertProjectScope.run(
            input.scopeSnapshot.principalId,
            input.scopeSnapshot.bbContextId,
            sourceRoot,
          );
        }
      }
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
    resolvePrivateHostObservation(principalId, bbContextId, id) {
      const row = selectPrivateHost.get(id, principalId, bbContextId);
      return row ? parsePrivateHostRow(row) : undefined;
    },
    persistCreation,
    persistUpdate,
    persistNativeReconciliation,
    listIncludingRetired(principalId, bbContextId) {
      return selectAll.all(principalId, bbContextId).map((row) => ({
        envelope: parseRow(row),
        retired: row.retired === 1,
      }));
    },
    listProjectScopes(principalId, bbContextId) {
      return selectProjectScopes
        .all(principalId, bbContextId)
        .map((row) => row.canonical_root);
    },
    persistCompleteSnapshot,
  };
}
