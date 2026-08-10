import { describe, expect, test } from "bun:test";

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
      now: () => 4_000,
      hostname: () => "studio.local",
      runBb: async () => command(JSON.stringify({ plugins })),
    }),
  );
}

describe("released native inventory row shapes", () => {
  test("bounds relevant row strings by UTF-8 bytes", async () => {
    const facts = await observeRows([
      {
        id: "notes",
        source: "npm:bb-plugin-notes",
        rootDir: "/installed/notes",
        version: "é".repeat(128),
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
    ]);

    expect(facts.entries).toEqual([]);
    expect(facts.malformedRows).toEqual([
      { index: 0, id: "notes", canonicalRoot: null, issues: ["version"] },
    ]);
  });

  test("rejects source schemes without a released source identity", async () => {
    const facts = await observeRows([
      {
        id: "notes",
        source: "npm:",
        rootDir: "/installed/notes",
        version: "1.0.0",
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
    ]);

    expect(facts.malformedRows).toEqual([
      { index: 0, id: "notes", canonicalRoot: null, issues: ["source"] },
    ]);
  });

  test("classifies orphan evidence on a managed source as malformed", async () => {
    const facts = await observeRows([
      {
        id: "notes",
        source: "npm:bb-plugin-notes",
        rootDir: "/installed/notes",
        version: "1.0.0",
        provenance: "direct",
        isOrphanedBuiltin: true,
        enabled: true,
        status: "running",
      },
    ]);

    expect(facts.malformedRows).toEqual([
      {
        index: 0,
        id: "notes",
        canonicalRoot: null,
        issues: ["isOrphanedBuiltin"],
      },
    ]);
  });

  test("normalizes managed and bundled rows without resolving installed roots", async () => {
    const facts = await observeRows([
      {
        id: "npm-plugin",
        source: "npm:bb-plugin-npm@1.0.0",
        rootDir: "/does/not/exist/npm",
        version: "1.0.0",
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
      {
        id: "git-plugin",
        source: "git:https://example.invalid/plugin.git@main",
        rootDir: "/does/not/exist/git",
        version: "2.0.0",
        provenance: "direct",
        isOrphanedBuiltin: false,
        enabled: false,
        status: "disabled",
      },
      {
        id: "threads",
        source: "builtin:threads",
        rootDir: "/does/not/exist/builtin",
        version: "0.36.0",
        provenance: "builtin",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "running",
      },
      {
        id: "memory",
        source: "builtin:memory",
        rootDir: "/does/not/exist/catalog",
        version: "0.36.0",
        provenance: "catalog",
        isOrphanedBuiltin: false,
        enabled: true,
        status: "needs-configuration",
      },
    ]);

    expect(facts.malformedRows).toEqual([]);
    expect(
      facts.entries.map(({ id, sourceKind, canonicalRoot }) => ({
        id,
        sourceKind,
        canonicalRoot,
      })),
    ).toEqual([
      { id: "npm-plugin", sourceKind: "npm", canonicalRoot: null },
      { id: "git-plugin", sourceKind: "git", canonicalRoot: null },
      { id: "threads", sourceKind: "builtin", canonicalRoot: null },
      { id: "memory", sourceKind: "catalog", canonicalRoot: null },
    ]);
    expect(JSON.stringify(facts)).not.toContain("example.invalid");
    expect(JSON.stringify(facts)).not.toContain("/does/not/exist");
  });
});
