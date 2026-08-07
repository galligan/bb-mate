import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProcessExit } from "./commands.ts";

export { runCapturedCommand } from "@bb-mate/inspection";

async function executablePath(candidate: string): Promise<string | null> {
  try {
    await fs.access(candidate, constants.X_OK);
    const stat = await fs.stat(candidate);
    return stat.isFile() ? await fs.realpath(candidate) : null;
  } catch {
    return null;
  }
}

async function searchPath(
  name: string,
  pathValue: string | undefined,
): Promise<string | null> {
  for (const directory of (pathValue ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const resolved = await executablePath(path.join(directory, name));
    if (resolved) return resolved;
  }
  return null;
}

export async function resolveBbExecutable(options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const override = options.env.BB_CLI?.trim();
  if (override) {
    const resolved = override.includes(path.sep)
      ? executablePath(path.resolve(options.cwd, override))
      : searchPath(override, options.env.PATH);
    const executable = await resolved;
    if (executable) return executable;
  }
  return searchPath("bb", options.env.PATH);
}

export function runInheritedCommand(
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<ProcessExit> {
  return new Promise((resolve) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: "inherit",
    });
    let spawnError = false;
    child.on("error", () => {
      spawnError = true;
    });
    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode: spawnError ? 1 : exitCode,
        signal: spawnError ? null : signal,
      });
    });
  });
}
