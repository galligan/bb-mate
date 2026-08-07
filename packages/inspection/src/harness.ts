import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { HarnessResolution, SdkPublicationResolution } from "./types.ts";
import type { PluginPackageJson } from "./manifest.ts";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function packageVersionFromResolvedFile(
  resolvedFile: string,
): Promise<string | null> {
  let current = path.dirname(resolvedFile);
  for (;;) {
    const packagePath = path.join(current, "package.json");
    try {
      const packageJson = recordOrNull(await readJson(packagePath));
      if (packageJson?.name === "@bb/plugin-sdk") {
        return stringOrNull(packageJson.version);
      }
    } catch {
      // Walk upward until the package root is found.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function declaresPluginSdk(packageJson: PluginPackageJson): boolean {
  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ].some((value) => recordOrNull(value)?.["@bb/plugin-sdk"] !== undefined);
}

export async function resolveHarness(
  pluginRoot: string,
  packageJson: PluginPackageJson,
): Promise<HarnessResolution> {
  if (!declaresPluginSdk(packageJson)) {
    return {
      state: "package-not-declared",
      version: null,
      detail: "The selected plugin does not declare @bb/plugin-sdk.",
    };
  }
  const requireFromPlugin = createRequire(
    path.join(pluginRoot, "package.json"),
  );
  let appRuntime: string;
  try {
    appRuntime = requireFromPlugin.resolve("@bb/plugin-sdk/app");
  } catch (error) {
    return {
      state: "dependency-unresolved",
      version: null,
      detail: `@bb/plugin-sdk is declared but cannot be resolved locally: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  try {
    const frontendHarness = requireFromPlugin.resolve(
      "@bb/plugin-sdk/testing/app",
    );
    requireFromPlugin.resolve("@bb/plugin-sdk/testing");
    return {
      state: "available",
      version:
        (await packageVersionFromResolvedFile(frontendHarness)) ??
        (await packageVersionFromResolvedFile(appRuntime)),
      detail: "The official selected-plugin testing subpaths resolved.",
    };
  } catch (error) {
    return {
      state: "testing-subpath-unavailable",
      version: await packageVersionFromResolvedFile(appRuntime),
      detail: `@bb/plugin-sdk resolves locally, but its testing subpaths do not: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function resolveSdkPublication(): Promise<SdkPublicationResolution> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      "https://registry.npmjs.org/@bb%2Fplugin-sdk",
      {
        headers: { Accept: "application/vnd.npm.install-v1+json" },
        signal: controller.signal,
      },
    );
    if (response.status === 404) {
      return {
        state: "missing",
        version: null,
        detail: "The npm registry does not currently publish @bb/plugin-sdk.",
      };
    }
    if (!response.ok) {
      return {
        state: "unknown",
        version: null,
        detail: `The npm registry returned HTTP ${response.status}; publication status is unknown.`,
      };
    }
    const body = recordOrNull((await response.json()) as unknown);
    const version = stringOrNull(recordOrNull(body?.["dist-tags"])?.latest);
    return version
      ? {
          state: "published",
          version,
          detail: `The npm registry publishes @bb/plugin-sdk ${version}.`,
        }
      : {
          state: "unknown",
          version: null,
          detail: "The npm registry response had no latest dist-tag.",
        };
  } catch (error) {
    return {
      state: "unknown",
      version: null,
      detail: `The npm registry could not be checked: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
