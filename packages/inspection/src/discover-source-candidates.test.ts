import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { discoverSourceCandidates } from "./discover-source-candidates.ts";
import {
  createDiscoveryTestHarness,
  EXAMPLE_ROOT_KEY,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import type { TrustedRoot } from "./discovery-types.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

describe("passive source discovery", () => {
  test("rejects a caller-forged trusted root", async () => {
    const forged = {
      rootKey: WORKSPACE_ROOT_KEY,
      kind: "explicit",
      displayName: "forged",
    } as TrustedRoot;

    await expect(discoverSourceCandidates([forged])).rejects.toThrow(
      "trusted root was not admitted by the server",
    );
  });

  test("discovers a bb package at an admitted root", async () => {
    const rootPath = await harness.createRoot("example-workspace");
    await harness.writePlugin(rootPath, "example");
    const admission = await admitTrustedRoots([
      { rootKey: EXAMPLE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.diagnostics).toEqual([]);
    expect(result.candidates).toEqual([
      {
        rootKey: EXAMPLE_ROOT_KEY,
        canonicalRoot: await fs.realpath(rootPath),
        displayPath: "example-workspace",
        packageName: "bb-plugin-example",
        version: "1.2.3",
        pluginId: "example",
        displayName: "example",
        hasServer: true,
        hasApp: false,
      },
    ]);
  });

  test("keeps candidate internals usable but rejects accidental serialization", async () => {
    const rootPath = await harness.createRoot();
    await harness.writePlugin(rootPath, "private");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);
    const candidate = result.candidates[0];

    expect(candidate?.rootKey).toBe(WORKSPACE_ROOT_KEY);
    expect(candidate?.canonicalRoot).toBe(await fs.realpath(rootPath));
    expect(() => JSON.stringify(candidate)).toThrow(
      "source candidates are server-private",
    );
  });

  test.each([
    [
      "display name",
      {
        name: "bb-plugin-broken",
        version: "1.0.0",
        bb: { name: "d".repeat(129), server: "./server.ts" },
      },
    ],
    [
      "package name",
      {
        name: "n".repeat(215),
        version: "1.0.0",
        bb: { name: "broken", server: "./server.ts" },
      },
    ],
    [
      "version",
      {
        name: "bb-plugin-broken",
        version: "1".repeat(65),
        bb: { name: "broken", server: "./server.ts" },
      },
    ],
    [
      "derived plugin id",
      {
        name: `bb-plugin-${"p".repeat(65)}`,
        version: "1.0.0",
        bb: { name: "broken", server: "./server.ts" },
      },
    ],
  ])(
    "rejects an oversized %s without hiding a safe sibling",
    async (_label, manifest) => {
      const rootPath = await harness.createRoot();
      const brokenRoot = path.join(rootPath, "broken");
      const safeRoot = path.join(rootPath, "safe");
      await fs.mkdir(brokenRoot);
      await fs.mkdir(safeRoot);
      await fs.writeFile(
        path.join(brokenRoot, "package.json"),
        JSON.stringify(manifest),
      );
      await fs.writeFile(path.join(brokenRoot, "server.ts"), "export {};\n");
      await harness.writePlugin(safeRoot, "safe");
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
          code: "manifest-invalid",
          displayPath: "workspace/broken",
        }),
      );
    },
  );

  test("discovers nested packages deterministically while ignoring generated and hidden trees", async () => {
    const rootPath = await harness.createRoot();
    const safeRoots = [
      path.join(rootPath, "plugins", "alpha"),
      path.join(rootPath, "plugins", "zeta"),
    ];
    const ignoredRoots = [
      path.join(rootPath, "node_modules", "ignored"),
      path.join(rootPath, ".hidden", "ignored"),
      path.join(rootPath, "dist", "ignored"),
      path.join(rootPath, "cache", "ignored"),
    ];
    for (const pluginRoot of [...safeRoots, ...ignoredRoots]) {
      await fs.mkdir(pluginRoot, { recursive: true });
      await harness.writePlugin(pluginRoot, path.basename(pluginRoot));
    }
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.displayPath)).toEqual(
      ["workspace/plugins/alpha", "workspace/plugins/zeta"],
    );
  });

  test("reports a malformed sibling without hiding a safe candidate", async () => {
    const rootPath = await harness.createRoot();
    const brokenRoot = path.join(rootPath, "plugins", "broken");
    const safeRoot = path.join(rootPath, "plugins", "safe");
    await fs.mkdir(brokenRoot, { recursive: true });
    await fs.mkdir(safeRoot, { recursive: true });
    await fs.writeFile(path.join(brokenRoot, "package.json"), "{not-json");
    await harness.writePlugin(safeRoot, "safe");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "safe",
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "workspace/plugins/broken",
      }),
    ]);
    expect(result.diagnostics[0]?.detail.length).toBeLessThanOrEqual(8192);
    expect(JSON.stringify(result.diagnostics)).not.toContain(rootPath);
  });

  test("reports malformed UTF-8 in a manifest without exposing its path", async () => {
    const rootPath = await harness.createRoot("private-invalid-utf8-root");
    const brokenRoot = path.join(rootPath, "plugins", "private-broken");
    await fs.mkdir(brokenRoot, { recursive: true });
    await fs.writeFile(path.join(brokenRoot, "server.ts"), "export {};\n");
    await fs.writeFile(
      path.join(brokenRoot, "package.json"),
      Buffer.concat([
        Buffer.from(
          '{"name":"bb-plugin-broken","version":"1.0.0","bb":{"name":"broken","description":"',
        ),
        Buffer.from([0xff]),
        Buffer.from('","branding":{"icon":"Puzzle"},"server":"./server.ts"}}'),
      ]),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-invalid-utf8-root/plugins/private-broken",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(rootPath);
  });

  test("rejects an oversized manifest without hiding a safe candidate", async () => {
    const rootPath = await harness.createRoot();
    const oversizedRoot = path.join(rootPath, "plugins", "oversized");
    const safeRoot = path.join(rootPath, "plugins", "safe");
    await fs.mkdir(oversizedRoot, { recursive: true });
    await fs.mkdir(safeRoot, { recursive: true });
    await fs.writeFile(
      path.join(oversizedRoot, "package.json"),
      Buffer.alloc(256 * 1024 + 1, 0x20),
    );
    await harness.writePlugin(safeRoot, "safe");
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "safe",
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest-too-large",
        displayPath: "workspace/plugins/oversized",
      }),
    ]);
  });

  test("never follows a package.json symlink", async () => {
    const rootPath = await harness.createRoot();
    const candidateRoot = path.join(rootPath, "plugins", "linked-manifest");
    await fs.mkdir(candidateRoot, { recursive: true });
    const outsideManifest = path.join(path.dirname(rootPath), "outside.json");
    await fs.writeFile(
      outsideManifest,
      JSON.stringify({
        name: "bb-plugin-outside",
        version: "1.0.0",
        bb: { name: "outside", server: "./server.ts" },
      }),
    );
    await fs.symlink(outsideManifest, path.join(candidateRoot, "package.json"));
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "manifest-symlink",
        displayPath: "workspace/plugins/linked-manifest",
      }),
    ]);
  });

  test("never executes plugin entrypoints or package scripts", async () => {
    const rootPath = await harness.createRoot();
    const sentinel = path.join(path.dirname(rootPath), "executed.txt");
    await fs.writeFile(
      path.join(rootPath, "server.ts"),
      `await Bun.write(${JSON.stringify(sentinel)}, "entrypoint");\n`,
    );
    await fs.writeFile(
      path.join(rootPath, "package.json"),
      JSON.stringify({
        name: "bb-plugin-passive",
        version: "1.0.0",
        scripts: {
          preinstall: `printf package-script > ${JSON.stringify(sentinel)}`,
          postinstall: `printf package-script > ${JSON.stringify(sentinel)}`,
        },
        bb: {
          name: "passive",
          description: "passive plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "explicit", path: rootPath },
    ]);

    const result = await discoverSourceCandidates(admission.roots);

    expect(result.candidates.map((candidate) => candidate.pluginId)).toEqual([
      "passive",
    ]);
    expect(await fs.readFile(sentinel, "utf8").catch(() => null)).toBeNull();
  });
});
