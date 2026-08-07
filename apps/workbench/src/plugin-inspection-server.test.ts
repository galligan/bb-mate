import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandResult, HarnessResolution } from "@bb-mate/inspection";
import {
  inspectPlugin,
  inspectPluginSession,
} from "../plugin-inspection-server";

const temporaryRoots: string[] = [];
const bbMateRoot = path.resolve(import.meta.dir, "../../..");

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-inspection-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "plugins"), { recursive: true });
  return root;
}

async function writePlugin(
  workspaceRoot: string,
  name: string,
  packageJson: Record<string, unknown>,
): Promise<string> {
  const pluginRoot = path.join(workspaceRoot, "plugins", name);
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  const bb = packageJson.bb as Record<string, unknown> | undefined;
  for (const entry of [bb?.server, bb?.app]) {
    if (typeof entry !== "string" || !entry.startsWith("./")) continue;
    const entryPath = path.resolve(pluginRoot, entry);
    if (!entryPath.startsWith(`${pluginRoot}${path.sep}`)) continue;
    await fs.mkdir(path.dirname(entryPath), { recursive: true });
    await fs.writeFile(entryPath, "export {};\n");
  }
  return pluginRoot;
}

function command(stdout: string): CommandResult {
  return { stdout, stderr: "", exitCode: 0 };
}

