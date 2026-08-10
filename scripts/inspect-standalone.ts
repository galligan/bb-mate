import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StandaloneManifest } from "./standalone-assets.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const defaultArtifactRoot = path.join(
  repositoryRoot,
  "artifacts",
  "standalone",
  "darwin-arm64",
);
const artifactAllowlist = ["bb-mate", "manifest.json"] as const;
const machMagic64 = 0xfeedfacf;
const cpuTypeArm64 = 0x0100000c;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export interface StandaloneInspection {
  artifactRoot: string;
  executablePath: string;
  manifest: StandaloneManifest;
}

export async function inspectStandalone(
  artifactRoot = defaultArtifactRoot,
): Promise<StandaloneInspection> {
  const resolvedRoot = path.resolve(artifactRoot);
  const entries = (
    await fs.readdir(resolvedRoot, { withFileTypes: true })
  ).sort((left, right) => compareText(left.name, right.name));
  assert(
    entries.every((entry) => entry.isFile()),
    "Standalone artifact directory may contain files only.",
  );
  assert(
    JSON.stringify(entries.map((entry) => entry.name)) ===
      JSON.stringify(artifactAllowlist),
    `Standalone artifact allowlist mismatch: ${entries.map((entry) => entry.name).join(", ")}`,
  );

  const executablePath = path.join(resolvedRoot, "bb-mate");
  const manifest = JSON.parse(
    await fs.readFile(path.join(resolvedRoot, "manifest.json"), "utf8"),
  ) as StandaloneManifest;
  const [workspaceManifest, cliManifest] = await Promise.all([
    fs
      .readFile(path.join(repositoryRoot, "package.json"), "utf8")
      .then((value) => JSON.parse(value) as { packageManager: string }),
    fs
      .readFile(
        path.join(repositoryRoot, "apps", "cli", "package.json"),
        "utf8",
      )
      .then((value) => JSON.parse(value) as { version: string }),
  ]);
  const executable = await fs.readFile(executablePath);
  const stat = await fs.stat(executablePath);

  assert(
    manifest.schemaVersion === 1,
    "Unexpected standalone manifest schema.",
  );
  assert(
    manifest.artifact === "bb-mate",
    "Unexpected standalone artifact name.",
  );
  assert(
    manifest.target === "bun-darwin-arm64" &&
      manifest.platform === "darwin" &&
      manifest.architecture === "arm64",
    "Standalone manifest target must be macOS arm64.",
  );
  assert(manifest.mode === "0755", "Standalone manifest mode must be 0755.");
  assert(
    manifest.bunVersion ===
      workspaceManifest.packageManager.replace(/^bun@/, ""),
    "Standalone manifest Bun version differs from the workspace pin.",
  );
  assert(
    manifest.runtimeVersion === cliManifest.version,
    "Standalone manifest runtime version differs from the CLI package.",
  );
  assert(
    (stat.mode & 0o777) === 0o755,
    `Standalone executable mode is ${(stat.mode & 0o777).toString(8)}, expected 755.`,
  );
  await fs.access(executablePath, constants.X_OK);
  assert(
    executable.byteLength >= 8 &&
      executable.readUInt32LE(0) === machMagic64 &&
      executable.readInt32LE(4) === cpuTypeArm64,
    "Standalone executable is not a 64-bit arm64 Mach-O.",
  );
  assert(
    manifest.size === executable.byteLength,
    "Standalone executable size does not match its manifest.",
  );
  assert(
    manifest.sha256 === sha256(executable),
    "Standalone executable SHA-256 does not match its manifest.",
  );
  assert(
    manifest.storyCount === 13,
    "Standalone manifest must contain 13 stories.",
  );
  assert(
    manifest.assets.length > 2,
    "Standalone asset graph is unexpectedly small.",
  );
  assert(
    manifest.assets.some((asset) => asset.route === "index.html") &&
      manifest.assets.some((asset) => asset.route === "meta.json"),
    "Standalone manifest is missing required lab assets.",
  );
  assert(
    manifest.assets.every(
      (asset) =>
        asset.route.length > 0 &&
        asset.size >= 0 &&
        /^[a-f0-9]{64}$/.test(asset.sha256),
    ),
    "Standalone manifest contains invalid asset metadata.",
  );
  const routes = manifest.assets.map((asset) => asset.route);
  assert(
    JSON.stringify(routes) ===
      JSON.stringify(
        [...routes].sort((left, right) => compareText(left, right)),
      ),
    "Standalone manifest assets are not sorted.",
  );
  assert(
    new Set(routes).size === routes.length,
    "Standalone manifest contains duplicate routes.",
  );

  return { artifactRoot: resolvedRoot, executablePath, manifest };
}

if (import.meta.main) {
  const inspection = await inspectStandalone(process.argv[2]);
  console.log(
    JSON.stringify(
      {
        artifactRoot: path.relative(repositoryRoot, inspection.artifactRoot),
        target: inspection.manifest.target,
        mode: inspection.manifest.mode,
        size: inspection.manifest.size,
        sha256: inspection.manifest.sha256,
        stories: inspection.manifest.storyCount,
        assets: inspection.manifest.assets.length,
      },
      null,
      2,
    ),
  );
}
