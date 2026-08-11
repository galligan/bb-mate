import path from "node:path";

import { z } from "zod";

import { DevelopmentTargetProjectionSchema } from "../discovery/development-target.ts";
import { TARGET_LIST_MAX_TARGETS } from "../discovery/target-limits.ts";

export { TARGET_LIST_MAX_TARGETS } from "../discovery/target-limits.ts";

export const TARGET_SOURCE_PATH_MAX_BYTES = 1024;
export const TARGET_ADMISSION_MAX_PROJECTS = 128;
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

const BatchProjectTargetAdmissionItemSchema = z.strictObject({
  projectKey: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
  sourcePath: SourcePathSchema,
});

export const BatchProjectTargetAdmissionRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    inventoryState: z.literal("complete"),
    projects: z
      .array(BatchProjectTargetAdmissionItemSchema)
      .max(TARGET_ADMISSION_MAX_PROJECTS),
  })
  .refine(
    ({ projects }) =>
      new Set(projects.map(({ projectKey }) => projectKey)).size ===
      projects.length,
    { message: "projectKey values must be unique", path: ["projects"] },
  );

export type BatchProjectTargetAdmissionRequest = z.infer<
  typeof BatchProjectTargetAdmissionRequestSchema
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

const BatchProjectTargetAdmissionGroupSchema = z.strictObject({
  projectKey: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
  state: z.enum(["ready", "partial"]),
  targets: z.array(DevelopmentTargetProjectionSchema),
});

export const BatchProjectTargetAdmissionResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    state: z.enum(["ready", "partial"]),
    projects: z
      .array(BatchProjectTargetAdmissionGroupSchema)
      .max(TARGET_ADMISSION_MAX_PROJECTS),
  })
  .superRefine(({ projects, state }, context) => {
    if (
      new Set(projects.map(({ projectKey }) => projectKey)).size !==
      projects.length
    ) {
      context.addIssue({
        code: "custom",
        message: "projectKey values must be unique",
        path: ["projects"],
      });
    }
    const targetCount = new Set(
      projects.flatMap((project) => project.targets.map((target) => target.id)),
    ).size;
    if (targetCount > TARGET_LIST_MAX_TARGETS) {
      context.addIssue({
        code: "too_big",
        origin: "array",
        maximum: TARGET_LIST_MAX_TARGETS,
        inclusive: true,
        path: ["projects"],
        message: `Admission results may contain at most ${TARGET_LIST_MAX_TARGETS} targets`,
      });
    }
    if (
      state === "ready" &&
      projects.some((project) => project.state === "partial")
    ) {
      context.addIssue({
        code: "custom",
        message: "a ready batch cannot contain a partial project",
        path: ["state"],
      });
    }
  });

export type BatchProjectTargetAdmissionResponse = z.infer<
  typeof BatchProjectTargetAdmissionResponseSchema
>;
