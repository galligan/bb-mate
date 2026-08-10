import { discoverSourceCandidates } from "../../../packages/inspection/src/discover-source-candidates.ts";
import type { TrustedRootInput } from "../../../packages/inspection/src/discovery-types.ts";
import { admitTrustedRoots } from "../../../packages/inspection/src/trusted-roots.ts";
import {
  createDevelopmentTargetService,
  createRequestContext,
  openDevelopmentTargetCatalog,
  TargetIdSchema,
  type DevelopmentTargetProjection,
  type TargetId,
} from "../../../packages/runtime/src/index.ts";

import { createInspectionDevelopmentTargetCandidateBridge } from "../../../packages/runtime/src/discovery/trusted-candidate.ts";
import {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "../../../packages/inspection/src/source-candidate-transition.ts";
import {
  loadWorkbenchServerIdentity,
  persistWorkbenchServerIdentity,
} from "./identities";

export interface WorkbenchConfiguredRoot {
  readonly slot: string;
  readonly kind: "current-project" | "explicit" | "pinned";
  readonly path: string;
  readonly displayName?: string;
}

export interface WorkbenchCatalogOptions {
  readonly dataRoot: string;
  readonly roots: readonly WorkbenchConfiguredRoot[];
}

export interface PreparedWorkbenchCatalog {
  readonly targets: readonly DevelopmentTargetProjection[];
  resolve(targetId: unknown): DevelopmentTargetProjection | null;
  close(): void;
}

export async function openPreparedWorkbenchCatalog(
  options: WorkbenchCatalogOptions,
): Promise<PreparedWorkbenchCatalog> {
  const catalog = await openDevelopmentTargetCatalog({
    dataRoot: options.dataRoot,
  });
  try {
    const identity = await loadWorkbenchServerIdentity(options.dataRoot);
    const inputs: TrustedRootInput[] = options.roots.map((root) => ({
      rootKey: identity.rootKey(root.slot),
      kind: root.kind,
      path: root.path,
      ...(root.displayName ? { displayName: root.displayName } : {}),
    }));
    await persistWorkbenchServerIdentity(
      options.dataRoot,
      identity,
      options.roots.map(({ slot }) => slot),
    );
    const admission = await admitTrustedRoots(inputs);
    const discovery = await discoverSourceCandidates(admission.roots);
    const sourceBridge = createInspectionDevelopmentTargetCandidateBridge({
      consumeIssuedSourceCandidate,
      readSourceCandidateTransition,
    });
    const context = createRequestContext({
      id: identity.principalId,
      kind: "plugin-adapter",
      scopes: ["targets:read", "targets:write"],
      revoked: false,
      bbContextId: identity.bbContextId,
    });
    const service = createDevelopmentTargetService(catalog);
    const targets: DevelopmentTargetProjection[] = [];
    for (const candidate of discovery.candidates) {
      targets.push(
        await service.refreshFromTrustedCandidate(
          context,
          await sourceBridge.issue(candidate),
        ),
      );
    }
    const visible = Object.freeze(targets);
    return {
      targets: visible,
      resolve(input) {
        let targetId: TargetId;
        try {
          targetId = TargetIdSchema.parse(input);
        } catch {
          return null;
        }
        return visible.find(({ id }) => id === targetId) ?? null;
      },
      close() {
        catalog.close();
      },
    };
  } catch (error) {
    catalog.close();
    throw error;
  }
}
