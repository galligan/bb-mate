import { parseArgs } from "node:util";

export type CliCommand = "dev" | "inspect" | "check" | "live" | "serve";

export interface CliArguments {
  command: CliCommand;
  targetPath?: string;
  host: string;
  port: number;
  json: boolean;
  help: boolean;
  parentPid?: number;
  supervisorFd?: number;
}

const commands = new Set<CliCommand>([
  "dev",
  "inspect",
  "check",
  "live",
  "serve",
]);

export function parseCliArgs(argv: readonly string[]): CliArguments {
  const values = [...argv];
  let command: CliCommand = "dev";
  if (values[0] && commands.has(values[0] as CliCommand)) {
    command = values.shift() as CliCommand;
  }

  const parsed = parseArgs({
    args: values,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h", default: false },
      json: { type: "boolean", default: false },
      host: { type: "string" },
      port: { type: "string" },
      "parent-pid": { type: "string" },
      "supervisor-fd": { type: "string" },
    },
  });
  if (parsed.positionals.length > 1) {
    throw new Error("Pass at most one plugin path.");
  }

  const targetPath = parsed.positionals[0];
  const host = parsed.values.host ?? "127.0.0.1";
  const parsedPort = parsed.values.port
    ? Number(parsed.values.port)
    : command === "serve"
      ? 0
      : 5173;
  if (
    !Number.isInteger(parsedPort) ||
    parsedPort < (command === "serve" ? 0 : 1) ||
    parsedPort > 65_535
  ) {
    throw new Error(
      command === "serve"
        ? "--port must be 0 for supervised serve."
        : "--port must be an integer between 1 and 65535.",
    );
  }
  const port = parsedPort;
  const json = parsed.values.json;
  const help = parsed.values.help;
  const addressOption =
    parsed.values.host !== undefined || parsed.values.port !== undefined;

  const parentPid = parsed.values["parent-pid"]
    ? Number(parsed.values["parent-pid"])
    : undefined;
  const supervisorFd = parsed.values["supervisor-fd"]
    ? Number(parsed.values["supervisor-fd"])
    : undefined;

  if (command === "serve") {
    if (help) return { command, host, port, json, help };
    if (targetPath) throw new Error("serve does not accept a plugin path.");
    if (parsed.values.host !== undefined) {
      throw new Error("Supervised serve does not accept --host.");
    }
    if (parsed.values.port === undefined) {
      throw new Error("Supervised serve requires explicit --port 0.");
    }
    if (port !== 0) throw new Error("--port must be 0 for supervised serve.");
    if (!json) throw new Error("Supervised serve requires --json.");
    if (!Number.isSafeInteger(parentPid) || (parentPid ?? 0) < 1) {
      throw new Error("Supervised serve requires a positive --parent-pid.");
    }
    if (!Number.isSafeInteger(supervisorFd) || (supervisorFd ?? 0) < 3) {
      throw new Error("Supervised serve requires --supervisor-fd >= 3.");
    }
    return {
      command,
      host,
      port,
      json,
      help,
      parentPid,
      supervisorFd,
    };
  }

  if (json && command !== "inspect") {
    throw new Error("--json is only available with inspect.");
  }
  if (command !== "dev" && addressOption) {
    throw new Error("--host and --port are only available with dev.");
  }
  if (parentPid !== undefined || supervisorFd !== undefined) {
    throw new Error(
      "--parent-pid and --supervisor-fd are only available with serve.",
    );
  }

  return { command, targetPath, host, port, json, help };
}
