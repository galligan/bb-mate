import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createStandaloneManifest,
  generateStandaloneEntry,
  inspectStandaloneAssets,
  serializeStandaloneManifest,
  type StandaloneManifest,
} from "./standalone-assets.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const workbenchRoot = path.join(repositoryRoot, "apps", "workbench");
const labRoot = path.join(workbenchRoot, "dist", "ladle");
const cliRoot = path.join(repositoryRoot, "apps", "cli");
const defaultOutputRoot = path.join(
  repositoryRoot,
  "artifacts",
  "standalone",
  "darwin-arm64",
);
const outputAllowlist = new Set(["bb-mate", "manifest.json"]);

function containsPath(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

async function assertPhysicalContainment(
  baseRoot: string,
  outputRoot: string,
): Promise<void> {
  const relative = path.relative(baseRoot, outputRoot);
  let current = baseRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current).catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    });
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Standalone output path contains a symlink component: ${current}`,
      );
    }
    if (!stat.isDirectory() && current !== outputRoot) {
      throw new Error(
        `Standalone output path contains a non-directory component: ${current}`,
      );
    }
  }
}

export async function prepareStandaloneOutputRoot(
  root: string,
): Promise<string> {
  const outputRoot = path.resolve(root);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (
    outputRoot === path.parse(outputRoot).root ||
    outputRoot === repositoryRoot ||
    outputRoot === os.homedir() ||
    containsPath(outputRoot, repositoryRoot) ||
    (outputRoot !== defaultOutputRoot &&
      (outputRoot === temporaryRoot ||
        !containsPath(temporaryRoot, outputRoot)))
  ) {
    throw new Error(`Refusing unsafe standalone output root: ${outputRoot}`);
  }

  const allowedBase =
    outputRoot === defaultOutputRoot ? repositoryRoot : temporaryRoot;
  await assertPhysicalContainment(allowedBase, outputRoot);

  const existing = await fs.lstat(outputRoot).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  });
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) {
    throw new Error(
      `Standalone output root must be a real directory: ${outputRoot}`,
    );
  }
  if (!existing) await fs.mkdir(outputRoot, { recursive: true });

  const [physicalBase, physicalOutput] = await Promise.all([
    fs.realpath(allowedBase),
    fs.realpath(outputRoot),
  ]);
  if (!containsPath(physicalBase, physicalOutput)) {
    throw new Error(
      `Standalone output root escapes its physical allowed base: ${outputRoot}`,
    );
  }

  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!outputAllowlist.has(entry.name) || !entry.isFile()) {
      throw new Error(
        `Standalone output root contains an unexpected entry: ${entry.name}`,
      );
    }
  }
  return outputRoot;
}

async function assertCompleteStagedOutput(root: string): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(names) !== JSON.stringify([...outputAllowlist].sort())
  ) {
    throw new Error(
      `Standalone staged output must contain exactly bb-mate and manifest.json: ${names.join(", ")}`,
    );
  }
}

async function removeOwnedOutputDirectory(root: string): Promise<void> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!outputAllowlist.has(entry.name) || !entry.isFile()) {
      throw new Error(
        `Refusing to remove unexpected standalone backup entry: ${entry.name}`,
      );
    }
  }
  await Promise.all(
    entries.map((entry) => fs.unlink(path.join(root, entry.name))),
  );
  await fs.rmdir(root);
}

export async function promoteStandaloneOutputRoot(
  root: string,
  stagedRoot: string,
  options: {
    rename?(source: string, destination: string): Promise<void>;
  } = {},
): Promise<void> {
  const outputRoot = await prepareStandaloneOutputRoot(root);
  const stage = path.resolve(stagedRoot);
  if (path.dirname(stage) !== path.dirname(outputRoot)) {
    throw new Error("Standalone staged output must be beside its final root.");
  }
  const stageStat = await fs.lstat(stage);
  if (stageStat.isSymbolicLink() || !stageStat.isDirectory()) {
    throw new Error("Standalone staged output must be a real directory.");
  }
  await assertCompleteStagedOutput(stage);

  const backup = `${outputRoot}.previous-${randomUUID()}`;
  const rename = options.rename ?? fs.rename;
  let previousMoved = false;
  try {
    await rename(outputRoot, backup);
    previousMoved = true;
    await rename(stage, outputRoot);
  } catch (error) {
    if (previousMoved) {
      try {
        await rename(backup, outputRoot);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Could not promote standalone output or restore the previous artifact.",
        );
      }
    }
    throw error;
  }
  await removeOwnedOutputDirectory(backup);
}

async function run(
  args: readonly string[],
  cwd = repositoryRoot,
): Promise<void> {
  const child = Bun.spawn([...args], {
    cwd,
    env: process.env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${args.join(" ")} exited with code ${exitCode}.`);
  }
}

