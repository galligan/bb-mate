import { randomBytes } from "node:crypto";

import { z } from "zod";

const OPAQUE_ID_BYTES = 24;

const OpaqueIdStringSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32}$/u, "Expected an opaque identifier");

export const OpaqueIdSchema = OpaqueIdStringSchema.brand<"OpaqueId">();

export type OpaqueId = z.infer<typeof OpaqueIdSchema>;
export const ObjectIdSchema = OpaqueIdStringSchema.brand<"ObjectId">();
export const PrincipalIdSchema = OpaqueIdStringSchema.brand<"PrincipalId">();
export const BbContextIdSchema = OpaqueIdStringSchema.brand<"BbContextId">();
export const TargetIdSchema = OpaqueIdStringSchema.brand<"TargetId">();
export const SessionIdSchema = OpaqueIdStringSchema.brand<"SessionId">();

export type ObjectId = z.infer<typeof ObjectIdSchema>;
export type PrincipalId = z.infer<typeof PrincipalIdSchema>;
export type BbContextId = z.infer<typeof BbContextIdSchema>;
export type TargetId = z.infer<typeof TargetIdSchema>;
export type SessionId = z.infer<typeof SessionIdSchema>;

export type OpaqueIdRandomSource = (length: number) => Uint8Array;

const cryptographicRandomSource: OpaqueIdRandomSource = (length) =>
  randomBytes(length);

export function createOpaqueId(
  randomSource: OpaqueIdRandomSource = cryptographicRandomSource,
): OpaqueId {
  const bytes = randomSource(OPAQUE_ID_BYTES);
  if (bytes.byteLength !== OPAQUE_ID_BYTES) {
    throw new TypeError(
      `Opaque ID sources must return ${OPAQUE_ID_BYTES} bytes`,
    );
  }

  return OpaqueIdSchema.parse(Buffer.from(bytes).toString("base64url"));
}
