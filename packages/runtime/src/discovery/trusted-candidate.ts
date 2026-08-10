import * as fs from "node:fs/promises";

import { z } from "zod";

import { OpaqueIdSchema, type OpaqueId } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import {
  DevelopmentTargetPayloadSchema,
  type DevelopmentTargetPayload,
} from "./development-target.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";

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
interface IssuedSourceIdentity {
  readonly canonicalRoot: string;
  readonly device: number;
  readonly inode: number;
}

const issuedCandidates = new WeakMap<object, IssuedSourceIdentity>();

const TrustedDevelopmentTargetCandidateSchema = z.strictObject({
  rootKey: OpaqueIdSchema,
  rootKind: DevelopmentTargetRootKindSchema,
  canonicalRoot: z.string(),
  target: DevelopmentTargetPayloadSchema,
});

export interface TrustedDevelopmentTargetCandidate {
  readonly rootKey: OpaqueId;
  readonly rootKind: DevelopmentTargetRootKind;
  readonly canonicalRoot: string;
  readonly target: DevelopmentTargetPayload;
  readonly [trustedCandidateBrand]: true;
}

async function inspectCanonicalRoot(
  canonicalRoot: string,
): Promise<IssuedSourceIdentity> {
  const before = await fs.lstat(canonicalRoot);
  const resolvedRoot = await fs.realpath(canonicalRoot);
  const after = await fs.lstat(canonicalRoot);
  const resolvedRootAfter = await fs.realpath(canonicalRoot);
  if (
    !isCanonicalSourcePathFormat(canonicalRoot) ||
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    resolvedRoot !== canonicalRoot ||
    resolvedRootAfter !== resolvedRoot ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  ) {
    throw new RuntimeError("invalid_request");
  }
  return {
    canonicalRoot,
    device: after.dev,
    inode: after.ino,
  };
}

export async function issueTrustedDevelopmentTargetCandidateFromInspection(
  input: unknown,
): Promise<TrustedDevelopmentTargetCandidate> {
  try {
    const candidate = TrustedDevelopmentTargetCandidateSchema.parse(input);
    if (
      !isCanonicalSourcePathFormat(candidate.canonicalRoot) ||
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

    const identity = await inspectCanonicalRoot(candidate.canonicalRoot);
    const issued = Object.freeze({
      ...candidate,
      target: Object.freeze({
        ...candidate.target,
        manifest: Object.freeze({ ...candidate.target.manifest }),
        native: Object.freeze({ ...candidate.target.native }),
        capabilities: Object.freeze({ ...candidate.target.capabilities }),
      }),
    }) as TrustedDevelopmentTargetCandidate;
    issuedCandidates.set(issued, identity);
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
  const expectedIdentity = issuedCandidates.get(candidate)!;
  try {
    const actualIdentity = await inspectCanonicalRoot(candidate.canonicalRoot);
    if (
      actualIdentity.canonicalRoot !== expectedIdentity.canonicalRoot ||
      actualIdentity.device !== expectedIdentity.device ||
      actualIdentity.inode !== expectedIdentity.inode
    ) {
      throw new RuntimeError("invalid_request");
    }
    return candidate;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("invalid_request", { cause: error });
  }
}
