import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveBbExecutable,
  runCapturedCommand,
  runInheritedCommand,
} from "./native.ts";

const temporaryRoots: string[] = [];

async function executable(
  name: string,
  body = "#!/bin/sh\nprintf '0.35.1\\n'\n",
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bb-mate-native-"));
  temporaryRoots.push(root);
  const file = path.join(root, name);
  await fs.writeFile(file, body, { mode: 0o755 });
  return { root, file };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("native command boundary", () => {
  test("prefers the BB_CLI executable over PATH", async () => {
    const override = await executable("bb-override");
    const fallback = await executable("bb");

    expect(
      await resolveBbExecutable({
        cwd: override.root,
        env: { BB_CLI: override.file, PATH: fallback.root },
      }),
    ).toBe(await fs.realpath(override.file));
  });

  test("resolves bb from PATH and captures output without a shell", async () => {
    const fallback = await executable("bb");
    const resolved = await resolveBbExecutable({
      cwd: fallback.root,
      env: { PATH: fallback.root },
    });

    expect(resolved).toBe(await fs.realpath(fallback.file));
    expect(
      await runCapturedCommand(resolved!, ["--version"], fallback.root),
    ).toEqual({
      stdout: "0.35.1\n",
      stderr: "",
      exitCode: 0,
    });
  });

  test("falls back to PATH when BB_CLI is not executable", async () => {
    const fallback = await executable("bb");

    expect(
      await resolveBbExecutable({
        cwd: fallback.root,
        env: { BB_CLI: "./missing-bb", PATH: fallback.root },
      }),
    ).toBe(await fs.realpath(fallback.file));
  });

  test("preserves a delegated process signal", async () => {
    const signaled = await executable("signaled", "#!/bin/sh\nkill -TERM $$\n");

    expect(
      await runInheritedCommand(signaled.file, [], {
        cwd: signaled.root,
        env: {},
      }),
    ).toEqual({ exitCode: null, signal: "SIGTERM" });
  });

  test("inherits literal argv, cwd, env, output, and a nonzero exit without a shell", async () => {
    const fixture = await executable("unused");
    const sideEffect = path.join(fixture.root, "must-not-exist");
    const child = path.join(fixture.root, "child.ts");
    const parent = path.join(fixture.root, "parent.ts");
    const literal = `$(touch ${sideEffect}) ; $HOME`;
    await fs.writeFile(
      child,
      [
        "console.log(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env.BB_MATE_LITERAL }))",
        'console.error("literal child stderr")',
        "process.exit(23)",
      ].join("\n"),
    );
    await fs.writeFile(
      parent,
      [
        `import { runInheritedCommand } from ${JSON.stringify(path.join(import.meta.dir, "native.ts"))}`,
        `const result = await runInheritedCommand(process.execPath, [${JSON.stringify(child)}, ${JSON.stringify(literal)}], { cwd: ${JSON.stringify(fixture.root)}, env: { ...process.env, BB_MATE_LITERAL: ${JSON.stringify("env ; $HOME")} } })`,
        "console.log(`RESULT ${JSON.stringify(result)}`)",
      ].join("\n"),
    );

    const processResult = Bun.spawn([process.execPath, parent], {
      cwd: fixture.root,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(processResult.stdout).text(),
      new Response(processResult.stderr).text(),
      processResult.exited,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      JSON.stringify({
        argv: [literal],
        cwd: await fs.realpath(fixture.root),
        env: "env ; $HOME",
      }),
    );
    expect(stdout).toContain('RESULT {"exitCode":23,"signal":null}');
    expect(stderr).toContain("literal child stderr");
    expect(await fs.exists(sideEffect)).toBe(false);
  });
});
