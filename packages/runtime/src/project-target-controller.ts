import * as path from "node:path";

import {
  admitTrustedRoots,
  discoverWorkspaceSourceCandidates,
  sourceCandidateDiscoveringRootKeys,
  trustedRootCanonicalRoot,
} from "@bb-plugin-studio/inspection/discovery";
import {
  consumeIssuedSourceCandidate,
  readSourceCandidateTransition,
} from "@bb-plugin-studio/inspection/source-transition";
import type { RequestContext } from "./auth/context.ts";
import {
  createOpaqueId,
  type BbContextId,
  type OpaqueId,
  type PrincipalId,
} from "./contracts/ids.ts";
import type { DevelopmentTargetCatalog } from "./discovery/catalog.ts";
import { createInspectionDevelopmentTargetCandidateBridge } from "./discovery/trusted-candidate.ts";
import { createDevelopmentTargetService } from "./service/development-target-service.ts";
import {
  TARGET_LIST_MAX_TARGETS,
  type BatchProjectTargetAdmissionResponse,
  type DevelopmentTargetListResponse,
} from "./supervision/targets.ts";

export interface CreateRuntimeTargetControllerOptions {
  readonly catalog: DevelopmentTargetCatalog;
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  readonly createRootKey?: () => OpaqueId;
  readonly clock?: () => number;
  readonly admitRoots?: typeof admitTrustedRoots;
  readonly discoverCandidates?: typeof discoverWorkspaceSourceCandidates;
  /** Revalidate host-owned source authorization immediately before writes. */
  readonly beforeCatalogMutation?: (signal?: AbortSignal) => Promise<void>;
}

export interface ProjectTargetController {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  admit(
    context: RequestContext,
    input: import("./supervision/targets.ts").BatchProjectTargetAdmissionRequest,
    signal?: AbortSignal,
  ): Promise<BatchProjectTargetAdmissionResponse>;
  list(context: RequestContext): DevelopmentTargetListResponse;
}

class CatalogAuthorizationFailure {
  readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }
}

