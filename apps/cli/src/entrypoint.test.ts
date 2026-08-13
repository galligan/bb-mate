import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createBbStudioCliRuntime,
  runBbStudioEntrypoint,
} from "./entrypoint.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("bb-plugin-studio entrypoint modes", () => {
  test("standalone mode requires embedded index assets and has no Bun source runner", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-entry-"),
    );
    roots.push(root);
    const indexPath = path.join(root, "index.html");
    await fs.writeFile(indexPath, "standalone");

    const runtime = await createBbStudioCliRuntime({
      mode: "standalone",
      runtimeVersion: "0.1.0-alpha.2",
      assets: { "/index.html": indexPath },
    });

    expect(runtime.runFixture).toBeFunction();
    expect(runtime.bunExecutable).toBeUndefined();
    expect(runtime.workspaceRoot).toBeUndefined();
    await expect(
      createBbStudioCliRuntime({
        mode: "standalone",
        runtimeVersion: "0.1.0-alpha.2",
        assets: {},
      }),
    ).rejects.toThrow("Standalone surface lab assets must include /index.html");
  });

  test("source-or-package mode uses Bun only when no packaged lab exists", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-entry-"),
    );
    roots.push(root);
    const moduleDirectory = path.join(root, "apps", "cli", "src");
    await fs.mkdir(moduleDirectory, { recursive: true });
    const moduleUrl = pathToFileURL(path.join(moduleDirectory, "bin.ts")).href;

    const source = await createBbStudioCliRuntime({
      mode: "source-or-package",
      moduleUrl,
      bunExecutable: "/actual/bun",
      runtimeVersion: "0.1.0-alpha.2",
    });
    expect(source.bunExecutable).toBe("/actual/bun");
    expect(source.runFixture).toBeUndefined();

    await fs.mkdir(path.join(moduleDirectory, "lab"));
    await fs.writeFile(path.join(moduleDirectory, "lab", "index.html"), "lab");
    const packaged = await createBbStudioCliRuntime({
      mode: "source-or-package",
      moduleUrl,
      bunExecutable: "/actual/bun",
      runtimeVersion: "0.1.0-alpha.2",
    });
    expect(packaged.runFixture).toBeFunction();
    expect(packaged.bunExecutable).toBeUndefined();
  });

  test("runs the standalone CLI through the exported executable seam", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "bb-plugin-studio-entry-"),
    );
    roots.push(root);
    const indexPath = path.join(root, "index.html");
    await fs.writeFile(indexPath, "standalone");
    const stdout: string[] = [];

    const result = await runBbStudioEntrypoint(
      {
        mode: "standalone",
        runtimeVersion: "0.1.0-alpha.2",
        assets: { "/index.html": indexPath },
      },
      {
        argv: ["--help"],
        stdout: (value) => stdout.push(value),
        stderr: () => undefined,
      },
    );

    expect(result).toEqual({ exitCode: 0, signal: null });
    expect(stdout.join("")).toContain("Usage: bb-plugin-studio");
  });
});
