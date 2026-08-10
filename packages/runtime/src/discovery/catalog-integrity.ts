import type { Database } from "bun:sqlite";

import { RuntimeError } from "../errors.ts";
import { parsePrivateDevelopmentTargetSource } from "./private-source.ts";

interface IntegrityRow {
  readonly invalid: number;
}

interface PrivateSourceRow {
  readonly canonical_root: string;
  readonly root_key: string;
  readonly root_kind: string;
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
    LIMIT 1
  `);
  const selectPrivateSources = database.query<PrivateSourceRow, []>(`
    SELECT canonical_root, root_key, root_kind
    FROM development_target_sources
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
    } catch (error) {
      throw new RuntimeError("corrupt_data", { cause: error });
    }
  };
}
