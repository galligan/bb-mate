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

describe("source path safety", () => {
  test("rejects a queued directory swapped to a symlink before inspection", async () => {
    const rootPath = await harness.createRoot();
    const safeRoot = path.join(rootPath, "00-safe");
    const volatileRoot = path.join(rootPath, "volatile");
    const originalRoot = path.join(rootPath, "volatile-original");
    const outsideRoot = path.join(path.dirname(rootPath), "outside-plugin");
    await fs.mkdir(safeRoot);
    await fs.mkdir(volatileRoot);
    await fs.mkdir(outsideRoot);
    await harness.writePlugin(safeRoot, "safe");
    await harness.writePlugin(outsideRoot, "outside");
    const canonicalRootPath = await fs.realpath(rootPath);
    let swapped = false;
    const restore = installDiscoveryTestHookForTest(async (event) => {
      if (
        swapped ||
        event.point !== "after-directory-read" ||
        event.path !== canonicalRootPath
      ) {
        return;
      }
      swapped = true;
      await fs.rename(volatileRoot, originalRoot);
      await fs.symlink(outsideRoot, volatileRoot, "dir");
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
          code: "scan-directory-symlink",
          displayPath: "workspace/volatile",
        }),
      );
    } finally {
      restore();
    }
  });

  test("reports and skips symlinked directories below a trusted root", async () => {
    const rootPath = await harness.createRoot();
    const outsideRoot = path.join(path.dirname(rootPath), "outside-plugin");
    await fs.mkdir(outsideRoot);
    await harness.writePlugin(outsideRoot, "outside");
    await fs.symlink(outsideRoot, path.join(rootPath, "linked-plugin"), "dir");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "path-symlink",
        displayPath: "workspace/linked-plugin",
      }),
    ]);
  });

  test.each([
    ["absolute", "/tmp/outside-server.ts"],
    ["traversal", "../outside-server.ts"],
  ])("rejects %s declared descendants", async (_label, server) => {
    const rootPath = await harness.createRoot();
    await fs.writeFile(
      path.join(rootPath, "package.json"),
      JSON.stringify({
        name: "bb-plugin-unsafe",
        version: "1.0.0",
        bb: {
          name: "unsafe",
          description: "unsafe plugin",
          branding: { icon: "Puzzle" },
          server,
        },
      }),
    );
    await fs.writeFile(
      path.join(path.dirname(rootPath), "outside-server.ts"),
      "",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest-path-invalid",
        displayPath: "workspace",
      }),
    ]);
  });

  test("rejects a symlink component in a declared app entrypoint", async () => {
    const rootPath = await harness.createRoot();
    const realDirectory = path.join(rootPath, "real");
    await fs.mkdir(realDirectory);
    await fs.writeFile(path.join(rootPath, "server.ts"), "export {};\n");
    await fs.writeFile(path.join(realDirectory, "app.tsx"), "export {};\n");
    await fs.symlink(realDirectory, path.join(rootPath, "linked"), "dir");
    await writeManifest(rootPath, { app: "./linked/app.tsx" });

    await expectSymlinkRejection(rootPath);
  });
});

async function writeManifest(
  rootPath: string,
  bb: Record<string, unknown>,
): Promise<void> {
  await fs.writeFile(
    path.join(rootPath, "package.json"),
    JSON.stringify({
      name: "bb-plugin-unsafe",
      version: "1.0.0",
      bb: {
        name: "unsafe",
        description: "unsafe plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
        ...bb,
      },
    }),
  );
}

async function expectSymlinkRejection(rootPath: string): Promise<void> {
  const admission = await admitTrustedRoots([
    { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
  ]);
  const result = await discoverSourceCandidates(admission.roots);
  expect(result.candidates).toEqual([]);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: "manifest-path-symlink" }),
  );
}
