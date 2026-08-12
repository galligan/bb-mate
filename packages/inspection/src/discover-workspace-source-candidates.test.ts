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

  test("bounds aggregate workspace matching work across directory entries", async () => {
    const root = await harness.createRoot("private-workspace-match-limit");
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        fs.mkdir(path.join(root, `${"a".repeat(40)}-${index}`)),
      ),
    );
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: Array.from(
          { length: 256 },
          (_, index) => `${"*?".repeat(20)}z${index}`,
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
        displayPath: "private-workspace-match-limit",
        detail: expect.stringContaining("matching"),
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("charges globstar memo states against the aggregate matching budget", async () => {
    const root = await harness.createRoot("private-workspace-globstar-limit");
    let directory = root;
    for (let depth = 0; depth < 64; depth += 1) {
      directory = path.join(directory, `level-${depth}`);
      await fs.mkdir(directory);
    }
    const globstarChain = Array.from({ length: 31 }, () => "**").join("/");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [
          "**",
          ...Array.from({ length: 255 }, () => `!${globstarChain}/z`),
        ],
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
        displayPath: "private-workspace-globstar-limit",
        detail: expect.stringContaining("matching"),
      }),
    ]);
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("charges triangular globstar closure visits against the matching budget", async () => {
    const root = await harness.createRoot("private-workspace-closure-limit");
    let directory = root;
    for (let depth = 0; depth < 31; depth += 1) {
      directory = path.join(directory, `level-${depth}`);
      await fs.mkdir(directory);
    }
    await Promise.all(
      Array.from({ length: 600 }, (_, index) =>
        fs.symlink("missing", path.join(directory, `link-${index}`)),
      ),
    );
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: [
          `${Array.from({ length: 31 }, () => "**").join("/")}/target`,
        ],
      }),
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
        displayPath: "private-workspace-closure-limit",
        detail: expect.stringContaining("matching"),
      }),
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain(
      path.dirname(root),
    );
  });

  test("completes a valid sixty-five-candidate workspace below the matching budget", async () => {
    const root = await harness.createRoot();
    const workspaces = Array.from(
      { length: 65 },
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

    expect(result.candidates).toHaveLength(65);
    expect(result.diagnostics).toEqual([]);
  });

  test("marks a later unscanned root partial when the global matching budget is exhausted", async () => {
    const expensiveRoot = await harness.createRoot("00-expensive");
    const validRoot = path.join(path.dirname(expensiveRoot), "zz-valid");
    await fs.mkdir(validRoot);
    await harness.writePlugin(validRoot, "valid");
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        fs.mkdir(path.join(expensiveRoot, `${"a".repeat(40)}-${index}`)),
      ),
    );
    await fs.writeFile(
      path.join(expensiveRoot, "package.json"),
      JSON.stringify({
        name: "workspace-root",
        private: true,
        workspaces: Array.from(
          { length: 256 },
          (_, index) => `${"*?".repeat(20)}z${index}`,
        ),
      }),
    );
    const admission = await admitTrustedRoots([
      {
        rootKey: WORKSPACE_ROOT_KEY,
        kind: "current-project",
        path: expensiveRoot,
      },
      { rootKey: EXAMPLE_ROOT_KEY, kind: "explicit", path: validRoot },
    ]);

    const result = await discoverWorkspaceSourceCandidates(admission.roots);

    expect(result.candidates).toEqual([]);
    expect(
      result.diagnostics.map(({ code, rootKey }) => ({ code, rootKey })),
    ).toEqual([
      { code: "workspace-config-invalid", rootKey: WORKSPACE_ROOT_KEY },
      { code: "workspace-config-invalid", rootKey: EXAMPLE_ROOT_KEY },
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

  test("rejects an adjacent duplicate pnpm packages key", async () => {
    const root = await harness.createRoot("private-pnpm-adjacent-duplicate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - 'plugins/*'\npackages:\n  - 'extensions/*'\n",
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
        displayPath: "private-pnpm-adjacent-duplicate",
      }),
    ]);
  });

  test("rejects a semantically duplicate quoted pnpm packages key", async () => {
    const root = await harness.createRoot("private-pnpm-quoted-duplicate");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      'packages:\n  - plugins/*\n"packages":\n  - extensions/*\n',
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
        displayPath: "private-pnpm-quoted-duplicate",
      }),
    ]);
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

  test("rejects multiline explicit and tagged pnpm packages keys", async () => {
    for (const [name, explicitKey] of [
      ["multiline", "?\n  packages\n:"],
      [
        "multiline-comments",
        "? # explicit key\n  packages # workspace key\n: # value",
      ],
      ["same-line-comments", "? packages # workspace key\n:"],
      ["same-line-tagged", "? !!str packages\n:"],
      ["multiline-tagged", "?\n  !!str packages\n:"],
      ["multiline-quoted", "?\n  'packages' # workspace key\n:"],
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

  test("rejects anchors and aliases used as top-level pnpm packages keys", async () => {
    for (const [name, keySource] of [
      ["explicit-alias", "? *workspace-key\n:"],
      ["multiline-explicit-alias", "?\n  *workspace-key\n:"],
      ["implicit-alias", "*workspace-key:"],
      ["anchored", "&workspace-key packages:"],
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

  test("rejects an explicit pnpm packages key split after a tag property", async () => {
    const root = await harness.createRoot("private-pnpm-explicit-tag-property");
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "pnpm-root", private: true }),
    );
    await fs.writeFile(
      path.join(root, "pnpm-workspace.yaml"),
      "packages:\n  - plugins/*\n? !!str\n  packages\n:\n  - extensions/*\n",
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
        displayPath: "private-pnpm-explicit-tag-property",
      }),
    ]);
  });

  test("rejects block-scalar explicit pnpm packages keys", async () => {
    for (const [name, explicitKey] of [
      ["literal-strip", "? |-\n  packages\n:"],
      ["folded-keep", "? >+\n  packages\n:"],
      ["multiline-literal", "?\n  |+\n  packages\n:"],
    ] as const) {
      const root = await harness.createRoot(
        `private-pnpm-explicit-block-${name}`,
      );
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
          displayPath: `private-pnpm-explicit-block-${name}`,
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

  test("rejects tagged semantic duplicate pnpm packages keys", async () => {
    for (const [name, taggedKey] of [
      ["non-specific-tag", "! packages"],
      ["local-tag", "!workspace packages"],
      ["standard-tag", "!!str packages"],
      ["verbatim-tag", "!<tag:yaml.org,2002:str> packages"],
    ] as const) {
      const root = await harness.createRoot(`private-pnpm-${name}`);
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - plugins/*\n${taggedKey}:\n  - extensions/*\n`,
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

  test("supports plain and quoted pnpm packages keys", async () => {
    for (const [name, packagesKey] of [
      ["plain", "packages"],
      ["single-quoted", "'packages'"],
      ["double-quoted", '"packages"'],
    ] as const) {
      const root = await harness.createRoot(`pnpm-key-${name}`);
      const plugin = path.join(root, "plugins", "included");
      await fs.mkdir(plugin, { recursive: true });
      await harness.writePlugin(plugin, "included");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `${packagesKey}:\n  - plugins/*\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
        "included",
      ]);
      expect(result.diagnostics).toEqual([]);
    }
  });

  test("supports colons in pnpm packages key comments", async () => {
    for (const [name, keyLine] of [
      ["plain", "packages: # workspace: plugins"],
      ["single-quoted", "'packages': # workspace: plugins"],
      ["double-quoted", '"packages": # workspace: plugins'],
    ] as const) {
      const root = await harness.createRoot(`pnpm-comment-colon-${name}`);
      const plugin = path.join(root, "plugins", "included");
      await fs.mkdir(plugin, { recursive: true });
      await harness.writePlugin(plugin, "included");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `${keyLine}\n  - "plugins/*" # target: plugins\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
        "included",
      ]);
      expect(result.diagnostics).toEqual([]);
    }
  });

  test("does not treat embedded plain-key colons as mapping delimiters", async () => {
    for (const [name, metadataLine] of [
      ["plain", "packages:metadata: true"],
      ["single-quoted", "'packages:metadata': true"],
      ["double-quoted", '"packages:metadata": true'],
    ] as const) {
      const root = await harness.createRoot(`pnpm-embedded-colon-${name}`);
      const plugin = path.join(root, "plugins", "included");
      await fs.mkdir(plugin, { recursive: true });
      await harness.writePlugin(plugin, "included");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `packages:\n  - plugins/*\n${metadataLine}\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
        "included",
      ]);
      expect(result.diagnostics).toEqual([]);
    }
  });

  test("supports pnpm packages keys separated from their mapping colon", async () => {
    for (const [name, keyLine] of [
      ["plain", "packages :"],
      ["single-quoted", "'packages' :"],
      ["double-quoted", '"packages" :'],
    ] as const) {
      const root = await harness.createRoot(`pnpm-spaced-colon-${name}`);
      const plugin = path.join(root, "plugins", "included");
      await fs.mkdir(plugin, { recursive: true });
      await harness.writePlugin(plugin, "included");
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "pnpm-root", private: true }),
      );
      await fs.writeFile(
        path.join(root, "pnpm-workspace.yaml"),
        `${keyLine}\n  - plugins/*\n`,
      );
      const admission = await admitTrustedRoots([
        { rootKey: WORKSPACE_ROOT_KEY, kind: "current-project", path: root },
      ]);

      const result = await discoverWorkspaceSourceCandidates(admission.roots);

      expect(result.candidates.map(({ pluginId }) => pluginId)).toEqual([
        "included",
      ]);
      expect(result.diagnostics).toEqual([]);
    }
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
