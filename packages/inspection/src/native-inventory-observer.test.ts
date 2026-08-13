import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  NATIVE_INVENTORY_MAX_OUTPUT_BYTES,
  observeNativePluginInventoryForTest,
} from "./native-inventory.ts";
import {
  command,
  readObservation,
  runtimeInstanceId,
} from "./native-inventory-test-helpers.ts";

describe("native inventory observer", () => {
  test("normalizes the released bb 0.36 path row through one passive command", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-native-"),
    );
    const calls: string[][] = [];
    try {
      const observation = await observeNativePluginInventoryForTest({
        runtimeInstanceId,
        now: () => 1_000,
        hostname: () => "studio.local",
        runBb: async (args) => {
          calls.push([...args]);
          return command(
            JSON.stringify({
              plugins: [
                {
                  id: "notes",
                  source: `path:${root}`,
                  rootDir: root,
                  version: "1.2.3",
                  provenance: "direct",
                  isOrphanedBuiltin: false,
                  enabled: true,
                  status: "running",
                  sourceDisplay: root,
                  capabilities: [],
                  services: [],
                  app: { status: "ready" },
                },
              ],
            }),
          );
        },
      });

      expect(calls).toEqual([["plugin", "list", "--json"]]);
      expect(await readObservation(observation)).toEqual({
        schemaVersion: 1,
        observedAt: 1_000,
        runtimeInstanceId,
        hostname: "studio.local",
        topLevelStatus: "ok",
        entries: [
          {
            id: "notes",
            sourceKind: "path",
            canonicalRoot: await fs.realpath(root),
            version: "1.2.3",
            provenance: "direct",
            isOrphanedBuiltin: false,
            enabled: true,
            status: "running",
          },
        ],
        malformedRows: [],
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("rejects oversized UTF-8 before parsing even with an injected runner", async () => {
    const observation = await observeNativePluginInventoryForTest({
      runtimeInstanceId,
      now: () => 3_000,
      hostname: () => "studio.local",
      runBb: async () =>
        command(`${" ".repeat(NATIVE_INVENTORY_MAX_OUTPUT_BYTES)}{}`),
    });

    expect(await readObservation(observation)).toMatchObject({
      topLevelStatus: "output-limit",
      entries: [],
      malformedRows: [],
    });
  });

  test("rejects topology-shaped host metadata before invoking bb", async () => {
    let called = false;
    await expect(
      observeNativePluginInventoryForTest({
        runtimeInstanceId,
        now: () => 5_000,
        hostname: () => "https://studio.local:4100/token@secret",
        runBb: async () => {
          called = true;
          return command(JSON.stringify({ plugins: [] }));
        },
      }),
    ).rejects.toThrow("Invalid native inventory hostname");
    expect(called).toBe(false);
  });

  test.each([
    ["command-error", { stdout: "secret", stderr: "private", exitCode: 1 }],
    ["malformed", command("not json")],
    ["malformed", command(JSON.stringify({ plugin: [] }))],
    [
      "entry-limit",
      command(
        JSON.stringify({
          plugins: Array.from({ length: 257 }, (_, index) => ({
            id: `row-${index}`,
          })),
        }),
      ),
    ],
  ] as const)("returns typed %s top-level evidence", async (status, result) => {
    const observation = await observeNativePluginInventoryForTest({
      runtimeInstanceId,
      now: () => 9_000,
      hostname: () => "studio.local",
      runBb: async () => result,
    });

    const facts = await readObservation(observation);
    expect(facts).toMatchObject({
      topLevelStatus: status,
      entries: [],
      malformedRows: [],
    });
    expect(JSON.stringify(facts)).not.toContain("secret");
    expect(JSON.stringify(facts)).not.toContain("private");
  });
});
