import { z } from "zod";

import { RuntimeError } from "../errors.ts";
import {
  DevelopmentTargetPayloadSchema,
  type DevelopmentTargetPayload,
} from "./development-target.ts";
import {
  readTrustedNativeInventory,
  type TrustedNativeInventory,
} from "./native-inventory.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";

const ReconciliationInputSchema = z.strictObject({
  targetPluginId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/u),
  canonicalSourceRoot: z.string().refine(isCanonicalSourcePathFormat),
  now: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export interface ReconcileNativeTargetInput {
  readonly inventory: TrustedNativeInventory;
  readonly targetPluginId: string;
  readonly canonicalSourceRoot: string;
  readonly now: number;
}

export type NativeReconciliationResult = Readonly<
  DevelopmentTargetPayload["native"]
>;

export function reconcileNativeTarget(
  input: ReconcileNativeTargetInput,
): NativeReconciliationResult {
  try {
    const parsed = ReconciliationInputSchema.parse({
      targetPluginId: input.targetPluginId,
      canonicalSourceRoot: input.canonicalSourceRoot,
      now: input.now,
    });
    const inventory = readTrustedNativeInventory(input.inventory);
    if (inventory.topLevelStatus !== "ok") {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "malformed",
          observedAt: inventory.observedAt,
        }),
      );
    }
    if (
      inventory.malformedRows.some(
        (row) =>
          row.id === parsed.targetPluginId ||
          row.canonicalRoot === parsed.canonicalSourceRoot,
      )
    ) {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "malformed",
          observedAt: inventory.observedAt,
        }),
      );
    }
    const matchingEntries = inventory.entries.filter(
      (entry) =>
        entry.id === parsed.targetPluginId ||
        (entry.sourceKind === "path" &&
          entry.canonicalRoot === parsed.canonicalSourceRoot),
    );
    if (matchingEntries.length > 1) {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "duplicate",
          observedAt: inventory.observedAt,
        }),
      );
    }
    if (
      matchingEntries.length === 1 &&
      matchingEntries[0]!.sourceKind === "path" &&
      matchingEntries[0]!.canonicalRoot === parsed.canonicalSourceRoot &&
      matchingEntries[0]!.id !== parsed.targetPluginId
    ) {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "malformed",
          observedAt: inventory.observedAt,
        }),
      );
    }
    if (inventory.observedAt > parsed.now) {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "malformed",
          observedAt: inventory.observedAt,
        }),
      );
    }
    if (parsed.now - inventory.observedAt > 30_000) {
      return Object.freeze(
        DevelopmentTargetPayloadSchema.shape.native.parse({
          status: "stale",
          observedAt: inventory.observedAt,
        }),
      );
    }
    const exact = inventory.entries.find(
      (entry) =>
        entry.id === parsed.targetPluginId &&
        entry.sourceKind === "path" &&
        entry.canonicalRoot === parsed.canonicalSourceRoot,
    );
    const otherPath = inventory.entries.find(
      (entry) =>
        entry.id === parsed.targetPluginId && entry.sourceKind === "path",
    );
    const managed = inventory.entries.find(
      (entry) =>
        entry.id === parsed.targetPluginId &&
        (entry.sourceKind === "npm" || entry.sourceKind === "git"),
    );
    const builtinConflict = inventory.entries.find(
      (entry) =>
        entry.id === parsed.targetPluginId &&
        (entry.sourceKind === "builtin" ||
          entry.sourceKind === "catalog" ||
          entry.isOrphanedBuiltin),
    );
    const native = exact
      ? {
          status: "exact-path" as const,
          pluginId: exact.id,
          observedAt: inventory.observedAt,
        }
      : otherPath
        ? {
            status: "other-path" as const,
            pluginId: otherPath.id,
            observedAt: inventory.observedAt,
          }
        : managed
          ? {
              status: "managed" as const,
              pluginId: managed.id,
              observedAt: inventory.observedAt,
            }
          : builtinConflict
            ? {
                status: "builtin-conflict" as const,
                pluginId: builtinConflict.id,
                observedAt: inventory.observedAt,
              }
            : {
                status: "absent" as const,
                observedAt: inventory.observedAt,
              };
    return Object.freeze(
      DevelopmentTargetPayloadSchema.shape.native.parse(native),
    );
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("invalid_request", { cause: error });
  }
}
