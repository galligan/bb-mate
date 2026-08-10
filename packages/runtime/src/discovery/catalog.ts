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
        storage.persistCreation(envelope, candidate);
        return envelope;
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
        if (host.observedAt !== native.observedAt) {
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