export function createProjectTargetController({
  catalog,
  principalId,
  bbContextId,
  createRootKey = createOpaqueId,
  clock,
  admitRoots = admitTrustedRoots,
  discoverCandidates = discoverWorkspaceSourceCandidates,
  beforeCatalogMutation,
}: CreateRuntimeTargetControllerOptions): ProjectTargetController {
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
      const rootInputs = projects.map(({ projectKey, sourcePath }) => {
        const rootKey = createRootKey();
        groups.set(projectKey, { state: "ready", targets: [] });
        projectByRootKey.set(rootKey, projectKey);
        return { rootKey, kind: "current-project" as const, path: sourcePath };
      });
      const admission = await abortable(
        admitRoots(rootInputs, { signal }),
        signal,
      );
      signal?.throwIfAborted();
      let partial = inventoryState === "partial";
      let rootlessUncertainty = false;
      const projectKeysByAdmittedRoot = new Map<string, string[]>();
      const canonicalSourceRootByAdmittedRoot = new Map<string, string>();
      for (const root of admission.roots) {
        const projectKey = projectByRootKey.get(root.rootKey);
        if (projectKey !== undefined) {
          projectKeysByAdmittedRoot.set(root.rootKey, [projectKey]);
        }
        canonicalSourceRootByAdmittedRoot.set(
          root.rootKey,
          trustedRootCanonicalRoot(root),
        );
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
        readonly rootKeys: readonly string[];
      }> = [];
      const rootKeysByCanonicalRoot = new Map(
        discovery.candidates.map((candidate) => [
          candidate.canonicalRoot,
          sourceCandidateDiscoveringRootKeys(candidate),
        ]),
      );
      for (const candidate of preferMostSpecificProjectCandidates(
        discovery.candidates,
        canonicalSourceRootByAdmittedRoot,
      )) {
        try {
          signal?.throwIfAborted();
          const issued = await abortable(bridge.issue(candidate), signal);
          signal?.throwIfAborted();
          issuedCandidates.push({
            candidate,
            issued,
            rootKeys: rootKeysByCanonicalRoot.get(candidate.canonicalRoot) ?? [
              candidate.rootKey,
            ],
          });
        } catch {
          signal?.throwIfAborted();
          partial = true;
          for (const rootKey of rootKeysByCanonicalRoot.get(
            candidate.canonicalRoot,
          ) ?? [candidate.rootKey]) {
            for (const projectKey of projectKeysByAdmittedRoot.get(rootKey) ??
              []) {
              markPartial(projectKey, groups);
            }
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
      const mutateCatalog = async <T>(mutation: () => PromiseLike<T>) => {
        signal?.throwIfAborted();
        try {
          await abortable(
            beforeCatalogMutation?.(signal) ?? Promise.resolve(),
            signal,
          );
        } catch (error) {
          throw new CatalogAuthorizationFailure(error);
        }
        signal?.throwIfAborted();
        return abortable(mutation(), signal);
      };
      const canReplaceProjectScopes =
        inventoryState === "complete" &&
        admission.diagnostics.length === 0 &&
        !rootlessUncertainty &&
        canonicalSourceRootByAdmittedRoot.size === admission.roots.length;
      if (canReplaceProjectScopes) {
        try {
          const refreshed = await mutateCatalog(() =>
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
          );
          for (const [index, target] of refreshed.entries()) {
            for (const rootKey of issuedCandidates[index]?.rootKeys ?? []) {
              addTargetToGroups(
                rootKey,
                target,
                projectKeysByAdmittedRoot,
                groups,
              );
            }
          }
        } catch (error) {
          rethrowCatalogAuthorizationFailure(error);
          signal?.throwIfAborted();
          partial = true;
          for (const group of groups.values()) group.state = "partial";
        }
        return batchResponse(projects, groups, partial);
      }
      const authoritativeRoots = admission.roots.filter((root) => {
        const projectKeys = projectKeysByAdmittedRoot.get(root.rootKey) ?? [];
        const sourceRoot = canonicalSourceRootByAdmittedRoot.get(root.rootKey);
        return (
          !rootlessUncertainty &&
          sourceRoot !== undefined &&
          projectKeys.every(
            (projectKey) => groups.get(projectKey)?.state === "ready",
          )
        );
      });
      const authoritativeRootKeys = new Set(
        authoritativeRoots.map(({ rootKey }) => rootKey),
      );
      const nonAuthoritativeRoots = admission.roots.filter(
        ({ rootKey }) => !authoritativeRootKeys.has(rootKey),
      );
      const scopeAdditions = nonAuthoritativeRoots.flatMap(({ rootKey }) => {
        const sourceRoot = canonicalSourceRootByAdmittedRoot.get(rootKey);
        return sourceRoot === undefined ? [] : [sourceRoot];
      });
      if (scopeAdditions.length > 0) {
        try {
          await mutateCatalog(() =>
            targets.registerProjectScopes(context, scopeAdditions, { signal }),
          );
        } catch (error) {
          rethrowCatalogAuthorizationFailure(error);
          signal?.throwIfAborted();
          partial = true;
          for (const { rootKey } of nonAuthoritativeRoots) {
            for (const projectKey of projectKeysByAdmittedRoot.get(rootKey) ??
              []) {
              markPartial(projectKey, groups);
            }
          }
        }
      }
      const reconciledRootKeys = new Set<string>();
      const reconciledCandidateRoots = new Set<string>();
      for (const component of overlappingRootComponents(
        authoritativeRoots,
        canonicalSourceRootByAdmittedRoot,
      )) {
        const componentRootKeys = new Set(
          component.map(({ rootKey }) => rootKey),
        );
        const candidatesForComponent = issuedCandidates.filter(({ rootKeys }) =>
          rootKeys.some((rootKey) => componentRootKeys.has(rootKey)),
        );
        try {
          const refreshed = await mutateCatalog(() =>
            targets.refreshFromCompleteSnapshot(
              context,
              candidatesForComponent.map(({ issued }) => issued),
              {
                authoritativeSourceRoots: component.map(({ rootKey }) =>
                  canonicalSourceRootByAdmittedRoot.get(rootKey)!,
                ),
                uncertainSourceRoots,
                signal,
              },
            ),
          );
          for (const [index, target] of refreshed.entries()) {
            for (const rootKey of candidatesForComponent[index]?.rootKeys ??
              []) {
              addTargetToGroups(
                rootKey,
                target,
                projectKeysByAdmittedRoot,
                groups,
              );
            }
          }
          for (const { candidate } of candidatesForComponent) {
            reconciledCandidateRoots.add(candidate.canonicalRoot);
          }
          for (const { rootKey } of component) reconciledRootKeys.add(rootKey);
        } catch (error) {
          rethrowCatalogAuthorizationFailure(error);
          signal?.throwIfAborted();
          partial = true;
          try {
            await mutateCatalog(() =>
              targets.registerProjectScopes(
                context,
                component.map(({ rootKey }) =>
                  canonicalSourceRootByAdmittedRoot.get(rootKey)!,
                ),
                { signal },
              ),
            );
          } catch (error) {
            rethrowCatalogAuthorizationFailure(error);
            signal?.throwIfAborted();
          }
          for (const { rootKey } of component) {
            for (const projectKey of projectKeysByAdmittedRoot.get(rootKey) ??
              []) {
              markPartial(projectKey, groups);
            }
          }
        }
      }
      for (const root of admission.roots) {
        if (reconciledRootKeys.has(root.rootKey)) continue;
        const candidatesForRoot = issuedCandidates.filter(({ rootKeys }) =>
          rootKeys.includes(root.rootKey),
        );
        const projectKeys = projectKeysByAdmittedRoot.get(root.rootKey) ?? [];
        for (const { candidate, issued, rootKeys } of candidatesForRoot) {
          if (reconciledCandidateRoots.has(candidate.canonicalRoot)) continue;
          try {
            signal?.throwIfAborted();
            const refreshed = await mutateCatalog(() =>
              targets.refreshFromTrustedCandidate(context, issued, { signal }),
            );
            for (const rootKey of rootKeys) {
              addTargetToGroups(
                rootKey,
                refreshed,
                projectKeysByAdmittedRoot,
                groups,
              );
            }
            reconciledCandidateRoots.add(candidate.canonicalRoot);
          } catch (error) {
            rethrowCatalogAuthorizationFailure(error);
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

/** @deprecated Child-runtime compatibility alias; remove with #101. */
export const createRuntimeTargetController = createProjectTargetController;

function rethrowCatalogAuthorizationFailure(error: unknown): void {
  if (error instanceof CatalogAuthorizationFailure) throw error.cause;
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

function overlappingRootComponents<T extends { readonly rootKey: string }>(
  roots: readonly T[],
  sourceRootByRootKey: ReadonlyMap<string, string>,
): readonly (readonly T[])[] {
  const remaining = new Set(roots);
  const components: T[][] = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value as T;
    remaining.delete(first);
    const component = [first];
    for (let index = 0; index < component.length; index += 1) {
      const sourceRoot = sourceRootByRootKey.get(component[index]!.rootKey);
      for (const candidate of [...remaining]) {
        const candidateRoot = sourceRootByRootKey.get(candidate.rootKey);
        if (
          sourceRoot !== undefined &&
          candidateRoot !== undefined &&
          sourceRootsOverlap(sourceRoot, candidateRoot)
        ) {
          remaining.delete(candidate);
          component.push(candidate);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function sourceRootsOverlap(first: string, second: string): boolean {
  const relative = path.relative(first, second);
  if (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  ) {
    return true;
  }
  const reverse = path.relative(second, first);
  return !reverse.startsWith("..") && !path.isAbsolute(reverse);
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
    const group = groups.get(projectKey);
    if (
      group !== undefined &&
      !group.targets.some((existing) => existing.id === target.id)
    ) {
      group.targets.push(target);
    }
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
  let remainingTargetEntries = TARGET_LIST_MAX_TARGETS;
  const projected = projects.map(({ projectKey }) => {
    const group = groups.get(projectKey);
    if (group === undefined) {
      return { projectKey, state: "partial" as const, targets: [] };
    }
    const targets = group.targets.slice(0, remainingTargetEntries);
    remainingTargetEntries -= targets.length;
    const truncated = targets.length !== group.targets.length;
    return {
      projectKey,
      state: truncated ? ("partial" as const) : group.state,
      targets,
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
