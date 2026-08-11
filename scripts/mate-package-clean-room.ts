import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMatePackage } from "./build-mate-package.ts";
import { buildStandaloneFresh } from "./fresh-standalone-build.ts";
import { inspectMatePackageArchive } from "./inspect-mate-package.ts";
import { verifyManagedMatePackage } from "./mate-package-managed-clean-room.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = path.join(repositoryRoot, "plugins", "mate");
const generatedStampPath = path.join(
  pluginRoot,
  "src",
  "generated",
  "runtime-artifact-stamp.ts",
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
}

async function exactTool(name: string): Promise<string> {
  const executable = Bun.which(name);
  assert(executable, `Required clean-room tool is unavailable: ${name}.`);
  return await fs.realpath(executable);
}

async function run(
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ stdout: string; stderr: string }> {
  const child = Bun.spawn([executable, ...args], {
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
  assert(
    exitCode === 0,
    `${executable} ${args.join(" ")} exited with ${exitCode}: ${stderr.trim()}`,
  );
  return { stdout, stderr };
}

async function writeHostileTool(
  directory: string,
  name: string,
  marker: string,
): Promise<void> {
  await fs.writeFile(
    path.join(directory, name),
    `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(name)} >> ${JSON.stringify(marker)}\nexit 97\n`,
    { mode: 0o755 },
  );
}

export async function runMatePackageCleanRoom(): Promise<void> {
  const [npmExecutable, nodeExecutable, tarExecutable, originalStamp] =
    await Promise.all([
      exactTool("npm"),
      exactTool("node"),
      exactTool("tar"),
      fs.readFile(generatedStampPath),
    ]);
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-mate-clean-room-"),
  );
  const originalCwd = process.cwd();
  try {
    const standaloneRoot = path.join(temporaryRoot, "standalone");
    await buildStandaloneFresh({ outputRoot: standaloneRoot });
    const hostileCwd = path.join(temporaryRoot, "hostile-cwd");
    const toolRoot = path.join(temporaryRoot, "bin");
    const homeRoot = path.join(temporaryRoot, "home");
    const dataRoot = path.join(temporaryRoot, "bb-data");
    const marker = path.join(temporaryRoot, "ambient-tool-used");
    const targetMarker = path.join(temporaryRoot, "target-code-executed");
    await Promise.all(
      [hostileCwd, toolRoot, homeRoot, dataRoot].map((directory) =>
        fs.mkdir(directory, { recursive: true }),
      ),
    );
    await Promise.all([
      fs.writeFile(
        path.join(hostileCwd, "package.json"),
        `${JSON.stringify({
          name: "bb-plugin-hostile-target",
          version: "1.0.0",
          type: "module",
          scripts: {
            build: `touch ${targetMarker}`,
            postinstall: `touch ${targetMarker}`,
          },
          bb: { server: "./server.ts", app: "./app.tsx" },
        })}\n`,
      ),
      fs.writeFile(
        path.join(hostileCwd, "server.ts"),
        `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(targetMarker)}, "server"); export default () => {};\n`,
      ),
      fs.writeFile(
        path.join(hostileCwd, "app.tsx"),
        `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(targetMarker)}, "app"); export default {};\n`,
      ),
    ]);
    await fs.symlink(nodeExecutable, path.join(toolRoot, "node"));
    await fs.symlink(npmExecutable, path.join(toolRoot, "npm"));
    await Promise.all(
      ["bb", "bb-mate", "bun", "bunx"].map((name) =>
        writeHostileTool(toolRoot, name, marker),
      ),
    );
    const npmConfig = path.join(temporaryRoot, "npmrc");
    await fs.writeFile(
      npmConfig,
      "audit=false\nfund=false\nignore-scripts=true\npackage-lock=false\nupdate-notifier=false\n",
    );
    const env: NodeJS.ProcessEnv = {
      PATH: `${toolRoot}:/usr/bin:/bin:/usr/sbin`,
      HOME: homeRoot,
      TMPDIR: path.join(temporaryRoot, "tmp"),
      XDG_CACHE_HOME: path.join(temporaryRoot, "cache"),
      XDG_CONFIG_HOME: path.join(temporaryRoot, "config"),
      XDG_DATA_HOME: path.join(temporaryRoot, "data"),
      XDG_STATE_HOME: path.join(temporaryRoot, "state"),
      BB_DATA_DIR: dataRoot,
      BUN_INSTALL: path.join(temporaryRoot, "bun-install"),
      BUN_INSTALL_CACHE_DIR: path.join(temporaryRoot, "bun-cache"),
      npm_config_cache: path.join(temporaryRoot, "npm-cache"),
      npm_config_userconfig: npmConfig,
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_package_lock: "false",
      NO_UPDATE_NOTIFIER: "1",
      CI: "1",
      LANG: "C.UTF-8",
    };
    await fs.mkdir(env.TMPDIR!, { recursive: true });
    process.chdir(hostileCwd);
    const first = await buildMatePackage({
      artifactRoot: path.join(temporaryRoot, "artifact-a"),
      env,
      npmExecutable,
      standaloneRoot,
    });
    const second = await buildMatePackage({
      artifactRoot: path.join(temporaryRoot, "artifact-b"),
      env,
      npmExecutable,
      standaloneRoot,
    });
    const [firstHash, secondHash] = await Promise.all([
      sha256(first.artifactPath),
      sha256(second.artifactPath),
    ]);
    assert(
      firstHash === secondHash,
      "Fresh Mate package builds are not byte-for-byte deterministic.",
    );
    const [firstInspection, secondInspection] = await Promise.all([
      inspectMatePackageArchive(
        first.artifactPath,
        tarExecutable,
        standaloneRoot,
      ),
      inspectMatePackageArchive(
        second.artifactPath,
        tarExecutable,
        standaloneRoot,
      ),
    ]);
    assert(
      JSON.stringify(firstInspection) === JSON.stringify(secondInspection),
      "Fresh Mate package inspections disagree.",
    );
    const bbExecutable = path.join(pluginRoot, "node_modules", ".bin", "bb");
    const bbAppExecutable = path.join(
      pluginRoot,
      "node_modules",
      ".bin",
      "bb-app",
    );
    await Promise.all([
      fs.access(bbExecutable, constants.X_OK),
      fs.access(bbAppExecutable, constants.X_OK),
    ]);
    await verifyManagedMatePackage({
      artifactPath: first.artifactPath,
      integrity: first.result.integrity,
      shasum: first.result.shasum,
      temporaryRoot,
      hostileCwd,
      env,
      bbExecutable,
      bbAppExecutable,
      canonicalStandaloneRoot: standaloneRoot,
    });

    const extractionRoot = path.join(temporaryRoot, "runtime-proof");
    await fs.mkdir(extractionRoot);
    await run(tarExecutable, ["-xzf", first.artifactPath], {
      cwd: extractionRoot,
      env,
    });
    const runtime = path.join(
      extractionRoot,
      "package",
      "runtime",
      "darwin-arm64",
      "bb-mate",
    );
    await fs.access(runtime, constants.X_OK);
    const runtimeResult = await run(runtime, ["--help"], {
      cwd: hostileCwd,
      env: { ...env, PATH: "" },
    });
    assert(
      runtimeResult.stdout.includes("bb-mate"),
      "Extracted Mate runtime did not identify itself.",
    );
    assert(
      !(await fs
        .access(marker)
        .then(() => true)
        .catch(() => false)),
      "Mate package proof invoked an ambient sentinel tool.",
    );
    assert(
      !(await fs
        .access(targetMarker)
        .then(() => true)
        .catch(() => false)),
      "Mate lifecycle inspected or executed disposable target plugin code.",
    );
    assert(
      Buffer.compare(originalStamp, await fs.readFile(generatedStampPath)) ===
        0,
      "Mate package proof did not restore the generated runtime stamp.",
    );
    console.log(
      JSON.stringify(
        {
          artifactSha256: firstHash,
          files: firstInspection.files,
          runtimeSha256: firstInspection.runtimeSha256,
          runtimeSize: firstInspection.runtimeSize,
          runtimeVersion: firstInspection.runtimeVersion,
        },
        null,
        2,
      ),
    );
  } finally {
    process.chdir(originalCwd);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) await runMatePackageCleanRoom();
