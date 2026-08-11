import { promises as fs } from "node:fs";
import path from "node:path";
import {
  discoverPluginRoots,
  formatInspection,
  inspectPlugin,
  nativeCommandEnv,
  type CommandResult,
  type PluginInspection,
} from "@bb-mate/inspection";
import { parseCliArgs } from "./args.ts";
import { workbenchCommand } from "./workbench.ts";

export interface ProcessExit {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface CliRuntime {
  cwd: string;
  env: NodeJS.ProcessEnv;
  bunExecutable?: string;
  workspaceRoot?: string;
  fixtureName?: string;
  stdout(value: string): void;
  stderr(value: string): void;
  resolveBb(): Promise<string | null>;
  runCaptured(
    executable: string,
    args: readonly string[],
    cwd: string,
  ): Promise<CommandResult>;
  runInherited(
    executable: string,
    args: readonly string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ): Promise<ProcessExit>;
  runFixture?(options: { host: string; port: number }): Promise<ProcessExit>;
  runServe(options: {
    port: 0;
    parentPid: number;
    supervisorFd: number;
  }): Promise<ProcessExit>;
}

interface InspectionContext {
  bbExecutable: string | null;
  report: PluginInspection;
}

const success: ProcessExit = { exitCode: 0, signal: null };
const failure: ProcessExit = { exitCode: 1, signal: null };

const help = `Usage: bb-mate [path]
       bb-mate dev [path] [--host 127.0.0.1] [--port 5173]
       bb-mate inspect [path] [--json]
       bb-mate check [path]
       bb-mate live [path]
       bb-mate serve --port 0 --json --parent-pid <pid> --supervisor-fd <fd>

Fixture workbench, packaged surface lab, and passive inspection stay in BB Mate.
Native bb owns build, install, dev/reload, and live runtime.`;

function line(writer: (value: string) => void, value = "") {
  writer(`${value}\n`);
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function displayHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function safeInlineText(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > 240 ? `${sanitized.slice(0, 239)}…` : sanitized;
}

function connectExposure(report: PluginInspection, port: number): string {
  const connect = report.native.connect;
  if (!connect) {
    return "Connect exposure: unavailable (status unavailable; passive status only)";
  }
  if (connect.paired === false) {
    return "Connect exposure: unavailable (Connect is unpaired; passive status only)";
  }
  const share = connect.localShares?.find(
    (candidate) => candidate.port === port,
  );
  if (share?.url && share.available !== false) {
    return `Connect exposure: ${share.url} (existing ${share.hostName} share; passive status only)`;
  }
  if (share) {
    return `Connect exposure: port ${port} share is unavailable (${safeInlineText(share.unavailableReason ?? "unknown reason")}; passive status only)`;
  }
  if (!connect.localShares) {
    return "Connect exposure: unavailable (local-host shares unavailable; passive status only)";
  }
  if (connect.state === "connected" || connect.paired) {
    const status = [
      connect.state === "connected" ? "connected" : null,
      connect.paired ? "paired" : null,
    ]
      .filter((value): value is string => value !== null)
      .join(" and ");
    return `Connect exposure: port ${port} is not shared (Connect is ${status}; passive status only)`;
  }
  return `Connect exposure: unavailable (Connect state: ${connect.state ?? "unknown"}; passive status only)`;
}

async function isPluginDirectory(candidate: string): Promise<boolean> {
  try {
    const value = JSON.parse(
      await fs.readFile(path.join(candidate, "package.json"), "utf8"),
    ) as unknown;
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).bb === "object"
    );
  } catch {
    return false;
  }
}

