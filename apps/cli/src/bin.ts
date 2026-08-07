#!/usr/bin/env bun

import { fileURLToPath } from "node:url";
import { runCli, type CliRuntime } from "./commands.ts";
import {
  resolveBbExecutable,
  runCapturedCommand,
  runInheritedCommand,
} from "./native.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

const runtime: CliRuntime = {
  cwd: process.cwd(),
  env: process.env,
  bunExecutable: process.execPath,
  workspaceRoot,
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  resolveBb: () =>
    resolveBbExecutable({ cwd: process.cwd(), env: process.env }),
  runCaptured: runCapturedCommand,
  runInherited: runInheritedCommand,
};

const result = await runCli(process.argv.slice(2), runtime);
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.exitCode ?? 1);
