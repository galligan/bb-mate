import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";

import { discoverWorkspaceSourceCandidates } from "./discover-workspace-source-candidates.ts";
import { sourceCandidateDiscoveringRootKeys } from "./discovery-scan-state.ts";
import {
  createDiscoveryTestHarness,
  EXAMPLE_ROOT_KEY,
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

  test("stops pathological matching at the aggregate work budget", async () => {
    const root = await harness.createRoot();
    const names = Array.from(
      { length: 8 },
      (_, index) => `${String.fromCharCode(97 + index)}${"z".repeat(240)}`,
    );
    await Promise.all(names.map((name) => fs.mkdir(path.join(root, name))));
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: Array.from(
          { length: 64 },
          (_, index) =>
            `${"*?".repeat(119)}${index.toString(36).padStart(2, "0")}`,
        ),
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const started = performance.now();
    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(performance.now() - started).toBeLessThan(2_000);
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: WORKSPACE_ROOT_KEY,
        detail: expect.stringContaining("global matching budget"),
      }),
    ]);
  });

  test("bounds a separated-wildcard segment nonmatch", async () => {
    const root = await harness.createRoot();
    await fs.mkdir(path.join(root, `${"a".repeat(120)}c`));
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [`${"*?".repeat(120)}b`],
      }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("completes a valid sixty-four-candidate workspace", async () => {
    const root = await harness.createRoot();
    const workspaces = Array.from(
      { length: 64 },
      (_, index) => `plugins/plugin-${index}`,
    );
    await Promise.all(
      workspaces.map(async (workspace, index) => {
        const plugin = path.join(root, workspace);
        await fs.mkdir(plugin, { recursive: true });
        await harness.writePlugin(plugin, `plugin-${index}`);
      }),
    );
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "workspace-root", private: true, workspaces }),
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toHaveLength(64);
    expect(result.diagnostics).toEqual([]);
  });

  test("rejects a workspace declaring sixty-five patterns", async () => {
    const root = await harness.createRoot("private-workspace-pattern-count");
    const plugin = path.join(root, "plugins", "plugin-0");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "plugin-0");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: Array.from(
          { length: 65 },
          (_, index) => `plugins/plugin-${index}`,
        ),
      }),
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
        displayPath: "private-workspace-pattern-count",
      }),
    ]);
  });

  test("accepts a 256-byte pattern and rejects a 257-byte pattern", async () => {
    const acceptedRoot = await harness.createRoot("workspace-pattern-bytes-ok");
    const acceptedName = "a".repeat(248);
    const acceptedPlugin = path.join(acceptedRoot, "plugins", acceptedName);
    await fs.mkdir(acceptedPlugin, { recursive: true });
    await harness.writePlugin(acceptedPlugin, "sized");
    await fs.writeFile(
      path.join(acceptedRoot, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [`plugins/${acceptedName}`],
      }),
    );
    const acceptedAdmission = await admitTrustedRoots([
      {
        rootKey: WORKSPACE_ROOT_KEY,
        kind: "current-project",
        path: acceptedRoot,
      },
    ]);

    const accepted = await discoverWorkspaceSourceCandidates(
      acceptedAdmission.roots,
    );

    expect(accepted.candidates.map(({ pluginId }) => pluginId)).toEqual([
      "sized",
    ]);
    expect(accepted.diagnostics).toEqual([]);

    const rejectedRoot = await harness.createRoot("workspace-pattern-bytes");
    await fs.writeFile(
      path.join(rejectedRoot, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [`plugins/${"a".repeat(249)}`],
      }),
    );
    const rejectedAdmission = await admitTrustedRoots([
      { rootKey: EXAMPLE_ROOT_KEY, kind: "explicit", path: rejectedRoot },
    ]);

    const rejected = await discoverWorkspaceSourceCandidates(
      rejectedAdmission.roots,
    );

    expect(rejected.candidates).toEqual([]);
    expect(rejected.diagnostics).toEqual([
      expect.objectContaining({
        code: "workspace-config-invalid",
        rootKey: EXAMPLE_ROOT_KEY,
        displayPath: "workspace-pattern-bytes",
      }),
    ]);
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

  test("rejects mixed indentation within a pnpm workspace package list", async () => {
    const root = await harness.createRoot("private-pnpm-mixed-indentation");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n   - 'plugins/*'\n  - 'extensions/*'\n",
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
        displayPath: "private-pnpm-mixed-indentation",
      }),
    ]);
  });

  test("supports consistently indented pnpm workspace package lists", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "included");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "included");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n   - 'plugins/*'\n   - '!plugins/excluded'\n",
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

  test("rejects an unquoted pnpm workspace pattern beginning with @", async () => {
    const root = await harness.createRoot("private-pnpm-at-prefix");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - @scope/*\n",
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
        displayPath: "private-pnpm-at-prefix",
      }),
    ]);
  });

  test("rejects an unquoted pnpm workspace pattern beginning with a backtick", async () => {
    const root = await harness.createRoot("private-pnpm-backtick-prefix");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - `plugins/*\n",
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
        displayPath: "private-pnpm-backtick-prefix",
      }),
    ]);
  });

  test("supports quoted pnpm workspace patterns beginning with reserved characters", async () => {
    const root = await harness.createRoot();
    const scoped = path.join(root, "@scope", "scoped");
    const backtick = path.join(root, "`plugins", "backtick");
    await fs.mkdir(scoped, { recursive: true });
    await fs.mkdir(backtick, { recursive: true });
    await harness.writePlugin(scoped, "scoped");
    await harness.writePlugin(backtick, "backtick");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - '@scope/*'\n  - \"`plugins/*\"\n",
    );
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates.map(({ pluginId }) => pluginId).sort()).toEqual([
      "backtick",
      "scoped",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  test("supports an inline comment after a double-quoted pnpm workspace pattern", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "included");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "included");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "plugins/*" # workspace plugins\n',
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

  test("rejects trailing tokens after a quoted pnpm workspace pattern", async () => {
    const root = await harness.createRoot("private-pnpm-quoted-trailing");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'plugins/*' 'extra'\n",
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
        displayPath: "private-pnpm-quoted-trailing",
      }),
    ]);
  });

  test("rejects trailing tokens after a double-quoted pnpm workspace pattern", async () => {
    const root = await harness.createRoot(
      "private-pnpm-double-quoted-trailing",
    );
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "plugins/*" extra\n',
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
        displayPath: "private-pnpm-double-quoted-trailing",
      }),
    ]);
  });

  test("rejects malformed YAML outside the pnpm packages block", async () => {
    const root = await harness.createRoot("private-pnpm-malformed-document");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "catalog: [\npackages:\n  - plugins/*\n",
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
        displayPath: "private-pnpm-malformed-document",
      }),
    ]);
  });

  test("rejects pnpm packages blocks without list items", async () => {
    const root = await harness.createRoot("private-pnpm-empty-packages");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n# no workspace entries\nother: true\n",
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
        displayPath: "private-pnpm-empty-packages",
      }),
    ]);
  });

  test("accepts duplicate packages keys with last-parse-wins semantics", async () => {
    const root = await harness.createRoot();
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

    expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
      "second",
    ]);
    const canonicalRoot = await fs.realpath(root);
    for (const candidate of result.candidates) {
      expect(candidate.canonicalRoot.startsWith(canonicalRoot + path.sep)).toBe(
        true,
      );
    }
    expect(
      result.diagnostics.filter(
        ({ code }) => code === "workspace-config-invalid",
      ),
    ).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("rejects an explicit-form duplicate pnpm packages key", async () => {
    const root = await harness.createRoot("private-pnpm-explicit-duplicate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - plugins/*\n? packages\n:\n  - extensions/*\n",
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
        displayPath: "private-pnpm-explicit-duplicate",
      }),
    ]);
  });

  test("rejects same-line explicit pnpm packages keys", async () => {
    for (const [name, explicitKey] of [
      ["same-line-comments", "? packages # workspace key\n:"],
      ["same-line-tagged", "? !!str packages\n:"],
    ] as const) {
      const root = await harness.createRoot(`private-pnpm-explicit-${name}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - plugins/*\n${explicitKey}\n  - extensions/*\n`,
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
          displayPath: `private-pnpm-explicit-${name}`,
        }),
      ]);
    }
  });

  test("rejects aliases used as top-level pnpm packages keys", async () => {
    for (const [name, keySource] of [
      ["explicit-alias", "? *workspace-key\n:"],
      ["implicit-alias", "*workspace-key:"],
    ] as const) {
      const root = await harness.createRoot(`private-pnpm-key-${name}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `workspace-key: &workspace-key packages\npackages:\n  - plugins/*\n${keySource}\n  - extensions/*\n`,
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
          displayPath: `private-pnpm-key-${name}`,
        }),
      ]);
    }
  });

  test("supports an alias used only as a pnpm workspace item value", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "included");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "included");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "workspace-pattern: &workspace-pattern plugins/*\npackages:\n  - *workspace-pattern\n",
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

  test("supports exactly one leading BOM in a pnpm workspace document", async () => {
    const root = await harness.createRoot();
    const plugin = path.join(root, "plugins", "included");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "included");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "\uFEFFpackages:\n  - plugins/*\n",
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

  test("rejects multiple or noninitial BOMs in a pnpm workspace document", async () => {
    for (const [name, source] of [
      ["multiple", "\uFEFF\uFEFFpackages:\n  - plugins/*\n"],
      ["noninitial", "# workspace\n\uFEFFpackages:\n  - plugins/*\n"],
    ] as const) {
      const root = await harness.createRoot(`private-pnpm-bom-${name}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), source);
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          code: "workspace-config-invalid",
          rootKey: WORKSPACE_ROOT_KEY,
          displayPath: `private-pnpm-bom-${name}`,
        }),
      ]);
    }
  });

  test("rejects a BOM embedded in a quoted pnpm workspace item", async () => {
    const root = await harness.createRoot("private-pnpm-embedded-bom");
    const plugin = path.join(root, `plugins\uFEFF`, "included");
    await fs.mkdir(plugin, { recursive: true });
    await harness.writePlugin(plugin, "included");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - "plugins\uFEFF/*"\n',
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
        displayPath: "private-pnpm-embedded-bom",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("rejects malformed UTF-8 in pnpm workspace and package configuration", async () => {
    for (const [name, fileName, prefix] of [
      ["pnpm", "pnpm-workspace.yaml", "packages:\n  - plugins/"],
      ["package", "package.json", '{"workspaces":["plugins/'],
    ] as const) {
      const root = await harness.createRoot(`private-${name}-invalid-utf8`);
      await fs.writeFile(
        path.join(root, fileName),
        Buffer.concat([Buffer.from(prefix), Buffer.from([0xff])]),
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates).toEqual([]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "workspace-config-invalid",
          rootKey: WORKSPACE_ROOT_KEY,
          displayPath: `private-${name}-invalid-utf8`,
        }),
      );
      if (name === "package")
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: "manifest-invalid",
            rootKey: WORKSPACE_ROOT_KEY,
            displayPath: "private-package-invalid-utf8",
          }),
        );
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        path.dirname(root),
      );
    }
  });

  test("does not normalize spaces inside a quoted pnpm key", async () => {
    const root = await harness.createRoot("private-pnpm-internal-key-spaces");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      '" packages " :\n  - plugins/*\n',
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
        displayPath: "private-pnpm-internal-key-spaces",
      }),
    ]);
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

  test("rejects comment-only pnpm workspace entries", async () => {
    const root = await harness.createRoot("private-pnpm-comment-only");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - # plugins/*\n",
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
        displayPath: "private-pnpm-comment-only",
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
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

  test("does not let generic workspace wildcards traverse dot directories", async () => {
    for (const [name, pattern] of [
      ["segment", "packages/*/*"],
      ["globstar", "packages/**"],
    ] as const) {
      const root = await harness.createRoot(`workspace-dot-${name}`);
      const hiddenPlugin = path.join(root, "packages", ".private", "hidden");
      const visiblePlugin = path.join(root, "packages", "public", "visible");
      await fs.mkdir(hiddenPlugin, { recursive: true });
      await fs.mkdir(visiblePlugin, { recursive: true });
      await harness.writePlugin(hiddenPlugin, "hidden");
      await harness.writePlugin(visiblePlugin, "visible");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          name: "workspace-root",
          private: true,
          workspaces: [pattern],
        }),
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
        "visible",
      ]);
      expect(result.diagnostics).toEqual([]);
    }
  });

  test("honors explicit dot wildcards and exclusions at nested segments", async () => {
    const root = await harness.createRoot();
    const included = path.join(root, "packages", ".public", "included");
    const excluded = path.join(root, "packages", ".private", "excluded");
    await fs.mkdir(included, { recursive: true });
    await fs.mkdir(excluded, { recursive: true });
    await harness.writePlugin(included, "included");
    await harness.writePlugin(excluded, "excluded");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: ["packages/.*/*", "!packages/.private/*"],
      }),
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

  test("counts shared candidates once while retaining every discovering root", async () => {
    const parent = await harness.createRoot("parent-project");
    const child = path.join(parent, "plugins");
    await fs.mkdir(child);
    await fs.writeFile(
      path.join(parent, "package.json"),
      JSON.stringify({
        name: "parent-project",
        private: true,
        workspaces: ["plugins/*"],
      }),
    );
    await fs.writeFile(
      path.join(child, "package.json"),
      JSON.stringify({
        name: "child-project",
        private: true,
        workspaces: ["*"],
      }),
    );
    for (let index = 0; index < 65; index += 1) {
      const pluginRoot = path.join(child, `plugin-${index}`);
      await fs.mkdir(pluginRoot);
      await harness.writePlugin(pluginRoot, `shared-${index}`);
    }
    const childKey = "c".repeat(32);
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: parent },
      { rootKey: childKey, kind: "current-project", path: child },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toHaveLength(65);
    for (const pluginId of Array.from(
      { length: 65 },
      (_, index) => `shared-${index}`,
    )) {
      expect(
        [
          ...sourceCandidateDiscoveringRootKeys(
            result.candidates.find(
              (candidate) => candidate.pluginId === pluginId,
            )!,
          ),
        ].sort(),
      ).toEqual([WORKSPACE_ROOT_KEY, childKey].sort());
    }
    expect(result.diagnostics).toEqual([]);
  });

  test("reports an omitted shared candidate to every discovering root", async () => {
    const parent = await harness.createRoot("parent-overflow-project");
    const child = path.join(parent, "z-child");
    const shared = path.join(child, "z-shared");
    await fs.mkdir(shared, { recursive: true });
    await harness.writePlugin(shared, "shared-overflow");
    await fs.writeFile(
      path.join(parent, "package.json"),
      JSON.stringify({
        name: "parent-project",
        private: true,
        workspaces: ["a-parent/*", "z-child/z-shared"],
      }),
    );
    await fs.writeFile(
      path.join(child, "package.json"),
      JSON.stringify({
        name: "child-project",
        private: true,
        workspaces: ["a-child/*", "z-shared"],
      }),
    );
    for (const [container, prefix] of [
      [path.join(parent, "a-parent"), "parent"],
      [path.join(child, "a-child"), "child"],
    ] as const) {
      await fs.mkdir(container);
      await Promise.all(
        Array.from({ length: 64 }, async (_, index) => {
          const pluginRoot = path.join(container, `plugin-${index}`);
          await fs.mkdir(pluginRoot);
          await harness.writePlugin(pluginRoot, `${prefix}-${index}`);
        }),
      );
    }
    const childKey = "c".repeat(32);
    const admission = await admitTrustedRoots([
      { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: parent },
      { rootKey: childKey, kind: "current-project", path: child },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toHaveLength(128);
    expect(
      result.candidates.some(({ pluginId }) => pluginId === "shared-overflow"),
    ).toBe(false);
    expect(
      result.diagnostics
        .filter(({ code }) => code === "candidate-limit")
        .map(({ rootKey }) => rootKey)
        .sort(),
    ).toEqual([WORKSPACE_ROOT_KEY, childKey].sort());
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
