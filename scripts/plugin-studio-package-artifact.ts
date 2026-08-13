export const PLUGIN_STUDIO_PACKAGE_ALLOWLIST = [
  "LICENSE",
  "README.md",
  "THIRD_PARTY_LICENSES.md",
  "THIRD_PARTY_NOTICES.md",
  "dist/app.css",
  "dist/app.js",
  "dist/app.meta.json",
  "dist/cli.js",
  "dist/server.js",
  "dist/server.meta.json",
  "package.json",
  "skills/plugin-studio/SKILL.md",
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function assertPluginStudioPackagePaths(paths: readonly string[]): void {
  if (
    paths.some(
      (file) =>
        file.length === 0 ||
        file.startsWith("/") ||
        file.split(/[\\/]/u).some((part) => part === "" || part === ".."),
    )
  ) {
    throw new Error("Studio package contains an unsafe path.");
  }
  const actual = [...paths].sort(compareText);
  if (
    JSON.stringify(actual) !== JSON.stringify(PLUGIN_STUDIO_PACKAGE_ALLOWLIST)
  ) {
    throw new Error(`Studio package allowlist mismatch: ${actual.join(", ")}`);
  }
}

interface PluginStudioSourceManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly homepage: string;
  readonly repository: Record<string, unknown>;
  readonly bugs: Record<string, unknown>;
  readonly keywords: readonly string[];
  readonly type: string;
  readonly license: string;
  readonly bin: Record<string, string>;
  readonly publishConfig: Record<string, unknown>;
  readonly engines: Record<string, unknown>;
  readonly bb: Record<string, unknown>;
  readonly files?: unknown;
  readonly scripts?: unknown;
  readonly devDependencies?: unknown;
}

export interface PluginStudioStagedManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly homepage: string;
  readonly repository: Record<string, unknown>;
  readonly bugs: Record<string, unknown>;
  readonly keywords: readonly string[];
  readonly type: string;
  readonly license: string;
  readonly bin: Record<string, string>;
  readonly publishConfig: Record<string, unknown>;
  readonly engines: Record<string, unknown>;
  readonly bb: Record<string, unknown> & {
    readonly server: "./dist/server.js";
    readonly app: "./dist/app.js";
  };
  readonly files: readonly string[];
}

export function createPluginStudioStagedManifest(
  source: PluginStudioSourceManifest,
): PluginStudioStagedManifest {
  return {
    name: source.name,
    version: source.version,
    description: source.description,
    homepage: source.homepage,
    repository: source.repository,
    bugs: source.bugs,
    keywords: source.keywords,
    type: source.type,
    license: source.license,
    bin: source.bin,
    publishConfig: source.publishConfig,
    engines: source.engines,
    bb: {
      ...source.bb,
      server: "./dist/server.js",
      app: "./dist/app.js",
    },
    files: PLUGIN_STUDIO_PACKAGE_ALLOWLIST.filter(
      (file) => file !== "package.json",
    ),
  };
}

export function stripPluginStudioBundleSourceNames(bundle: string): string {
  return bundle
    .replace(/^\/\/ (?:src\/|\.\.\/\.\.\/packages\/)[^\r\n]*(?:\r?\n|$)/gmu, "")
    .replace(/^\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n|$)/gmu, "");
}
