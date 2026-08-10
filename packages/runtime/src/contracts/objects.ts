import { z } from "zod";

import { RuntimeError } from "../errors.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  SessionIdSchema,
  TargetIdSchema,
  type BbContextId,
  type ObjectId,
  type PrincipalId,
  type SessionId,
  type TargetId,
} from "./ids.ts";

export const ObjectKindSchema = z.enum([
  "development-target",
  "session",
  "surface",
  "annotation",
  "capture",
  "comparison",
  "plugin-brief",
  "review",
]);

export type ObjectKind = z.infer<typeof ObjectKindSchema>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key] as JsonValue)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJson(JsonValueSchema.parse(value)));
}

export interface ObjectBindings {
  principalId: PrincipalId;
  bbContextId: BbContextId;
  targetId: TargetId;
  sessionId?: SessionId;
}

export const ObjectBindingsSchema: z.ZodType<ObjectBindings> = z.strictObject({
  principalId: PrincipalIdSchema,
  bbContextId: BbContextIdSchema,
  targetId: TargetIdSchema,
  sessionId: SessionIdSchema.optional(),
});

export interface ObjectEnvelope<
  K extends ObjectKind = ObjectKind,
  P extends JsonValue = JsonValue,
> {
  schemaVersion: 1;
  id: ObjectId;
  kind: K;
  bindings: ObjectBindings;
  revision: number;
  createdAt: number;
  updatedAt: number;
  payload: P;
}

const EnvelopeSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: ObjectIdSchema,
    kind: ObjectKindSchema,
    bindings: ObjectBindingsSchema,
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    payload: z.unknown(),
  })
  .refine((value) => value.updatedAt >= value.createdAt, {
    message: "updatedAt must not precede createdAt",
    path: ["updatedAt"],
  });

export interface ObjectCodec<K extends ObjectKind = ObjectKind> {
  readonly kind: K;
  parse(payload: unknown): JsonValue;
}

export function defineObjectCodec<
  K extends ObjectKind,
  Shape extends z.ZodRawShape,
>(kind: K, shape: Shape): ObjectCodec<K> {
  const schema = z.strictObject(shape);

  return {
    kind,
    parse(payload) {
      return JsonValueSchema.parse(schema.parse(payload));
    },
  };
}

export class ObjectCodecRegistry {
  readonly #codecs: ReadonlyMap<ObjectKind, ObjectCodec>;

  constructor(codecs: readonly ObjectCodec[]) {
    const registered = new Map<ObjectKind, ObjectCodec>();
    for (const codec of codecs) {
      if (registered.has(codec.kind)) {
        throw new TypeError(`Duplicate object codec: ${codec.kind}`);
      }
      registered.set(codec.kind, codec);
    }
    this.#codecs = registered;
  }

  parse(input: unknown): ObjectEnvelope {
    try {
      const envelope = EnvelopeSchema.parse(input);
      const codec = this.#codecs.get(envelope.kind);
      if (!codec) {
        throw new RuntimeError("unsupported_schema");
      }

      return {
        ...envelope,
        payload: codec.parse(envelope.payload),
      };
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw error;
      }
      throw new RuntimeError("invalid_request", { cause: error });
    }
  }

  serialize(input: unknown): string {
    return canonicalJson(this.parse(input));
  }

  deserialize(serialized: string): ObjectEnvelope {
    try {
      return this.parse(JSON.parse(serialized));
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw error;
      }
      throw new RuntimeError("invalid_request", { cause: error });
    }
  }
}
