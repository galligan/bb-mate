import path from "node:path";

export function workbenchCommand(options: {
  workspaceRoot: string;
  host: string;
  port: number;
}): readonly string[] {
  return [
    "run",
    "--cwd",
    path.join(options.workspaceRoot, "apps", "workbench"),
    "dev",
    "--",
    "--host",
    options.host,
    "--port",
    String(options.port),
    "--strictPort",
  ];
}
