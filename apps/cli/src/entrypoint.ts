import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, type CliRuntime, type ProcessExit } from "./commands.ts";
import {
  createEmbeddedLabAssets,
  type EmbeddedLabAssetMap,
} from "./lab-assets.ts";
import {
  nativeCommandEnv,
  resolveBbExecutable,
  runCapturedCommand,
  runInheritedCommand,
} from "./native.ts";
import { runSurfaceLab } from "./surface-lab-server.ts";

export type BbMateEntrypointOptions =
  | {
      mode: "source-or-package";
      moduleUrl: string;
      bunExecutable: string;
    }
  | {
      mode: "standalone";
      assets: EmbeddedLabAssetMap;
    };

interface EntrypointEnvironment {
  argv?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?(value: string): void;
  stderr?(value: string): void;
}

function environment(overrides: EntrypointEnvironment) {
  return {
    argv: overrides.argv ?? process.argv.slice(2),
    cwd: overrides.cwd ?? process.cwd(),
    env: overrides.env ?? process.env,
    stdout:
      overrides.stdout ?? ((value: string) => process.stdout.write(value)),
    stderr:
      overrides.stderr ?? ((value: string) => process.stderr.write(value)),
  };
}

export async function createBbMateCliRuntime(
  options: BbMateEntrypointOptions,
  overrides: EntrypointEnvironment = {},
): Promise<CliRuntime> {
  const current = environment(overrides);
  let fixture: Pick<CliRuntime, "fixtureName" | "runFixture"> = {};
  let source: Pick<CliRuntime, "bunExecutable" | "workspaceRoot"> = {};

  if (options.mode === "standalone") {
    if (!("/index.html" in options.assets)) {
      throw new Error(
        "Standalone surface lab assets must include /index.html.",
      );
    }
    const assets = createEmbeddedLabAssets(options.assets);
    fixture = {
      fixtureName: "surface lab",
      runFixture: (serverOptions) =>
        runSurfaceLab({
          assets,
          ...serverOptions,
          stdout: current.stdout,
          stderr: current.stderr,
        }),
    };
  } else {
    const moduleDirectory = path.dirname(fileURLToPath(options.moduleUrl));
    const packagedLabRoot = path.join(moduleDirectory, "lab");
    const packaged = await fs
      .access(path.join(packagedLabRoot, "index.html"))
      .then(() => true)
      .catch(() => false);
    if (packaged) {
      fixture = {
        fixtureName: "surface lab",
        runFixture: (serverOptions) =>
          runSurfaceLab({
            root: packagedLabRoot,
            ...serverOptions,
            stdout: current.stdout,
            stderr: current.stderr,
          }),
      };
    } else {
      source = {
        bunExecutable: options.bunExecutable,
        workspaceRoot: fileURLToPath(new URL("../../..", options.moduleUrl)),
      };
    }
  }

  return {
    cwd: current.cwd,
    env: current.env,
    ...source,
    ...fixture,
    stdout: current.stdout,
    stderr: current.stderr,
    resolveBb: () =>
      resolveBbExecutable({ cwd: current.cwd, env: current.env }),
    runCaptured: (executable, args, cwd) =>
      runCapturedCommand(executable, args, cwd, {
        env: nativeCommandEnv(current.env),
      }),
    runInherited: runInheritedCommand,
  };
}

export async function runBbMateEntrypoint(
  options: BbMateEntrypointOptions,
  overrides: EntrypointEnvironment = {},
): Promise<ProcessExit> {
  const current = environment(overrides);
  const runtime = await createBbMateCliRuntime(options, current);
  return runCli(current.argv, runtime);
}
