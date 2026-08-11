import * as fs from "node:fs/promises";

import {
  createDevelopmentTargetService,
  createInspectionDevelopmentTargetCandidateBridge,
  createOpaqueId,
  type BbContextId,
  type BatchProjectTargetAdmissionResponse,
  type DevelopmentTargetCatalog,
  type DevelopmentTargetListResponse,
  type OpaqueId,
  type PrincipalId,
  type RequestContext,
  type RuntimeTargetController,
} from "@bb-mate/runtime";
import {
  admitTrustedRoots,
  discoverWorkspaceSourceCandidates,
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
  readonly discoverCandidates?: typeof discoverWorkspaceSourceCandidates;
}

export function createRuntimeTargetController({
  catalog,
  principalId,
  bbContextId,
  createRootKey = createOpaqueId,
  clock,
  discoverCandidates = discoverWorkspaceSourceCandidates,
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
    async admit(context, { inventoryState, projects }, signal) {
      signal?.throwIfAborted();
      const groups = new Map<
        string,
        {
          state: "ready" | "partial";
          targets: DevelopmentTargetListResponse["targets"][number][];
        }
      >();
      const projectByRootKey = new Map<string, string>();
      const sourcePathByRootKey = new Map<string, string>();
      const rootInputs = projects.map(({ projectKey, sourcePath }) => {
        const rootKey = createRootKey();
        groups.set(projectKey, { state: "ready", targets: [] });
        projectByRootKey.set(rootKey, projectKey);
        sourcePathByRootKey.set(rootKey, sourcePath);
        return { rootKey, kind: "current-project" as const, path: sourcePath };
      });
      const admission = await abortable(
        admitTrustedRoots(rootInputs, { signal }),
        signal,
      );
      signal?.throwIfAborted();
      let partial = false;
      let rootlessUncertainty = false;
      const projectKeysByAdmittedRoot = new Map<string, string[]>();
      const canonicalSourceRootByAdmittedRoot = new Map<string, string>();
      for (const root of admission.roots) {
        const projectKey = projectByRootKey.get(root.rootKey);
        if (projectKey !== undefined) {
          projectKeysByAdmittedRoot.set(root.rootKey, [projectKey]);
        }
        const sourcePath = sourcePathByRootKey.get(root.rootKey);
        if (sourcePath !== undefined) {
          try {
            canonicalSourceRootByAdmittedRoot.set(
              root.rootKey,
              await abortable(fs.realpath(sourcePath), signal),
            );
          } catch {
            signal?.throwIfAborted();
            partial = true;
            markPartial(projectKey, groups);
          }
        }
      }
      for (const alias of admission.aliases) {
        const projectKey = projectByRootKey.get(alias.rootKey);
        if (projectKey !== undefined) {
          const projectKeys =
            projectKeysByAdmittedRoot.get(alias.admittedRootKey) ?? [];
          projectKeys.push(projectKey);
          projectKeysByAdmittedRoot.set(alias.admittedRootKey, projectKeys);
        }
      }
      for (const diagnostic of admission.diagnostics) {
        partial = true;
        if (diagnostic.rootKey === null) rootlessUncertainty = true;
        markPartial(
          diagnostic.rootKey === null
            ? undefined
            : projectByRootKey.get(diagnostic.rootKey),
          groups,
        );
      }

      const discovery = await abortable(
        discoverCandidates(admission.roots, { signal }),
        signal,
      );
      signal?.throwIfAborted();
      for (const diagnostic of discovery.diagnostics) {
        partial = true;
        if (diagnostic.rootKey === null) {
          rootlessUncertainty = true;
          continue;
        }
        for (const projectKey of projectKeysByAdmittedRoot.get(
          diagnostic.rootKey,
        ) ?? []) {
          markPartial(projectKey, groups);
        }
      }
      const issuedCandidates: Array<{
        readonly candidate: (typeof discovery.candidates)[number];
        readonly issued: Awaited<ReturnType<typeof bridge.issue>>;
      }> = [];
      for (const candidate of preferMostSpecificProjectCandidates(
        discovery.candidates,
        canonicalSourceRootByAdmittedRoot,
      )) {
        try {
          signal?.throwIfAborted();
          const issued = await abortable(bridge.issue(candidate), signal);
          signal?.throwIfAborted();
          issuedCandidates.push({ candidate, issued });
        } catch {
          signal?.throwIfAborted();
          partial = true;
          for (const projectKey of projectKeysByAdmittedRoot.get(
            candidate.rootKey,
          ) ?? []) {
            markPartial(projectKey, groups);
          }
        }
      }
      const uncertainSourceRoots = rootlessUncertainty
        ? [...canonicalSourceRootByAdmittedRoot.values()]
        : [...canonicalSourceRootByAdmittedRoot]
            .filter(([rootKey]) =>
              (projectKeysByAdmittedRoot.get(rootKey) ?? []).some(
                (projectKey) => groups.get(projectKey)?.state === "partial",
              ),
            )
            .map(([, sourceRoot]) => sourceRoot);
      const canReplaceProjectScopes =
        inventoryState === "complete" &&
        admission.diagnostics.length === 0 &&
        !rootlessUncertainty &&
        canonicalSourceRootByAdmittedRoot.size === admission.roots.length;
      if (canReplaceProjectScopes) {
        try {
          const refreshed = await abortable(
            targets.refreshFromCompleteSnapshot(
              context,
              issuedCandidates.map(({ issued }) => issued),
              {
                currentSourceRoots: [
                  ...canonicalSourceRootByAdmittedRoot.values(),
                ],
                uncertainSourceRoots,
                signal,
              },
            ),
            signal,
          );
          for (const [index, target] of refreshed.entries()) {
            addTargetToGroups(
              issuedCandidates[index]?.candidate.rootKey,
              target,
              projectKeysByAdmittedRoot,
              groups,
            );
          }
        } catch {
          signal?.throwIfAborted();
          partial = true;
          for (const group of groups.values()) group.state = "partial";
        }
        return batchResponse(projects, groups, partial);
      }
      for (const root of admission.roots) {
        const candidatesForRoot = issuedCandidates.filter(
          ({ candidate }) => candidate.rootKey === root.rootKey,
        );
        const projectKeys = projectKeysByAdmittedRoot.get(root.rootKey) ?? [];
        const sourceRoot = canonicalSourceRootByAdmittedRoot.get(root.rootKey);
        const authoritative =
          !rootlessUncertainty &&
          sourceRoot !== undefined &&
          projectKeys.every(
            (projectKey) => groups.get(projectKey)?.state === "ready",
          );
        if (authoritative) {
          try {
            const refreshed = await abortable(
              targets.refreshFromCompleteSnapshot(
                context,
                candidatesForRoot.map(({ issued }) => issued),
                {
                  authoritativeSourceRoots: [sourceRoot],
                  uncertainSourceRoots,
                  signal,
                },
              ),
              signal,
            );
            for (const target of refreshed) {
              addTargetToGroups(
                root.rootKey,
                target,
                projectKeysByAdmittedRoot,
                groups,
              );
            }
          } catch {
            signal?.throwIfAborted();
            partial = true;
            for (const projectKey of projectKeys)
              markPartial(projectKey, groups);
          }
          continue;
        }
        for (const { issued } of candidatesForRoot) {
          try {
            signal?.throwIfAborted();
            const refreshed = await abortable(
              targets.refreshFromTrustedCandidate(context, issued, { signal }),
              signal,
            );
            addTargetToGroups(
              root.rootKey,
              refreshed,
              projectKeysByAdmittedRoot,
              groups,
            );
          } catch {
            signal?.throwIfAborted();
            partial = true;
            for (const projectKey of projectKeys)
              markPartial(projectKey, groups);
          }
        }
      }
      return batchResponse(projects, groups, partial);
    },
    list(context) {
      return response("ready", targets.listTargets(context));
    },
  };
}

