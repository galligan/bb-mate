import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  inspectPlugin,
  type CommandResult,
  type HarnessResolution,
} from "./index.ts";

const temporaryRoots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-contract-"));
  temporaryRoots.push(root);
  await fs.mkdir(path.join(root, "plugins"), { recursive: true });
  return root;
}

function validPackage(
  slug: string,
  bb: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: `bb-plugin-${slug}`,
    version: "1.0.0",
    engines: { bb: ">=0.35", bbPluginSdk: "^0.4.1" },
    bb: {
      name: slug,
      description: `${slug} test plugin`,
      branding: { icon: "Puzzle" },
      server: "./server.ts",
      ...bb,
    },
  };
}

async function writePackage(
  workspaceRoot: string,
  slug: string,
  value: unknown,
): Promise<string> {
  const pluginRoot = path.join(workspaceRoot, "plugins", slug);
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    `${JSON.stringify(value, null, 2)}\n`,
  );
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const bb = (value as { bb?: Record<string, unknown> }).bb;
    for (const entry of [bb?.server, bb?.app]) {
      if (typeof entry !== "string" || path.isAbsolute(entry)) continue;
      const entryPath = path.resolve(pluginRoot, entry);
      if (!entryPath.startsWith(`${pluginRoot}${path.sep}`)) continue;
      await fs.mkdir(path.dirname(entryPath), { recursive: true });
      await fs.writeFile(entryPath, "export {};\n");
    }
  }
  return pluginRoot;
}

function command(
  stdout: string,
  options: Partial<CommandResult> = {},
): CommandResult {
  return { stdout, stderr: "", exitCode: 0, ...options };
}

const harnessAvailable: HarnessResolution = {
  state: "available",
  version: "0.4.1",
  detail: "Official testing subpaths resolved.",
};

function nativeRunner(
  pluginRoot: string,
  plugin: Record<string, unknown> | null = null,
) {
  return async (args: readonly string[]): Promise<CommandResult> => {
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
        plugins: plugin
          ? [
              {
                id: "ui",
                rootDir: pluginRoot,
                source: `path:${pluginRoot}`,
                ...plugin,
              },
            ]
          : [],
      }),
    );
  };
}

