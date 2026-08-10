import type { ObjectBindings } from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import { isRequestContext, type RequestContext } from "./context.ts";
import type { Scope } from "./principals.ts";

export interface AuthorizationRequirement {
  readonly scope: Scope;
  readonly resource?: ObjectBindings;
}

export function authorize(
  context: RequestContext | undefined,
  requirement: AuthorizationRequirement,
): RequestContext {
  if (!isRequestContext(context) || context.principal.revoked) {
    throw new RuntimeError("unauthenticated");
  }

  const { principal } = context;
  if (!principal.scopes.includes(requirement.scope)) {
    throw new RuntimeError("forbidden");
  }

  const { resource } = requirement;
  if (
    resource &&
    (resource.principalId !== principal.id ||
      resource.bbContextId !== principal.bbContextId ||
      principal.targetId === undefined ||
      resource.targetId !== principal.targetId ||
      resource.sessionId !== principal.sessionId)
  ) {
    throw new RuntimeError("not_found");
  }

  return context;
}
