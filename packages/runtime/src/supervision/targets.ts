import path from "node:path";

import { z } from "zod";

import { DevelopmentTargetProjectionSchema } from "../discovery/development-target.ts";
import { TARGET_LIST_MAX_TARGETS } from "../discovery/target-limits.ts";

export { TARGET_LIST_MAX_TARGETS } from "../discovery/target-limits.ts";

export const TARGET_SOURCE_PATH_MAX_BYTES = 1024;
const SourcePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= TARGET_SOURCE_PATH_MAX_BYTES,
    `sourcePath must be at most ${TARGET_SOURCE_PATH_MAX_BYTES} UTF-8 bytes`,
  )
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "sourcePath must not contain control characters",
  })
  .refine((value) => path.isAbsolute(value), {
    message: "sourcePath must be absolute",
  })
  .refine((value) => path.normalize(value) === value, {
    message: "sourcePath must be lexically normalized",
  });

export const CurrentProjectTargetAdmissionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourcePath: SourcePathSchema,
});

export type CurrentProjectTargetAdmissionRequest = z.infer<
  typeof CurrentProjectTargetAdmissionRequestSchema
>;

export { DevelopmentTargetProjectionSchema };

export const DevelopmentTargetListResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  state: z.enum(["ready", "partial"]),
  targets: z
    .array(DevelopmentTargetProjectionSchema)
    .max(TARGET_LIST_MAX_TARGETS),
});

export type DevelopmentTargetListResponse = z.infer<
  typeof DevelopmentTargetListResponseSchema
>;
