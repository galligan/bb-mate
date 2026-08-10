#!/usr/bin/env bun

import { runBbMateEntrypoint } from "./entrypoint.ts";

const result = await runBbMateEntrypoint({
  mode: "source-or-package",
  moduleUrl: import.meta.url,
  bunExecutable: process.execPath,
});
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.exitCode ?? 1);
