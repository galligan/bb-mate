import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandResult, HarnessResolution } from "@bb-mate/inspection";
import { inspectPlugin } from "../plugin-inspection-server";

const temporaryRoots: string[] = [];

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
});
