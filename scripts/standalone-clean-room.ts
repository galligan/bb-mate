import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStandalone } from "./build-standalone.ts";
import { inspectStandalone } from "./inspect-standalone.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const labRoot = path.join(repositoryRoot, "apps", "workbench", "dist", "ladle");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function run(
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    allowFailure?: boolean;
  },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([...args], {
    cwd: options.cwd,
    env: options.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `${args.join(" ")} exited with code ${exitCode}\n${stdout.trim()}\n${stderr.trim()}`,
    );
  }
  return { exitCode, stdout, stderr };
}

async function unusedPort(): Promise<number> {
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const port = probe.port;
  probe.stop(true);
  if (port === undefined)
    throw new Error("Could not allocate a loopback port.");
  return port;
}

const temporaryRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "bb-mate-standalone-clean-room-"),
);
let server: ReturnType<typeof Bun.spawn> | null = null;
let hiddenLabRoot: string | null = null;

try {
  assert(
    process.platform === "darwin" && process.arch === "arm64",
    "The standalone clean-room lane requires a native macOS arm64 host.",
  );

  const buildRoot = path.join(temporaryRoot, "build");
  const firstCopy = path.join(temporaryRoot, "first-bb-mate");
  const firstManifestCopy = path.join(temporaryRoot, "first-manifest.json");
  const first = await buildStandalone({ outputRoot: buildRoot });
  await Promise.all([
    fs.copyFile(first.executablePath, firstCopy),
    fs.copyFile(first.manifestPath, firstManifestCopy),
  ]);

  const second = await buildStandalone({ outputRoot: buildRoot });
  const inspected = await inspectStandalone(buildRoot);
  const [firstExecutable, secondExecutable, firstManifest, secondManifest] =
    await Promise.all([
      fs.readFile(firstCopy),
      fs.readFile(second.executablePath),
      fs.readFile(firstManifestCopy, "utf8"),
      fs.readFile(second.manifestPath, "utf8"),
    ]);
  assert(
    firstExecutable.equals(secondExecutable),
    "Two complete standalone builds are not byte-for-byte deterministic.",
  );
  assert(
    firstManifest === secondManifest,
    "Two complete standalone manifests are not byte-for-byte deterministic.",
  );
  assert(
    sha256(secondExecutable) === inspected.manifest.sha256,
    "Inspected standalone hash differs from the repeated build.",
  );
  assert(
    !secondExecutable.includes(Buffer.from(repositoryRoot)),
    "Standalone executable contains the absolute repository path.",
  );

  const movedRoot = path.join(temporaryRoot, "moved");
  const homeRoot = path.join(temporaryRoot, "home");
  const cacheRoot = path.join(temporaryRoot, "cache");
  const configRoot = path.join(temporaryRoot, "config");
  const dataRoot = path.join(temporaryRoot, "data");
  const stateRoot = path.join(temporaryRoot, "state");
  const tempRoot = path.join(temporaryRoot, "tmp");
  await Promise.all(
    [
      movedRoot,
      homeRoot,
      cacheRoot,
      configRoot,
      dataRoot,
      stateRoot,
      tempRoot,
    ].map((root) => fs.mkdir(root, { recursive: true })),
  );
  const movedExecutable = path.join(movedRoot, "bb-mate");
  await fs.copyFile(second.executablePath, movedExecutable);
  await fs.chmod(movedExecutable, 0o755);
  await fs.access(movedExecutable, constants.X_OK);
  await Promise.all([
    fs.writeFile(path.join(movedRoot, ".env"), "BB_CLI=/ambient/not-bb\n"),
    fs.writeFile(path.join(movedRoot, "bunfig.toml"), 'logLevel = "debug"\n'),
  ]);

  const runtimeEnv: NodeJS.ProcessEnv = {
    PATH: "",
    HOME: homeRoot,
    TMPDIR: tempRoot,
    XDG_CACHE_HOME: cacheRoot,
    XDG_CONFIG_HOME: configRoot,
    XDG_DATA_HOME: dataRoot,
    XDG_STATE_HOME: stateRoot,
    BB_CLI: "",
    BUN_BE_BUN: "",
    BUN_OPTIONS: "",
    CI: "1",
    LANG: "C.UTF-8",
  };

  const help = await run([movedExecutable, "--help"], {
    cwd: movedRoot,
    env: runtimeEnv,
  });
  assert(
    help.stdout.includes("Usage: bb-mate"),
    "Moved executable help failed.",
  );

  const workspaceRoot = path.join(temporaryRoot, "workspace");
  const pluginRoot = path.join(workspaceRoot, "plugins", "fixture");
  const executionMarker = path.join(temporaryRoot, "plugin-executed");
  await fs.mkdir(pluginRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(pluginRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "bb-plugin-standalone-fixture",
          version: "1.0.0",
          engines: { bb: ">=0.36.0", bbPluginSdk: "^0.4.1" },
          dependencies: { "@bb/plugin-sdk": "^0.4.1" },
          bb: {
            name: "Standalone Fixture",
            description: "No-Bun clean-room fixture",
            branding: { icon: "Puzzle" },
            server: "./server.ts",
          },
        },
        null,
        2,
      )}\n`,
    ),
    fs.writeFile(
      path.join(pluginRoot, "server.ts"),
      `await Bun.write(${JSON.stringify(executionMarker)}, "executed");\n`,
    ),
  ]);

  const inspection = await run([movedExecutable, "inspect", pluginRoot], {
    cwd: workspaceRoot,
    env: runtimeEnv,
    allowFailure: true,
  });
  assert(inspection.exitCode === 1, "Missing native bb must fail inspection.");
  assert(
    inspection.stdout.includes("Native bb executable: unavailable") &&
      inspection.stdout.includes("Plugin: Standalone Fixture"),
    "Moved executable did not complete passive inspection.",
  );
  await fs.access(executionMarker).then(
    () => {
      throw new Error(
        "Passive standalone inspection executed target plugin code.",
      );
    },
    () => undefined,
  );

  const unavailableLabRoot = path.join(
    temporaryRoot,
    "checkout-lab-unavailable",
  );
  await fs.rename(labRoot, unavailableLabRoot);
  hiddenLabRoot = unavailableLabRoot;
  const port = await unusedPort();
  server = Bun.spawn(
    [
      movedExecutable,
      "dev",
      pluginRoot,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: workspaceRoot,
      env: runtimeEnv,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  let exited = false;
  void server.exited.then(() => {
    exited = true;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !exited; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/meta.json`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The standalone process is still starting.
    }
    await Bun.sleep(100);
  }
  assert(ready, "Moved executable did not start its embedded surface lab.");

  const index = await fetch(`http://127.0.0.1:${port}/`);
  assert(index.ok, "Embedded surface lab index is unavailable.");
  const metadataResponse = await fetch(`http://127.0.0.1:${port}/meta.json`);
  const metadata = (await metadataResponse.json()) as {
    stories?: Record<string, unknown>;
  };
  assert(
    Object.keys(metadata.stories ?? {}).length === 13,
    "Embedded surface lab does not expose all 13 stories.",
  );
  const metadataHead = await fetch(`http://127.0.0.1:${port}/meta.json`, {
    method: "HEAD",
  });
  assert(metadataHead.ok, "Embedded surface lab HEAD request failed.");
  assert(
    (await metadataHead.arrayBuffer()).byteLength === 0,
    "Embedded surface lab HEAD response unexpectedly contained a body.",
  );

  for (const asset of inspected.manifest.assets) {
    const response = await fetch(
      `http://127.0.0.1:${port}/${asset.route
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    );
    assert(response.ok, `Embedded asset is unavailable: ${asset.route}`);
    const body = new Uint8Array(await response.arrayBuffer());
    assert(
      body.byteLength === asset.size && sha256(body) === asset.sha256,
      `Embedded asset differs from its build input: ${asset.route}`,
    );
  }

  server.kill("SIGTERM");
  await server.exited;
  await fetch(`http://127.0.0.1:${port}/meta.json`).then(
    () => {
      throw new Error("Standalone listener remained reachable after shutdown.");
    },
    () => undefined,
  );
  const stdoutStream = server.stdout;
  const stderrStream = server.stderr;
  assert(
    stdoutStream instanceof ReadableStream,
    "Server stdout was not captured.",
  );
  assert(
    stderrStream instanceof ReadableStream,
    "Server stderr was not captured.",
  );
  const stdout = await new Response(stdoutStream).text();
  const stderr = await new Response(stderrStream).text();
  assert(
    stdout.includes("Launching Fixture surface lab"),
    `Standalone output did not identify its embedded lab.\n${stderr}`,
  );
  server = null;

  console.log(
    `Standalone clean room passed: ${inspected.manifest.target}, mode ${inspected.manifest.mode}, ${inspected.manifest.size} bytes, sha256 ${inspected.manifest.sha256}, ${inspected.manifest.assets.length} assets, 13 stories.`,
  );
} finally {
  if (server) {
    server.kill("SIGKILL");
    await server.exited.catch(() => undefined);
  }
  if (hiddenLabRoot) {
    await fs.rename(hiddenLabRoot, labRoot);
    hiddenLabRoot = null;
  }
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
