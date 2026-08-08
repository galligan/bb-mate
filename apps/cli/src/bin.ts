#!/usr/bin/env bun

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli, type CliRuntime } from "./commands.ts";
import {
  resolveBbExecutable,
  runCapturedCommand,
  runInheritedCommand,
} from "./native.ts";
import { runSurfaceLab } from "./surface-lab-server.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const packagedLabRoot = path.join(moduleDirectory, "lab");
const packaged = await fs
  .access(path.join(packagedLabRoot, "index.html"))
  .then(() => true)
  .catch(() => false);

const runtime: CliRuntime = {
  cwd: process.cwd(),
  env: process.env,
  bunExecutable: process.execPath,
  workspaceRoot,
  ...(packaged
    ? {
        fixtureName: "surface lab",
        runFixture: (options: { host: string; port: number }) =>
          runSurfaceLab({
            root: packagedLabRoot,
            ...options,
            stdout: (value) => process.stdout.write(value),
            stderr: (value) => process.stderr.write(value),
          }),
      }
    : {}),
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
