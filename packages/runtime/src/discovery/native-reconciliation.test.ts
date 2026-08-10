import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import {
  consumeIssuedNativeInventory,
  observeNativePluginInventoryForTest,
  readNativeInventoryTransition,
} from "../../../inspection/src/native-inventory.ts";
import {
  createInspectionNativeInventoryBridge,
  type NativeInventoryEntry,
  type NativeInventoryTransitionFacts,
  type TrustedNativeInventory,
} from "./native-inventory.ts";
import { reconcileNativeTarget } from "./native-reconciliation.ts";

const RUNTIME_INSTANCE_ID = OpaqueIdSchema.parse("r".repeat(32));
const TARGET_ROOT = "/workspace/plugins/notes";

function entry(
  overrides: Partial<NativeInventoryEntry> = {},
): NativeInventoryEntry {
  return {
    id: "notes",
    sourceKind: "path",
    canonicalRoot: TARGET_ROOT,
    version: "1.2.3",
    provenance: "direct",
    isOrphanedBuiltin: false,
    enabled: true,
    status: "running",
    ...overrides,
  };
}

async function inventory(
  overrides: Partial<NativeInventoryTransitionFacts> = {},
): Promise<TrustedNativeInventory> {
  const issued = Object.freeze({ inventory: true });
  const transition = Object.freeze({ transition: true });
  let consumed = false;
  let active = false;
  const facts: NativeInventoryTransitionFacts = {
    schemaVersion: 1,
    observedAt: 1_000,
    runtimeInstanceId: RUNTIME_INSTANCE_ID,
    hostname: "devbox.local",
    topLevelStatus: "ok",
    entries: [],
    malformedRows: [],
    ...overrides,
  };
  const bridge = createInspectionNativeInventoryBridge({
    async consumeIssuedNativeInventory(candidate, consumer) {
      if (candidate !== issued || consumed) {
        throw new RuntimeError("invalid_request");
      }
      consumed = true;
      active = true;
      try {
        return await consumer(transition);
      } finally {
        active = false;
      }
    },
    readNativeInventoryTransition(candidate) {
      if (candidate !== transition || !active) {
        throw new RuntimeError("invalid_request");
      }
      return facts;
    },
  });
  return bridge.issue(issued);
}

