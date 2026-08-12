import { afterEach, describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  nativeCommandEnv,
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

  test("removes bb re-exec selectors from delegated native commands", () => {
    expect(
      nativeCommandEnv({
        BB_CLI: "/tmp/daemon-managed-bb",
        BB_CLI_REEXEC: "1",
        BB_SERVER_URL: "http://127.0.0.1:49161",
        PATH: "/usr/bin",
      }),
    ).toEqual({
      BB_SERVER_URL: "http://127.0.0.1:49161",
      PATH: "/usr/bin",
    });
  });

  test("passes an explicit environment to captured native commands", async () => {
    const fixture = await executable(
      "env-probe",
      '#!/bin/sh\nprintf \'%s|%s\' "${BB_CLI-unset}" "${BB_MATE_SENTINEL-unset}"\n',
    );

    expect(
      await runCapturedCommand(fixture.file, [], fixture.root, {
        env: nativeCommandEnv({
          BB_CLI: fixture.file,
          BB_MATE_SENTINEL: "preserved",
        }),
      }),
    ).toEqual({
      stdout: "unset|preserved",
      stderr: "",
      exitCode: 0,
    });
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

  test("bounds passive captured commands and terminates an unresponsive child", async () => {
    const stalled = await executable(
      "stalled",
      "#!/bin/sh\ntrap '' TERM\nwhile :; do :; done\n",
    );
    const startedAt = performance.now();

    const result = await runCapturedCommand(stalled.file, [], stalled.root, {
      timeoutMs: 20,
    });

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(result).toMatchObject({
      exitCode: 124,
      stderr: expect.stringContaining("timed out after 20ms"),
    });
  });

  test("does not wait for a descendant that inherited capture pipes", async () => {
    const stalled = await executable(
      "stalled-tree",
      "#!/bin/sh\ntrap '' TERM\nsleep 2\n",
    );
    const startedAt = performance.now();

    const result = await runCapturedCommand(stalled.file, [], stalled.root, {
      timeoutMs: 20,
    });

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(result).toMatchObject({
      exitCode: 124,
      stderr: expect.stringContaining("timed out after 20ms"),
    });
  });

  test("force-kills a TERM-ignoring descendant before settling", async () => {
    if (process.platform === "win32") return;
    const fixture = await executable("unused");
    const descendantPidFile = path.join(fixture.root, "descendant.pid");
    const stalled = await executable(
      "stubborn-tree",
      [
        "#!/bin/sh",
        // Ignore TERM before forking so the descendant inherits SIG_IGN and
        // setup cannot be interrupted between its fork and its own trap line.
        'trap "" TERM',
        "sh -c 'trap \"\" TERM; while :; do :; done' &",
        "descendant=$!",
        `printf '%s' \"$descendant\" > ${JSON.stringify(descendantPidFile)}`,
        // Readiness signal: exceeding maxOutputBytes triggers termination, so
        // the kill sequence is causally ordered after the pid file write
        // instead of racing shell startup against a wall-clock timeout.
        "head -c 2048 /dev/zero",
        'wait "$descendant"',
        "",
      ].join("\n"),
    );

    const result = await runCapturedCommand(stalled.file, [], stalled.root, {
      timeoutMs: 5_000,
      maxOutputBytes: 1_024,
    });
    const descendantPid = Number(await fs.readFile(descendantPidFile, "utf8"));

    expect(descendantPid).toBeGreaterThan(0);
    expect(result.exitCode).toBe(125);
    expect(() => process.kill(descendantPid, 0)).toThrow();
  });

  test("terminates passive capture when combined output exceeds its bound", async () => {
    const fixture = await executable("unused");
    const noisy = path.join(fixture.root, "noisy.ts");
    await fs.writeFile(
      noisy,
      'process.stdout.write("x".repeat(4096)); setInterval(() => {}, 1_000);\n',
    );
    const startedAt = performance.now();

    const result = await runCapturedCommand(
      process.execPath,
      [noisy],
      fixture.root,
      { timeoutMs: 5_000, maxOutputBytes: 1_024 },
    );

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBeLessThan(1_100);
    expect(result).toMatchObject({
      exitCode: 125,
      stderr: expect.stringContaining("output exceeded 1024 bytes"),
    });
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
