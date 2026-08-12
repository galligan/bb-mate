import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";

import { discoverWorkspaceSourceCandidates } from "./discover-workspace-source-candidates.ts";
import {
  createDiscoveryTestHarness,
  WORKSPACE_ROOT_KEY,
} from "./discovery-test-helpers.ts";
import { installDiscoveryTestHookForTest } from "./discovery-test-hook.ts";
import { admitTrustedRoots } from "./trusted-roots.ts";

const harness = createDiscoveryTestHarness();

afterEach(() => harness.cleanup());

describe("workspace-aware source discovery", () => {
  test("discovers only the root and npm or Bun workspace packages", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "mate");
    const unrelated = path.join(root, "src", "nested");
    await fs.mkdir(plugin, { recursive: true });
    await fs.mkdir(unrelated, { recursive: true });
    await harness.writePlugin(plugin, "mate");
    await harness.writePlugin(unrelated, "unrelated");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["plugins/*"],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual(["mate"]);
    expect(result.diagnostics).toEqual([]);
  });

  test("continues through a package boundary when a declared pattern reaches a nested workspace", async () => {
    const root = await harness.createRoot();
    const parentPackage = path.join(root, "packages", "tools");
    const nestedPlugin = path.join(parentPackage, "examples", "demo");
    await fs.mkdir(nestedPlugin, { recursive: true });
    await fs.writeFile(
      path.join(parentPackage, "package.json"),
      JSON.stringify({ name: "tools", private: true }),
    );
    await harness.writePlugin(nestedPlugin, "demo");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["packages/*", "packages/*/examples/*"],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual(["demo"]);
    expect(result.diagnostics).toEqual([]);
  });

  test("traverses ignored directories only when a workspace names them explicitly", async () => {
    const root = await harness.createRoot();
    const distPlugin = path.join(root, "dist", "plugins", "dist-plugin");
    const hiddenPlugin = path.join(root, ".plugins", "hidden-plugin");
    const wildcardHiddenPlugin = path.join(
      root,
      "packages",
      ".plugins-dev",
      "wildcard-hidden-plugin",
    );
    const implicitPlugin = path.join(root, "node_modules", "implicit-plugin");
    await fs.mkdir(distPlugin, { recursive: true });
    await fs.mkdir(hiddenPlugin, { recursive: true });
    await fs.mkdir(wildcardHiddenPlugin, { recursive: true });
    await fs.mkdir(implicitPlugin, { recursive: true });
    await harness.writePlugin(distPlugin, "dist-plugin");
    await harness.writePlugin(hiddenPlugin, "hidden-plugin");
    await harness.writePlugin(wildcardHiddenPlugin, "wildcard-hidden-plugin");
    await harness.writePlugin(implicitPlugin, "implicit-plugin");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [
          "dist/plugins/*",
          ".plugins/*",
          "packages/.plugins-*/*",
          "**",
        ],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId).sort()).toEqual([
      "dist-plugin",
      "hidden-plugin",
      "wildcard-hidden-plugin",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("supports pnpm workspace includes and exclusions", async () => {
    const root = await harness.createRoot();
    const included = path.join(root, "plugins", "included");
    const excluded = path.join(root, "plugins", "excluded");
    await fs.mkdir(included, { recursive: true });
    await fs.mkdir(excluded, { recursive: true });
    await harness.writePlugin(included, "included");
    await harness.writePlugin(excluded, "excluded");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'plugins/*'\n  - '!plugins/excluded'\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
      "included",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("rejects a duplicate pnpm packages key after the parsed block", async () => {
    const root = await harness.createRoot("private-pnpm-duplicate");
    const first = path.join(root, "plugins", "first");
    const second = path.join(root, "extensions", "second");
    await fs.mkdir(first, { recursive: true });
    await fs.mkdir(second, { recursive: true });
    await harness.writePlugin(first, "first");
    await harness.writePlugin(second, "second");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'plugins/*'\nother: true\npackages:\n  - 'extensions/*'\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-pnpm-duplicate",
      }),
    ]);
  });

  test("reports unsupported pnpm workspace syntax as partial", async () => {
    const root = await harness.createRoot("private-pnpm-workspace");
    const plugin = path.join(root, "plugins", "mate");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "mate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages: ['plugins/*']\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-pnpm-workspace",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("reports indentationless pnpm package lists as unsupported", async () => {
    const root = await harness.createRoot("private-pnpm-indentationless");
    const plugin = path.join(root, "plugins", "mate");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "mate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n- 'plugins/*'\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-pnpm-indentationless",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("rejects YAML mapping entries as pnpm workspace patterns", async () => {
    const root = await harness.createRoot("private-pnpm-mapping");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - foo: bar\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-pnpm-mapping",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("rejects non-specific and local YAML tags as pnpm workspace patterns", async () => {
    for (const [name, scalar] of [
      ["non-specific-tag", "! plugins/*"],
      ["local-tag", "!workspace plugins/*"],
    ] as const) {
      const root = await harness.createRoot(`private-pnpm-${name}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - ${scalar}\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "workspace-config-invalid",
          rootKey: WORKSPACE_ROOT_KEY,
          displayPath: `private-pnpm-${name}`,
        }),
      ]);
    }
  });

  test("rejects nested YAML collections as pnpm workspace patterns", async () => {
    for (const scalar of ["- plugins/*", "? plugins/*"]) {
      const root = await harness.createRoot("private-pnpm-nested");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - ${scalar}\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "workspace-config-invalid",
          rootKey: WORKSPACE_ROOT_KEY,
          displayPath: "private-pnpm-nested",
        }),
      ]);
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        path.dirname(root),
      );
    }
  });

  test("rejects non-string YAML core scalars as pnpm workspace patterns", async () => {
    for (const scalar of ["true", "null"]) {
      const root = await harness.createRoot(`private-pnpm-${scalar}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - ${scalar}\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "workspace-config-invalid",
          rootKey: WORKSPACE_ROOT_KEY,
          displayPath: `private-pnpm-${scalar}`,
        }),
      ]);
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        path.dirname(root),
      );
    }
  });

  test("supports Bun object-form workspace packages", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "extensions", "mate");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "mate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "bun-root",
        private: true,
        workspaces: { packages: ["extensions/*"] },
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual(["mate"]);
    expect(result.diagnostics).toEqual([]);
  });

  test("falls back to the root with a path-free diagnostic for invalid configuration", async () => {
    const root = await harness.createRoot("private-workspace-name");
    const nested = path.join(root, "plugins", "nested");
    await fs.mkdir(nested, { recursive: true });
    await harness.writePlugin(nested, "nested");
    await fs.writeFile(path.join(root, "server.ts"), "export {};\n");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "bb-plugin-root",
        version: "1.0.0",
        workspaces: ["../outside"],
        bb: {
          name: "root",
          description: "root plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual(["root"]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "private-workspace-name",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("does not follow a symlinked workspace directory", async () => {
    const root = await harness.createRoot();
    const outside = path.join(path.dirname(root), "outside-plugin");
    await fs.mkdir(outside);
    await harness.writePlugin(outside, "outside");
    await fs.symlink(outside, path.join(root, "linked-plugin"), "dir");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["*"],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "path-symlink",
        rootKey: WORKSPACE_ROOT_KEY,
        displayPath: "workspace/linked-plugin",
      }),
    ]);
  });

  test("keeps candidates correlated across one globally budgeted multi-root scan", async () => {
    const first = await harness.createRoot("first-project");
    const second = await harness.createRoot("second-project");
    const firstPlugin = path.join(first, "plugins", "first");
    const secondPlugin = path.join(second, "plugins", "second");
    await fs.mkdir(firstPlugin, { recursive: true });
    await fs.mkdir(secondPlugin, { recursive: true });
    await harness.writePlugin(firstPlugin, "first");
    await harness.writePlugin(secondPlugin, "second");
    for (const root of [first, second]) {
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          name: path.basename(root),
          private: true,
          workspaces: ["plugins/*"],
        }),
      );
    }
    const secondKey = "s".repeat(32);
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: first },
      { rootKey: secondKey, kind: "current-project", path: second },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(
      result.candidates
        .map(({ pluginId, rootKey }) => `${pluginId}:${rootKey}`)
        .sort(),
    ).toEqual([`first:${WORKSPACE_ROOT_KEY}`, `second:${secondKey}`].sort());
    expect(result.diagnostics).toEqual([]);
  });

  test("prunes fully excluded subtrees before they consume the global entry budget", async () => {
    const root = await harness.createRoot();
    const excluded = path.join(root, "00-generated");
    const included = path.join(root, "zz-plugins", "valid");
    await fs.mkdir(excluded);
    await fs.mkdir(included, { recursive: true });
    await Promise.all(
      Array.from({ length: 2_050 }, (_, index) =>
        fs.mkdir(
          path.join(excluded, `entry-${String(index).padStart(4, "0")}`),
        ),
      ),
    );
    await harness.writePlugin(included, "valid");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["**", "!00-generated/**"],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
      "valid",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("stops discovery when its request is aborted during a directory read", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "valid");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "valid");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["plugins/*"],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);
    const canonicalRoot = await fs.realpath(root);
    const controller = new AbortController();
    const restore = installDiscoveryTestHookForTest(async (event) => {
      if (
        event.point === "after-directory-read" &&
        event.path === canonicalRoot
      )
        controller.abort();
    });

    try {
      await expect(
        discoverWorkspaceSourceCandidates(admission.roots, {
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      restore();
    }
  });
});