export interface BuildStandaloneOptions {
  outputRoot?: string;
  buildStories?: boolean;
}

export interface BuildStandaloneResult {
  executablePath: string;
  manifestPath: string;
  manifest: StandaloneManifest;
}

export async function buildStandalone(
  options: BuildStandaloneOptions = {},
): Promise<BuildStandaloneResult> {
  const outputRoot = await prepareStandaloneOutputRoot(
    options.outputRoot ?? defaultOutputRoot,
  );
  if (options.buildStories !== false) {
    await run([process.execPath, "run", "stories:build"], workbenchRoot);
  }

  const graph = await inspectStandaloneAssets(labRoot);
  const temporaryRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-mate-standalone-build-"),
  );
  const stagedRoot = await fs.mkdtemp(
    path.join(path.dirname(outputRoot), ".bb-mate-standalone-stage-"),
  );
  try {
    const generatedEntry = path.join(temporaryRoot, "standalone-entry.ts");
    await fs.writeFile(
      generatedEntry,
      generateStandaloneEntry({
        assets: graph.assets,
        entrypointPath: path.join(cliRoot, "src", "entrypoint.ts"),
      }),
    );

    const stagedExecutablePath = path.join(stagedRoot, "bb-mate");
    const result = await Bun.build({
      entrypoints: [generatedEntry],
      compile: {
        target: "bun-darwin-arm64",
        outfile: stagedExecutablePath,
        autoloadDotenv: false,
        autoloadBunfig: false,
      },
      minify: true,
    });
    if (!result.success) {
      throw new AggregateError(
        result.logs,
        "Could not compile the standalone bb-mate executable.",
      );
    }
    await fs.chmod(stagedExecutablePath, 0o755);

    const sourceManifest = JSON.parse(
      await fs.readFile(path.join(cliRoot, "package.json"), "utf8"),
    ) as { version: string };
    const executable = await fs.readFile(stagedExecutablePath);
    const manifest = createStandaloneManifest({
      graph,
      executable,
      bunVersion: Bun.version,
      runtimeVersion: sourceManifest.version,
    });
    await fs.writeFile(
      path.join(stagedRoot, "manifest.json"),
      serializeStandaloneManifest(manifest),
    );
    await promoteStandaloneOutputRoot(outputRoot, stagedRoot);
    const executablePath = path.join(outputRoot, "bb-mate");
    const manifestPath = path.join(outputRoot, "manifest.json");
    return { executablePath, manifestPath, manifest };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
    await fs.rm(stagedRoot, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const result = await buildStandalone();
  console.log(
    JSON.stringify(
      {
        artifact: path.relative(repositoryRoot, result.executablePath),
        manifest: path.relative(repositoryRoot, result.manifestPath),
        target: result.manifest.target,
        size: result.manifest.size,
        sha256: result.manifest.sha256,
        stories: result.manifest.storyCount,
        assets: result.manifest.assets.length,
      },
      null,
      2,
    ),
  );
}
