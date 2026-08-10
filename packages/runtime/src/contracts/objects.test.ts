import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
  ObjectCodecRegistry,
  ObjectKindSchema,
  canonicalJson,
  defineObjectCodec,
} from "./objects.ts";
import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  SessionIdSchema,
  TargetIdSchema,
} from "./ids.ts";
import { RuntimeError } from "../errors.ts";

describe("object contracts", () => {
  test("reserves the complete Workbench object vocabulary", () => {
    expect(ObjectKindSchema.options).toEqual([
      "development-target",
      "session",
      "surface",
      "annotation",
      "capture",
      "comparison",
      "plugin-brief",
      "review",
    ]);
    expect(() => ObjectKindSchema.parse("artifact")).toThrow();
  });

  test("parses a schema-v1 envelope through its registered strict codec", () => {
    const registry = new ObjectCodecRegistry([
      defineObjectCodec("session", { title: z.string() }),
    ]);
    const id = ObjectIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const principalId = PrincipalIdSchema.parse(id);
    const bbContextId = BbContextIdSchema.parse(id);
    const targetId = TargetIdSchema.parse(id);
    const sessionId = SessionIdSchema.parse(id);

    expect(
      registry.parse({
        schemaVersion: 1,
        id,
        kind: "session",
        bindings: {
          principalId,
          bbContextId,
          targetId,
          sessionId,
        },
        revision: 1,
        createdAt: 1_723_300_000_000,
        updatedAt: 1_723_300_000_000,
        payload: { title: "Workbench pass" },
      }),
    ).toEqual({
      schemaVersion: 1,
      id,
      kind: "session",
      bindings: {
        principalId,
        bbContextId,
        targetId,
        sessionId,
      },
      revision: 1,
      createdAt: 1_723_300_000_000,
      updatedAt: 1_723_300_000_000,
      payload: { title: "Workbench pass" },
    });
  });

  test("serializes JSON with recursively sorted object keys", () => {
    expect(
      canonicalJson({
        z: [{ second: true, first: null }],
        a: { beta: 2, alpha: 1 },
      }),
    ).toBe('{"a":{"alpha":1,"beta":2},"z":[{"first":null,"second":true}]}');
  });

  test("round-trips an envelope only through its registered codec", () => {
    const registry = new ObjectCodecRegistry([
      defineObjectCodec("surface", { name: z.string(), state: z.string() }),
    ]);
    const id = ObjectIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const principalId = PrincipalIdSchema.parse(id);
    const bbContextId = BbContextIdSchema.parse(id);
    const targetId = TargetIdSchema.parse(id);
    const serialized = registry.serialize({
      updatedAt: 7,
      schemaVersion: 1,
      revision: 2,
      payload: { state: "empty", name: "Sidebar" },
      kind: "surface",
      id,
      createdAt: 3,
      bindings: { targetId, principalId, bbContextId },
    });

    expect(serialized).toBe(
      '{"bindings":{"bbContextId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","principalId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","targetId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"createdAt":3,"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","kind":"surface","payload":{"name":"Sidebar","state":"empty"},"revision":2,"schemaVersion":1,"updatedAt":7}',
    );
    expect(registry.deserialize(serialized)).toEqual(
      registry.parse(JSON.parse(serialized)),
    );
  });

  test("rejects envelope, binding, payload, revision, and timestamp drift", () => {
    const registry = new ObjectCodecRegistry([
      defineObjectCodec("review", { verdict: z.string() }),
    ]);
    const id = "ffffffffffffffffffffffffffffffff";
    const valid = {
      schemaVersion: 1,
      id,
      kind: "review",
      bindings: { principalId: id, bbContextId: id, targetId: id },
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
      payload: { verdict: "ready" },
    };

    for (const invalid of [
      { ...valid, extra: true },
      { ...valid, bindings: { ...valid.bindings, extra: true } },
      { ...valid, payload: { ...valid.payload, extra: true } },
      { ...valid, revision: 0 },
      { ...valid, createdAt: 10.5 },
      { ...valid, updatedAt: 9 },
    ]) {
      expect(() => registry.parse(invalid)).toThrow(
        new RuntimeError("invalid_request"),
      );
    }
  });

  test("rejects payloads beyond the global text, collection, and byte bounds", () => {
    const registry = new ObjectCodecRegistry([
      defineObjectCodec("annotation", {
        body: z.string(),
        items: z.array(z.string()),
        metadata: z.record(z.string(), z.string()),
      }),
    ]);
    const id = "ffffffffffffffffffffffffffffffff";
    const valid = {
      schemaVersion: 1,
      id,
      kind: "annotation",
      bindings: { principalId: id, bbContextId: id, targetId: id },
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
      payload: { body: "ok", items: ["ok"], metadata: { ok: "ok" } },
    };

    for (const payload of [
      { ...valid.payload, body: "x".repeat(8_193) },
      { ...valid.payload, items: Array.from({ length: 101 }, () => "x") },
      {
        ...valid.payload,
        metadata: Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [`key-${index}`, "x"]),
        ),
      },
      {
        ...valid.payload,
        items: Array.from({ length: 100 }, () => "x".repeat(8_192)),
      },
    ]) {
      expect(() => registry.parse({ ...valid, payload })).toThrow(
        new RuntimeError("invalid_request"),
      );
    }
  });

  test("admits only envelopes that fit the same canonical serialization bound", () => {
    const registry = new ObjectCodecRegistry([
      defineObjectCodec("annotation", {
        body: z.string(),
        items: z.array(z.string()),
        metadata: z.record(z.string(), z.string()),
      }),
    ]);
    const id = "ffffffffffffffffffffffffffffffff";
    const metadata = Object.fromEntries(
      Array.from({ length: 31 }, (_, index) => [
        `key-${index}`,
        "x".repeat(8_192),
      ]),
    );
    const payloadWithoutBody = { body: "", items: ["ok"], metadata };
    const maximumBytes = 256 * 1024;
    const remainingPayloadBytes =
      maximumBytes - Buffer.byteLength(JSON.stringify(payloadWithoutBody)) - 1;
    expect(remainingPayloadBytes).toBeGreaterThan(0);
    expect(remainingPayloadBytes).toBeLessThanOrEqual(8_192);
    const payload = {
      ...payloadWithoutBody,
      body: "x".repeat(remainingPayloadBytes),
    };
    const envelope = {
      schemaVersion: 1,
      id,
      kind: "annotation",
      bindings: { principalId: id, bbContextId: id, targetId: id },
      revision: 1,
      createdAt: 10,
      updatedAt: 10,
      payload,
    };

    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(
      maximumBytes,
    );
    expect(Buffer.byteLength(JSON.stringify(envelope))).toBeGreaterThan(
      maximumBytes,
    );
    expect(() => registry.parse(envelope)).toThrow(
      new RuntimeError("invalid_request"),
    );
  });
});