const unavailableHarness: HarnessResolution = {
  state: "package-not-declared",
  version: null,
  detail: "The selected plugin does not declare @bb/plugin-sdk.",
};

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("plugin inspection", () => {
  test("discovers one headless workspace plugin without executing it", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(workspaceRoot, "linear", {
      name: "bb-plugin-linear",
      version: "0.1.0",
      engines: { bb: ">=0.35", bbPluginSdk: "^0.4.1" },
      bb: {
        name: "Linear",
        description: "Linear test plugin",
        branding: { icon: "Check" },
        server: "./server.ts",
      },
    });
    await fs.mkdir(path.join(pluginRoot, "dist"));
    await fs.writeFile(
      path.join(pluginRoot, "dist", "server.meta.json"),
      JSON.stringify({
        artifactFormatVersion: 1,
        sdkMajor: 0,
        sdkVersion: "0.4.1",
        pluginId: "linear",
        pluginVersion: "0.1.0",
        builtWith: {
          bbVersion: "0.35.1",
          pluginSdkVersion: "0.4.1",
        },
      }),
    );

    const inspection = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => unavailableHarness,
      runBb: async (args) => {
        if (args[0] === "--version") return command("0.35.1");
        if (args[0] === "connect") {
          return command(
            JSON.stringify(
              args[1] === "shares"
                ? {
                    host: { id: "host_test", name: "test", isServer: true },
                    shares: [],
                  }
                : {
                    state: "connected",
                    paired: true,
                    url: "https://example.getbb.app",
                    shares: [],
                  },
            ),
          );
        }
        if (args[1] === "source") {
          return command(
            JSON.stringify({
              requested: `path:${pluginRoot}`,
              resolved: `path:${pluginRoot}`,
            }),
          );
        }
        return command(
          JSON.stringify({
            plugins: [
              {
                id: "linear",
                rootDir: pluginRoot,
                source: `path:${pluginRoot}`,
                status: "running",
              },
            ],
          }),
        );
      },
    });

    expect(inspection.state).toBe("ready");
    expect(inspection.target?.displayPath).toBe("plugins/linear");
    expect(inspection.target?.build.server?.sdkVersion).toBe("0.4.1");
    expect(inspection.modes.harness.available).toBe(false);
    expect(inspection.modes.live.available).toBe(false);
    expect(inspection.modes.live.status).toBe("running");
  });

  test("reports official harness and native live availability for an app plugin", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePlugin(workspaceRoot, "notes", {
      name: "bb-plugin-notes",
      version: "1.2.3",
      bb: {
        name: "Notes",
        description: "Notes test plugin",
        branding: { icon: "Notebook" },
        server: "./server.ts",
        app: "./app.tsx",
      },
    });

    const inspection = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
      resolveHarness: async () => ({
        state: "available",
        version: "0.4.1",
        detail: "The official selected-plugin testing subpaths resolved.",
      }),
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
      runBb: async (args) => {
        if (args[0] === "--version") return command("0.35.1");
        if (args[0] === "connect") {
          return command(
            JSON.stringify(
              args[1] === "shares"
                ? {
                    host: { id: "host_test", name: "test", isServer: true },
                    shares: [],
                  }
                : {
                    state: "connected",
                    paired: true,
                    url: "https://example.getbb.app",
                    shares: [],
                  },
            ),
          );
        }
        if (args[1] === "source") {
          return command(
            JSON.stringify({
              requested: `path:${pluginRoot}`,
              resolved: `path:${pluginRoot}`,
            }),
          );
        }
        return command(
          JSON.stringify({
            plugins: [
              {
                id: "notes",
                rootDir: pluginRoot,
                source: `path:${pluginRoot}`,
                status: "running",
                enabled: true,
                app: {
                  hasApp: true,
                  bundle: {
                    compatible: true,
                    sdkMajor: 0,
                    sdkVersion: "0.4.1",
                  },
                },
              },
            ],
          }),
        );
      },
    });

    expect(inspection.modes.harness).toMatchObject({
      available: true,
      sdkVersion: "0.4.1",
    });
    expect(inspection.modes.live).toMatchObject({
      available: true,
      pluginId: "notes",
      status: "running",
      sourceKind: "path",
      url: "https://example.getbb.app",
    });
  });

  test("requires an explicit target when discovery is ambiguous", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "one", {
      name: "bb-plugin-one",
      version: "1.0.0",
      bb: {
        name: "One",
        description: "One test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });
    await writePlugin(workspaceRoot, "two", {
      name: "bb-plugin-two",
      version: "1.0.0",
      bb: {
        name: "Two",
        description: "Two test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
        app: "./app.tsx",
      },
    });

    const inspection = await inspectPlugin({ workspaceRoot });

    expect(inspection.state).toBe("ambiguous");
    expect(inspection.candidates).toEqual(["plugins/one", "plugins/two"]);
  });

  test("selects only a server-discovered opaque candidate key", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "one", {
      name: "bb-plugin-one",
      version: "1.0.0",
      bb: {
        name: "One",
        description: "One test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });
    await writePlugin(workspaceRoot, "two", {
      name: "bb-plugin-two",
      version: "1.0.0",
      bb: {
        name: "Two",
        description: "Two test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });
    const session = await inspectPluginSession({
      workspaceRoot,
      selectedKey: "two",
      resolveHarness: async () => unavailableHarness,
      runBb: async (args) =>
        args[0] === "--version"
          ? command("0.35.1")
          : { stdout: "", stderr: "unavailable", exitCode: 1 },
    });

    expect(session.workspace).toMatchObject({
      label: path.basename(workspaceRoot),
      selectedKey: "two",
      selectionError: null,
      candidates: [
        { key: "one", displayPath: "plugins/one" },
        { key: "two", displayPath: "plugins/two" },
      ],
    });
    expect(session.inspection.target?.displayPath).toBe("plugins/two");
    expect(session.inspection.target?.rootPath).toBe("plugins/two");
    expect(session.handoffs.checkCommand).toBe(
      "bun run bb-mate check plugins/two",
    );
    expect(JSON.stringify(session)).not.toContain(workspaceRoot);
  });

  test("recovers stale and path-like selections using only allowlisted candidates", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "one", {
      name: "bb-plugin-one",
      version: "1.0.0",
      bb: {
        name: "One",
        description: "One test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });

    for (const selectedKey of ["../one", "/tmp/one", "plugins/one"]) {
      const session = await inspectPluginSession({
        workspaceRoot,
        selectedKey,
        runBb: async () => ({
          stdout: "",
          stderr: "unavailable",
          exitCode: 1,
        }),
      });

      expect(session.workspace.selectedKey).toBe("one");
      expect(session.workspace.selectionError).toContain("unavailable");
      expect(session.inspection.target?.displayPath).toBe("plugins/one");
      expect(session.workspace.selectionError).not.toContain(selectedKey);
    }
  });

  test("returns discovery when a stale selection has no unique fallback", async () => {
    const workspaceRoot = await createWorkspace();
    for (const name of ["one", "two"]) {
      await writePlugin(workspaceRoot, name, {
        name: `bb-plugin-${name}`,
        version: "1.0.0",
        bb: {
          name,
          description: `${name} test plugin`,
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      });
    }

    const session = await inspectPluginSession({
      workspaceRoot,
      selectedKey: "removed",
    });

    expect(session.workspace.selectedKey).toBeNull();
    expect(session.workspace.selectionError).toContain("unavailable");
    expect(session.workspace.candidates).toHaveLength(2);
    expect(session.handoffs.checkCommand).toBeNull();
  });

  test("withholds cross-workspace commands for an explicit standalone plugin", async () => {
    const workspaceRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-standalone-"),
    );
    temporaryRoots.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-standalone",
        version: "1.0.0",
        bb: {
          name: "Standalone",
          description: "Standalone test plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    await fs.writeFile(path.join(workspaceRoot, "server.ts"), "export {};\n");

    const session = await inspectPluginSession({
      workspaceRoot,
      targetPath: workspaceRoot,
      commandWorkspaceRoot: bbMateRoot,
      runBb: async () => ({ stdout: "", stderr: "unavailable", exitCode: 1 }),
    });

    expect(session.workspace.selectedKey).toBe("selected-plugin");
    expect(session.workspace.selectionError).toBeNull();
    expect(session.handoffs).toEqual({
      launchCommand: null,
      checkCommand: null,
      liveCommand: null,
      detail:
        "Copyable handoffs are unavailable because the inspected workspace is outside the BB Mate command workspace.",
    });
    expect(JSON.stringify(session)).not.toContain(workspaceRoot);
  });

  test("keeps explicit candidate keys unique when a plugin uses the reserved-looking name", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "selected-plugin", {
      name: "bb-plugin-selected",
      version: "1.0.0",
      bb: {
        name: "Selected",
        description: "Discovered plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });
    const explicitRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-explicit-plugin-"),
    );
    temporaryRoots.push(explicitRoot);
    await fs.writeFile(
      path.join(explicitRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-explicit",
        version: "1.0.0",
        bb: {
          name: "Explicit",
          description: "Explicit plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    await fs.writeFile(path.join(explicitRoot, "server.ts"), "export {};\n");

    const session = await inspectPluginSession({
      workspaceRoot,
      targetPath: explicitRoot,
      runBb: async () => ({ stdout: "", stderr: "unavailable", exitCode: 1 }),
    });

    expect(session.workspace.candidates.map(({ key }) => key)).toEqual([
      "selected-plugin",
      "selected-plugin-2",
    ]);
    expect(session.workspace.selectedKey).toBe("selected-plugin-2");
  });

  test("shell-quotes server-trusted candidate paths in terminal handoffs", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "my plugin's", {
      name: "bb-plugin-special",
      version: "1.0.0",
      bb: {
        name: "Special",
        description: "Shell quoting test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });

    const session = await inspectPluginSession({
      workspaceRoot,
      selectedKey: "my plugin's",
      runBb: async () => ({ stdout: "", stderr: "unavailable", exitCode: 1 }),
    });

    expect(session.handoffs.checkCommand).toBe(
      `bun run bb-mate check 'plugins/my plugin'"'"'s'`,
    );
  });

  test("redacts an explicit missing target even when inspection has no target", async () => {
    const workspaceRoot = await createWorkspace();
    const missingRoot = path.join(os.tmpdir(), "bb-mate-private", "missing");

    const session = await inspectPluginSession({
      workspaceRoot,
      targetPath: missingRoot,
    });
    const json = JSON.stringify(session);

    expect(session.inspection.target).toBeNull();
    expect(json).not.toContain(missingRoot);
    expect(json).not.toContain(workspaceRoot);
  });

  test("redacts real paths behind a symlinked plugin and path provenance", async () => {
    const workspaceRoot = await createWorkspace();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-mate-external-plugin-"),
    );
    temporaryRoots.push(externalRoot);
    await fs.writeFile(
      path.join(externalRoot, "package.json"),
      JSON.stringify({
        name: "bb-plugin-linked",
        version: "1.0.0",
        bb: {
          name: "Linked",
          description: "Linked test plugin",
          branding: { icon: "Puzzle" },
          server: "./server.ts",
        },
      }),
    );
    await fs.writeFile(path.join(externalRoot, "server.ts"), "export {};\n");
    const linkedRoot = path.join(workspaceRoot, "plugins", "linked");
    await fs.symlink(externalRoot, linkedRoot);

    const session = await inspectPluginSession({
      workspaceRoot,
      selectedKey: "linked",
      runBb: async (args) => {
        if (args[0] === "--version") return command("0.35.1");
        if (args[1] === "list") {
          return command(
            JSON.stringify({
              plugins: [
                {
                  id: "linked",
                  rootDir: externalRoot,
                  source: `path:${externalRoot}`,
                  status: "running",
                },
              ],
            }),
          );
        }
        if (args[1] === "source") {
          return command(
            JSON.stringify({
              requested: `path:${linkedRoot}`,
              resolved: `path:${externalRoot}`,
            }),
          );
        }
        return { stdout: "", stderr: "unavailable", exitCode: 1 };
      },
    });
    const json = JSON.stringify(session);

    expect(session.inspection.target?.rootPath).toBe("plugins/linked");
    expect(session.inspection.provenance).toMatchObject({
      requested: "path:plugins/linked",
      resolved: "path:plugins/linked",
    });
    expect(json).not.toContain(externalRoot);
    expect(json).not.toContain(linkedRoot);
    expect(json).not.toContain(workspaceRoot);
  });

  test("redacts unrelated absolute paths in native diagnostics", async () => {
    const workspaceRoot = await createWorkspace();
    await writePlugin(workspaceRoot, "one", {
      name: "bb-plugin-one",
      version: "1.0.0",
      bb: {
        name: "One",
        description: "One test plugin",
        branding: { icon: "Puzzle" },
        server: "./server.ts",
      },
    });

    const session = await inspectPluginSession({
      workspaceRoot,
      runBb: async () => ({
        stdout: "",
        stderr: String.raw`failed while reading path:/Users/private/secret.json, [/Volumes/private/file], ENOENT:/private/adjacent.json, file:///Users/private/local.ts, and \\server\share\secret.ts; https://example.test/stays`,
        exitCode: 1,
      }),
    });

    expect(JSON.stringify(session)).not.toContain("/Users/private");
    expect(JSON.stringify(session)).not.toContain("/Volumes/private");
    expect(JSON.stringify(session)).not.toContain("/private/adjacent");
    expect(JSON.stringify(session)).not.toContain("/Users/private/local");
    expect(JSON.stringify(session)).not.toContain("server\\share");
    expect(JSON.stringify(session)).toContain("https://example.test/stays");
    expect(JSON.stringify(session)).toContain("[redacted-path]");
  });
});
