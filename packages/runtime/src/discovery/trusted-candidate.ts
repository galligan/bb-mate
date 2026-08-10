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

const InspectionSourceCandidateFactsSchema = z.strictObject({
  rootKey: OpaqueIdSchema,
  rootKind: DevelopmentTargetRootKindSchema,
  canonicalRoot: z.string(),
  displayPath: z.string(),
  packageName: z.string(),
  version: z.string(),
  pluginId: z.string(),
  displayName: z.string(),
  hasServer: z.boolean(),
  hasApp: z.boolean(),
});

export type InspectionSourceCandidateFacts = z.infer<
  typeof InspectionSourceCandidateFactsSchema
>;

export interface InspectionDevelopmentTargetCandidateBridge {
  issue(candidate: unknown): Promise<TrustedDevelopmentTargetCandidate>;
}

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

async function issueTrustedDevelopmentTargetCandidate(
  input: InspectionSourceCandidateFacts,
  observedAt: number,
): Promise<TrustedDevelopmentTargetCandidate> {
  try {
    const sourceKind =
      input.rootKind === "current-project"
        ? "workspace-discovered"
        : input.rootKind;
    const candidate = TrustedDevelopmentTargetCandidateSchema.parse({
      rootKey: input.rootKey,
      rootKind: input.rootKind,
      canonicalRoot: input.canonicalRoot,
      target: {
        displayName: input.displayName,
        displayPath: input.displayPath,
        sourceKind,
        manifest: {
          pluginId: input.pluginId,
          packageName: input.packageName,
          version: input.version,
          hasServer: input.hasServer,
          hasApp: input.hasApp,
        },
        native: { status: "absent", observedAt },
        capabilities: { fixture: false, harness: false, live: false },
      },
    });
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

export function createInspectionDevelopmentTargetCandidateBridge(options: {
  readonly readIssuedSourceCandidate: (
    candidate: unknown,
  ) => unknown | Promise<unknown>;
  readonly clock?: () => number;
}): InspectionDevelopmentTargetCandidateBridge {
  if (typeof options.readIssuedSourceCandidate !== "function") {
    throw new TypeError("Inspection candidate reader must be a function");
  }
  const clock = options.clock ?? Date.now;
  return Object.freeze({
    async issue(candidate: unknown) {
      try {
        const facts = InspectionSourceCandidateFactsSchema.parse(
          await options.readIssuedSourceCandidate(candidate),
        );
        const observedAt = clock();
        if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
          throw new RuntimeError("invalid_request");
        }
        return await issueTrustedDevelopmentTargetCandidate(facts, observedAt);
      } catch (error) {
        if (error instanceof RuntimeError) throw error;
        throw new RuntimeError("invalid_request", { cause: error });
      }
    },
  });
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
