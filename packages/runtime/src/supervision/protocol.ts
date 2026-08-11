import { z } from "zod";
import path from "node:path";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import { canonicalJson } from "../contracts/objects.ts";

export const RUNTIME_API_VERSION = 2 as const;
export const SUPERVISOR_FRAME_MAX_BYTES = 4 * 1024;
export const RUNTIME_DESCRIPTOR_MAX_BYTES = 8 * 1024;

const RuntimeVersionSchema = z
  .string()
  .max(64)
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u,
  );

const SupervisorTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/u, "Expected a 32-byte base64url token")
  .refine((value) => {
    const decoded = Buffer.from(value, "base64url");
    return decoded.byteLength === 32 && decoded.toString("base64url") === value;
  }, "Expected a canonical 32-byte base64url token");

const RuntimeDataRootSchema = z
  .string()
  .min(1)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 1024)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .refine((value) => path.isAbsolute(value))
  .refine((value) => path.normalize(value) === value);

export const SupervisorFrameSchema = z.strictObject({
  schemaVersion: z.literal(2),
  expectedRuntimeVersion: RuntimeVersionSchema,
  expectedApiVersion: z.literal(RUNTIME_API_VERSION),
  token: SupervisorTokenSchema,
  dataRoot: RuntimeDataRootSchema,
});

export type SupervisorFrame = z.infer<typeof SupervisorFrameSchema>;

function parseBoundedJsonLine(
  input: string | Uint8Array,
  maxBytes: number,
): unknown {
  let text =
    typeof input === "string"
      ? input
      : new TextDecoder("utf-8", { fatal: true }).decode(input);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new TypeError();
  if (text.endsWith("\n")) text = text.slice(0, -1);
  if (text.length === 0 || text.includes("\n") || text.includes("\r")) {
    throw new TypeError();
  }
  return JSON.parse(text);
}

export function parseSupervisorFrame(
  input: string | Uint8Array,
): SupervisorFrame {
  try {
    return SupervisorFrameSchema.parse(
      parseBoundedJsonLine(input, SUPERVISOR_FRAME_MAX_BYTES),
    );
  } catch {
    throw new TypeError("Invalid supervisor frame");
  }
}

export const RuntimeCapabilitiesSchema = z.strictObject({
  annotations: z.boolean(),
  artifacts: z.boolean(),
  browserBootstrap: z.boolean(),
  captures: z.boolean(),
  comparisons: z.boolean(),
  events: z.boolean(),
  mcp: z.boolean(),
  pluginBriefs: z.boolean(),
  reviews: z.boolean(),
  sessions: z.boolean(),
  targets: z.boolean(),
});

export type RuntimeCapabilitiesV1 = z.infer<typeof RuntimeCapabilitiesSchema>;

export const RUNTIME_CAPABILITIES: Readonly<RuntimeCapabilitiesV1> =
  Object.freeze({
    annotations: false,
    artifacts: false,
    browserBootstrap: false,
    captures: false,
    comparisons: false,
    events: false,
    mcp: false,
    pluginBriefs: false,
    reviews: false,
    sessions: false,
    targets: true,
  });

const LoopbackBaseUrlSchema = z
  .string()
  .regex(/^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/u)
  .refine((value) => Number(value.slice(value.lastIndexOf(":") + 1)) <= 65_535);

export const RuntimeLaunchDescriptorSchema = z.strictObject({
  schemaVersion: z.literal(2),
  protocol: z.literal("bb-mate-runtime"),
  runtimeVersion: RuntimeVersionSchema,
  apiVersion: z.literal(RUNTIME_API_VERSION),
  pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  instanceId: OpaqueIdSchema,
  baseUrl: LoopbackBaseUrlSchema,
  capabilities: RuntimeCapabilitiesSchema,
});

export type RuntimeLaunchDescriptor = z.infer<
  typeof RuntimeLaunchDescriptorSchema
>;

export const RuntimeCapabilityDocumentSchema =
  RuntimeLaunchDescriptorSchema.omit({
    protocol: true,
    pid: true,
    baseUrl: true,
  });

export type RuntimeCapabilityDocument = z.infer<
  typeof RuntimeCapabilityDocumentSchema
>;

export function parseRuntimeLaunchDescriptor(
  input: string | Uint8Array,
): RuntimeLaunchDescriptor {
  try {
    return RuntimeLaunchDescriptorSchema.parse(
      parseBoundedJsonLine(input, RUNTIME_DESCRIPTOR_MAX_BYTES),
    );
  } catch {
    throw new TypeError("Invalid runtime launch descriptor");
  }
}

export function serializeRuntimeLaunchDescriptor(input: unknown): string {
  try {
    const line = `${canonicalJson(RuntimeLaunchDescriptorSchema.parse(input))}\n`;
    if (Buffer.byteLength(line, "utf8") > RUNTIME_DESCRIPTOR_MAX_BYTES) {
      throw new TypeError();
    }
    return line;
  } catch {
    throw new TypeError("Invalid runtime launch descriptor");
  }
}
