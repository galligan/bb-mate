import { parseArgs } from "node:util";

export type CliCommand = "dev" | "inspect" | "check" | "live";

export interface CliArguments {
  command: CliCommand;
  targetPath?: string;
  host: string;
  port: number;
  json: boolean;
  help: boolean;
}

const commands = new Set<CliCommand>(["dev", "inspect", "check", "live"]);

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
    },
  });
  if (parsed.positionals.length > 1) {
    throw new Error("Pass at most one plugin path.");
  }

  const targetPath = parsed.positionals[0];
  const host = parsed.values.host ?? "127.0.0.1";
  const parsedPort = parsed.values.port ? Number(parsed.values.port) : 5173;
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("--port must be an integer between 1 and 65535.");
  }
  const port = parsedPort;
  const json = parsed.values.json;
  const help = parsed.values.help;
  const addressOption =
    parsed.values.host !== undefined || parsed.values.port !== undefined;

  if (json && command !== "inspect") {
    throw new Error("--json is only available with inspect.");
  }
  if (command !== "dev" && addressOption) {
    throw new Error("--host and --port are only available with dev.");
  }
  return { command, targetPath, host, port, json, help };
}
