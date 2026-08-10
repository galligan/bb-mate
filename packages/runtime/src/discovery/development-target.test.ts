import { describe, expect, test } from "bun:test";

import {
  BbContextIdSchema,
  ObjectIdSchema,
  PrincipalIdSchema,
  TargetIdSchema,
} from "../contracts/ids.ts";
import {
  parseDevelopmentTargetEnvelope,
  projectDevelopmentTarget,
} from "./development-target.ts";
import { RuntimeError } from "../errors.ts";

const id = "t".repeat(32);

function envelope() {
  return {
    schemaVersion: 1,
    id: ObjectIdSchema.parse(id),
    kind: "development-target",
    bindings: {
      principalId: PrincipalIdSchema.parse("p".repeat(32)),
      bbContextId: BbContextIdSchema.parse("b".repeat(32)),
      targetId: TargetIdSchema.parse(id),
    },
    revision: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    payload: {
      displayName: "Notes",
      displayPath: "plugins/notes",
      sourceKind: "workspace-discovered",
      manifest: {
        pluginId: "notes",
        packageName: "bb-plugin-notes",
        version: "1.2.3",
        hasServer: true,
        hasApp: true,
      },
      native: {
        status: "absent",
        observedAt: 1_000,
      },
      capabilities: {
        fixture: true,
        harness: false,
        live: false,
      },
    },
  } as const;
}

describe("DevelopmentTarget contract", () => {
  test("parses a strict self-bound v1 envelope and projects only public fields", () => {
    const parsed = parseDevelopmentTargetEnvelope(envelope());

    expect(projectDevelopmentTarget(parsed)).toEqual({
      schemaVersion: 1,
      kind: "development-target",
      id: TargetIdSchema.parse(id),
      revision: 1,
      createdAt: 1_000,
      updatedAt: 1_000,
      ...envelope().payload,
    });
  });

  test("rejects unbound, oversized, and non-public payload fields", () => {
    expect(() =>
      parseDevelopmentTargetEnvelope({
        ...envelope(),
        bindings: {
          ...envelope().bindings,
          targetId: TargetIdSchema.parse("x".repeat(32)),
        },
      }),
    ).toThrow(new RuntimeError("invalid_request"));
    expect(() =>
      parseDevelopmentTargetEnvelope({
        ...envelope(),
        payload: { ...envelope().payload, displayName: "x".repeat(129) },
      }),
    ).toThrow(new RuntimeError("invalid_request"));
    expect(() =>
      parseDevelopmentTargetEnvelope({
        ...envelope(),
        payload: { ...envelope().payload, canonicalRoot: "/private/plugin" },
      }),
    ).toThrow(new RuntimeError("invalid_request"));
  });
});
