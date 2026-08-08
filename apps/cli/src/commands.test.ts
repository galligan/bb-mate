import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandResult } from "@bb-mate/inspection";
import { runCli, type CliRuntime, type ProcessExit } from "./commands.ts";

const temporaryRoots: string[] = [];

async function createPlugin(
  options: { workspace?: boolean; prefix?: string } = {},
) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), options.prefix ?? "bb-mate-cli-"),
  );
  temporaryRoots.push(root);
  const pluginRoot = options.workspace
    ? path.join(root, "plugins", "notes")
    : root;
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(
    path.join(pluginRoot, "package.json"),
    JSON.stringify({
      name: "bb-plugin-notes",
      version: "1.0.0",
      bb: {
        name: "Notes",
        description: "Notes test plugin",
        branding: { icon: "Notebook" },
        server: "./server.ts",
      },
    }),
  );
  await fs.writeFile(path.join(pluginRoot, "server.ts"), "export {};\n");
  return { root, pluginRoot };
}

interface ConnectFixture {
  status?: Record<string, unknown>;
  local?: Record<string, unknown>;
}

function nativeOutput(
  pluginRoot: string,
  installed = false,
  connect: ConnectFixture = {},
) {
  return async (
    _executable: string,
    args: readonly string[],
  ): Promise<CommandResult> => {
    if (args[0] === "--version") {
      return { stdout: "0.35.1\n", stderr: "", exitCode: 0 };
    }
    if (args[0] === "connect") {
      return {
        stdout: JSON.stringify(
          args[1] === "shares"
            ? (connect.local ?? {
                host: { id: "host_local", name: "studio", isServer: true },
                shares: [
                  {
                    hostId: "host_local",
                    hostName: "studio",
                    port: 4317,
                    url: "https://mate--4317.example.getbb.app",
                  },
                ],
              })
            : (connect.status ?? {
                state: "connected",
                paired: true,
                url: "https://mate.example.getbb.app",
                shares: [
                  {
                    hostId: "host_local",
                    hostName: "studio",
                    port: 4317,
                    url: "https://mate--4317.example.getbb.app",
                  },
                ],
              }),
        ),
        stderr: "",
        exitCode: 0,
      };
    }
    if (args[1] === "source") {
      return {
        stdout: JSON.stringify({
          requested: `path:${pluginRoot}`,
          resolved: `path:${pluginRoot}`,
        }),
        stderr: "",
        exitCode: 0,
      };
    }
    return {
      stdout: JSON.stringify({
        plugins: installed
          ? [
              {
                id: "notes",
                rootDir: pluginRoot,
                source: `path:${pluginRoot}`,
                status: "running",
              },
            ]
          : [],
      }),
      stderr: "",
      exitCode: 0,
    };
  };
}

