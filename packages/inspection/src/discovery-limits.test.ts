import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverSourceCandidates } from "./discover-source-candidates.ts";
import {
  createDiscoveryTestHarness,
  EXAMPLE_ROOT_KEY,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

describe("source discovery limits", () => {
  test("bounds the redacted display path for runtime persistence", async () => {
    const rootPath = await harness.createRoot();
    const pluginRoot = path.join(rootPath, "plugin");
    await fs.mkdir(pluginRoot);
    await harness.writePlugin(pluginRoot, "plugin");
    const admission = await admitTrustedRoots([
      {
        rootKey: WORKSPACE_ROOT_KEY,
        kind: "current-project",
        path: rootPath,
        displayName: "r".repeat(255),
      },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates[0]?.displayPath).toHaveLength(256);
  });

  test("stops at depth four with typed evidence while keeping the boundary candidate", async () => {
    const rootPath = await harness.createRoot();
    const boundaryRoot = path.join(rootPath, "a", "b", "c", "d");
    const tooDeepRoot = path.join(boundaryRoot, "too-deep");
    await fs.mkdir(tooDeepRoot, { recursive: true });
    await harness.writePlugin(boundaryRoot, "boundary");
    await harness.writePlugin(tooDeepRoot, "too-deep");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "boundary",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "scan-depth-limit",
        displayPath: "workspace/a/b/c/d/too-deep",
      }),
    );
  });

  test("bounds visited entries while preserving an earlier safe candidate", async () => {
    const rootPath = await harness.createRoot();
    const safeRoot = path.join(rootPath, "00-safe");
    await fs.mkdir(safeRoot);
    await harness.writePlugin(safeRoot, "safe");
    await Promise.all(
      Array.from({ length: 2048 }, (_, index) =>
        fs.writeFile(
          path.join(rootPath, `z-${index.toString().padStart(4, "0")}`),
          "",
        ),
      ),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "safe",
    ]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "scan-entry-limit",
        displayPath: "workspace",
      }),
    );
  });

  test("bounds discovered candidates at one hundred twenty-eight", async () => {
    const rootPath = await harness.createRoot();
    for (let index = 0; index < 129; index += 1) {
      const pluginRoot = path.join(
        rootPath,
        `plugin-${index.toString().padStart(3, "0")}`,
      );
      await fs.mkdir(pluginRoot);
      await harness.writePlugin(pluginRoot, `plugin-${index}`);
    }
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toHaveLength(128);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "candidate-limit",
        displayPath: "workspace/plugin-128",
      }),
    );
  });

  test("reserves the global entry budget fairly across independent roots", async () => {
    const noisyRoot = await harness.createRoot("noisy");
    const safeRoot = await harness.createRoot("safe-root");
    const safePlugin = path.join(safeRoot, "plugin");
    await fs.mkdir(safePlugin);
    await harness.writePlugin(safePlugin, "safe");
    await Promise.all(
      Array.from({ length: 2048 }, (_, index) =>
        fs.writeFile(
          path.join(noisyRoot, `entry-${index.toString().padStart(4, "0")}`),
          "",
        ),
      ),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: noisyRoot },
      { rootKey: EXAMPLE_ROOT_KEY, kind: "explicit", path: safeRoot },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toContain(
      "safe",
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "scan-entry-limit",
        displayPath: "noisy",
      }),
    );
  });

  test("reserves the global candidate budget fairly across independent roots", async () => {
    const noisyRoot = await harness.createRoot("noisy");
    const safeRoot = await harness.createRoot("safe-root");
    for (let index = 0; index < 128; index += 1) {
      const pluginRoot = path.join(
        noisyRoot,
        `plugin-${index.toString().padStart(3, "0")}`,
      );
      await fs.mkdir(pluginRoot);
      await harness.writePlugin(pluginRoot, `noisy-${index}`);
    }
    const safePlugin = path.join(safeRoot, "plugin");
    await fs.mkdir(safePlugin);
    await harness.writePlugin(safePlugin, "safe");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: noisyRoot },
      { rootKey: EXAMPLE_ROOT_KEY, kind: "explicit", path: safeRoot },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toHaveLength(65);
    expect(result.candidates.map((candidate) => candidate.pluginId)).toContain(
      "safe",
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "candidate-limit",
        displayPath: "noisy/plugin-064",
      }),
    );
  });
});
