import * as path from "node:path";

import {
  BbContextIdSchema,
  createOpaqueId,
  ObjectIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
  type BbContextId,
  type ObjectId,
  type PrincipalId,
} from "../contracts/ids.ts";
import { canonicalJson } from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import { openRuntimeDatabase } from "../persistence/database.ts";
import { RUNTIME_MIGRATIONS } from "../persistence/runtime-migrations.ts";
import { createDevelopmentTargetCatalogStorage } from "./catalog-storage.ts";
import {
  parseDevelopmentTargetEnvelope,
  type DevelopmentTargetEnvelope,
} from "./development-target.ts";
import type { PrivateDevelopmentTargetSource } from "./private-source.ts";
import type { PrivateHostObservation } from "./private-host-observation.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";
import {
  readPrivateHostObservation,
  type TrustedNativeInventory,
} from "./native-inventory.ts";
import { reconcileNativeTarget } from "./native-reconciliation.ts";
import {
  validateTrustedDevelopmentTargetCandidate,
  type TrustedDevelopmentTargetCandidate,
} from "./trusted-candidate.ts";

export interface OpenDevelopmentTargetCatalogOptions {
  readonly dataRoot: string;
  readonly clock?: () => number;
  readonly id?: () => ObjectId;
}

export type { PrivateDevelopmentTargetSource } from "./private-source.ts";

export interface RefreshDevelopmentTargetInput {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  readonly candidate: TrustedDevelopmentTargetCandidate;
  readonly expectedRevision?: number;
  readonly signal?: AbortSignal;
}

