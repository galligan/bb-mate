import { z } from "zod";

import { TargetIdSchema, type TargetId } from "../contracts/ids.ts";
import {
  defineObjectCodec,
  ObjectCodecRegistry,
  type ObjectEnvelope,
} from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const DevelopmentTargetSourceKindSchema = z.enum([
  "current-project",
  "workspace-discovered",
  "explicit",
  "pinned",
]);

export const NativeReconciliationStatusSchema = z.enum([
  "exact-path",
  "other-path",
  "managed",
  "builtin-conflict",
  "absent",
  "duplicate",
  "malformed",
  "stale",
]);

const developmentTargetShape = {
  displayName: boundedText(128),
  displayPath: boundedText(256).refine(
    (value) =>
      !value.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/u.test(value) &&
      !value.split(/[\\/]/u).includes(".."),
    "displayPath must be redacted and relative",
  ),
  sourceKind: DevelopmentTargetSourceKindSchema,
  manifest: z.strictObject({
    pluginId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/u),
    packageName: boundedText(214),
    version: boundedText(64),
    hasServer: z.boolean(),
    hasApp: z.boolean(),
  }),
  native: z.strictObject({
    status: NativeReconciliationStatusSchema,
    pluginId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/u)
      .optional(),
    observedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  capabilities: z.strictObject({
    fixture: z.boolean(),
    harness: z.boolean(),
    live: z.boolean(),
  }),
} satisfies z.ZodRawShape;

export const DevelopmentTargetPayloadSchema = z.strictObject(
  developmentTargetShape,
);
export type DevelopmentTargetPayload = z.infer<
  typeof DevelopmentTargetPayloadSchema
>;

export const DevelopmentTargetCodec = defineObjectCodec(
  "development-target",
  developmentTargetShape,
);

const developmentTargetRegistry = new ObjectCodecRegistry([
  DevelopmentTargetCodec,
]);

export type DevelopmentTargetEnvelope = ObjectEnvelope<
  "development-target",
  DevelopmentTargetPayload
>;

export interface DevelopmentTargetProjection extends DevelopmentTargetPayload {
  readonly schemaVersion: 1;
  readonly kind: "development-target";
  readonly id: TargetId;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function parseDevelopmentTargetEnvelope(
  input: unknown,
): DevelopmentTargetEnvelope {
  const envelope = developmentTargetRegistry.parse(input);
  if (
    envelope.kind !== "development-target" ||
    String(envelope.id) !== String(envelope.bindings.targetId) ||
    envelope.bindings.sessionId !== undefined
  ) {
    throw new RuntimeError("invalid_request");
  }

  return {
    ...envelope,
    kind: "development-target",
    payload: DevelopmentTargetPayloadSchema.parse(envelope.payload),
  };
}

export function projectDevelopmentTarget(
  envelope: DevelopmentTargetEnvelope,
): DevelopmentTargetProjection {
  const parsed = parseDevelopmentTargetEnvelope(envelope);
  return {
    schemaVersion: 1,
    kind: "development-target",
    id: TargetIdSchema.parse(parsed.id),
    revision: parsed.revision,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    ...parsed.payload,
  };
}