describe("native target reconciliation", () => {
  test("classifies the same plugin ID at the exact canonical direct path", async () => {
    const result = reconcileNativeTarget({
      inventory: await inventory({ entries: [entry()] }),
      targetPluginId: "notes",
      canonicalSourceRoot: TARGET_ROOT,
      now: 1_001,
    });

    expect(result).toEqual({
      status: "exact-path",
      pluginId: "notes",
      observedAt: 1_000,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test("classifies the same plugin ID at another direct path", async () => {
    const result = reconcileNativeTarget({
      inventory: await inventory({
        entries: [entry({ canonicalRoot: "/workspace/other/notes" })],
      }),
      targetPluginId: "notes",
      canonicalSourceRoot: TARGET_ROOT,
      now: 1_001,
    });

    expect(result).toEqual({
      status: "other-path",
      pluginId: "notes",
      observedAt: 1_000,
    });
  });

  test("classifies npm and Git installations with the same ID as managed", async () => {
    for (const sourceKind of ["npm", "git"] as const) {
      const result = reconcileNativeTarget({
        inventory: await inventory({
          entries: [
            entry({
              sourceKind,
              canonicalRoot: null,
              provenance: "direct",
            }),
          ],
        }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      });

      expect(result).toEqual({
        status: "managed",
        pluginId: "notes",
        observedAt: 1_000,
      });
    }
  });

  test("interoperates with the real inspection observer for released npm provenance", async () => {
    const calls: string[][] = [];
    const observation = await observeNativePluginInventoryForTest({
      runtimeInstanceId: RUNTIME_INSTANCE_ID,
      now: () => 1_000,
      hostname: () => "devbox.local",
      runBb: async (args) => {
        calls.push([...args]);
        return {
          stdout: JSON.stringify({
            plugins: [
              {
                id: "notes",
                source: "npm:bb-plugin-notes@1.2.3",
                rootDir: "/managed/plugins/notes",
                version: "1.2.3",
                provenance: "direct",
                isOrphanedBuiltin: false,
                enabled: true,
                status: "running",
              },
            ],
          }),
          stderr: "",
          exitCode: 0,
        };
      },
    });
    const bridge = createInspectionNativeInventoryBridge({
      consumeIssuedNativeInventory,
      readNativeInventoryTransition,
    });

    const result = reconcileNativeTarget({
      inventory: await bridge.issue(observation),
      targetPluginId: "notes",
      canonicalSourceRoot: TARGET_ROOT,
      now: 1_001,
    });

    expect(calls).toEqual([["plugin", "list", "--json"]]);
    expect(result).toEqual({
      status: "managed",
      pluginId: "notes",
      observedAt: 1_000,
    });
  });

  test("uses the real observer's safe malformed-root hint to protect a matching target", async () => {
    const root = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "bb-mate-native-runtime-"),
    );
    try {
      const observation = await observeNativePluginInventoryForTest({
        runtimeInstanceId: RUNTIME_INSTANCE_ID,
        now: () => 1_000,
        hostname: () => "devbox.local",
        runBb: async () => ({
          stdout: JSON.stringify({
            plugins: [
              {
                id: " ",
                source: `path:${root}`,
                rootDir: root,
                version: "1.2.3",
                provenance: "direct",
                isOrphanedBuiltin: false,
                enabled: true,
                status: "running",
              },
            ],
          }),
          stderr: "",
          exitCode: 0,
        }),
      });
      const bridge = createInspectionNativeInventoryBridge({
        consumeIssuedNativeInventory,
        readNativeInventoryTransition,
      });

      expect(
        reconcileNativeTarget({
          inventory: await bridge.issue(observation),
          targetPluginId: "notes",
          canonicalSourceRoot: await fs.realpath(root),
          now: 1_001,
        }),
      ).toEqual({ status: "malformed", observedAt: 1_000 });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("classifies builtin, bundled catalog, and orphaned builtin identities as conflicts", async () => {
    const conflicts: NativeInventoryEntry[] = [
      entry({
        sourceKind: "builtin",
        canonicalRoot: null,
        provenance: "builtin",
      }),
      entry({
        sourceKind: "catalog",
        canonicalRoot: null,
        provenance: "catalog",
      }),
      entry({
        sourceKind: "catalog",
        canonicalRoot: null,
        provenance: "catalog",
        isOrphanedBuiltin: true,
      }),
    ];

    for (const installed of conflicts) {
      expect(
        reconcileNativeTarget({
          inventory: await inventory({ entries: [installed] }),
          targetPluginId: "notes",
          canonicalSourceRoot: TARGET_ROOT,
          now: 1_001,
        }),
      ).toEqual({
        status: "builtin-conflict",
        pluginId: "notes",
        observedAt: 1_000,
      });
    }
  });

  test("reports absent when inventory has no matching ID or canonical root", async () => {
    const result = reconcileNativeTarget({
      inventory: await inventory({
        entries: [
          entry({
            id: "calendar",
            canonicalRoot: "/workspace/plugins/calendar",
          }),
        ],
      }),
      targetPluginId: "notes",
      canonicalSourceRoot: TARGET_ROOT,
      now: 1_001,
    });

    expect(result).toEqual({ status: "absent", observedAt: 1_000 });
  });

  test("keeps observations fresh through 30 seconds and marks only older snapshots stale", async () => {
    const trusted = await inventory({
      observedAt: 1_000,
      entries: [entry()],
    });

    expect(
      reconcileNativeTarget({
        inventory: trusted,
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 31_000,
      }),
    ).toMatchObject({ status: "exact-path" });
    expect(
      reconcileNativeTarget({
        inventory: trusted,
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 31_001,
      }),
    ).toEqual({ status: "stale", observedAt: 1_000 });
  });

  test("classifies a future observation timestamp as malformed", async () => {
    expect(
      reconcileNativeTarget({
        inventory: await inventory({
          observedAt: 1_001,
          entries: [entry()],
        }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_000,
      }),
    ).toEqual({ status: "malformed", observedAt: 1_001 });
  });

  test("gives malformed top-level inventory evidence highest precedence", async () => {
    for (const topLevelStatus of [
      "command-error",
      "output-limit",
      "malformed",
      "entry-limit",
    ] as const) {
      expect(
        reconcileNativeTarget({
          inventory: await inventory({
            topLevelStatus,
            entries: [entry()],
          }),
          targetPluginId: "notes",
          canonicalSourceRoot: TARGET_ROOT,
          now: 1_001,
        }),
      ).toEqual({ status: "malformed", observedAt: 1_000 });
    }
  });

  test("matching malformed rows win while malformed unrelated siblings do not hide a safe match", async () => {
    const malformedRow = {
      index: 1,
      id: "notes",
      canonicalRoot: null,
      issues: ["source-provenance" as const],
    };
    expect(
      reconcileNativeTarget({
        inventory: await inventory({
          entries: [entry()],
          malformedRows: [malformedRow],
        }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      }),
    ).toEqual({ status: "malformed", observedAt: 1_000 });

    expect(
      reconcileNativeTarget({
        inventory: await inventory({
          entries: [entry()],
          malformedRows: [{ ...malformedRow, id: "calendar" }],
        }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      }),
    ).toMatchObject({ status: "exact-path", pluginId: "notes" });

    expect(
      reconcileNativeTarget({
        inventory: await inventory({
          entries: [entry()],
          malformedRows: [
            {
              ...malformedRow,
              id: null,
              canonicalRoot: TARGET_ROOT,
              issues: ["id"],
            },
          ],
        }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      }),
    ).toEqual({ status: "malformed", observedAt: 1_000 });
  });

  test("classifies duplicate matching plugin IDs or canonical roots before path states", async () => {
    const duplicateSets: NativeInventoryEntry[][] = [
      [entry(), entry({ canonicalRoot: "/workspace/other/notes" })],
      [entry(), entry({ id: "calendar" })],
    ];

    for (const entries of duplicateSets) {
      expect(
        reconcileNativeTarget({
          inventory: await inventory({ entries }),
          targetPluginId: "notes",
          canonicalSourceRoot: TARGET_ROOT,
          now: 1_001,
        }),
      ).toEqual({ status: "duplicate", observedAt: 1_000 });
    }
  });

  test("gives duplicate evidence precedence over future and stale timestamps", async () => {
    const duplicates = [
      entry(),
      entry({ canonicalRoot: "/workspace/other/notes" }),
    ];
    for (const [observedAt, now] of [
      [2_000, 1_000],
      [1_000, 31_001],
    ] as const) {
      expect(
        reconcileNativeTarget({
          inventory: await inventory({ observedAt, entries: duplicates }),
          targetPluginId: "notes",
          canonicalSourceRoot: TARGET_ROOT,
          now,
        }),
      ).toEqual({ status: "duplicate", observedAt });
    }
  });

  test("classifies one direct root claiming a different plugin ID as malformed", async () => {
    expect(
      reconcileNativeTarget({
        inventory: await inventory({ entries: [entry({ id: "calendar" })] }),
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      }),
    ).toEqual({ status: "malformed", observedAt: 1_000 });
  });

  test("rejects raw, cloned, and prototype-derived inventory claims", async () => {
    const trusted = await inventory({ entries: [entry()] });
    for (const forged of [
      { ...trusted },
      Object.create(trusted) as unknown,
      {
        schemaVersion: 1,
        observedAt: 1_000,
        entries: [entry()],
      },
    ]) {
      expect(() =>
        reconcileNativeTarget({
          inventory: forged as TrustedNativeInventory,
          targetPluginId: "notes",
          canonicalSourceRoot: TARGET_ROOT,
          now: 1_001,
        }),
      ).toThrow("Invalid request");
    }
  });

  test("returns only the strict public native payload", async () => {
    const result = reconcileNativeTarget({
      inventory: await inventory({ entries: [entry()] }),
      targetPluginId: "notes",
      canonicalSourceRoot: TARGET_ROOT,
      now: 1_001,
    });
    const serialized = JSON.stringify(result);

    expect(Object.keys(result).sort()).toEqual([
      "observedAt",
      "pluginId",
      "status",
    ]);
    for (const privateValue of [
      TARGET_ROOT,
      "devbox.local",
      RUNTIME_INSTANCE_ID,
      "1.2.3",
      "running",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  test("rejects invalid target identity, private root, and clock inputs", async () => {
    const trusted = await inventory();
    for (const input of [
      {
        targetPluginId: "../notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: 1_001,
      },
      {
        targetPluginId: "notes",
        canonicalSourceRoot: "plugins/notes",
        now: 1_001,
      },
      {
        targetPluginId: "notes",
        canonicalSourceRoot: TARGET_ROOT,
        now: Number.MAX_SAFE_INTEGER + 1,
      },
    ]) {
      expect(() =>
        reconcileNativeTarget({ inventory: trusted, ...input }),
      ).toThrow("Invalid request");
    }
  });
});
