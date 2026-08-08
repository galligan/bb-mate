import { spawn } from "node:child_process";
import type { CommandResult } from "./types.ts";

const defaultTimeoutMs = 5_000;
const defaultMaxOutputBytes = 4 * 1024 * 1024;
const terminationGraceMs = 250;
const forcedSettlementDelayMs = 10;

export interface CapturedCommandOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export function runCapturedCommand(
  executable: string,
  args: readonly string[],
  cwd: string,
  options: CapturedCommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, [...args], {
      cwd,
      detached: process.platform !== "win32",
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    const maxOutputBytes = options.maxOutputBytes ?? defaultMaxOutputBytes;
    let capturedBytes = 0;
    let spawnError: Error | null = null;
    let timedOut = false;
    let outputExceeded = false;
    let terminating = false;
    let settled = false;
    let forceKillSent = false;
    let terminationExitCode: number | null | undefined;
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    let forceSettlement: ReturnType<typeof setTimeout> | undefined;

    const signalProcessTree = (signal: NodeJS.Signals) => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the direct child if its process group already exited.
        }
      }
      child.kill(signal);
    };
    const terminate = () => {
      if (terminating) return;
      terminating = true;
      signalProcessTree("SIGTERM");
      forceKill = setTimeout(() => {
        forceKill = undefined;
        forceKillSent = true;
        signalProcessTree("SIGKILL");
        scheduleForcedSettlement();
      }, terminationGraceMs);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    const capture = (target: Buffer[], chunk: Buffer) => {
      if (outputExceeded) return;
      const remaining = Math.max(0, maxOutputBytes - capturedBytes);
      if (remaining > 0) {
        const retained =
          chunk.byteLength <= remaining ? chunk : chunk.subarray(0, remaining);
        target.push(retained);
        capturedBytes += retained.byteLength;
      }
      if (chunk.byteLength > remaining) {
        outputExceeded = true;
        clearTimeout(timeout);
        terminate();
      }
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      if (forceSettlement) clearTimeout(forceSettlement);
      const capturedStderr = Buffer.concat(stderr).toString("utf8");
      const diagnostic = [
        outputExceeded
          ? `Native command output exceeded ${maxOutputBytes} bytes.`
          : "",
        timedOut ? `Native command timed out after ${timeoutMs}ms.` : "",
        spawnError?.message ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr:
          capturedStderr && diagnostic
            ? `${capturedStderr}${capturedStderr.endsWith("\n") ? "" : "\n"}${diagnostic}`
            : capturedStderr || diagnostic,
        exitCode: outputExceeded ? 125 : timedOut ? 124 : (exitCode ?? 1),
      });
    };
    function scheduleForcedSettlement() {
      if (
        process.platform === "win32" ||
        !forceKillSent ||
        terminationExitCode === undefined ||
        forceSettlement
      ) {
        return;
      }
      forceSettlement = setTimeout(
        () => finish(terminationExitCode ?? null),
        forcedSettlementDelayMs,
      );
    }

    child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk));
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("exit", (exitCode) => {
      if (!terminating) return;
      child.stdout.destroy();
      child.stderr.destroy();
      terminationExitCode = exitCode;
      if (process.platform === "win32") finish(exitCode);
      else scheduleForcedSettlement();
    });
    child.on("close", (exitCode) => {
      if (!terminating || process.platform === "win32") {
        finish(exitCode);
        return;
      }
      terminationExitCode ??= exitCode;
      scheduleForcedSettlement();
    });
  });
}
