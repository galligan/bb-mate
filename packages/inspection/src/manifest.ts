import { promises as fs } from "node:fs";
import path from "node:path";
import { assertValidCompactSvg } from "./svg.ts";

export interface PluginPackageJson extends Record<string, unknown> {
  pluginId: string;
  name: string;
  version: string;
  dependencies?: unknown;
  devDependencies?: unknown;
  optionalDependencies?: unknown;
  peerDependencies?: unknown;
  engines?: {
    bb?: string;
    bbPluginSdk?: string;
  };
  bb: {
    name: string;
    description: string;
    branding: Record<string, unknown>;
    server: string;
    app?: string;
    skills?: string[];
    themes?: Array<{
      id: string;
      name: string;
      description?: string;
      css: string;
    }>;
  };
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, label);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`${label}.${unknown} is not supported`);
}

function resolveContainedPath(
  rootDir: string,
  entry: string,
  label: string,
): string {
  if (path.isAbsolute(entry)) throw new Error(`${label} must be relative`);
  const resolved = path.resolve(rootDir, entry);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error(`${label} escapes the plugin directory`);
  }
  return resolved;
}

async function validateExistingFile(
  rootDir: string,
  entry: string,
  label: string,
): Promise<void> {
  const resolved = resolveContainedPath(rootDir, entry, label);
  let entryStat;
  try {
    entryStat = await fs.stat(resolved);
  } catch {
    throw new Error(`${label} points at a missing file: ${entry}`);
  }
  if (!entryStat.isFile()) throw new Error(`${label} must point at a file`);
  const [realRoot, realEntry] = await Promise.all([
    fs.realpath(rootDir),
    fs.realpath(resolved),
  ]);
  if (!realEntry.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the plugin directory through a symlink`);
  }
}

function validateBranding(value: unknown): Record<string, unknown> {
  const branding = recordOrNull(value);
  if (!branding) throw new Error("bb.branding must be an object");
  rejectUnknownKeys(branding, ["icon", "logo"], "bb.branding");
  const icon = optionalString(branding.icon, "bb.branding.icon");
  const logo = recordOrNull(branding.logo);
  if (!icon && !logo) {
    throw new Error(
      "bb.branding must declare at least branding.icon or branding.logo.light",
    );
  }
  if (branding.logo !== undefined && !logo) {
    throw new Error("bb.branding.logo must be an object");
  }
  let normalizedLogo: Record<string, unknown> | undefined;
  if (logo) {
    rejectUnknownKeys(logo, ["light", "dark"], "bb.branding.logo");
    const light = requiredString(logo.light, "bb.branding.logo.light");
    const dark = optionalString(logo.dark, "bb.branding.logo.dark");
    normalizedLogo = { light, ...(dark ? { dark } : {}) };
  }
  if (icon?.startsWith("./") && !icon.toLowerCase().endsWith(".svg")) {
    throw new Error("plugin-owned bb.branding.icon must point at an .svg file");
  }
  return {
    ...(icon ? { icon } : {}),
    ...(normalizedLogo ? { logo: normalizedLogo } : {}),
  };
}

function validateStringArray(
  value: unknown,
  label: string,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) =>
    requiredString(entry, `${label}.${index}`),
  );
}

function validateThemes(value: unknown): PluginPackageJson["bb"]["themes"] {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("bb.themes must be an array");
  const ids = new Set<string>();
  return value.map((entry, index) => {
    const theme = recordOrNull(entry);
    if (!theme) throw new Error(`bb.themes.${index} must be an object`);
    rejectUnknownKeys(
      theme,
      ["id", "name", "description", "css"],
      `bb.themes.${index}`,
    );
    const id = requiredString(theme.id, `bb.themes.${index}.id`);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || id.length > 64) {
      throw new Error(`bb.themes.${index}.id is invalid`);
    }
    if (ids.has(id)) throw new Error(`bb.themes contains duplicate id ${id}`);
    ids.add(id);
    return {
      id,
      name: requiredString(theme.name, `bb.themes.${index}.name`),
      ...(theme.description === undefined
        ? {}
        : {
            description: requiredString(
              theme.description,
              `bb.themes.${index}.description`,
            ),
          }),
      css: requiredString(theme.css, `bb.themes.${index}.css`),
    };
  });
}

export async function readPackageJson(pluginRoot: string): Promise<unknown> {
  return JSON.parse(
    await fs.readFile(path.join(pluginRoot, "package.json"), "utf8"),
  ) as unknown;
}

export async function discoverPluginRoots(
  workspaceRoot: string,
): Promise<string[]> {
  const pluginsRoot = path.join(workspaceRoot, "plugins");
  const entries = await fs
    .readdir(pluginsRoot, { withFileTypes: true })
    .catch(() => null);
  if (!entries) return [];
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const candidate = path.join(pluginsRoot, entry.name);
    try {
      const packageStat = await fs.stat(path.join(candidate, "package.json"));
      if (packageStat.isFile()) candidates.push(candidate);
    } catch {
      // Ordinary non-package directories are not plugin candidates.
    }
  }
  return candidates.sort();
}

export async function validatePluginManifest(
  value: unknown,
  pluginRoot: string,
): Promise<PluginPackageJson> {
  const root = recordOrNull(value);
  if (!root) throw new Error("package.json must contain a JSON object");
  const name = requiredString(root.name, "name");
  const version = requiredString(root.version, "version");
  const bb = recordOrNull(root.bb);
  if (!bb) throw new Error("bb must be an object");
  rejectUnknownKeys(
    bb,
    ["name", "description", "branding", "server", "app", "skills", "themes"],
    "bb",
  );
  const server = requiredString(bb.server, "bb.server");
  const app = optionalString(bb.app, "bb.app");
  const branding = validateBranding(bb.branding);
  const skills = validateStringArray(bb.skills, "bb.skills");
  const themes = validateThemes(bb.themes);

  const enginesValue = root.engines;
  const engines =
    enginesValue === undefined ? null : recordOrNull(enginesValue);
  if (enginesValue !== undefined && !engines) {
    throw new Error("engines must be an object");
  }
  const bbEngine = engines
    ? optionalString(engines.bb, "engines.bb")
    : undefined;
  const sdkEngine = engines
    ? optionalString(engines.bbPluginSdk, "engines.bbPluginSdk")
    : undefined;
  await validateExistingFile(pluginRoot, server, "bb.server");
  if (app) await validateExistingFile(pluginRoot, app, "bb.app");
  for (const skillRoot of skills ?? ["skills"]) {
    resolveContainedPath(
      pluginRoot,
      skillRoot.replace(/\/\*$/, ""),
      "bb.skills",
    );
  }
  for (const [label, asset] of [
    ["bb.branding.icon", branding.icon],
    ["bb.branding.logo.light", recordOrNull(branding.logo)?.light],
    ["bb.branding.logo.dark", recordOrNull(branding.logo)?.dark],
  ] as const) {
    if (typeof asset !== "string") continue;
    if (label === "bb.branding.icon" && !asset.startsWith("./")) continue;
    if (!/\.(svg|png|webp)$/i.test(asset)) {
      throw new Error(`${label} must point at a .svg, .png, or .webp file`);
    }
    await validateExistingFile(pluginRoot, asset, label);
    if (label === "bb.branding.icon") {
      assertValidCompactSvg(
        await fs.readFile(resolveContainedPath(pluginRoot, asset, label)),
        label,
      );
    }
  }
  for (const theme of themes ?? []) {
    if (!theme.css.toLowerCase().endsWith(".css")) {
      throw new Error(`bb.themes.${theme.id}.css must point at a .css file`);
    }
    await validateExistingFile(
      pluginRoot,
      theme.css,
      `bb.themes.${theme.id}.css`,
    );
  }

  return {
    ...root,
    pluginId: derivePluginId(name),
    name,
    version,
    ...(engines
      ? {
          engines: {
            ...(bbEngine ? { bb: bbEngine } : {}),
            ...(sdkEngine ? { bbPluginSdk: sdkEngine } : {}),
          },
        }
      : {}),
    bb: {
      name: requiredString(bb.name, "bb.name"),
      description: requiredString(bb.description, "bb.description"),
      branding,
      server,
      ...(app ? { app } : {}),
      ...(skills ? { skills } : {}),
      ...(themes ? { themes } : {}),
    },
  };
}

export function derivePluginId(packageName: string): string {
  const base = packageName.includes("/")
    ? (packageName.split("/").at(-1) ?? packageName)
    : packageName;
  const id = base
    .replace(/^bb-plugin-/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!id) throw new Error(`cannot derive a plugin id from ${packageName}`);
  return id;
}
