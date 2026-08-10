import { RuntimeError } from "../errors.ts";
import {
  AuthenticatedPrincipalSchema,
  type AuthenticatedPrincipal,
} from "./principals.ts";

const requestContextBrand: unique symbol = Symbol("bb-mate.request-context");
const issuedRequestContexts = new WeakSet<object>();

export interface RequestContext {
  readonly principal: AuthenticatedPrincipal;
  readonly [requestContextBrand]: true;
}

export function createRequestContext(input: unknown): RequestContext {
  let principal: AuthenticatedPrincipal;
  try {
    const parsed = AuthenticatedPrincipalSchema.parse(input);
    principal = Object.freeze({
      ...parsed,
      scopes: Object.freeze([...parsed.scopes]),
    });
  } catch (error) {
    throw new RuntimeError("unauthenticated", { cause: error });
  }

  const context = Object.freeze({ principal }) as RequestContext;
  issuedRequestContexts.add(context);
  return context;
}

export function isRequestContext(value: unknown): value is RequestContext {
  return (
    typeof value === "object" &&
    value !== null &&
    issuedRequestContexts.has(value)
  );
}
