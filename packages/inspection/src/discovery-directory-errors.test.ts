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

describe("directory read diagnostics", () => {
  test("reports an unreadable directory without hiding a safe sibling", async () => {
    const rootPath = await harness.createRoot();
    const unreadableRoot = path.join(rootPath, "unreadable");
    const safeRoot = path.join(rootPath, "safe");
    await fs.mkdir(unreadableRoot);
    await fs.mkdir(safeRoot);
    await harness.writePlugin(safeRoot, "safe");
    const canonicalUnreadable = await fs.realpath(unreadableRoot);
    const restore = installDiscoveryTestHookForTest((event) => {
      if (
        event.point === "before-directory-read" &&
        event.path === canonicalUnreadable
      ) {
        throw new Error("sensitive host error");
      }
    });

    try {
      const admission = await admitTrustedRoots([
        {
          rootKey: WORKSPACE_ROOT_KEY,
          kind: "current-project",
          path: rootPath,
        },
      ]);
      const result = await discoverSourceCandidates(admission.roots);

      expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
        "safe",
      ]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "scan-directory-unreadable",
          displayPath: "workspace/unreadable",
        }),
      );
      expect(JSON.stringify(result.diagnostics)).not.toContain(rootPath);
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        "sensitive host error",
      );
    } finally {
      restore();
    }
  });
});
