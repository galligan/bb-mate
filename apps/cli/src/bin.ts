#!/usr/bin/env bun

import { runBbStudioEntrypoint } from "./entrypoint.ts";

const result = await runBbStudioEntrypoint({
  mode: "source-or-package",
  moduleUrl: import.meta.url,
  bunExecutable: process.execPath,
});
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.exitCode ?? 1);
