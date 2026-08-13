import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBbStudioCliRuntime } from "./entrypoint.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => fs.rm(root, { recursive: true })),
  );
});

describe("bb-plugin-studio entrypoint", () => {
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
    });
    expect(source.bunExecutable).toBe("/actual/bun");
    expect(source.runFixture).toBeUndefined();

    await fs.mkdir(path.join(moduleDirectory, "lab"));
    await fs.writeFile(path.join(moduleDirectory, "lab", "index.html"), "lab");
    const packaged = await createBbStudioCliRuntime({
      mode: "source-or-package",
      moduleUrl,
      bunExecutable: "/actual/bun",
    });
    expect(packaged.runFixture).toBeFunction();
    expect(packaged.bunExecutable).toBeUndefined();
  });
});