async function writeMetadata(
  pluginRoot: string,
  kind: "server" | "app",
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await fs.mkdir(path.join(pluginRoot, "dist"), { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "dist", `${kind}.meta.json`),
    JSON.stringify({
      artifactFormatVersion: 1,
      sdkMajor: 0,
      sdkVersion: "0.4.1",
      pluginId: "ui",
      pluginVersion: "1.0.0",
      builtWith: {
        bbVersion: "0.35.1",
        pluginSdkVersion: "0.4.1",
      },
      ...overrides,
    }),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("public manifest contract", () => {
  test("surfaces malformed package JSON found by default discovery", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = path.join(workspaceRoot, "plugins", "broken");
    await fs.mkdir(pluginRoot);
    await fs.writeFile(path.join(pluginRoot, "package.json"), "{not-json");

    const report = await inspectPlugin({ workspaceRoot });

    expect(report).toMatchObject({ schemaVersion: 1, state: "error" });
    expect(report.checks[0]).toMatchObject({
      id: "manifest.read",
      status: "fail",
      nextAction: expect.any(String),
    });
  });

  test.each([
    ["null root", null],
    ["array root", []],
    [
      "app-only",
      validPackage("invalid", { server: undefined, app: "./app.tsx" }),
    ],
    ["missing name", { ...validPackage("invalid"), name: undefined }],
    ["missing branding", validPackage("invalid", { branding: undefined })],
    ["underivable package name", { ...validPackage("invalid"), name: "@@@" }],
  ])("returns a versioned failure for %s", async (_label, manifest) => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(workspaceRoot, "invalid", manifest);

    const report = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
    });

    expect(report).toMatchObject({ schemaVersion: 1, state: "error" });
    expect(report.checks[0]).toMatchObject({
      id: "manifest.schema",
      status: "fail",
      nextAction: expect.any(String),
    });
  });

  test("rejects missing and escaping server entrypoints", async () => {
    const workspaceRoot = await createWorkspace();
    const missingRoot = await writePackage(
      workspaceRoot,
      "missing",
      validPackage("missing"),
    );
    await fs.rm(path.join(missingRoot, "server.ts"));
    const escapingRoot = await writePackage(
      workspaceRoot,
      "escaping",
      validPackage("escaping", { server: "../outside.ts" }),
    );

    const missing = await inspectPlugin({
      workspaceRoot,
      targetPath: missingRoot,
    });
    const escaping = await inspectPlugin({
      workspaceRoot,
      targetPath: escapingRoot,
    });

    expect(missing.checks[0]?.detail).toContain("missing");
    expect(escaping.checks[0]?.detail).toContain("escapes");
  });

  test("accepts native contained-relative paths and validates skill roots", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "relative",
      validPackage("relative", {
        server: "src/server.ts",
        skills: ["skills/*"],
        branding: { logo: { light: "assets/logo.svg" } },
      }),
    );
    await fs.mkdir(path.join(pluginRoot, "assets"), { recursive: true });
    await fs.writeFile(path.join(pluginRoot, "assets", "logo.svg"), "<svg />");

    const valid = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
      runBb: nativeRunner(pluginRoot),
    });
    const escapingRoot = await writePackage(
      workspaceRoot,
      "skill-escape",
      validPackage("skill-escape", { skills: ["../outside"] }),
    );
    const escaping = await inspectPlugin({
      workspaceRoot,
      targetPath: escapingRoot,
    });

    expect(valid.state).toBe("ready");
    expect(escaping.checks[0]?.detail).toContain("bb.skills escapes");
  });

  test("normalizes branding paths and parses plugin-owned compact SVG", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "icon",
      validPackage("icon", {
        branding: { icon: "  ./assets/icon.svg  " },
      }),
    );
    await fs.mkdir(path.join(pluginRoot, "assets"), { recursive: true });
    await fs.writeFile(
      path.join(pluginRoot, "assets", "icon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" />',
    );

    const valid = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
      runBb: nativeRunner(pluginRoot),
    });
    await fs.writeFile(path.join(pluginRoot, "assets", "icon.svg"), "not svg");
    const malformed = await inspectPlugin({
      workspaceRoot,
      targetPath: pluginRoot,
    });

    expect(valid.state).toBe("ready");
    expect(malformed).toMatchObject({ schemaVersion: 1, state: "error" });
    expect(malformed.checks[0]?.detail).toContain("not valid SVG XML");
  });
});

describe("native artifact contract", () => {
  test.each([
    ["format", { artifactFormatVersion: 2 }],
    ["SDK major", { sdkMajor: 1 }],
    ["plugin identity", { pluginId: "somebody-else" }],
    [
      "builtWith SDK",
      { builtWith: { bbVersion: "0.35.1", pluginSdkVersion: "0.4.0" } },
    ],
  ])("rejects inconsistent %s metadata", async (_label, overrides) => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui"),
    );
    await writeMetadata(pluginRoot, "server", overrides);

    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot),
    });

    expect(
      report.checks.find((check) => check.id === "artifact.server"),
    ).toMatchObject({ status: "fail", nextAction: expect.any(String) });
  });

  test("rejects server and app metadata built with different SDKs", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui", { app: "./app.tsx" }),
    );
    await writeMetadata(pluginRoot, "server");
    await writeMetadata(pluginRoot, "app", {
      sdkVersion: "0.5.0",
      builtWith: { bbVersion: "0.35.1", pluginSdkVersion: "0.5.0" },
    });

    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => harnessAvailable,
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
      runBb: nativeRunner(pluginRoot),
    });

    expect(
      report.checks.find((check) => check.id === "artifact.consistency"),
    ).toMatchObject({ status: "fail", nextAction: expect.any(String) });
  });
});

