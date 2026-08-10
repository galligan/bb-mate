import { z } from "zod";

import { OpaqueIdSchema, type OpaqueId } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import {
  DevelopmentTargetPayloadSchema,
  type DevelopmentTargetPayload,
} from "./development-target.ts";
import { isCanonicalSourcePathFormat } from "./source-path-policy.ts";
import {
  inspectDevelopmentSourceIdentity,
  sameDevelopmentSourceIdentity,
  type DevelopmentSourceIdentity,
} from "./source-identity.ts";

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
const issuedCandidates = new WeakMap<object, DevelopmentSourceIdentity>();

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

const SourceCandidateTransitionFactsSchema =
  InspectionSourceCandidateFactsSchema.extend({
    directoryIdentity: z.strictObject({
      canonicalRoot: z.string(),
      device: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      inode: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
    manifestIdentity: z.strictObject({
      device: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      inode: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      sha256: z.string().regex(/^[0-9a-f]{64}$/u),
    }),
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

async function issueTrustedDevelopmentTargetCandidate(
  input: z.infer<typeof SourceCandidateTransitionFactsSchema>,
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

    const identity = await inspectDevelopmentSourceIdentity(
      candidate.canonicalRoot,
    );
    const expectedIdentity: DevelopmentSourceIdentity = {
      ...input.directoryIdentity,
      manifest: input.manifestIdentity,
    };
    if (
      input.directoryIdentity.canonicalRoot !== input.canonicalRoot ||
      !sameDevelopmentSourceIdentity(identity, expectedIdentity)
    ) {
      throw new RuntimeError("invalid_request");
    }
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
  readonly consumeIssuedSourceCandidate: (
    candidate: unknown,
    consumer: (transition: unknown) => unknown | Promise<unknown>,
  ) => unknown | Promise<unknown>;
  readonly readSourceCandidateTransition: (transition: unknown) => unknown;
  readonly clock?: () => number;
}): InspectionDevelopmentTargetCandidateBridge {
  if (
    typeof options.consumeIssuedSourceCandidate !== "function" ||
    typeof options.readSourceCandidateTransition !== "function"
  ) {
    throw new TypeError("Inspection transition functions must be provided");
  }
  const clock = options.clock ?? Date.now;
  return Object.freeze({
    async issue(candidate: unknown) {
      try {
        let consumed = false;
        const issued = await options.consumeIssuedSourceCandidate(
          candidate,
          async (transition) => {
            if (consumed) throw new RuntimeError("invalid_request");
            consumed = true;
            const facts = SourceCandidateTransitionFactsSchema.parse(
              options.readSourceCandidateTransition(transition),
            );
            const observedAt = clock();
            if (!Number.isSafeInteger(observedAt) || observedAt < 0) {
              throw new RuntimeError("invalid_request");
            }
            return await issueTrustedDevelopmentTargetCandidate(
              facts,
              observedAt,
            );
          },
        );
        if (
          !consumed ||
          typeof issued !== "object" ||
          issued === null ||
          !issuedCandidates.has(issued)
        ) {
          throw new RuntimeError("invalid_request");
        }
        return issued as TrustedDevelopmentTargetCandidate;
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
    const actualIdentity = await inspectDevelopmentSourceIdentity(
      candidate.canonicalRoot,
    );
    if (!sameDevelopmentSourceIdentity(actualIdentity, expectedIdentity)) {
      throw new RuntimeError("invalid_request");
    }
    return candidate;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError("invalid_request", { cause: error });
  }
}
