import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { observeNativePluginInventoryForTest } from "./native-inventory.ts";
import {
  command,
  readObservation,
  runtimeInstanceId,
} from "./native-inventory-test-helpers.ts";

async function observeRows(plugins: readonly unknown[]) {
  return readObservation(
    await observeNativePluginInventoryForTest({
      runtimeInstanceId,
      now: () => 2_000,
      hostname: () => "studio.local",
      runBb: async () => command(JSON.stringify({ plugins })),
    }),
  );
}

describe("native inventory row security", () => {
  test("retains matching malformed evidence without retaining unsafe roots", async () => {
    const unsafeRoot = "/private/secret/plugin";
    const facts = await observeRows([
      {
        id: "notes",
        source: `path:${unsafeRoot}`,
        rootDir: 42,
        version: "1.2.3",
        provenance: "catalog",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
      {
        id: "memory",
        source: "npm:bb-plugin-memory@1.0.0",
        rootDir: "/installed/managed/memory",
        version: "1.0.0",
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "disabled",
      },
    ]);

    expect(facts.entries).toEqual([
      {
        id: "memory",
        sourceKind: "npm",
        canonicalRoot: null,
        version: "1.0.0",
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "disabled",
      },
    ]);
    expect(facts.malformedRows).toEqual([
      {
        index: 0,
        id: "notes",
        canonicalRoot: null,
        issues: ["rootDir", "source-provenance"],
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain(unsafeRoot);
  });

  test("does not resolve a path-shaped row whose provenance is not direct", async () => {
    const unsafeRoot = "/definitely/missing/private/plugin";
    const facts = await observeRows([
      {
        id: "notes",
        source: `path:${unsafeRoot}`,
        rootDir: unsafeRoot,
        version: "1.2.3",
        provenance: "catalog",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
    ]);

    expect(facts.malformedRows).toEqual([
      {
        index: 0,
        id: "notes",
        canonicalRoot: null,
        issues: ["source-provenance"],
      },
    ]);
    expect(JSON.stringify(facts)).not.toContain(unsafeRoot);
  });

  test("rejects direct source and runtime root disagreement", async () => {
    const sourceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-native-source-"),
    );
    const runtimeRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-native-runtime-"),
    );
    try {
      const facts = await observeRows([
        {
          id: "notes",
          source: `path:${sourceRoot}`,
          rootDir: runtimeRoot,
          version: "1.0.0",
          provenance: "direct",
          isOrphanedBuiltin: false,
          enabled: true,
          status: "running",
        },
      ]);

      expect(facts.entries).toEqual([]);
      expect(facts.malformedRows).toEqual([
        {
          index: 0,
          id: "notes",
          canonicalRoot: null,
          issues: ["source"],
        },
      ]);
      expect(JSON.stringify(facts)).not.toContain(sourceRoot);
      expect(JSON.stringify(facts)).not.toContain(runtimeRoot);
    } finally {
      await Promise.all([
        fs.rm(sourceRoot, { recursive: true, force: true }),
        fs.rm(runtimeRoot, { recursive: true, force: true }),
      ]);
    }
  });

  test("retains only a safely canonicalized root hint for a malformed direct row", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-native-malformed-root-"),
    );
    try {
      const facts = await observeRows([
        {
          id: 42,
          source: `path:${root}`,
          rootDir: root,
          version: "1.0.0",
          provenance: "direct",
          isOrphanedBuiltin: false,
          enabled: true,
          status: "running",
        },
      ]);

      expect(facts.malformedRows).toEqual([
        {
          index: 0,
          id: null,
          canonicalRoot: await fs.realpath(root),
          issues: ["id"],
        },
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