async function explicitTarget(
  cwd: string,
  targetPath: string | undefined,
): Promise<string | undefined> {
  if (targetPath) return path.resolve(cwd, targetPath);
  if (await isPluginDirectory(cwd)) return cwd;
  const candidates = await discoverPluginRoots(cwd);
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function inspectSelection(
  runtime: CliRuntime,
  targetPath: string | undefined,
): Promise<InspectionContext> {
  const selected = await explicitTarget(runtime.cwd, targetPath);
  const bbExecutable = await runtime.resolveBb();
  const unavailableBb: CommandResult = {
    stdout: "",
    stderr: "No bb executable was found via BB_CLI or PATH.",
    exitCode: 127,
  };
  const report = await inspectPlugin({
    workspaceRoot: runtime.cwd,
    ...(selected ? { targetPath: selected } : {}),
    runBb: (args) =>
      bbExecutable
        ? runtime.runCaptured(bbExecutable, args, selected ?? runtime.cwd)
        : Promise.resolve(unavailableBb),
  });
  return { bbExecutable, report };
}

function printInspection(
  runtime: CliRuntime,
  context: InspectionContext,
  json: boolean,
) {
  const executable = context.bbExecutable ?? "unavailable";
  const version = context.report.native.bbVersion ?? "unavailable";
  if (json) {
    line(runtime.stdout, JSON.stringify(context.report, null, 2));
    line(runtime.stderr, `Native bb executable: ${executable} (${version})`);
    return;
  }
  line(runtime.stdout, `Native bb executable: ${executable} (${version})`);
  line(runtime.stdout, formatInspection(context.report));
  if (context.report.candidates.length > 0) {
    line(runtime.stdout, "Candidates:");
    for (const candidate of context.report.candidates) {
      line(runtime.stdout, `  ${candidate}`);
    }
  }
}

export async function runCli(
  argv: readonly string[],
  runtime: CliRuntime,
): Promise<ProcessExit> {
  let args;
  try {
    args = parseCliArgs(argv);
  } catch (error) {
    line(
      runtime.stderr,
      error instanceof Error ? error.message : String(error),
    );
    return failure;
  }

  if (args.help) {
    line(runtime.stdout, help);
    return success;
  }

  if (args.command === "serve") {
    return runtime.runServe({
      port: 0,
      parentPid: args.parentPid as number,
      supervisorFd: args.supervisorFd as number,
    });
  }

  const context = await inspectSelection(runtime, args.targetPath);
  if (args.command === "inspect") {
    printInspection(runtime, context, args.json);
    return context.report.target && context.report.outcome !== "blocked"
      ? success
      : failure;
  }

  if (args.command === "dev") {
    printInspection(runtime, context, false);
    const pluginRoot = context.report.target?.rootPath;
    if (!pluginRoot && context.report.state !== "ambiguous") return failure;
    line(runtime.stdout, connectExposure(context.report, args.port));
    if (runtime.runFixture) {
      return runtime.runFixture({ host: args.host, port: args.port });
    }
    if (!runtime.bunExecutable || !runtime.workspaceRoot) {
      line(runtime.stderr, "Fixture surface lab assets are unavailable.");
      return failure;
    }
    line(
      runtime.stdout,
      `Launching Fixture ${runtime.fixtureName ?? "workbench"} at http://${displayHost(args.host)}:${args.port}`,
    );
    return runtime.runInherited(
      runtime.bunExecutable,
      workbenchCommand({
        workspaceRoot: runtime.workspaceRoot,
        host: args.host,
        port: args.port,
      }),
      {
        cwd: runtime.workspaceRoot,
        env: {
          ...nativeCommandEnv(runtime.env),
          BB_MATE_WORKSPACE: runtime.cwd,
          ...(pluginRoot ? { BB_MATE_PLUGIN: pluginRoot } : {}),
          ...(context.bbExecutable ? { BB_CLI: context.bbExecutable } : {}),
        },
      },
    );
  }

  if (args.command === "check") {
    printInspection(runtime, context, false);
    const pluginRoot = context.report.target?.rootPath;
    if (!pluginRoot || !context.bbExecutable) return failure;
    line(runtime.stdout, "Running: bb plugin build .");
    const build = await runtime.runInherited(
      context.bbExecutable,
      ["plugin", "build", "."],
      { cwd: pluginRoot, env: nativeCommandEnv(runtime.env) },
    );
    if (build.signal || build.exitCode !== 0) return build;
    const refreshed = await inspectSelection(runtime, pluginRoot);
    line(runtime.stdout, "Refreshed compatibility report");
    printInspection(runtime, refreshed, false);
    return build;
  }

  if (args.command === "live") {
    printInspection(runtime, context, false);
    const pluginRoot = context.report.target?.rootPath;
    if (!pluginRoot || !context.bbExecutable) return failure;
    if (!context.report.provenance) {
      line(
        runtime.stderr,
        "Live handoff requires native bb to have this exact plugin path installed.",
      );
      line(
        runtime.stderr,
        `Run: ${shellArgument(context.bbExecutable)} plugin install ${shellArgument(pluginRoot)} --yes`,
      );
      return failure;
    }
    line(runtime.stdout, "Running: bb plugin dev .");
    return runtime.runInherited(context.bbExecutable, ["plugin", "dev", "."], {
      cwd: pluginRoot,
      env: nativeCommandEnv(runtime.env),
    });
  }

  line(runtime.stderr, `${args.command} is not implemented yet.`);
  return failure;
}
