import { describe, expect, test } from "bun:test";

import {
  consumeIssuedNativeInventory,
  observeNativePluginInventoryForTest,
  readNativeInventoryTransition,
} from "./native-inventory.ts";
import { command, runtimeInstanceId } from "./native-inventory-test-helpers.ts";

describe("native inventory transition", () => {
  test("admits only the exact observation and active one-use transition", async () => {
    const observation = await observeNativePluginInventoryForTest({
      runtimeInstanceId,
      now: () => 6_000,
      hostname: () => "studio.local",
      runBb: async () => command(JSON.stringify({ plugins: [] })),
    });
    expect(Object.isFrozen(observation)).toBe(true);
    expect(() => JSON.stringify(observation)).toThrow(
      "native inventory observations are server-private",
    );
    let retainedTransition: unknown;

    await consumeIssuedNativeInventory(observation, (transition) => {
      retainedTransition = transition;
      const facts = readNativeInventoryTransition(transition);
      expect(facts.observedAt).toBe(6_000);
      expect(Object.isFrozen(facts)).toBe(true);
      expect(Object.isFrozen(facts.entries)).toBe(true);
      for (const forged of [
        { ...(transition as object) },
        Object.create(transition as object),
        {},
      ]) {
        expect(() => readNativeInventoryTransition(forged)).toThrow(
          "native inventory transition is not active",
        );
      }
    });

    expect(() => readNativeInventoryTransition(retainedTransition)).toThrow(
      "native inventory transition is not active",
    );
    for (const forged of [{ ...observation }, Object.create(observation), {}]) {
      await expect(
        consumeIssuedNativeInventory(forged, () => null),
      ).rejects.toThrow(
        "native inventory observation was not issued by inspection",
      );
    }
    await expect(
      consumeIssuedNativeInventory(observation, () => null),
    ).rejects.toThrow(
      "native inventory observation was not issued by inspection",
    );

    const failedObservation = await observeNativePluginInventoryForTest({
      runtimeInstanceId,
      now: () => 6_001,
      hostname: () => "studio.local",
      runBb: async () => command(JSON.stringify({ plugins: [] })),
    });
    let failedTransition: unknown;
    await expect(
      consumeIssuedNativeInventory(failedObservation, (transition) => {
        failedTransition = transition;
        throw new Error("consumer failed");
      }),
    ).rejects.toThrow("consumer failed");
    expect(() => readNativeInventoryTransition(failedTransition)).toThrow(
      "native inventory transition is not active",
    );
    await expect(
      consumeIssuedNativeInventory(failedObservation, () => null),
    ).rejects.toThrow(
      "native inventory observation was not issued by inspection",
    );
  });
});
