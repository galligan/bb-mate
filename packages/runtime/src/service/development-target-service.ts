import { authorize } from "../auth/authorize.ts";
import type { RequestContext } from "../auth/context.ts";
import { ObjectIdSchema, type ObjectId } from "../contracts/ids.ts";
import type { Scope } from "../auth/principals.ts";
import type { DevelopmentTargetCatalog } from "../discovery/catalog.ts";
import { projectDevelopmentTarget } from "../discovery/development-target.ts";
import type { TrustedNativeInventory } from "../discovery/native-inventory.ts";
import { type TrustedDevelopmentTargetCandidate } from "../discovery/trusted-candidate.ts";
import { RuntimeError } from "../errors.ts";

function authorizeUnboundTargetContext(
  context: RequestContext,
  scope: Extract<Scope, "targets:read" | "targets:write">,
) {
  const authorized = authorize(context, { scope });
  if (
    authorized.principal.targetId !== undefined ||
    authorized.principal.sessionId !== undefined
  ) {
    throw new RuntimeError("forbidden");
  }
  return authorized.principal;
}

const RECONCILIATION_INPUT_KEYS = [
  "expectedRevision",
  "inventory",
  "sourceCandidate",
  "targetId",
] as const;

function assertExactReconciliationInput(
  input: unknown,
): asserts input is object {
  if (typeof input !== "object" || input === null) {
    throw new RuntimeError("invalid_request");
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== RECONCILIATION_INPUT_KEYS.length ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !RECONCILIATION_INPUT_KEYS.includes(
          key as (typeof RECONCILIATION_INPUT_KEYS)[number],
        ),
    )
  ) {
    throw new RuntimeError("invalid_request");
  }
}

export function createDevelopmentTargetService(
  catalog: DevelopmentTargetCatalog,
) {
  return {
    async refreshFromCompleteSnapshot(
      context: RequestContext,
      candidates: readonly TrustedDevelopmentTargetCandidate[],
      options: {
        readonly currentSourceRoots?: readonly string[];
        readonly authoritativeSourceRoots?: readonly string[];
        readonly uncertainSourceRoots?: readonly string[];
        readonly signal?: AbortSignal;
      } = {},
    ) {
      options.signal?.throwIfAborted();
      const principal = authorizeUnboundTargetContext(context, "targets:write");
      return (
        await catalog.refreshCompleteSnapshot({
          principalId: principal.id,
          bbContextId: principal.bbContextId,
          candidates,
          ...(options.currentSourceRoots === undefined
            ? {}
            : { currentSourceRoots: options.currentSourceRoots }),
          ...(options.authoritativeSourceRoots === undefined
            ? {}
            : {
                authoritativeSourceRoots: options.authoritativeSourceRoots,
              }),
          ...(options.uncertainSourceRoots === undefined
            ? {}
            : { uncertainSourceRoots: options.uncertainSourceRoots }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        })
      ).map(projectDevelopmentTarget);
    },
    async refreshFromTrustedCandidate(
      context: RequestContext,
      input: TrustedDevelopmentTargetCandidate,
      options: {
        readonly expectedRevision?: number;
        readonly signal?: AbortSignal;
      } = {},
    ) {
      options.signal?.throwIfAborted();
      const principal = authorizeUnboundTargetContext(context, "targets:write");
      if (
        options.expectedRevision !== undefined &&
        (!Number.isSafeInteger(options.expectedRevision) ||
          options.expectedRevision < 1)
      ) {
        throw new RuntimeError("invalid_request");
      }
      return projectDevelopmentTarget(
        await catalog.refresh({
          principalId: principal.id,
          bbContextId: principal.bbContextId,
          candidate: input,
          ...(options.expectedRevision === undefined
            ? {}
            : { expectedRevision: options.expectedRevision }),
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        }),
      );
    },
    async reconcileFromTrustedInventory(
      context: RequestContext,
      input: {
        readonly targetId: unknown;
        readonly sourceCandidate: TrustedDevelopmentTargetCandidate;
        readonly inventory: TrustedNativeInventory;
        readonly expectedRevision: number;
      },
    ) {
      const principal = authorizeUnboundTargetContext(context, "targets:write");
      assertExactReconciliationInput(input);
      let targetId: ObjectId;
      try {
        targetId = ObjectIdSchema.parse(input.targetId);
      } catch (error) {
        throw new RuntimeError("invalid_request", { cause: error });
      }
      if (
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision < 1
      ) {
        throw new RuntimeError("invalid_request");
      }
      return projectDevelopmentTarget(
        await catalog.reconcileNative({
          principalId: principal.id,
          bbContextId: principal.bbContextId,
          id: targetId,
          candidate: input.sourceCandidate,
          inventory: input.inventory,
          expectedRevision: input.expectedRevision,
        }),
      );
    },
    listTargets(context: RequestContext) {
      const principal = authorizeUnboundTargetContext(context, "targets:read");
      return catalog
        .list({
          principalId: principal.id,
          bbContextId: principal.bbContextId,
        })
        .map(projectDevelopmentTarget);
    },
    getTarget(context: RequestContext, input: unknown) {
      const principal = authorizeUnboundTargetContext(context, "targets:read");
      let id: ObjectId;
      try {
        id = ObjectIdSchema.parse(input);
      } catch (error) {
        throw new RuntimeError("invalid_request", { cause: error });
      }
      const target = catalog.get({
        principalId: principal.id,
        bbContextId: principal.bbContextId,
        id,
      });
      if (!target) throw new RuntimeError("not_found");
      return projectDevelopmentTarget(target);
    },
  };
}
