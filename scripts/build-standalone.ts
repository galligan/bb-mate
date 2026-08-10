import { promises as fs } from "node:fs";
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

export async function prepareStandaloneOutputRoot(
  root: string,
): Promise<string> {
  const outputRoot = path.resolve(root);
  if (
    outputRoot === path.parse(outputRoot).root ||
    outputRoot === repositoryRoot ||
    outputRoot === os.homedir() ||
    containsPath(outputRoot, repositoryRoot)
  ) {
    throw new Error(`Refusing unsafe standalone output root: ${outputRoot}`);
  }

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

  const entries = await fs.readdir(outputRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!outputAllowlist.has(entry.name) || !entry.isFile()) {
      throw new Error(
        `Standalone output root contains an unexpected entry: ${entry.name}`,
      );
    }
  }
  await Promise.all(
    entries.map((entry) => fs.unlink(path.join(outputRoot, entry.name))),
  );
  return outputRoot;
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
  try {
    const generatedEntry = path.join(temporaryRoot, "standalone-entry.ts");
    await fs.writeFile(
      generatedEntry,
      generateStandaloneEntry({
        assets: graph.assets,
        entrypointPath: path.join(cliRoot, "src", "entrypoint.ts"),
      }),
    );

    const executablePath = path.join(outputRoot, "bb-mate");
    const result = await Bun.build({
      entrypoints: [generatedEntry],
      compile: {
        target: "bun-darwin-arm64",
        outfile: executablePath,
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
    await fs.chmod(executablePath, 0o755);

    const sourceManifest = JSON.parse(
      await fs.readFile(path.join(cliRoot, "package.json"), "utf8"),
    ) as { version: string };
    const executable = await fs.readFile(executablePath);
    const manifest = createStandaloneManifest({
      graph,
      executable,
      bunVersion: Bun.version,
      runtimeVersion: sourceManifest.version,
    });
    const manifestPath = path.join(outputRoot, "manifest.json");
    await fs.writeFile(manifestPath, serializeStandaloneManifest(manifest));
    return { executablePath, manifestPath, manifest };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
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
