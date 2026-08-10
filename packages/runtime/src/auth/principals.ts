import { z } from "zod";

import {
  BbContextIdSchema,
  PrincipalIdSchema,
  SessionIdSchema,
  TargetIdSchema,
  type BbContextId,
  type PrincipalId,
  type SessionId,
  type TargetId,
} from "../contracts/ids.ts";

export const PrincipalKindSchema = z.enum([
  "supervisor",
  "browser-session",
  "plugin-adapter",
  "mcp-client",
]);

export type PrincipalKind = z.infer<typeof PrincipalKindSchema>;

export const ScopeSchema = z.enum([
  "runtime:read",
  "credential:issue",
  "targets:read",
  "sessions:read",
  "sessions:write",
  "surfaces:read",
  "annotations:read",
  "annotations:write",
  "captures:read",
  "captures:write",
  "comparisons:read",
  "comparisons:write",
  "plugin-briefs:read",
  "plugin-briefs:write",
  "reviews:read",
  "reviews:write",
  "events:read",
]);

export type Scope = z.infer<typeof ScopeSchema>;

export interface AuthenticatedPrincipal {
  readonly id: PrincipalId;
  readonly kind: PrincipalKind;
  readonly scopes: readonly Scope[];
  readonly revoked: boolean;
  readonly bbContextId: BbContextId;
  readonly targetId?: TargetId;
  readonly sessionId?: SessionId;
}

export const AuthenticatedPrincipalSchema: z.ZodType<AuthenticatedPrincipal> = z
  .strictObject({
    id: PrincipalIdSchema,
    kind: PrincipalKindSchema,
    scopes: z.array(ScopeSchema),
    revoked: z.boolean(),
    bbContextId: BbContextIdSchema,
    targetId: TargetIdSchema.optional(),
    sessionId: SessionIdSchema.optional(),
  })
  .refine(
    (principal) =>
      principal.sessionId === undefined || principal.targetId !== undefined,
    {
      message: "A session-bound credential must also be target-bound",
      path: ["sessionId"],
    },
  );
