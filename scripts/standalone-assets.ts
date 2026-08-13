import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface StandaloneAsset {
  route: string;
  sourcePath: string;
  size: number;
  sha256: string;
}

export interface StandaloneAssetGraph {
  assets: StandaloneAsset[];
  storyCount: number;
}

export interface StandaloneManifest {
  schemaVersion: 1;
  artifact: "bb-plugin-studio-runtime";
  target: "bun-darwin-arm64";
  platform: "darwin";
  architecture: "arm64";
  mode: "0755";
  size: number;
  sha256: string;
  bunVersion: string;
  runtimeVersion: string;
  storyCount: number;
  assets: Array<{
    route: string;
    size: number;
    sha256: string;
  }>;
}

const requiredRoutes = ["index.html", "meta.json"] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function routeFromRelative(relativePath: string): string {
  const route = relativePath.split(path.sep).join("/");
  if (
    route.length === 0 ||
    route.startsWith("/") ||
    route
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid standalone asset route: ${relativePath}`);
  }
  return route;
}

async function collectFiles(root: string, relative = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  entries.sort((left, right) => compareText(left.name, right.name));

  const files: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Standalone asset graph contains a symlink: ${child}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    } else {
      throw new Error(`Standalone asset graph contains a non-file: ${child}`);
    }
  }
  return files;
}

export async function inspectStandaloneAssets(
  root: string,
  expectedStoryCount = 13,
): Promise<StandaloneAssetGraph> {
  const resolvedRoot = await fs.realpath(root);
  const relatives = await collectFiles(resolvedRoot);
  const assets = await Promise.all(
    relatives.map(async (relativePath): Promise<StandaloneAsset> => {
      const sourcePath = path.join(resolvedRoot, relativePath);
      const content = await fs.readFile(sourcePath);
      return {
        route: routeFromRelative(relativePath),
        sourcePath,
        size: content.byteLength,
        sha256: sha256(content),
      };
    }),
  );
  assets.sort((left, right) => compareText(left.route, right.route));

  const routes = new Set(assets.map((asset) => asset.route));
  if (routes.size !== assets.length) {
    throw new Error("Standalone asset graph contains duplicate routes.");
  }
  for (const required of requiredRoutes) {
    if (!routes.has(required)) {
      throw new Error(`Standalone asset graph is missing ${required}.`);
    }
  }

  const metadata = JSON.parse(
    await fs.readFile(path.join(resolvedRoot, "meta.json"), "utf8"),
  ) as { stories?: Record<string, unknown> };
  const storyCount = Object.keys(metadata.stories ?? {}).length;
  if (storyCount !== expectedStoryCount) {
    throw new Error(
      `Expected ${expectedStoryCount} standalone stories, found ${storyCount}.`,
    );
  }

  return { assets, storyCount };
}

export function generateStandaloneEntry(options: {
  assets: readonly StandaloneAsset[];
  entrypointPath: string;
  runtimeVersion: string;
}): string {
  const assets = [...options.assets].sort((left, right) =>
    compareText(left.route, right.route),
  );
  const imports = assets.map(
    (asset, index) =>
      `import embeddedAsset${index} from ${JSON.stringify(asset.sourcePath)} with { type: "file" };`,
  );
  const manifest = assets.map(
    (asset, index) =>
      `  ${JSON.stringify(`/${asset.route}`)}: embeddedAsset${index},`,
  );

  return [
    ...imports,
    `import { runBbStudioEntrypoint } from ${JSON.stringify(options.entrypointPath)};`,
    "",
    "const result = await runBbStudioEntrypoint({",
    '  mode: "standalone",',
    `  runtimeVersion: ${JSON.stringify(options.runtimeVersion)},`,
    "  assets: {",
    ...manifest,
    "  },",
    "});",
    "if (result.signal) process.kill(process.pid, result.signal);",
    "process.exit(result.exitCode ?? 1);",
    "",
  ].join("\n");
}

export function createStandaloneManifest(options: {
  graph: StandaloneAssetGraph;
  executable: Uint8Array;
  bunVersion: string;
  runtimeVersion: string;
}): StandaloneManifest {
  return {
    schemaVersion: 1,
    artifact: "bb-plugin-studio-runtime",
    target: "bun-darwin-arm64",
    platform: "darwin",
    architecture: "arm64",
    mode: "0755",
    size: options.executable.byteLength,
    sha256: sha256(options.executable),
    bunVersion: options.bunVersion,
    runtimeVersion: options.runtimeVersion,
    storyCount: options.graph.storyCount,
    assets: options.graph.assets.map(
      ({ route, size, sha256: assetSha256 }) => ({
        route,
        size,
        sha256: assetSha256,
      }),
    ),
  };
}

export function serializeStandaloneManifest(
  manifest: StandaloneManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