export interface RefreshCompleteDevelopmentTargetSnapshotInput {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  readonly candidates: readonly TrustedDevelopmentTargetCandidate[];
  readonly currentSourceRoots?: readonly string[];
  readonly authoritativeSourceRoots?: readonly string[];
  readonly uncertainSourceRoots?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface ReconcileDevelopmentTargetNativeInput {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  readonly id: ObjectId;
  readonly candidate: TrustedDevelopmentTargetCandidate;
  readonly inventory: TrustedNativeInventory;
  readonly expectedRevision: number;
}

export interface DevelopmentTargetCatalog {
  refresh(
    input: RefreshDevelopmentTargetInput,
  ): Promise<DevelopmentTargetEnvelope>;
  refreshCompleteSnapshot(
    input: RefreshCompleteDevelopmentTargetSnapshotInput,
  ): Promise<readonly DevelopmentTargetEnvelope[]>;
  reconcileNative(
    input: ReconcileDevelopmentTargetNativeInput,
  ): Promise<DevelopmentTargetEnvelope>;
  list(input: {
    readonly principalId: PrincipalId;
    readonly bbContextId: BbContextId;
  }): readonly DevelopmentTargetEnvelope[];
  get(input: {
    readonly principalId: PrincipalId;
    readonly bbContextId: BbContextId;
    readonly id: ObjectId;
  }): DevelopmentTargetEnvelope | undefined;
  resolvePrivate(input: {
    readonly principalId: PrincipalId;
    readonly bbContextId: BbContextId;
    readonly id: ObjectId;
  }): PrivateDevelopmentTargetSource | undefined;
  resolvePrivateHostObservation(input: {
    readonly principalId: PrincipalId;
    readonly bbContextId: BbContextId;
    readonly id: ObjectId;
  }): PrivateHostObservation | undefined;
  close(): void;
}

function storageError(error: unknown): never {
  if (error instanceof RuntimeError) throw error;
  throw new RuntimeError("internal", { cause: error });
}

export async function openDevelopmentTargetCatalog(
  options: OpenDevelopmentTargetCatalogOptions,
): Promise<DevelopmentTargetCatalog> {
  const runtimeDatabase = await openRuntimeDatabase({
    dataRoot: options.dataRoot,
    migrations: RUNTIME_MIGRATIONS,
  });
  const clock = options.clock ?? Date.now;
  const id = options.id ?? (() => ObjectIdSchema.parse(createOpaqueId()));
  const storage = createDevelopmentTargetCatalogStorage(
    runtimeDatabase.database,
  );

  try {
    storage.assertIntegrity();
  } catch (error) {
    runtimeDatabase.close();
    storageError(error);
  }

  return {
    async refresh(input) {
      try {
        const candidate = await validateTrustedDevelopmentTargetCandidate(
          input.candidate,
        );
        input.signal?.throwIfAborted();
        storage.assertIntegrity();
        const existing = storage.findByRoot(
          input.principalId,
          input.bbContextId,
          candidate.canonicalRoot,
        );
        if (existing) {
          const expectedRevision = input.expectedRevision ?? existing.revision;
          if (existing.revision !== expectedRevision) {
            throw new RuntimeError("conflict");
          }
          const privateHost = storage.resolvePrivateHostObservation(
            input.principalId,
            input.bbContextId,
            existing.id,
          );
          if (
            privateHost &&
            existing.payload.manifest.pluginId !==
              candidate.target.manifest.pluginId
          ) {
            throw new RuntimeError("invalid_request");
          }
          const envelope = parseDevelopmentTargetEnvelope({
            ...existing,
            revision: existing.revision + 1,
            updatedAt: clock(),
            payload: {
              ...candidate.target,
              ...(privateHost ? { native: existing.payload.native } : {}),
            },
          });
          input.signal?.throwIfAborted();
          storage.persistUpdate(envelope, candidate, expectedRevision);
          return envelope;
        }
        if (input.expectedRevision !== undefined) {
          throw new RuntimeError("not_found");
        }

        const objectId = id();
        const now = clock();
        const envelope = parseDevelopmentTargetEnvelope({
          schemaVersion: 1,
          id: objectId,
          kind: "development-target",
          bindings: {
            principalId: PrincipalIdSchema.parse(input.principalId),
            bbContextId: BbContextIdSchema.parse(input.bbContextId),
            targetId: TargetIdSchema.parse(objectId),
          },
          revision: 1,
          createdAt: now,
          updatedAt: now,
          payload: candidate.target,
        });
        input.signal?.throwIfAborted();
        storage.persistCreation(envelope, candidate);
        return envelope;
      } catch (error) {
        storageError(error);
      }
    },
    async refreshCompleteSnapshot(input) {
      try {
        input.signal?.throwIfAborted();
        const candidates = await Promise.all(
          input.candidates.map((candidate) =>
            validateTrustedDevelopmentTargetCandidate(candidate),
          ),
        );
        input.signal?.throwIfAborted();
        const canonicalRoots = new Set(
          candidates.map((candidate) => candidate.canonicalRoot),
        );
        if (canonicalRoots.size !== candidates.length) {
          throw new RuntimeError("invalid_request");
        }
        if (
          input.currentSourceRoots !== undefined &&
          input.authoritativeSourceRoots !== undefined
        ) {
          throw new RuntimeError("invalid_request");
        }
        const currentSourceRoots = validateSourceScopes(
          input.currentSourceRoots,
        );
        const requestedAuthoritativeSourceRoots =
          currentSourceRoots === undefined
            ? validateSourceScopes(input.authoritativeSourceRoots)
            : undefined;
        const authoritativeSourceRoots =
          currentSourceRoots === undefined
            ? requestedAuthoritativeSourceRoots
            : new Set([
                ...storage.listProjectScopes(
                  input.principalId,
                  input.bbContextId,
                ),
                ...currentSourceRoots,
              ]);
        const requestedUncertainSourceRoots = validateSourceScopes(
          input.uncertainSourceRoots,
        );
        const uncertainSourceRoots =
          currentSourceRoots === undefined &&
          authoritativeSourceRoots !== undefined
            ? new Set([
                ...(requestedUncertainSourceRoots ?? []),
                ...storage
                  .listProjectScopes(input.principalId, input.bbContextId)
                  .filter(
                    (registeredScope) =>
                      !authoritativeSourceRoots.has(registeredScope) &&
                      [...authoritativeSourceRoots].some((sourceRoot) =>
                        sourceScopesOverlap(registeredScope, sourceRoot),
                      ),
                  ),
              ])
            : requestedUncertainSourceRoots;
        if (
          currentSourceRoots !== undefined &&
          candidates.some(
            (candidate) =>
              ![...currentSourceRoots].some((sourceRoot) =>
                isWithinSourceRoot(candidate.canonicalRoot, sourceRoot),
              ),
          )
        ) {
          throw new RuntimeError("invalid_request");
        }

        storage.assertIntegrity();
        const existing = storage.listIncludingRetired(
          input.principalId,
          input.bbContextId,
        );
        const existingByRoot = new Map(
          existing.map((entry) => {
            const source = storage.resolvePrivate(
              input.principalId,
              input.bbContextId,
              entry.envelope.id,
            );
            if (!source) throw new RuntimeError("corrupt_data");
            return [source.canonicalRoot, { ...entry, source }] as const;
          }),
        );
        const now = clock();
        const present = candidates.map((candidate) => {
          const previous = existingByRoot.get(candidate.canonicalRoot);
          if (!previous) {
            const objectId = id();
            return {
              candidate,
              reopened: false,
              unchanged: false,
              envelope: parseDevelopmentTargetEnvelope({
                schemaVersion: 1,
                id: objectId,
                kind: "development-target",
                bindings: {
                  principalId: PrincipalIdSchema.parse(input.principalId),
                  bbContextId: BbContextIdSchema.parse(input.bbContextId),
                  targetId: TargetIdSchema.parse(objectId),
                },
                revision: 1,
                createdAt: now,
                updatedAt: now,
                payload: candidate.target,
              }),
            };
          }

          const privateHost = storage.resolvePrivateHostObservation(
            input.principalId,
            input.bbContextId,
            previous.envelope.id,
          );
          if (
            privateHost &&
            previous.envelope.payload.manifest.pluginId !==
              candidate.target.manifest.pluginId
          ) {
            throw new RuntimeError("invalid_request");
          }
          const payload = {
            ...candidate.target,
            ...(privateHost ||
            (previous.envelope.payload.native.status === "absent" &&
              candidate.target.native.status === "absent")
              ? { native: previous.envelope.payload.native }
              : {}),
          };
          const unchanged =
            !previous.retired &&
            previous.source.rootKind === candidate.rootKind &&
            canonicalJson(previous.envelope.payload) === canonicalJson(payload);
          return {
            candidate,
            previousRevision: previous.envelope.revision,
            reopened: previous.retired,
            unchanged,
            envelope: unchanged
              ? previous.envelope
              : parseDevelopmentTargetEnvelope({
                  ...previous.envelope,
                  revision: previous.envelope.revision + 1,
                  updatedAt: now,
                  payload,
                }),
          };
        });
        const retired = existing
          .filter(
            (entry) =>
              !entry.retired &&
              shouldReconcileSource(
                storage.resolvePrivate(
                  input.principalId,
                  input.bbContextId,
                  entry.envelope.id,
                )!.canonicalRoot,
                authoritativeSourceRoots,
                uncertainSourceRoots,
              ) &&
              !canonicalRoots.has(
                storage.resolvePrivate(
                  input.principalId,
                  input.bbContextId,
                  entry.envelope.id,
                )!.canonicalRoot,
              ),
          )
          .map((entry) => ({
            previousRevision: entry.envelope.revision,
            envelope: parseDevelopmentTargetEnvelope({
              ...entry.envelope,
              revision: entry.envelope.revision + 1,
              updatedAt: now,
            }),
          }));

        input.signal?.throwIfAborted();
        storage.persistCompleteSnapshot({
          present,
          retired,
          ...(currentSourceRoots === undefined
            ? requestedAuthoritativeSourceRoots === undefined
              ? {}
              : {
                  scopeAdditions: {
                    principalId: input.principalId,
                    bbContextId: input.bbContextId,
                    sourceRoots: [...requestedAuthoritativeSourceRoots],
                  },
                }
            : {
                scopeSnapshot: {
                  principalId: input.principalId,
                  bbContextId: input.bbContextId,
                  currentSourceRoots: [...currentSourceRoots],
                },
              }),
        });
        return present.map((entry) => entry.envelope);
      } catch (error) {
        storageError(error);
      }
    },
    async reconcileNative(input) {
      try {
        storage.assertIntegrity();
        const existing = storage.get(
          input.principalId,
          input.bbContextId,
          input.id,
        );
        if (!existing) throw new RuntimeError("not_found");
        if (existing.revision !== input.expectedRevision) {
          throw new RuntimeError("conflict");
        }
        const privateSource = storage.resolvePrivate(
          input.principalId,
          input.bbContextId,
          input.id,
        );
        if (!privateSource) throw new RuntimeError("corrupt_data");

        const candidate = await validateTrustedDevelopmentTargetCandidate(
          input.candidate,
        );
        if (
          candidate.canonicalRoot !== privateSource.canonicalRoot ||
          candidate.target.manifest.pluginId !==
            existing.payload.manifest.pluginId ||
          candidate.target.manifest.packageName !==
            existing.payload.manifest.packageName ||
          candidate.target.manifest.version !==
            existing.payload.manifest.version
        ) {
          throw new RuntimeError("invalid_request");
        }

        const now = clock();
        const native = reconcileNativeTarget({
          inventory: input.inventory,
          targetPluginId: existing.payload.manifest.pluginId,
          canonicalSourceRoot: privateSource.canonicalRoot,
          now,
        });
        const host = readPrivateHostObservation(input.inventory);
        if (host.observedAt > now) {
          throw new RuntimeError("invalid_request");
        }
        if (host.observedAt !== native.observedAt) {
          throw new RuntimeError("invalid_request");
        }
        const existingHost = storage.resolvePrivateHostObservation(
          input.principalId,
          input.bbContextId,
          input.id,
        );
        if (existingHost && host.observedAt <= existingHost.observedAt) {
          throw new RuntimeError("invalid_request");
        }
        const envelope = parseDevelopmentTargetEnvelope({
          ...existing,
          revision: existing.revision + 1,
          updatedAt: now,
          payload: { ...existing.payload, native },
        });
        storage.persistNativeReconciliation(
          envelope,
          host,
          input.expectedRevision,
        );
        return envelope;
      } catch (error) {
        storageError(error);
      }
    },
    list(input) {
      try {
        storage.assertIntegrity();
        return storage.list(input.principalId, input.bbContextId);
      } catch (error) {
        storageError(error);
      }
    },
    get(input) {
      try {
        storage.assertIntegrity();
        return storage.get(input.principalId, input.bbContextId, input.id);
      } catch (error) {
        storageError(error);
      }
    },
    resolvePrivate(input) {
      try {
        storage.assertIntegrity();
        return storage.resolvePrivate(
          input.principalId,
          input.bbContextId,
          input.id,
        );
      } catch (error) {
        storageError(error);
      }
    },
    resolvePrivateHostObservation(input) {
      try {
        storage.assertIntegrity();
        return storage.resolvePrivateHostObservation(
          input.principalId,
          input.bbContextId,
          input.id,
        );
      } catch (error) {
        storageError(error);
      }
    },
    close: runtimeDatabase.close,
  };
}

function validateSourceScopes(
  values: readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (values === undefined) return undefined;
  const scopes = new Set<string>();
  for (const value of values) {
    if (!isCanonicalSourcePathFormat(value) || scopes.has(value)) {
      throw new RuntimeError("invalid_request");
    }
    scopes.add(value);
  }
  return scopes;
}

function shouldReconcileSource(
  sourceRoot: string,
  authoritativeRoots: ReadonlySet<string> | undefined,
  uncertainRoots: ReadonlySet<string> | undefined,
): boolean {
  if (authoritativeRoots === undefined) return true;
  return (
    [...authoritativeRoots].some((scope) =>
      isWithinSourceRoot(sourceRoot, scope),
    ) &&
    ![...(uncertainRoots ?? [])].some((scope) =>
      isWithinSourceRoot(sourceRoot, scope),
    )
  );
}

function isWithinSourceRoot(sourceRoot: string, scope: string): boolean {
  return sourceRoot === scope || sourceRoot.startsWith(`${scope}${path.sep}`);
}

function sourceScopesOverlap(left: string, right: string): boolean {
  return isWithinSourceRoot(left, right) || isWithinSourceRoot(right, left);
}
