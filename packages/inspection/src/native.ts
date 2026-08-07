import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { valid } from "semver";
import type {
  CommandResult,
  InspectPluginOptions,
  InspectionCheck,
  NativeErrorEvidence,
} from "./types.ts";

const execFileAsync = promisify(execFile);

export interface InstalledPlugin {
  id?: unknown;
  rootDir?: unknown;
  source?: unknown;
  status?: unknown;
  enabled?: unknown;
  hasSettings?: unknown;
  capabilities?: unknown;
  services?: unknown;
  app?: unknown;
}

export interface NativeState {
  bbVersion: string | null;
  connectUrl: string | null;
  installed: InstalledPlugin | null;
  source: Record<string, unknown> | null;
  checks: InspectionCheck[];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function defaultRunBb(args: readonly string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("bb", [...args], {
      timeout: 5_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const native = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: native.stdout ?? "",
      stderr: native.stderr ?? native.message,
      exitCode: typeof native.code === "number" ? native.code : 1,
    };
  }
}

function boundUtf8(value: string): string {
  const trimmed = value.trim();
  const bytes = Buffer.from(trimmed, "utf8");
  const suffix = "\n[truncated by BB Mate]";
  const maxBytes = 8_192;
  if (bytes.byteLength <= maxBytes) return trimmed;
  let end = maxBytes - Buffer.byteLength(suffix, "utf8");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (end > 0) {
    try {
      return `${decoder.decode(bytes.subarray(0, end))}${suffix}`;
    } catch {
      end -= 1;
    }
  }
  return suffix.trim();
}

export function nativeEvidence(
  args: readonly string[],
  result: CommandResult,
): NativeErrorEvidence {
  return {
    command: `bb ${args.join(" ")}`,
    exitCode: result.exitCode,
    stderr: boundUtf8(result.stderr),
    stdout: boundUtf8(result.stdout) || null,
  };
}

async function runSafely(
  runner: NonNullable<InspectPluginOptions["runBb"]>,
  args: readonly string[],
): Promise<CommandResult> {
  try {
    return await runner(args);
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

async function realPathOrSelf(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch {
    return value;
  }
}

export async function readNativeState(
  pluginRoot: string,
  runner: NonNullable<InspectPluginOptions["runBb"]> = defaultRunBb,
): Promise<NativeState> {
  const versionArgs = ["--version"] as const;
  const listArgs = ["plugin", "list", "--json"] as const;
  const connectArgs = ["connect", "status", "--json"] as const;
  const [versionResult, listResult, connectResult] = await Promise.all([
    runSafely(runner, versionArgs),
    runSafely(runner, listArgs),
    runSafely(runner, connectArgs),
  ]);
  const checks: InspectionCheck[] = [];

  let bbVersion: string | null = null;
  if (versionResult.exitCode !== 0) {
    checks.push({
      id: "native.bb-version",
      status: "fail",
      summary: "Native bb version is unavailable.",
      nextAction:
        "Resolve the active bb binary or daemon, then rerun inspection.",
      nativeError: nativeEvidence(versionArgs, versionResult),
    });
  } else {
    bbVersion = stringOrNull(versionResult.stdout);
    const parsed = bbVersion ? valid(bbVersion.replace(/^v/, "")) : null;
    checks.push(
      parsed
        ? {
            id: "native.bb-version",
            status: "pass",
            summary: `Native bb ${parsed} is available.`,
          }
        : {
            id: "native.bb-version",
            status: "fail",
            summary: "Native bb returned an unparseable version.",
            detail: bbVersion ?? "The command returned no version.",
            nextAction:
              "Run `bb --version` and repair or update the active bb installation.",
            nativeError: nativeEvidence(versionArgs, versionResult),
          },
    );
  }

  let installed: InstalledPlugin | null = null;
  if (listResult.exitCode !== 0) {
    checks.push({
      id: "native.plugin-list",
      status: "fail",
      summary: "Native plugin inventory is unavailable.",
      nextAction: "Run `bb plugin list --json` and resolve the native error.",
      nativeError: nativeEvidence(listArgs, listResult),
    });
  } else {
    try {
      const parsed = recordOrNull(JSON.parse(listResult.stdout));
      if (!parsed || !Array.isArray(parsed.plugins)) {
        throw new Error("Missing plugins array.");
      }
      const targetRealPath = await realPathOrSelf(pluginRoot);
      for (const value of parsed.plugins) {
        const plugin = recordOrNull(value) as InstalledPlugin | null;
        const rootDir = stringOrNull(plugin?.rootDir);
        if (
          plugin &&
          rootDir &&
          (await realPathOrSelf(rootDir)) === targetRealPath
        ) {
          installed = plugin;
          break;
        }
      }
      checks.push({
        id: "native.plugin-list",
        status: "pass",
        summary: installed
          ? "The selected plugin appears in native bb."
          : "Native plugin inventory was read; the selected plugin is not installed.",
      });
    } catch (error) {
      checks.push({
        id: "native.plugin-list",
        status: "fail",
        summary: "Native plugin inventory JSON is malformed.",
        detail: error instanceof Error ? error.message : String(error),
        nextAction: "Run `bb plugin list --json` and inspect its raw output.",
        nativeError: nativeEvidence(listArgs, listResult),
      });
    }
  }

  let source: Record<string, unknown> | null = null;
  const installedId = stringOrNull(installed?.id);
  if (installedId) {
    const sourceArgs = ["plugin", "source", installedId, "--json"] as const;
    const sourceResult = await runSafely(runner, sourceArgs);
    if (sourceResult.exitCode !== 0) {
      checks.push({
        id: "native.plugin-source",
        status: "warning",
        summary: "Native plugin provenance details are unavailable.",
        nextAction: `Run \`bb plugin source ${installedId} --json\` and resolve the native error.`,
        nativeError: nativeEvidence(sourceArgs, sourceResult),
      });
    } else {
      try {
        source = recordOrNull(JSON.parse(sourceResult.stdout));
        if (!source) throw new Error("Expected a JSON object.");
        checks.push({
          id: "native.plugin-source",
          status: "pass",
          summary: "Native plugin provenance was read.",
        });
      } catch (error) {
        checks.push({
          id: "native.plugin-source",
          status: "warning",
          summary: "Native plugin provenance JSON is malformed.",
          detail: error instanceof Error ? error.message : String(error),
          nextAction: `Inspect \`bb plugin source ${installedId} --json\` directly.`,
          nativeError: nativeEvidence(sourceArgs, sourceResult),
        });
      }
    }
  }

  let connectUrl: string | null = null;
  if (connectResult.exitCode !== 0) {
    checks.push({
      id: "native.connect",
      status: "warning",
      summary: "Native bb Connect status is unavailable.",
      nextAction: "Run `bb connect status --json` if a Live bb URL is needed.",
      nativeError: nativeEvidence(connectArgs, connectResult),
    });
  } else {
    try {
      const parsed = recordOrNull(JSON.parse(connectResult.stdout));
      if (!parsed) throw new Error("Expected a JSON object.");
      connectUrl = stringOrNull(parsed.url);
      checks.push({
        id: "native.connect",
        status: "pass",
        summary: connectUrl
          ? "Native bb Connect metadata is available."
          : "Native bb Connect is not paired; local Live validation remains possible.",
      });
    } catch (error) {
      checks.push({
        id: "native.connect",
        status: "warning",
        summary: "Native bb Connect JSON is malformed.",
        detail: error instanceof Error ? error.message : String(error),
        nextAction: "Inspect `bb connect status --json` directly.",
        nativeError: nativeEvidence(connectArgs, connectResult),
      });
    }
  }

  return { bbVersion, connectUrl, installed, source, checks };
}