function runtime(
  cwd: string,
  captured: CliRuntime["runCaptured"],
  overrides: Partial<CliRuntime> = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const processExit: ProcessExit = { exitCode: 0, signal: null };
  return {
    stdout,
    stderr,
    value: {
      cwd,
      env: {},
      bunExecutable: "/fake/bun",
      workspaceRoot: "/workspace/bb-mate",
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
      resolveBb: async () => "/fake/bin/bb",
      runCaptured: captured,
      runInherited: async () => processExit,
      ...overrides,
    } satisfies CliRuntime,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("bb-mate CLI", () => {
  test("prints help without resolving or running native commands", async () => {
    let nativeCall = false;
    const testRuntime = runtime(
      "/workspace",
      async () => {
        nativeCall = true;
        return { stdout: "", stderr: "", exitCode: 1 };
      },
      {
        resolveBb: async () => {
          nativeCall = true;
          return null;
        },
      },
    );

    const result = await runCli(["--help"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(nativeCall).toBe(false);
    expect(testRuntime.stdout.join("")).toContain("Usage: bb-mate [path]");
  });

  test("inspects a standalone plugin without executing its entrypoint", async () => {
    const { pluginRoot } = await createPlugin();
    const testRuntime = runtime(pluginRoot, nativeOutput(pluginRoot));

    const result = await runCli(["inspect", "--json"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    const report = JSON.parse(testRuntime.stdout.join(""));
    expect(report.target.rootPath).toBe(pluginRoot);
    expect(report.target.displayName).toBe("Notes");
    expect(testRuntime.stderr.join("")).toContain(
      "Native bb executable: /fake/bin/bb (0.35.1)",
    );
  });

  test("launches the existing workbench with an explicit target and strict address", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const launches: Array<{
      executable: string;
      args: readonly string[];
      options: { cwd: string; env: NodeJS.ProcessEnv };
    }> = [];
    const testRuntime = runtime(root, nativeOutput(pluginRoot), {
      env: {
        BB_CLI: "/daemon/managed/bb",
        BB_CLI_REEXEC: "1",
        BB_MATE_SENTINEL: "preserved",
      },
      runInherited: async (executable, args, options) => {
        launches.push({ executable, args, options });
        return { exitCode: 0, signal: null };
      },
    });

    const result = await runCli(
      ["dev", "--host", "::1", "--port", "4317"],
      testRuntime.value,
    );

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(launches).toEqual([
      {
        executable: "/fake/bun",
        args: [
          "run",
          "--cwd",
          "/workspace/bb-mate/apps/workbench",
          "dev",
          "--",
          "--host",
          "::1",
          "--port",
          "4317",
          "--strictPort",
        ],
        options: {
          cwd: "/workspace/bb-mate",
          env: {
            BB_CLI: "/fake/bin/bb",
            BB_MATE_PLUGIN: pluginRoot,
            BB_MATE_SENTINEL: "preserved",
            BB_MATE_WORKSPACE: root,
          },
        },
      },
    ]);
    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: https://mate--4317.example.getbb.app (existing studio share; passive status only)",
    );
    expect(testRuntime.stdout.join("")).toContain(
      "Launching Fixture workbench at http://[::1]:4317",
    );
  });

  test("uses the packaged surface-lab launcher without a source checkout", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const fixtureLaunches: Array<{ host: string; port: number }> = [];
    let inherited = false;
    const testRuntime = runtime(root, nativeOutput(pluginRoot), {
      fixtureName: "surface lab",
      runFixture: async (options) => {
        fixtureLaunches.push(options);
        return { exitCode: 0, signal: null };
      },
      runInherited: async () => {
        inherited = true;
        return { exitCode: 1, signal: null };
      },
    });

    const result = await runCli(
      ["dev", "--host", "127.0.0.1", "--port", "4317"],
      testRuntime.value,
    );

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(fixtureLaunches).toEqual([{ host: "127.0.0.1", port: 4317 }]);
    expect(inherited).toBe(false);
    expect(testRuntime.stdout.join("")).not.toContain("Launching Fixture");
  });

  test("does not present the Connect base URL as an unshared workbench port", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const testRuntime = runtime(root, nativeOutput(pluginRoot));

    const result = await runCli(["dev", "--port", "5173"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: port 5173 is not shared (Connect is connected and paired; passive status only)",
    );
    expect(testRuntime.stdout.join("")).not.toContain(
      "Connect exposure: https://mate.example.getbb.app",
    );
  });

  test("uses only the invoking host share when two hosts expose the same port", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const testRuntime = runtime(
      root,
      nativeOutput(pluginRoot, false, {
        status: {
          state: "connected",
          paired: true,
          url: "https://mate.example.getbb.app",
          shares: [
            {
              hostId: "host_remote",
              hostName: "remote",
              port: 5173,
              url: "https://remote--5173.example.getbb.app",
            },
            {
              hostId: "host_local",
              hostName: "studio",
              port: 5173,
              url: "https://studio--5173.example.getbb.app",
            },
          ],
        },
        local: {
          host: { id: "host_local", name: "studio", isServer: true },
          shares: [
            {
              hostId: "host_local",
              hostName: "studio",
              port: 5173,
              url: "https://studio--5173.example.getbb.app",
            },
          ],
        },
      }),
    );

    await runCli(["dev"], testRuntime.value);

    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: https://studio--5173.example.getbb.app",
    );
    expect(testRuntime.stdout.join("")).not.toContain(
      "Connect exposure: https://remote--5173.example.getbb.app",
    );
  });

  test("reports a matching unavailable local share without terminal control text", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const testRuntime = runtime(
      root,
      nativeOutput(pluginRoot, false, {
        local: {
          host: { id: "host_local", name: "studio", isServer: true },
          shares: [
            {
              hostId: "host_local",
              hostName: "studio",
              port: 5173,
              url: "",
              unavailableReason: "Host is offline.\n\u001b[31mTry later.",
            },
          ],
        },
      }),
    );

    await runCli(["dev"], testRuntime.value);

    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: port 5173 share is unavailable (Host is offline. [31mTry later.; passive status only)",
    );
    expect(testRuntime.stdout.join("")).not.toContain("\u001b");
  });

  test("reports a canonical unpaired status distinctly", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const testRuntime = runtime(
      root,
      nativeOutput(pluginRoot, false, {
        status: {
          state: "disconnected",
          paired: false,
          url: null,
          shares: [],
        },
        local: {
          host: { id: "host_local", name: "studio", isServer: true },
          shares: [],
        },
      }),
    );

    await runCli(["dev"], testRuntime.value);

    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: unavailable (Connect is unpaired; passive status only)",
    );
  });

  test("keeps authoritative unpaired status when local shares are unavailable", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const unpaired = nativeOutput(pluginRoot, false, {
      status: {
        state: "disconnected",
        paired: false,
        url: null,
        shares: [],
      },
    });
    const testRuntime = runtime(root, async (executable, args) =>
      args[0] === "connect" && args[1] === "shares"
        ? { stdout: "", stderr: "not paired", exitCode: 9 }
        : unpaired(executable, args),
    );

    const result = await runCli(["dev"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: unavailable (Connect is unpaired; passive status only)",
    );
    expect(testRuntime.stdout.join("")).not.toContain(
      "local-host shares unavailable",
    );
  });

  test("distinguishes unavailable Connect status from an unshared connected port", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const available = nativeOutput(pluginRoot);
    const testRuntime = runtime(root, async (executable, args) =>
      args[0] === "connect"
        ? { stdout: "", stderr: "daemon unavailable", exitCode: 9 }
        : available(executable, args),
    );

    const result = await runCli(["dev"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(testRuntime.stdout.join("")).toContain(
      "Connect exposure: unavailable (status unavailable; passive status only)",
    );
    expect(testRuntime.stdout.join("")).not.toContain("is not shared");
  });

  test("checks before and after delegating the exact native build command", async () => {
    const { pluginRoot } = await createPlugin();
    const delegated: Array<{
      executable: string;
      args: readonly string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
    }> = [];
    const testRuntime = runtime(pluginRoot, nativeOutput(pluginRoot), {
      env: {
        BB_CLI: "/daemon/managed/bb",
        BB_CLI_REEXEC: "1",
        BB_MATE_SENTINEL: "preserved",
      },
      runInherited: async (executable, args, options) => {
        delegated.push({
          executable,
          args,
          cwd: options.cwd,
          env: options.env,
        });
        await fs.mkdir(path.join(pluginRoot, "dist"));
        await fs.writeFile(
          path.join(pluginRoot, "dist", "server.meta.json"),
          JSON.stringify({
            artifactFormatVersion: 1,
            sdkMajor: 0,
            sdkVersion: "0.4.1",
            pluginId: "notes",
            pluginVersion: "1.0.0",
            builtWith: { bbVersion: "0.35.1", pluginSdkVersion: "0.4.1" },
          }),
        );
        return { exitCode: 0, signal: null };
      },
    });

    const result = await runCli(["check"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(delegated).toEqual([
      {
        executable: "/fake/bin/bb",
        args: ["plugin", "build", "."],
        cwd: pluginRoot,
        env: { BB_MATE_SENTINEL: "preserved" },
      },
    ]);
    expect(testRuntime.stdout.join("")).toContain("Running: bb plugin build .");
    expect(testRuntime.stdout.join("")).toContain(
      "Refreshed compatibility report",
    );
  });

  test("preserves a failed native build without claiming a refreshed report", async () => {
    const { pluginRoot } = await createPlugin();
    const testRuntime = runtime(pluginRoot, nativeOutput(pluginRoot), {
      runInherited: async () => ({ exitCode: 23, signal: null }),
    });

    const result = await runCli(["check"], testRuntime.value);

    expect(result).toEqual({ exitCode: 23, signal: null });
    expect(testRuntime.stdout.join("")).not.toContain(
      "Refreshed compatibility report",
    );
  });

  test("hands an installed path plugin to native live development", async () => {
    const { pluginRoot } = await createPlugin();
    const delegated: Array<{
      args: readonly string[];
      cwd: string;
      env: NodeJS.ProcessEnv;
    }> = [];
    const testRuntime = runtime(pluginRoot, nativeOutput(pluginRoot, true), {
      env: {
        BB_CLI: "/daemon/managed/bb",
        BB_CLI_REEXEC: "1",
        BB_MATE_SENTINEL: "preserved",
      },
      runInherited: async (_executable, args, options) => {
        delegated.push({ args, cwd: options.cwd, env: options.env });
        return { exitCode: null, signal: "SIGTERM" };
      },
    });

    const result = await runCli(["live"], testRuntime.value);

    expect(result).toEqual({ exitCode: null, signal: "SIGTERM" });
    expect(delegated).toEqual([
      {
        args: ["plugin", "dev", "."],
        cwd: pluginRoot,
        env: { BB_MATE_SENTINEL: "preserved" },
      },
    ]);
    expect(testRuntime.stdout.join("")).toContain("Running: bb plugin dev .");
  });

  test("refuses live handoff when the selected real path is not installed", async () => {
    const { pluginRoot } = await createPlugin({ prefix: "bb mate cli-" });
    let delegated = false;
    const testRuntime = runtime(pluginRoot, nativeOutput(pluginRoot), {
      resolveBb: async () => "/fake bb/bb's",
      runInherited: async () => {
        delegated = true;
        return { exitCode: 0, signal: null };
      },
    });

    const result = await runCli(["live"], testRuntime.value);

    expect(result).toEqual({ exitCode: 1, signal: null });
    expect(delegated).toBe(false);
    expect(testRuntime.stderr.join("")).toContain(
      `Run: '/fake bb/bb'"'"'s' plugin install '${pluginRoot}' --yes`,
    );
  });

  test("requires an explicit path when workspace discovery is ambiguous", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const second = path.join(root, "plugins", "second");
    await fs.cp(pluginRoot, second, { recursive: true });
    const testRuntime = runtime(root, nativeOutput(pluginRoot));

    const result = await runCli(["inspect"], testRuntime.value);

    expect(result).toEqual({ exitCode: 1, signal: null });
    expect(testRuntime.stdout.join("")).toContain(
      "Plugin selection is ambiguous",
    );
    expect(testRuntime.stdout.join("")).toContain("plugins/notes");
    expect(testRuntime.stdout.join("")).toContain("plugins/second");
  });

  test("launches ambiguous discovery for explicit selection in the overlay", async () => {
    const { root, pluginRoot } = await createPlugin({ workspace: true });
    const second = path.join(root, "plugins", "second");
    await fs.cp(pluginRoot, second, { recursive: true });
    const launches: Array<{
      args: readonly string[];
      env: NodeJS.ProcessEnv;
    }> = [];
    const testRuntime = runtime(root, nativeOutput(pluginRoot), {
      runInherited: async (_executable, args, options) => {
        launches.push({ args, env: options.env });
        return { exitCode: 0, signal: null };
      },
    });

    const result = await runCli(["dev"], testRuntime.value);

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(launches).toHaveLength(1);
    expect(launches[0]?.env.BB_MATE_WORKSPACE).toBe(root);
    expect(launches[0]?.env.BB_MATE_PLUGIN).toBeUndefined();
    expect(testRuntime.stdout.join("")).toContain(
      "Plugin selection is ambiguous",
    );
  });
});
