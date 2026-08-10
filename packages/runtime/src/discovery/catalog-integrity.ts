import type { Database } from "bun:sqlite";

import { RuntimeError } from "../errors.ts";
import { DevelopmentTargetPayloadSchema } from "./development-target.ts";
import { parsePrivateDevelopmentTargetSource } from "./private-source.ts";
import { parsePrivateHostObservation } from "./private-host-observation.ts";

interface IntegrityRow {
  readonly invalid: number;
}

interface PrivateSourceRow {
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
  readonly payload_json: string;
  readonly object_revision: number;
  readonly reconciliation_revision: number;
  readonly reconciliation_occurred_at: number;
}

export function createDevelopmentTargetIntegrityCheck(
  database: Database,
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
    } catch (error) {
      throw new RuntimeError("corrupt_data", { cause: error });
    }
  };
}
