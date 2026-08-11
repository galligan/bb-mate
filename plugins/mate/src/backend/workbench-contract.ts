import { z } from "zod";

const utf8Bytes = (maximum: number) =>
  z
    .string()
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= maximum,
      `Must be at most ${maximum} UTF-8 bytes.`,
    );

const safeLabel = (maximum: number) =>
  utf8Bytes(maximum)
    .min(1)
    .refine(
      (value) =>
        value === value.trim() &&
        !/[\u0000-\u001f\u007f\\/]/u.test(value) &&
        value !== "." &&
        value !== ".." &&
        value !== "~" &&
        !/^[A-Za-z]:/u.test(value),
    );

function uniqueIds<T extends { id: string }>(items: readonly T[]) {
  return new Set(items.map(({ id }) => id)).size === items.length;
}

export const projectIdSchema = utf8Bytes(128)
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/u);

export const targetSummarySchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
    label: safeLabel(128),
    pluginId: utf8Bytes(64)
      .min(1)
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const projectOptionSchema = z
  .object({
    id: projectIdSchema,
    label: safeLabel(256),
    activity: z
      .object({
        active: z.boolean(),
        lastThreadUpdatedAt: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER)
          .nullable(),
      })
      .strict(),
    scan: z.discriminatedUnion("state", [
      z
        .object({ state: z.literal("not_scanned"), items: z.tuple([]) })
        .strict(),
      z
        .object({
          state: z.enum(["ready", "partial"]),
          items: z.array(targetSummarySchema).max(128).refine(uniqueIds),
        })
        .strict(),
      z
        .object({
          state: z.literal("unavailable"),
          reason: z.enum(["source_changed", "scan_failed", "capacity_reached"]),
          items: z.tuple([]),
        })
        .strict(),
    ]),
  })
  .strict();

const projectItemsSchema = z
  .array(projectOptionSchema)
  .max(128)
  .refine(uniqueIds)
  .refine(
    (items) =>
      new Set(items.flatMap((item) => item.scan.items.map(({ id }) => id)))
        .size <= 128,
  );

export const projectCatalogSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.enum(["ready", "partial"]),
      items: projectItemsSchema,
    })
    .strict()
    .refine((catalog) => {
      const incomplete = catalog.items.some(
        ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
      );
      return incomplete === (catalog.state === "partial");
    }),
  z.object({ state: z.literal("unavailable"), items: z.tuple([]) }).strict(),
]);

const runtimeVersionSchema = utf8Bytes(64)
  .min(1)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._+-]*$/u);

export const workbenchSnapshotSchema = z
  .object({
    schemaVersion: z.literal(3),
    runtimeState: z.enum([
      "idle",
      "starting",
      "ready",
      "stopping",
      "unavailable",
      "failed",
    ]),
    reason: z
      .enum([
        "unsupported_platform",
        "artifact_missing",
        "artifact_invalid",
        "runtime_incompatible",
        "startup_failed",
      ])
      .nullable(),
    runtimeVersion: runtimeVersionSchema.nullable(),
    apiVersion: z.literal(2).nullable(),
    canStart: z.boolean(),
    browserLaunch: z.literal("unavailable"),
    projects: projectCatalogSchema,
  })
  .strict()
  .refine((snapshot) => {
    const hasRuntimeIdentity =
      snapshot.runtimeVersion !== null && snapshot.apiVersion === 2;
    const expectsRuntimeIdentity =
      snapshot.runtimeState === "ready" || snapshot.runtimeState === "stopping";
    if (expectsRuntimeIdentity !== hasRuntimeIdentity) return false;
    if (
      !expectsRuntimeIdentity &&
      (snapshot.runtimeVersion !== null || snapshot.apiVersion !== null)
    )
      return false;
    if (snapshot.runtimeState === "idle")
      return snapshot.canStart && snapshot.reason === null;
    if (snapshot.runtimeState === "unavailable")
      return !snapshot.canStart && snapshot.reason !== null;
    if (snapshot.runtimeState === "failed")
      return snapshot.canStart && snapshot.reason === "startup_failed";
    return !snapshot.canStart && snapshot.reason === null;
  });

export type ProjectOption = z.infer<typeof projectOptionSchema>;
export type ProjectCatalog = z.infer<typeof projectCatalogSchema>;
export type TargetSummary = z.infer<typeof targetSummarySchema>;
export type PluginWorkbenchSnapshotV3 = z.infer<typeof workbenchSnapshotSchema>;
