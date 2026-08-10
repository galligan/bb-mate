import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverSourceCandidates } from "./discover-source-candidates.ts";
import { installDiscoveryTestHookForTest } from "./discovery-test-hook.ts";
import {
  createDiscoveryTestHarness,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

describe("bounded manifest reads", () => {
  test("bounds a manifest that grows after its initial stat and keeps a safe sibling", async () => {
    const rootPath = await harness.createRoot();
    const growingRoot = path.join(rootPath, "growing");
    const safeRoot = path.join(rootPath, "safe");
    await fs.mkdir(growingRoot);
    await fs.mkdir(safeRoot);
    await harness.writePlugin(growingRoot, "growing");
    await harness.writePlugin(safeRoot, "safe");
    const growingManifest = await fs.realpath(
      path.join(growingRoot, "package.json"),
    );
    let grew = false;
    const restore = installDiscoveryTestHookForTest(async (event) => {
      if (
        grew ||
        event.point !== "after-manifest-stat" ||
        event.path !== growingManifest
      ) {
        return;
      }
      grew = true;
      await fs.appendFile(growingManifest, Buffer.alloc(1024 * 1024, 0x20));
    });

    try {
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
      ]);
      const result = await discoverSourceCandidates(admission.roots);

      expect(grew).toBeTrue();
      expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
        "safe",
      ]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "manifest-too-large",
          displayPath: "workspace/growing",
        }),
      );
    } finally {
      restore();
    }
  });
});
