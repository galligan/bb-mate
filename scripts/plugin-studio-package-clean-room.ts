import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPluginStudioPackage } from "./build-plugin-studio-package.ts";
import { inspectPluginStudioPackageArchive } from "./inspect-plugin-studio-package.ts";
import { verifyManagedPluginStudioPackage } from "./plugin-studio-package-managed-clean-room.ts";
import { fingerprintProfileRoots } from "./profile-fingerprint.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = path.join(repositoryRoot, "plugins", "studio");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exactTool(name: string): Promise<string> {
  const executable = Bun.which(name);
  assert(executable, `Required clean-room tool is unavailable: ${name}.`);
  return fs.realpath(executable);
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex");
}

async function writeHostileTool(
  directory: string,
  name: string,
  marker: string,
) {
  await fs.writeFile(
    path.join(directory, name),
    `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(name)} >> ${JSON.stringify(marker)}\nexit 97\n`,
    { mode: 0o755 },
  );
}

async function writePassiveTarget(
  root: string,
  id: string,
  label: string,
  marker: string,
) {
  await fs.mkdir(root, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({
        name: `bb-plugin-${id}`,
        version: "1.2.3",
        scripts: { build: `touch ${marker}`, postinstall: `touch ${marker}` },
        bb: {
          name: label,
          description: `${id} clean-room target`,
          branding: { icon: "Puzzle" },
          server: "./server.ts",
          app: "./app.tsx",
        },
      })}\n`,
    ),
    fs.writeFile(
      path.join(root, "server.ts"),
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "server"); export default () => {};\n`,
    ),
    fs.writeFile(
      path.join(root, "app.tsx"),
      `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "app"); export default {};\n`,
    ),
  ]);
}

export async function runPluginStudioPackageCleanRoom(): Promise<void> {
  const normalRoots = [
    path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "bb",
      "plugins",
      "studio",
    ),
    path.join(os.homedir(), ".bb", "plugins", "studio"),
  ];
  const normalBefore = await fingerprintProfileRoots(normalRoots);
  const [npmExecutable, nodeExecutable, tarExecutable] = await Promise.all([
    exactTool("npm"),
    exactTool("node"),
    exactTool("tar"),
  ]);
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-studio-clean-room-"),
  );
  const originalCwd = process.cwd();
  try {
    const hostileCwd = path.join(temporaryRoot, "hostile-cwd");
    const toolRoot = path.join(temporaryRoot, "bin");
    const homeRoot = path.join(temporaryRoot, "home");
    const dataRoot = path.join(temporaryRoot, "bb-data");
    const marker = path.join(temporaryRoot, "ambient-tool-used");
    const targetMarker = path.join(temporaryRoot, "target-code-executed");
    const sourceRoot = path.join(hostileCwd, "bb-plugin-studio-source");
    const gridRoot = path.join(hostileCwd, "grid-source");
    await Promise.all(
      [hostileCwd, toolRoot, homeRoot, dataRoot, sourceRoot, gridRoot].map(
        (root) => fs.mkdir(root, { recursive: true }),
      ),
    );
    await Promise.all([
      fs.writeFile(
        path.join(hostileCwd, "package.json"),
        '{"name":"hostile","private":true}\n',
      ),
      ...[sourceRoot, gridRoot].map((root) =>
        fs.writeFile(
          path.join(root, "package.json"),
          `${JSON.stringify({ name: path.basename(root), private: true, workspaces: ["plugins/*"] })}\n`,
        ),
      ),
      writePassiveTarget(
        path.join(sourceRoot, "plugins", "linear"),
        "linear",
        "Linear",
        targetMarker,
      ),
      writePassiveTarget(
        path.join(sourceRoot, "plugins", "plugin-studio"),
        "plugin-studio",
        "Plugin Studio",
        targetMarker,
      ),
    ]);
    await fs.symlink(nodeExecutable, path.join(toolRoot, "node"));
    await fs.symlink(npmExecutable, path.join(toolRoot, "npm"));
    await Promise.all(
      ["bb", "bb-plugin-studio", "bun", "bunx"].map((name) =>
        writeHostileTool(toolRoot, name, marker),
      ),
    );
    const env: NodeJS.ProcessEnv = {
      PATH: `${toolRoot}:/usr/bin:/bin:/usr/sbin`,
      HOME: homeRoot,
      TMPDIR: path.join(temporaryRoot, "tmp"),
      BB_DATA_DIR: dataRoot,
      npm_config_cache: path.join(temporaryRoot, "npm-cache"),
      npm_config_ignore_scripts: "true",
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_package_lock: "false",
      CI: "1",
      LANG: "C.UTF-8",
    };
    await fs.mkdir(env.TMPDIR!, { recursive: true });
    process.chdir(hostileCwd);
    const first = await buildPluginStudioPackage({
      artifactRoot: path.join(temporaryRoot, "artifact-a"),
      env,
      npmExecutable,
    });
    const second = await buildPluginStudioPackage({
      artifactRoot: path.join(temporaryRoot, "artifact-b"),
      env,
      npmExecutable,
    });
    const [firstHash, secondHash] = await Promise.all([
      sha256(first.artifactPath),
      sha256(second.artifactPath),
    ]);
    assert(
      firstHash === secondHash,
      "Fresh Studio package builds are not byte-for-byte deterministic.",
    );
    const [firstInspection, secondInspection] = await Promise.all([
      inspectPluginStudioPackageArchive(first.artifactPath, tarExecutable),
      inspectPluginStudioPackageArchive(second.artifactPath, tarExecutable),
    ]);
    assert(
      JSON.stringify(firstInspection) === JSON.stringify(secondInspection),
      "Fresh Studio package inspections disagree.",
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
    await verifyManagedPluginStudioPackage({
      artifactPath: first.artifactPath,
      integrity: first.result.integrity,
      shasum: first.result.shasum,
      temporaryRoot,
      hostileCwd,
      env,
      bbExecutable,
      bbAppExecutable,
      bbPluginStudioSourceRoot: sourceRoot,
      gridSourceRoot: gridRoot,
      targetMarker,
      ambientMarker: marker,
    });
    assert(
      !(await fs
        .access(marker)
        .then(() => true)
        .catch(() => false)),
      "Studio package proof invoked an ambient sentinel tool.",
    );
    assert(
      !(await fs
        .access(targetMarker)
        .then(() => true)
        .catch(() => false)),
      "Studio lifecycle executed disposable target plugin code.",
    );
    assert(
      (await fingerprintProfileRoots(normalRoots)) === normalBefore,
      "Studio package proof mutated the normal bb profile.",
    );
    console.log(
      JSON.stringify(
        { artifactSha256: firstHash, files: firstInspection.files },
        null,
        2,
      ),
    );
  } finally {
    process.chdir(originalCwd);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) await runPluginStudioPackageCleanRoom();
