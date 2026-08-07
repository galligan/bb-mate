import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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
  return pluginRoot;
}

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
      bb: { name: "Linear", server: "./server.ts" },
    });
    await fs.mkdir(path.join(pluginRoot, "dist"));
    await fs.writeFile(
      path.join(pluginRoot, "dist", "server.meta.json"),
      JSON.stringify({
        sdkVersion: "0.4.1",
        pluginId: "linear",
        pluginVersion: "0.1.0",
        builtWith: { bbVersion: "0.35.1" },
      }),
    );

    const inspection = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => null,
      runBb: async (args) => {
        if (args[0] === "--version") return "0.35.1";
        if (args[0] === "connect") {
          return JSON.stringify({ url: "https://example.getbb.app" });
        }
        if (args[1] === "source") {
          return JSON.stringify({ resolved: `path:${pluginRoot}` });
        }
        return JSON.stringify({
          plugins: [{ id: "linear", rootDir: pluginRoot, status: "running" }],
        });
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
        server: "./server.ts",
        app: "./app.tsx",
      },
    });

    const inspection = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
      resolveHarness: async () => "0.4.1",
      runBb: async (args) => {
        if (args[0] === "--version") return "0.35.1";
        if (args[0] === "connect") {
          return JSON.stringify({ url: "https://example.getbb.app" });
        }
        if (args[1] === "source") {
          return JSON.stringify({ resolved: `path:${pluginRoot}` });
        }
        return JSON.stringify({
          plugins: [{ id: "notes", rootDir: pluginRoot, status: "running" }],
        });
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
      bb: { server: "./server.ts" },
    });
    await writePlugin(workspaceRoot, "two", {
      name: "bb-plugin-two",
      bb: { app: "./app.tsx" },
    });

    const inspection = await inspectPlugin({ workspaceRoot });

    expect(inspection.state).toBe("ambiguous");
    expect(inspection.candidates).toEqual(["plugins/one", "plugins/two"]);
  });
});
