import { z } from "zod";

import { OpaqueIdSchema, type OpaqueId } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";

const boundedHostText = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      !/[\u0000-\u001f\u007f]/u.test(value) &&
      !value.includes(":") &&
      !value.includes("/") &&
      !value.includes("@"),
    "Host metadata must not contain URLs or credentials",
  );

const HostnameSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine((value) => {
    if (
      value.includes(":") ||
      value.includes("/") ||
      value.includes("@") ||
      value.includes("..")
    ) {
      return false;
    }
    return value
      .split(".")
      .every(
        (label) =>
          label.length >= 1 &&
          label.length <= 63 &&
          /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label),
      );
  }, "Expected a hostname without a URL, port, or credentials");

const PrivateHostObservationSchema = z.strictObject({
  runtimeInstanceId: OpaqueIdSchema,
  hostname: HostnameSchema,
  bbHost: z
    .strictObject({
      id: boundedHostText,
      name: boundedHostText,
      isServer: z.boolean(),
    })
    .optional(),
  observedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export interface PrivateHostObservation {
  readonly runtimeInstanceId: OpaqueId;
  readonly hostname: string;
  readonly bbHost?: {
    readonly id: string;
    readonly name: string;
    readonly isServer: boolean;
  };
  readonly observedAt: number;
}

export function parsePrivateHostObservation(
  input: unknown,
): PrivateHostObservation {
  try {
    return PrivateHostObservationSchema.parse(input);
  } catch (error) {
    throw new RuntimeError("invalid_request", { cause: error });
  }
}
