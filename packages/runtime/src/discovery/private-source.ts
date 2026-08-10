import { z } from "zod";

import { OpaqueIdSchema, type OpaqueId } from "../contracts/ids.ts";
import {
  DevelopmentTargetRootKindSchema,
  type DevelopmentTargetRootKind,
} from "./trusted-candidate.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";

const PrivateDevelopmentTargetSourceSchema = z.strictObject({
  canonicalRoot: z.string().refine(isCanonicalSourcePathFormat),
  rootKey: OpaqueIdSchema,
  rootKind: DevelopmentTargetRootKindSchema,
});

export interface PrivateDevelopmentTargetSource {
  readonly canonicalRoot: string;
  readonly rootKey: OpaqueId;
  readonly rootKind: DevelopmentTargetRootKind;
}

export function parsePrivateDevelopmentTargetSource(
  input: unknown,
): PrivateDevelopmentTargetSource {
  return PrivateDevelopmentTargetSourceSchema.parse(input);
}
