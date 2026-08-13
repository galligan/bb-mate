import { RuntimeError } from "../errors.ts";
import type { SqliteDatabase } from "../persistence/sqlite.ts";
import { DevelopmentTargetPayloadSchema } from "./development-target.ts";
import { parsePrivateDevelopmentTargetSource } from "./private-source.ts";
import { parsePrivateHostObservation } from "./private-host-observation.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";
import {
  TARGET_EVENT_MAX_EVENTS_PER_TARGET,
  TARGET_HISTORY_MAX_TARGETS,
} from "./target-limits.ts";

interface IntegrityRow {
  readonly invalid: number;
}

interface PrivateSourceRow {
  readonly canonical_root: string;
  readonly root_key: string;
  readonly root_kind: string;
}

interface PrivateScopeRow {
  readonly canonical_root: string;
}

interface PrivateHostRow {
  readonly runtime_instance_id: string;
  readonly hostname: string;
  readonly bb_host_id: string | null;
  readonly bb_host_name: string | null;
  readonly bb_host_is_server: number | null;
  readonly observed_at: number;
  readonly payload_json: string;
  readonly object_revision: number;
  readonly reconciliation_revision: number;
  readonly reconciliation_occurred_at: number;
}

export function createDevelopmentTargetIntegrityCheck(
  database: SqliteDatabase,
): () => void {
  const selectFailure = database.query<IntegrityRow, []>(`
    SELECT 1 AS invalid
    FROM development_target_sources s
    LEFT JOIN runtime_objects o ON o.id = s.object_id
    WHERE o.id IS NULL
      OR o.kind != 'development-target'
      OR o.principal_id != s.principal_id
      OR o.bb_context_id != s.bb_context_id
      OR o.target_id != o.id
      OR o.session_id IS NOT NULL
    UNION ALL
    SELECT 1 AS invalid
    FROM runtime_objects o
    LEFT JOIN development_target_sources s ON s.object_id = o.id
    WHERE o.kind = 'development-target'
      AND (
        s.object_id IS NULL
        OR s.principal_id != o.principal_id
        OR s.bb_context_id != o.bb_context_id
        OR o.target_id != o.id
        OR o.session_id IS NOT NULL
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM development_target_host_observations h
    LEFT JOIN runtime_objects o ON o.id = h.object_id
    WHERE o.id IS NULL
      OR o.kind != 'development-target'
      OR o.principal_id != h.principal_id
      OR o.bb_context_id != h.bb_context_id
      OR o.target_id != o.id
      OR o.session_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1
        FROM runtime_events e
        WHERE e.event_type = 'target.native-reconciled'
          AND e.object_id = h.object_id
          AND e.principal_id = h.principal_id
          AND e.bb_context_id = h.bb_context_id
          AND e.target_id = h.object_id
          AND e.session_id IS NULL
      )
      OR h.observed_at > (
        SELECT e.occurred_at
        FROM runtime_events e
        WHERE e.event_type = 'target.native-reconciled'
          AND e.object_id = h.object_id
          AND e.principal_id = h.principal_id
          AND e.bb_context_id = h.bb_context_id
          AND e.target_id = h.object_id
          AND e.session_id IS NULL
        ORDER BY e.sequence DESC
        LIMIT 1
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM runtime_events e
    LEFT JOIN runtime_objects o ON o.id = e.object_id
    LEFT JOIN development_target_host_observations h
      ON h.object_id = e.object_id
      AND h.principal_id = e.principal_id
      AND h.bb_context_id = e.bb_context_id
    WHERE e.event_type = 'target.native-reconciled'
      AND (
        o.id IS NULL
        OR o.kind != 'development-target'
        OR e.object_kind != 'development-target'
        OR o.principal_id != e.principal_id
        OR o.bb_context_id != e.bb_context_id
        OR o.target_id != e.target_id
        OR o.session_id IS NOT e.session_id
        OR e.revision > o.revision
        OR e.occurred_at > o.updated_at
        OR h.object_id IS NULL
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM development_target_retirements r
    LEFT JOIN runtime_objects o ON o.id = r.object_id
    LEFT JOIN development_target_sources s ON s.object_id = r.object_id
    WHERE o.id IS NULL
      OR s.object_id IS NULL
      OR o.kind != 'development-target'
      OR o.principal_id != r.principal_id
      OR o.bb_context_id != r.bb_context_id
      OR s.principal_id != r.principal_id
      OR s.bb_context_id != r.bb_context_id
      OR o.target_id != o.id
      OR o.session_id IS NOT NULL
      OR r.revision != o.revision
      OR r.retired_at != o.updated_at
      OR NOT EXISTS (
        SELECT 1
        FROM runtime_events e
        WHERE e.event_type = 'target.retired'
          AND e.object_id = r.object_id
          AND e.principal_id = r.principal_id
          AND e.bb_context_id = r.bb_context_id
          AND e.target_id = r.object_id
          AND e.session_id IS NULL
          AND e.revision = r.revision
          AND e.occurred_at = r.retired_at
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM runtime_events e
    LEFT JOIN runtime_objects o ON o.id = e.object_id
    WHERE e.event_type IN ('target.retired', 'target.reopened')
      AND (
        o.id IS NULL
        OR o.kind != 'development-target'
        OR e.object_kind != 'development-target'
        OR o.principal_id != e.principal_id
        OR o.bb_context_id != e.bb_context_id
        OR o.target_id != e.target_id
        OR o.session_id IS NOT e.session_id
        OR e.revision > o.revision
        OR e.occurred_at > o.updated_at
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM runtime_events e
    WHERE e.event_type IN ('target.retired', 'target.reopened')
      AND e.sequence = (
        SELECT MAX(latest.sequence)
        FROM runtime_events latest
        WHERE latest.object_id = e.object_id
          AND latest.principal_id = e.principal_id
          AND latest.bb_context_id = e.bb_context_id
          AND latest.event_type IN ('target.retired', 'target.reopened')
      )
      AND (
        (
          e.event_type = 'target.retired'
          AND NOT EXISTS (
            SELECT 1 FROM development_target_retirements r
            WHERE r.object_id = e.object_id
              AND r.principal_id = e.principal_id
              AND r.bb_context_id = e.bb_context_id
          )
        )
        OR (
          e.event_type = 'target.reopened'
          AND EXISTS (
            SELECT 1 FROM development_target_retirements r
            WHERE r.object_id = e.object_id
              AND r.principal_id = e.principal_id
              AND r.bb_context_id = e.bb_context_id
          )
        )
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM development_target_sources s
    GROUP BY s.principal_id, s.bb_context_id
    HAVING COUNT(*) > ${TARGET_HISTORY_MAX_TARGETS}
    UNION ALL
    SELECT 1 AS invalid
    FROM development_target_event_retention r
    LEFT JOIN runtime_objects o ON o.id = r.object_id
    LEFT JOIN development_target_sources s ON s.object_id = r.object_id
    WHERE o.id IS NULL
      OR s.object_id IS NULL
      OR o.kind != 'development-target'
      OR o.principal_id != r.principal_id
      OR o.bb_context_id != r.bb_context_id
      OR s.principal_id != r.principal_id
      OR s.bb_context_id != r.bb_context_id
      OR NOT EXISTS (
        SELECT 1 FROM runtime_events e
        WHERE e.object_id = r.object_id
          AND e.principal_id = r.principal_id
          AND e.bb_context_id = r.bb_context_id
          AND e.sequence > r.expired_through_sequence
      )
    UNION ALL
    SELECT 1 AS invalid
    FROM runtime_events e
    INNER JOIN development_target_sources s ON s.object_id = e.object_id
    GROUP BY e.object_id, s.principal_id, s.bb_context_id
    HAVING COUNT(*) > ${TARGET_EVENT_MAX_EVENTS_PER_TARGET}
    LIMIT 1
  `);
  const selectPrivateSources = database.query<PrivateSourceRow, []>(`
    SELECT canonical_root, root_key, root_kind
    FROM development_target_sources
  `);
  const selectPrivateHosts = database.query<PrivateHostRow, []>(`
    SELECT h.runtime_instance_id, h.hostname, h.bb_host_id, h.bb_host_name,
      h.bb_host_is_server, h.observed_at, o.payload_json,
      o.revision AS object_revision,
      (
        SELECT e.revision
        FROM runtime_events e
        WHERE e.event_type = 'target.native-reconciled'
          AND e.object_id = h.object_id
          AND e.principal_id = h.principal_id
          AND e.bb_context_id = h.bb_context_id
          AND e.target_id = h.object_id
          AND e.session_id IS NULL
        ORDER BY e.sequence DESC
        LIMIT 1
      ) AS reconciliation_revision,
      (
        SELECT e.occurred_at
        FROM runtime_events e
        WHERE e.event_type = 'target.native-reconciled'
          AND e.object_id = h.object_id
          AND e.principal_id = h.principal_id
          AND e.bb_context_id = h.bb_context_id
          AND e.target_id = h.object_id
          AND e.session_id IS NULL
        ORDER BY e.sequence DESC
        LIMIT 1
      ) AS reconciliation_occurred_at
    FROM development_target_host_observations h
    INNER JOIN runtime_objects o ON o.id = h.object_id
  `);
  const selectPrivateScopes = database.query<PrivateScopeRow, []>(`
    SELECT canonical_root FROM development_target_project_scopes
  `);

  return () => {
    if (selectFailure.get()) throw new RuntimeError("corrupt_data");
    try {
      for (const row of selectPrivateSources.all()) {
        parsePrivateDevelopmentTargetSource({
          canonicalRoot: row.canonical_root,
          rootKey: row.root_key,
          rootKind: row.root_kind,
        });
      }
      for (const row of selectPrivateHosts.all()) {
        const observation = parsePrivateHostObservation({
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
        const payload = DevelopmentTargetPayloadSchema.parse(
          JSON.parse(row.payload_json),
        );
        if (
          payload.native.observedAt !== observation.observedAt ||
          !Number.isSafeInteger(row.object_revision) ||
          !Number.isSafeInteger(row.reconciliation_revision) ||
          !Number.isSafeInteger(row.reconciliation_occurred_at) ||
          row.reconciliation_revision < 1 ||
          row.reconciliation_revision > row.object_revision ||
          row.reconciliation_occurred_at < observation.observedAt
        ) {
          throw new RuntimeError("corrupt_data");
        }
      }
      for (const row of selectPrivateScopes.all()) {
        if (!isCanonicalSourcePathFormat(row.canonical_root)) {
          throw new RuntimeError("corrupt_data");
        }
      }
    } catch (error) {
      throw new RuntimeError("corrupt_data", { cause: error });
    }
  };
}
