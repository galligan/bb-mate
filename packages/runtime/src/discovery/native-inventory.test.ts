import { describe, expect, test } from "bun:test";

import { RuntimeError } from "../errors.ts";
import { OpaqueIdSchema } from "../contracts/ids.ts";
import {
  createInspectionNativeInventoryBridge,
  readPrivateHostObservation,
  type NativeInventoryTransitionFacts,
} from "./native-inventory.ts";

const RUNTIME_INSTANCE_ID = OpaqueIdSchema.parse("r".repeat(32));

function facts(): NativeInventoryTransitionFacts {
  return {
    schemaVersion: 1,
    observedAt: 1_000,
    runtimeInstanceId: RUNTIME_INSTANCE_ID,
    hostname: "devbox.local",
    topLevelStatus: "ok",
    entries: [],
    malformedRows: [],
  };
}

function createInspectionHarness() {
  const issued = new WeakMap<object, NativeInventoryTransitionFacts>();
  const consumed = new WeakSet<object>();
  const active = new WeakMap<object, NativeInventoryTransitionFacts>();
  const bridge = createInspectionNativeInventoryBridge({
    async consumeIssuedNativeInventory(candidate, consumer) {
      if (typeof candidate !== "object" || candidate === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = issued.get(candidate);
      if (!value || consumed.has(candidate)) {
        throw new RuntimeError("invalid_request");
      }
      consumed.add(candidate);
      const transition = Object.freeze({ transition: true });
      active.set(transition, value);
      try {
        return await consumer(transition);
      } finally {
        active.delete(transition);
      }
    },
    readNativeInventoryTransition(transition) {
      if (typeof transition !== "object" || transition === null) {
        throw new RuntimeError("invalid_request");
      }
      const value = active.get(transition);
      if (!value) throw new RuntimeError("invalid_request");
      return value;
    },
  });

  return {
    bridge,
    issue(value: NativeInventoryTransitionFacts) {
      const candidate = Object.freeze({ inventory: true });
      issued.set(candidate, Object.freeze(value));
      return candidate;
    },
  };
}

describe("trusted native inventory", () => {
  test("issues a capability only through an active one-use inspection transition", async () => {
    const harness = createInspectionHarness();
    const observation = harness.issue(facts());

    const capability = await harness.bridge.issue(observation);

    expect(Object.isFrozen(capability)).toBe(true);
    expect(() => JSON.stringify(capability)).toThrow(
      "native inventory capabilities are server-private",
    );
    await expect(harness.bridge.issue(observation)).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(harness.bridge.issue(facts())).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  test("retains only bounded private host evidence on the exact capability", async () => {
    const harness = createInspectionHarness();
    const observation = harness.issue(facts());

    const capability = await harness.bridge.issue(observation);

    expect(readPrivateHostObservation(capability)).toEqual({
      runtimeInstanceId: RUNTIME_INSTANCE_ID,
      hostname: "devbox.local",
      observedAt: 1_000,
    });
    for (const clone of [
      { ...capability },
      Object.create(capability) as unknown,
      Object.fromEntries(Object.entries(capability)),
    ]) {
      expect(() => readPrivateHostObservation(clone)).toThrow(
        "Invalid native inventory capability",
      );
    }
  });

  test("strictly admits only the normalized bounded inventory allowlist", async () => {
    const harness = createInspectionHarness();
    const normalizedEntry = {
      id: "notes",
      sourceKind: "path" as const,
      canonicalRoot: "/workspace/plugins/notes",
      version: "1.2.3",
      provenance: "direct" as const,
      isOrphanedBuiltin: false,
      enabled: true,
      status: "running" as const,
    };
    const valid = harness.issue({
      ...facts(),
      entries: [normalizedEntry],
    });

    await expect(harness.bridge.issue(valid)).resolves.toBeObject();

    for (const invalid of [
      { ...facts(), command: "bb plugin list --json" },
      {
        ...facts(),
        entries: [
          {
            id: "notes",
            sourceKind: "npm",
            canonicalRoot: "/managed/root",
            version: "1.2.3",
            provenance: "catalog",
            isOrphanedBuiltin: false,
            enabled: true,
            status: "running",
          },
        ],
      },
      {
        ...facts(),
        entries: [
          {
            id: "notes",
            sourceKind: "npm",
            canonicalRoot: null,
            version: "é".repeat(128),
            provenance: "direct",
            isOrphanedBuiltin: false,
            enabled: true,
            status: "running",
          },
        ],
      },
      {
        ...facts(),
        malformedRows: [
          {
            index: 0,
            id: "notes",
            canonicalRoot: "/workspace/plugins/notes",
            issues: ["source"],
          },
        ],
      },
      {
        ...facts(),
        entries: Array.from({ length: 129 }, () => normalizedEntry),
        malformedRows: Array.from({ length: 128 }, (_, index) => ({
          index,
          id: null,
          canonicalRoot: null,
          issues: ["row" as const],
        })),
      },
    ]) {
      await expect(
        harness.bridge.issue(
          harness.issue(invalid as NativeInventoryTransitionFacts),
        ),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
  });

  test("withholds a pending capability when inspection transition completion fails", async () => {
    let captured: unknown;
    const transition = Object.freeze({ transition: true });
    const bridge = createInspectionNativeInventoryBridge({
      async consumeIssuedNativeInventory(_observation, consumer) {
        captured = await consumer(transition);
        throw new Error("post-attestation failed");
      },
      readNativeInventoryTransition(candidate) {
        if (candidate !== transition) throw new Error("inactive");
        return facts();
      },
    });

    await expect(bridge.issue(Object.freeze({}))).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(() => readPrivateHostObservation(captured)).toThrow(
      "Invalid native inventory capability",
    );
  });
});
