import { z } from "zod";

import { authorize } from "../auth/authorize.ts";
import type { RequestContext } from "../auth/context.ts";
import type { Scope } from "../auth/principals.ts";
import { ObjectIdSchema } from "../contracts/ids.ts";
import {
  ObjectKindSchema,
  type ObjectBindings,
  type ObjectKind,
} from "../contracts/objects.ts";
import { RuntimeError } from "../errors.ts";
import type { RuntimeStore } from "../persistence/store.ts";

const GenericObjectKindSchema = ObjectKindSchema.exclude([
  "development-target",
]);
type GenericObjectKind = Exclude<ObjectKind, "development-target">;

const CreateObjectInputSchema = z.strictObject({
  kind: GenericObjectKindSchema,
  payload: z.unknown(),
});

const GetObjectInputSchema = z.strictObject({
  id: ObjectIdSchema,
  kind: GenericObjectKindSchema,
});

const UpdateObjectInputSchema = z.strictObject({
  id: ObjectIdSchema,
  kind: GenericObjectKindSchema,
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  payload: z.unknown(),
});

const PullEventsInputSchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const READ_SCOPE = {
  session: "sessions:read",
  surface: "surfaces:read",
  annotation: "annotations:read",
  capture: "captures:read",
  comparison: "comparisons:read",
  "plugin-brief": "plugin-briefs:read",
  review: "reviews:read",
} as const satisfies Record<GenericObjectKind, Scope>;

const WRITE_SCOPE = {
  session: "sessions:write",
  surface: "surfaces:write",
  annotation: "annotations:write",
  capture: "captures:write",
  comparison: "comparisons:write",
  "plugin-brief": "plugin-briefs:write",
  review: "reviews:write",
} as const satisfies Record<GenericObjectKind, Scope>;

function parseDto<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    throw new RuntimeError("invalid_request", { cause: error });
  }
}

function bindingsFor(context: RequestContext, scope: Scope): ObjectBindings {
  const authorized = authorize(context, { scope });
  const { principal } = authorized;
  if (principal.targetId === undefined) {
    throw new RuntimeError("forbidden");
  }
  return {
    principalId: principal.id,
    bbContextId: principal.bbContextId,
    targetId: principal.targetId,
    ...(principal.sessionId === undefined
      ? {}
      : { sessionId: principal.sessionId }),
  };
}

export function createWorkbenchService(store: RuntimeStore) {
  return {
    createObject(context: RequestContext, input: unknown) {
      const parsed = parseDto(CreateObjectInputSchema, input);
      const scope = WRITE_SCOPE[parsed.kind];
      return store.createObject({
        kind: parsed.kind,
        bindings: bindingsFor(context, scope),
        payload: parsed.payload,
      });
    },
    getObject(context: RequestContext, input: unknown) {
      const parsed = parseDto(GetObjectInputSchema, input);
      const bindings = bindingsFor(context, READ_SCOPE[parsed.kind]);
      const envelope = store.getObject({ id: parsed.id, bindings });
      if (!envelope || envelope.kind !== parsed.kind) {
        throw new RuntimeError("not_found");
      }
      return envelope;
    },
    updateObject(context: RequestContext, input: unknown) {
      const parsed = parseDto(UpdateObjectInputSchema, input);
      const bindings = bindingsFor(context, WRITE_SCOPE[parsed.kind]);
      const envelope = store.getObject({ id: parsed.id, bindings });
      if (!envelope || envelope.kind !== parsed.kind) {
        throw new RuntimeError("not_found");
      }
      return store.updateObject({
        id: parsed.id,
        bindings,
        expectedRevision: parsed.expectedRevision,
        payload: parsed.payload,
      });
    },
    pullEvents(context: RequestContext, input: unknown) {
      const parsed = parseDto(PullEventsInputSchema, input);
      return store.pullEvents({
        bindings: bindingsFor(context, "events:read"),
        ...parsed,
      });
    },
  };
}
