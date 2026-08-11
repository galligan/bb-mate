import {
  createDevelopmentTargetService,
  createInspectionDevelopmentTargetCandidateBridge,
  createOpaqueId,
  type BbContextId,
  type DevelopmentTargetCatalog,
  type DevelopmentTargetListResponse,
  type OpaqueId,
  type PrincipalId,
  type RequestContext,
  type RuntimeTargetController,
} from "@bb-mate/runtime";
import {
  admitTrustedRoots,
  discoverSourceCandidates,
} from "@bb-mate/inspection";
import {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "@bb-mate/inspection/source-transition";

export interface CreateRuntimeTargetControllerOptions {
  readonly catalog: DevelopmentTargetCatalog;
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  readonly createRootKey?: () => OpaqueId;
  readonly clock?: () => number;
}

export function createRuntimeTargetController({
  catalog,
  principalId,
  bbContextId,
  createRootKey = createOpaqueId,
  clock,
}: CreateRuntimeTargetControllerOptions): RuntimeTargetController {
  const targets = createDevelopmentTargetService(catalog);
  const bridge = createInspectionDevelopmentTargetCandidateBridge({
    consumeIssuedSourceCandidate,
    readSourceCandidateTransition,
    ...(clock ? { clock } : {}),
  });

  return {
    principalId,
    bbContextId,
    async admit(context, { sourcePath }) {
      const admission = await admitTrustedRoots([
        {
          rootKey: createRootKey(),
          kind: "current-project",
          path: sourcePath,
        },
      ]);
      let partial = admission.diagnostics.length > 0;
      if (admission.roots.length === 0) return response("partial", []);

      const discovery = await discoverSourceCandidates(admission.roots);
      partial ||= discovery.diagnostics.length > 0;
      const refreshed: DevelopmentTargetListResponse["targets"][number][] = [];
      for (const candidate of discovery.candidates) {
        try {
          refreshed.push(
            await targets.refreshFromTrustedCandidate(
              context,
              await bridge.issue(candidate),
            ),
          );
        } catch {
          partial = true;
        }
      }
      return response(partial ? "partial" : "ready", refreshed);
    },
    list(context) {
      return response("ready", targets.listTargets(context));
    },
  };
}

function response(
  state: DevelopmentTargetListResponse["state"],
  targets: DevelopmentTargetListResponse["targets"],
): DevelopmentTargetListResponse {
  return Object.freeze({
    schemaVersion: 1,
    state,
    targets: [...targets],
  });
}
