import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPluginStudioPackagePaths,
  createPluginStudioStagedManifest,
  stripPluginStudioBundleSourceNames,
} from "./plugin-studio-package-artifact.ts";
import { generateThirdPartyLicenses } from "./third-party-licenses.ts";

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
  integrity: string;
  shasum: string;
}

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = path.join(repositoryRoot, "plugins", "studio");
const defaultArtifactRoot = path.join(
  repositoryRoot,
  "artifacts",
  "plugin-studio-package",
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

export async function buildPluginStudioPackage(options: {
  artifactRoot?: string;
  env?: NodeJS.ProcessEnv;
  npmExecutable: string;
}): Promise<{ artifactPath: string; result: PackResult }> {
  const env = options.env ?? process.env;
  const artifactRoot = path.resolve(
    options.artifactRoot ?? defaultArtifactRoot,
  );
  const sourceManifestText = await fs.readFile(
    path.join(pluginRoot, "package.json"),
    "utf8",
  );
  const sourceManifest = JSON.parse(sourceManifestText) as Parameters<
    typeof createPluginStudioStagedManifest
  >[0];
  const thirdPartyNotices = await fs.readFile(
    path.join(repositoryRoot, "apps", "cli", "THIRD_PARTY_NOTICES.md"),
    "utf8",
  );
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-studio-package-"),
  );
  const stagingRoot = path.join(temporaryRoot, "package");
  const bbExecutable = path.join(pluginRoot, "node_modules", ".bin", "bb");
  const npmExecutable = path.resolve(options.npmExecutable);
  if (!path.isAbsolute(options.npmExecutable)) {
    throw new Error("npmExecutable must be an absolute path.");
  }

  try {
    await runCapture(process.execPath, ["scripts/build-local-package.ts"], {
      cwd: repositoryRoot,
      env,
    });
    await runCapture(bbExecutable, ["plugin", "build", "."], {
      cwd: pluginRoot,
      env,
    });

    await fs.mkdir(stagingRoot, { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(stagingRoot, "package.json"),
        `${JSON.stringify(createPluginStudioStagedManifest(sourceManifest), null, 2)}\n`,
      ),
      copyFile(
        path.join(pluginRoot, "README.md"),
        path.join(stagingRoot, "README.md"),
      ),
      copyFile(
        path.join(pluginRoot, "LICENSE"),
        path.join(stagingRoot, "LICENSE"),
      ),
      fs.writeFile(
        path.join(stagingRoot, "THIRD_PARTY_NOTICES.md"),
        thirdPartyNotices,
      ),
      generateThirdPartyLicenses().then((licenses) =>
        fs.writeFile(
          path.join(stagingRoot, "THIRD_PARTY_LICENSES.md"),
          licenses,
        ),
      ),
      copyFile(
        path.join(pluginRoot, "skills", "plugin-studio", "SKILL.md"),
        path.join(stagingRoot, "skills", "plugin-studio", "SKILL.md"),
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
          stripPluginStudioBundleSourceNames(bundle),
        );
      }),
      copyFile(
        path.join(repositoryRoot, "apps", "cli", "dist", "cli.js"),
        path.join(stagingRoot, "dist", "cli.js"),
      ),
    ]);
    await fs.access(bbExecutable, constants.X_OK);
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
      throw new Error("npm pack did not return exactly one Studio artifact.");
    }
    const result = parsed[0];
    assertPluginStudioPackagePaths(result.files.map(({ path: file }) => file));
    const artifactPath = path.join(artifactRoot, result.filename);
    await fs.access(artifactPath, constants.R_OK);
    return { artifactPath, result };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const npmExecutable = process.env.BB_PLUGIN_STUDIO_NPM_EXECUTABLE;
  if (!npmExecutable) {
    throw new Error(
      "Set BB_PLUGIN_STUDIO_NPM_EXECUTABLE to the absolute npm executable path.",
    );
  }
  const { artifactPath, result } = await buildPluginStudioPackage({
    npmExecutable,
  });
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
