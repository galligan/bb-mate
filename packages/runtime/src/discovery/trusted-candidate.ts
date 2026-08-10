import * as fs from "node:fs/promises";
import * as path from "node:path";

import { z } from "zod";

import { OpaqueIdSchema, type OpaqueId } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import {
  DevelopmentTargetPayloadSchema,
  type DevelopmentTargetPayload,
} from "./development-target.ts";

export const DevelopmentTargetRootKindSchema = z.enum([
  "current-project",
  "explicit",
  "pinned",
]);
export type DevelopmentTargetRootKind = z.infer<
  typeof DevelopmentTargetRootKindSchema
>;

const trustedCandidateBrand: unique symbol = Symbol(
  "bb-mate.trusted-development-target-candidate",
);
const issuedCandidates = new WeakSet<object>();

const TrustedDevelopmentTargetCandidateSchema = z.strictObject({
  rootKey: OpaqueIdSchema,
  rootKind: DevelopmentTargetRootKindSchema,
  canonicalRoot: z.string().min(1).max(4_096),
  target: DevelopmentTargetPayloadSchema,
});

export interface TrustedDevelopmentTargetCandidate {
  readonly rootKey: OpaqueId;
  readonly rootKind: DevelopmentTargetRootKind;
  readonly canonicalRoot: string;
  readonly target: DevelopmentTargetPayload;
  readonly [trustedCandidateBrand]: true;
}

async function validateCanonicalRoot(canonicalRoot: string): Promise<void> {
  const [metadata, resolvedRoot] = await Promise.all([
    fs.lstat(canonicalRoot),
    fs.realpath(canonicalRoot),
  ]);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    resolvedRoot !== canonicalRoot
  ) {
    throw new RuntimeError("invalid_request");
  }
}

export async function issueTrustedDevelopmentTargetCandidate(
  input: unknown,
): Promise<TrustedDevelopmentTargetCandidate> {
  try {
    const candidate = TrustedDevelopmentTargetCandidateSchema.parse(input);
    if (
      !path.isAbsolute(candidate.canonicalRoot) ||
      path.normalize(candidate.canonicalRoot) !== candidate.canonicalRoot ||
      (candidate.rootKind === "explicit" &&
        candidate.target.sourceKind !== "explicit") ||
      (candidate.rootKind === "pinned" &&
        candidate.target.sourceKind !== "pinned") ||
      (candidate.rootKind === "current-project" &&
        candidate.target.sourceKind !== "current-project" &&
        candidate.target.sourceKind !== "workspace-discovered")
    ) {
      throw new RuntimeError("invalid_request");
    }

    await validateCanonicalRoot(candidate.canonicalRoot);
    const issued = Object.freeze({
      ...candidate,
      target: Object.freeze({
        ...candidate.target,
        manifest: Object.freeze({ ...candidate.target.manifest }),
        native: Object.freeze({ ...candidate.target.native }),
        capabilities: Object.freeze({ ...candidate.target.capabilities }),
      }),
    }) as TrustedDevelopmentTargetCandidate;
    issuedCandidates.add(issued);
    return issued;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("invalid_request", { cause: error });
  }
}

export async function validateTrustedDevelopmentTargetCandidate(
  input: unknown,
): Promise<TrustedDevelopmentTargetCandidate> {
  if (
    typeof input !== "object" ||
    input === null ||
    !issuedCandidates.has(input)
  ) {
    throw new RuntimeError("invalid_request");
  }
  const candidate = input as TrustedDevelopmentTargetCandidate;
  try {
    await validateCanonicalRoot(candidate.canonicalRoot);
    return candidate;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("invalid_request", { cause: error });
  }
}
