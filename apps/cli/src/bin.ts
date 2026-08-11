#!/usr/bin/env bun

import { runBbMateEntrypoint } from "./entrypoint.ts";

const manifest = (await Bun.file(
  new URL("../package.json", import.meta.url),
).json()) as { version: string };
const result = await runBbMateEntrypoint({
  mode: "source-or-package",
  moduleUrl: import.meta.url,
  bunExecutable: process.execPath,
  runtimeVersion: manifest.version,
});
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.exitCode ?? 1);
