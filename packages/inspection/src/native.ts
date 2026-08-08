import { promises as fs } from "node:fs";
import { valid } from "semver";
import {
  runCapturedCommand,
  type CapturedCommandOptions,
} from "./captured-command.ts";
import { nativeCommandEnv } from "./native-env.ts";
import type {
  CommandResult,
  InspectPluginOptions,
  InspectionCheck,
  NativeConnectHost,
  NativeConnectShare,
  NativeConnectStatus,
  NativeErrorEvidence,
} from "./types.ts";

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
  connect: NativeConnectStatus | null;
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

function connectShares(value: unknown): NativeConnectShare[] {
  if (!Array.isArray(value)) {
    throw new Error("Connect shares must be an array when present.");
  }
  return value.map((entry: unknown, index: number) => {
    const share = recordOrNull(entry);
    const hostId = stringOrNull(share?.hostId);
    const hostName = stringOrNull(share?.hostName);
    const port = share?.port;
    if (typeof share?.url !== "string") {
      throw new Error(`Connect shares.${index}.url must be a string.`);
    }
    const url = share.url.trim();
    const unavailableReason =
      share.unavailableReason === undefined
        ? null
        : stringOrNull(share.unavailableReason);
    if (
      !hostName ||
      (share?.hostId !== undefined && !hostId) ||
      !Number.isInteger(port) ||
      (port as number) < 1 ||
      (port as number) > 65_535 ||
      (!url && !unavailableReason) ||
      (url && unavailableReason)
    ) {
      throw new Error(
        `Connect shares.${index} must provide hostName, port, and either url or unavailableReason.`,
      );
    }
    return {
      ...(hostId ? { hostId } : {}),
      hostName,
      port: port as number,
      url,
      available: Boolean(url),
      unavailableReason,
    };
  });
}

function connectStatus(value: Record<string, unknown>): NativeConnectStatus {
  if (value.state !== undefined && stringOrNull(value.state) === null) {
    throw new Error("Connect state must be a non-empty string when present.");
  }
  if (value.paired !== undefined && typeof value.paired !== "boolean") {
    throw new Error("Connect paired must be a boolean when present.");
  }
  if (
    value.url !== undefined &&
    value.url !== null &&
    stringOrNull(value.url) === null
  ) {
    throw new Error("Connect URL must be a non-empty string when present.");
  }

  return {
    state: stringOrNull(value.state),
    paired: typeof value.paired === "boolean" ? value.paired : null,
    baseUrl: stringOrNull(value.url),
    shares: connectShares(value.shares ?? []),
  };
}

function localConnectShares(value: Record<string, unknown>): {
  host: NativeConnectHost;
  shares: NativeConnectShare[];
} {
  const rawHost = recordOrNull(value.host);
  const id = stringOrNull(rawHost?.id);
  const name = stringOrNull(rawHost?.name);
  const isServer = rawHost?.isServer;
  if (!id || !name || typeof isServer !== "boolean") {
    throw new Error("Connect local host must provide id, name, and isServer.");
  }
  if (!Array.isArray(value.shares)) {
    throw new Error("Connect local shares must be an array.");
  }
  for (const [index, entry] of value.shares.entries()) {
    const share = recordOrNull(entry);
    if (stringOrNull(share?.hostId) !== id) {
      throw new Error(
        `Connect local shares.${index}.hostId does not match the host.`,
      );
    }
  }
  return {
    host: { id, name, isServer },
    shares: connectShares(value.shares),
  };
}

export function defaultRunBb(
  args: readonly string[],
  options: CapturedCommandOptions = {},
): Promise<CommandResult> {
  const executable = process.env.BB_CLI?.trim() || "bb";
  return runCapturedCommand(executable, args, process.cwd(), {
    ...options,
    env: nativeCommandEnv(options.env ?? process.env),
  });
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
  const connectSharesArgs = ["connect", "shares", "--json"] as const;
  const [versionResult, listResult, connectResult, connectSharesResult] =
    await Promise.all([
      runSafely(runner, versionArgs),
      runSafely(runner, listArgs),
      runSafely(runner, connectArgs),
      runSafely(runner, connectSharesArgs),
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
  let connect: NativeConnectStatus | null = null;
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
      connect = connectStatus(parsed);
      connectUrl = connect.baseUrl;
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

  if (connectSharesResult.exitCode !== 0) {
    checks.push({
      id: "native.connect-shares",
      status: "info",
      summary: "Local-host Connect shares are unavailable.",
      nativeError: nativeEvidence(connectSharesArgs, connectSharesResult),
    });
  } else {
    try {
      const parsed = recordOrNull(JSON.parse(connectSharesResult.stdout));
      if (!parsed) throw new Error("Expected a JSON object.");
      const local = localConnectShares(parsed);
      if (connect) {
        connect = {
          ...connect,
          localHost: local.host,
          localShares: local.shares,
        };
      }
    } catch (error) {
      checks.push({
        id: "native.connect-shares",
        status: "info",
        summary: "Local-host Connect shares JSON is malformed.",
        detail: error instanceof Error ? error.message : String(error),
        nativeError: nativeEvidence(connectSharesArgs, connectSharesResult),
      });
    }
  }

  return { bbVersion, connectUrl, connect, installed, source, checks };
}
