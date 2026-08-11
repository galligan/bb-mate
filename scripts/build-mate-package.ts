import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertMatePackagePaths,
  assertMateRuntimeCopyMode,
  createMateRuntimeStamp,
  createMateStagedManifest,
  createMateThirdPartyNotices,
  generateMateRuntimeStampModule,
  pinnedBunLicenseBytes,
  stripMateBundleSourceNames,
} from "./mate-package-artifact.ts";
import { inspectStandalone } from "./inspect-standalone.ts";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
  integrity: string;
  shasum: string;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = path.join(repositoryRoot, "plugins", "mate");
const generatedStampPath = path.join(
  pluginRoot,
  "src",
  "generated",
  "runtime-artifact-stamp.ts",
);
const defaultArtifactRoot = path.join(
  repositoryRoot,
  "artifacts",
  "mate-package",
);

async function runCapture(
  executable: string,
  args: readonly string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<string> {
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
  if (exitCode !== 0) {
    throw new Error(
      `${executable} ${args.join(" ")} exited with code ${exitCode}: ${stderr.trim()}`,
    );
  }
  return stdout;
}

async function copyFile(source: string, destination: string): Promise<void> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function buildMatePackage(options: {
  artifactRoot?: string;
  env?: NodeJS.ProcessEnv;
  npmExecutable: string;
  standaloneRoot?: string;
}): Promise<{ artifactPath: string; result: PackResult }> {
  const env = options.env ?? process.env;
  const artifactRoot = path.resolve(
    options.artifactRoot ?? defaultArtifactRoot,
  );
  const [standalone, sourceManifestText, originalStamp] = await Promise.all([
    inspectStandalone(options.standaloneRoot),
    fs.readFile(path.join(pluginRoot, "package.json"), "utf8"),
    readOptional(generatedStampPath),
  ]);
  const sourceManifest = JSON.parse(sourceManifestText) as Parameters<
    typeof createMateStagedManifest
  >[0];
  const stamp = createMateRuntimeStamp(
    standalone.manifest,
    standalone.manifestBytes,
  );
  const thirdPartyNotices = await fs.readFile(
    path.join(repositoryRoot, "apps", "cli", "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-mate-package-"),
  );
  const stagingRoot = path.join(temporaryRoot, "package");
  const bbExecutable = path.join(pluginRoot, "node_modules", ".bin", "bb");
  const npmExecutable = path.resolve(options.npmExecutable);
  if (!path.isAbsolute(options.npmExecutable)) {
    throw new Error("npmExecutable must be an absolute path.");
  }

  try {
    await fs.writeFile(
      generatedStampPath,
      generateMateRuntimeStampModule(stamp),
    );
    await runCapture(bbExecutable, ["plugin", "build", "."], {
      cwd: pluginRoot,
      env,
    });

    await fs.mkdir(stagingRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(stagingRoot, "package.json"),
        `${JSON.stringify(createMateStagedManifest(sourceManifest), null, 2)}\n`,
      ),
      copyFile(
        path.join(pluginRoot, "README.md"),
        path.join(stagingRoot, "README.md"),
      ),
      copyFile(
        path.join(pluginRoot, "LICENSE"),
        path.join(stagingRoot, "LICENSE"),
      ),
      fs
        .readFile(path.join(pluginRoot, "BUN_LICENSE.md"))
        .then((license) =>
          fs.writeFile(
            path.join(stagingRoot, "BUN_LICENSE.md"),
            pinnedBunLicenseBytes(license),
          ),
        ),
      fs.writeFile(
        path.join(stagingRoot, "THIRD_PARTY_NOTICES.md"),
        createMateThirdPartyNotices(
          thirdPartyNotices,
          standalone.manifest.bunVersion,
        ),
      ),
      generateThirdPartyLicenses().then((licenses) =>
        fs.writeFile(
          path.join(stagingRoot, "THIRD_PARTY_LICENSES.md"),
          licenses,
        ),
      ),
      copyFile(
        path.join(pluginRoot, "skills", "plugin-workbench", "SKILL.md"),
        path.join(stagingRoot, "skills", "plugin-workbench", "SKILL.md"),
      ),
      ...["server.meta.json", "app.css", "app.meta.json"].map((file) =>
        copyFile(
          path.join(pluginRoot, "dist", file),
          path.join(stagingRoot, "dist", file),
        ),
      ),
      ...["server.js", "app.js"].map(async (file) => {
        const bundle = await fs.readFile(
          path.join(pluginRoot, "dist", file),
          "utf8",
        );
        await fs.mkdir(path.join(stagingRoot, "dist"), { recursive: true });
        await fs.writeFile(
          path.join(stagingRoot, "dist", file),
          stripMateBundleSourceNames(bundle),
        );
      }),
      copyFile(
        standalone.executablePath,
        path.join(stagingRoot, "runtime", "darwin-arm64", "bb-mate"),
      ),
      copyFile(
        path.join(standalone.artifactRoot, "manifest.json"),
        path.join(stagingRoot, "runtime", "darwin-arm64", "manifest.json"),
      ),
    ]);
    const stagedExecutable = path.join(
      stagingRoot,
      "runtime",
      "darwin-arm64",
      "bb-mate",
    );
    const [sourceExecutableStat, stagedExecutableStat] = await Promise.all([
      fs.stat(standalone.executablePath),
      fs.stat(stagedExecutable),
    ]);
    const sourceMode = sourceExecutableStat.mode & 0o7777;
    const stagedMode = stagedExecutableStat.mode & 0o7777;
    assertMateRuntimeCopyMode(sourceMode, stagedMode);
    await fs.access(bbExecutable, constants.X_OK);
    await fs.access(stagedExecutable, constants.X_OK);
    await fs.mkdir(artifactRoot, { recursive: true });
    const output = await runCapture(
      npmExecutable,
      [
        "pack",
        stagingRoot,
        "--pack-destination",
        artifactRoot,
        "--json",
        "--ignore-scripts",
      ],
      { cwd: temporaryRoot, env },
    );
    const parsed = JSON.parse(output) as PackResult[];
    if (parsed.length !== 1 || !parsed[0]) {
      throw new Error("npm pack did not return exactly one Mate artifact.");
    }
    const result = parsed[0];
    assertMatePackagePaths(result.files.map(({ path: file }) => file));
    const artifactPath = path.join(artifactRoot, result.filename);
    await fs.access(artifactPath, constants.R_OK);
    return { artifactPath, result };
  } finally {
    if (originalStamp === undefined) {
      await fs.unlink(generatedStampPath).catch(() => undefined);
    } else {
      await fs.writeFile(generatedStampPath, originalStamp);
    }
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const npmExecutable = process.env.BB_MATE_NPM_EXECUTABLE;
  if (!npmExecutable) {
    throw new Error(
      "Set BB_MATE_NPM_EXECUTABLE to the absolute npm executable path.",
    );
  }
  const { artifactPath, result } = await buildMatePackage({ npmExecutable });
  console.log(
    JSON.stringify(
      {
        artifact: path.relative(repositoryRoot, artifactPath),
        files: result.files.length,
        integrity: result.integrity,
        shasum: result.shasum,
      },
      null,
      2,
    ),
  );
}