describe("runtime and evidence claims", () => {
  test.each([
    "disabled",
    "error",
    "incompatible",
    "missing",
    "degraded",
    "needs-configuration",
  ])("does not call a %s plugin Live-ready", async (status) => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui", { app: "./app.tsx" }),
    );

    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => harnessAvailable,
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
      runBb: nativeRunner(pluginRoot, {
        status,
        enabled: status !== "disabled",
        app: {
          hasApp: true,
          bundle: { compatible: true, sdkMajor: 0, sdkVersion: "0.4.1" },
        },
      }),
    });

    expect(report.modes.live).toMatchObject({
      available: false,
      pluginId: "ui",
      status,
      url: null,
    });
    expect(
      report.checks.find((check) => check.id === "mode.live"),
    ).toMatchObject({ status: "unavailable", nextAction: expect.any(String) });
  });

  test.each([
    ["missing bundle", null],
    [
      "incompatible bundle",
      { compatible: false, sdkMajor: 1, sdkVersion: "1.0.0" },
    ],
  ])("requires a compatible native app %s", async (_label, bundle) => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui", { app: "./app.tsx" }),
    );
    const report = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => harnessAvailable,
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
      runBb: nativeRunner(pluginRoot, {
        status: "running",
        enabled: true,
        app: { hasApp: true, bundle },
      }),
    });

    expect(report.modes.live.available).toBe(false);
    expect(report.modes.live.url).toBeNull();
  });

  test("preserves bounded native stdout when successful JSON is malformed", async () => {
    const workspaceRoot = await createWorkspace();
    await writePackage(workspaceRoot, "ui", validPackage("ui"));
    const report = await inspectPlugin({
      workspaceRoot,
      runBb: async (args) =>
        args[0] === "--version" ? command("0.35.1") : command("not-json"),
    });

    expect(
      report.checks.find((check) => check.id === "native.plugin-list"),
    ).toMatchObject({
      status: "fail",
      nativeError: {
        command: "bb plugin list --json",
        exitCode: 0,
        stdout: "not-json",
      },
    });
  });

  test("bounds native evidence by UTF-8 bytes", async () => {
    const workspaceRoot = await createWorkspace();
    await writePackage(workspaceRoot, "ui", validPackage("ui"));
    const report = await inspectPlugin({
      workspaceRoot,
      runBb: async (args) =>
        args[0] === "--version"
          ? command("0.35.1")
          : command("", { stderr: "🧭".repeat(3_000), exitCode: 9 }),
    });
    const evidence = report.checks.find(
      (check) => check.id === "native.plugin-list",
    )?.nativeError;

    expect(evidence?.stderr).toContain("[truncated by bb Plugin Studio]");
    expect(
      Buffer.byteLength(evidence?.stderr ?? "", "utf8"),
    ).toBeLessThanOrEqual(8_192);
  });

  test("distinguishes missing SDK publication from a local dependency error", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui", { app: "./app.tsx" }),
    );
    const missing = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => ({
        state: "dependency-unresolved",
        version: null,
        detail: "The local dependency cannot resolve.",
      }),
      resolveSdkPublication: async () => ({
        state: "missing",
        version: null,
        detail: "The package registry returned 404.",
      }),
      runBb: nativeRunner(pluginRoot),
    });
    const local = await inspectPlugin({
      workspaceRoot,
      resolveHarness: async () => ({
        state: "dependency-unresolved",
        version: null,
        detail: "The local dependency cannot resolve.",
      }),
      resolveSdkPublication: async () => ({
        state: "published",
        version: "0.4.1",
        detail: "Published on npm.",
      }),
      runBb: nativeRunner(pluginRoot),
    });

    expect(missing.modes.harness.publication).toBe("missing");
    expect(
      missing.checks.find((check) => check.id === "mode.harness")?.summary,
    ).toContain("not published");
    expect(local.modes.harness.publication).toBe("published");
    expect(
      local.checks.find((check) => check.id === "mode.harness")?.summary,
    ).toContain("local");
  });

  test("a healthy headless plugin can reach ready", async () => {
    const workspaceRoot = await createWorkspace();
    const pluginRoot = await writePackage(
      workspaceRoot,
      "ui",
      validPackage("ui"),
    );
    await writeMetadata(pluginRoot, "server");
    const report = await inspectPlugin({
      workspaceRoot,
      runBb: nativeRunner(pluginRoot, {
        status: "running",
        enabled: true,
        app: { hasApp: false, bundle: null },
      }),
    });

    expect(report.outcome).toBe("ready");
    expect(
      report.checks.filter((check) =>
        ["warning", "fail", "unavailable"].includes(check.status),
      ),
    ).toEqual([]);
  });
});