function preferMostSpecificProjectCandidates<
  T extends { readonly rootKey: string; readonly canonicalRoot: string },
>(
  candidates: readonly T[],
  sourceRootByRootKey: ReadonlyMap<string, string>,
): readonly T[] {
  const selected = new Map<string, T>();
  for (const candidate of candidates) {
    const previous = selected.get(candidate.canonicalRoot);
    const candidateScope = sourceRootByRootKey.get(candidate.rootKey) ?? "";
    const previousScope =
      previous === undefined
        ? ""
        : (sourceRootByRootKey.get(previous.rootKey) ?? "");
    if (
      previous === undefined ||
      candidateScope.length > previousScope.length
    ) {
      selected.set(candidate.canonicalRoot, candidate);
    }
  }
  return [...selected.values()];
}

async function abortable<T>(operation: PromiseLike<T>, signal?: AbortSignal) {
  if (signal === undefined) return operation;
  signal.throwIfAborted();

  let rejectAborted: ((reason?: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject;
  });
  const onAbort = () => rejectAborted?.(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function addTargetToGroups(
  rootKey: string | undefined,
  target: DevelopmentTargetListResponse["targets"][number],
  projectKeysByAdmittedRoot: ReadonlyMap<string, readonly string[]>,
  groups: Map<
    string,
    {
      state: "ready" | "partial";
      targets: DevelopmentTargetListResponse["targets"][number][];
    }
  >,
): void {
  if (rootKey === undefined) return;
  for (const projectKey of projectKeysByAdmittedRoot.get(rootKey) ?? []) {
    groups.get(projectKey)?.targets.push(target);
  }
}

function markPartial(
  projectKey: string | undefined,
  groups: Map<
    string,
    {
      state: "ready" | "partial";
      targets: DevelopmentTargetListResponse["targets"][number][];
    }
  >,
): void {
  if (projectKey === undefined) return;
  const group = groups.get(projectKey);
  if (group !== undefined) group.state = "partial";
}

function batchResponse(
  projects: readonly { readonly projectKey: string }[],
  groups: ReadonlyMap<
    string,
    {
      readonly state: "ready" | "partial";
      readonly targets: DevelopmentTargetListResponse["targets"];
    }
  >,
  partial: boolean,
): BatchProjectTargetAdmissionResponse {
  const projected = projects.map(({ projectKey }) => {
    const group = groups.get(projectKey);
    if (group === undefined) {
      return { projectKey, state: "partial" as const, targets: [] };
    }
    return {
      projectKey,
      state: group.state,
      targets: [...group.targets],
    };
  });
  return Object.freeze({
    schemaVersion: 2,
    state:
      partial || projected.some(({ state }) => state === "partial")
        ? "partial"
        : "ready",
    projects: projected,
  });
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
