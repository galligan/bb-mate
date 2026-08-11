import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const buildScript = path.join(repositoryRoot, "scripts", "build-standalone.ts");
const MAX_OUTPUT_ROOT_BYTES = 4096;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

export function freshStandaloneBuildCommand(outputRoot: string): string[] {
  if (
    !path.isAbsolute(outputRoot) ||
    Buffer.byteLength(outputRoot, "utf8") > MAX_OUTPUT_ROOT_BYTES
  ) {
    throw new Error(
      "Fresh standalone output root must be one bounded absolute path.",
    );
  }
  return [process.execPath, buildScript, outputRoot];
}

export async function buildStandaloneFresh(options: {
  outputRoot: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const command = freshStandaloneBuildCommand(options.outputRoot);
  const child = Bun.spawn(command, {
    cwd: repositoryRoot,
    env: options.env ?? process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdoutBytes, stderrBytes, exitCode] = await Promise.all([
    new Response(child.stdout).bytes(),
    new Response(child.stderr).bytes(),
    child.exited,
  ]);
  if (
    stdoutBytes.byteLength > MAX_DIAGNOSTIC_BYTES ||
    stderrBytes.byteLength > MAX_DIAGNOSTIC_BYTES
  ) {
    throw new Error("Fresh standalone build diagnostics exceeded their bound.");
  }
  if (exitCode !== 0) {
    const stderr = new TextDecoder("utf-8", { fatal: false }).decode(
      stderrBytes,
    );
    throw new Error(
      `Fresh standalone build exited with ${exitCode}: ${stderr.trim()}`,
    );
  }
}
