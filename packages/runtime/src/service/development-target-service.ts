import { authorize } from "../auth/authorize.ts";
import type { RequestContext } from "../auth/context.ts";
import { ObjectIdSchema, type ObjectId } from "../contracts/ids.ts";
import type { Scope } from "../auth/principals.ts";
import type { DevelopmentTargetCatalog } from "../discovery/catalog.ts";
import { projectDevelopmentTarget } from "../discovery/development-target.ts";
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

export function createDevelopmentTargetService(
  catalog: DevelopmentTargetCatalog,
) {
  return {
    async refreshFromTrustedCandidate(
      context: RequestContext,
      input: TrustedDevelopmentTargetCandidate,
      options: { readonly expectedRevision?: number } = {},
    ) {
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
