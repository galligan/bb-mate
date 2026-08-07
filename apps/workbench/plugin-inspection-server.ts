import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import type {
  NativeBuildMetadata,
  PluginInspection,
  PluginTarget,
} from "./src/plugin-inspection";

const execFileAsync = promisify(execFile);

interface PluginPackageJson {
  name?: unknown;
  version?: unknown;
  engines?: {
    bb?: unknown;
    bbPluginSdk?: unknown;
  };
  bb?: {
    name?: unknown;
    server?: unknown;
    app?: unknown;
  };
}

interface InstalledPlugin {
  id?: unknown;
  rootDir?: unknown;
  status?: unknown;
}

interface CommandRunner {
  (args: string[]): Promise<string>;
}

export interface InspectPluginOptions {
  workspaceRoot: string;
  targetPath?: string;
  runBb?: CommandRunner;
  resolveHarness?: (pluginRoot: string) => Promise<string | null>;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function readPackage(pluginRoot: string): Promise<PluginPackageJson> {
  return (await readJson(
    path.join(pluginRoot, "package.json"),
  )) as PluginPackageJson;
}

function isPluginPackage(packageJson: PluginPackageJson): boolean {
  return Boolean(
    stringOrNull(packageJson.bb?.server) || stringOrNull(packageJson.bb?.app),
  );
}

async function discoverPluginRoots(workspaceRoot: string): Promise<string[]> {
  const pluginsRoot = path.join(workspaceRoot, "plugins");
  const entries = await fs
    .readdir(pluginsRoot, { withFileTypes: true })
    .catch(() => null);
  if (!entries) return [];

  const roots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const candidate = path.join(pluginsRoot, entry.name);
    try {
      if (isPluginPackage(await readPackage(candidate))) roots.push(candidate);
    } catch {
      // Discovery ignores ordinary directories that are not valid packages.
    }
  }
  return roots.sort();
}

function displayPath(workspaceRoot: string, pluginRoot: string): string {
  const relative = path.relative(workspaceRoot, pluginRoot);
  return relative.startsWith("..") ? pluginRoot : relative || ".";
}

function parseBuildMetadata(value: unknown): NativeBuildMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const metadata = value as Record<string, unknown>;
  const builtWith =
    typeof metadata.builtWith === "object" && metadata.builtWith !== null
      ? (metadata.builtWith as Record<string, unknown>)
      : {};
  return {
    sdkVersion: stringOrNull(metadata.sdkVersion),
    pluginId: stringOrNull(metadata.pluginId),
    pluginVersion: stringOrNull(metadata.pluginVersion),
    bbVersion: stringOrNull(builtWith.bbVersion),
  };
}

async function readBuildMetadata(
  pluginRoot: string,
  name: "server" | "app",
): Promise<NativeBuildMetadata | null> {
  try {
    return parseBuildMetadata(
      await readJson(path.join(pluginRoot, "dist", `${name}.meta.json`)),
    );
  } catch {
    return null;
  }
}

async function defaultRunBb(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("bb", args, {
    timeout: 5_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout.trim();
}

async function packageVersionFromResolvedFile(
  resolvedFile: string,
): Promise<string | null> {
  let current = path.dirname(resolvedFile);
  for (;;) {
    const packagePath = path.join(current, "package.json");
    try {
      const packageJson = (await readJson(packagePath)) as {
        name?: unknown;
        version?: unknown;
      };
      if (packageJson.name === "@bb/plugin-sdk") {
        return stringOrNull(packageJson.version);
      }
    } catch {
      // Keep walking until the package root is found.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function defaultResolveHarness(
  pluginRoot: string,
): Promise<string | null> {
  try {
    const requireFromPlugin = createRequire(
      path.join(pluginRoot, "package.json"),
    );
    const frontendHarness = requireFromPlugin.resolve(
      "@bb/plugin-sdk/testing/app",
    );
    requireFromPlugin.resolve("@bb/plugin-sdk/testing");
    return packageVersionFromResolvedFile(frontendHarness);
  } catch {
    return null;
  }
}

async function realPathOrSelf(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch {
    return value;
  }
}

async function readNativeState(
  pluginRoot: string,
  runBb: CommandRunner,
): Promise<{
  bbVersion: string | null;
  connectUrl: string | null;
  installed: {
    id: string;
    status: string | null;
    sourceKind: string | null;
  } | null;
}> {
  const [versionResult, listResult, connectResult] = await Promise.allSettled([
    runBb(["--version"]),
    runBb(["plugin", "list", "--json"]),
    runBb(["connect", "status", "--json"]),
  ]);

  let installed: {
    id: string;
    status: string | null;
    sourceKind: string | null;
  } | null = null;
  if (listResult.status === "fulfilled") {
    try {
      const parsed = JSON.parse(listResult.value) as {
        plugins?: InstalledPlugin[];
      };
      const targetRealPath = await realPathOrSelf(pluginRoot);
      for (const plugin of parsed.plugins ?? []) {
        const id = stringOrNull(plugin.id);
        const rootDir = stringOrNull(plugin.rootDir);
        if (!id || !rootDir) continue;
        if ((await realPathOrSelf(rootDir)) === targetRealPath) {
          installed = {
            id,
            status: stringOrNull(plugin.status),
            sourceKind: null,
          };
          break;
        }
      }
    } catch {
      // A malformed native response is reported as unavailable below.
    }
  }

  if (installed) {
    try {
      const parsed = JSON.parse(
        await runBb(["plugin", "source", installed.id, "--json"]),
      ) as { resolved?: unknown };
      const resolved = stringOrNull(parsed.resolved);
      installed.sourceKind = resolved?.split(":", 1)[0] ?? null;
    } catch {
      // List status is still useful when detailed source history is unavailable.
    }
  }

  let connectUrl: string | null = null;
  if (connectResult.status === "fulfilled") {
    try {
      const parsed = JSON.parse(connectResult.value) as { url?: unknown };
      connectUrl = stringOrNull(parsed.url);
    } catch {
      // Ignore malformed Connect metadata.
    }
  }

  return {
    bbVersion:
      versionResult.status === "fulfilled" ? versionResult.value : null,
    connectUrl,
    installed,
  };
}

function emptyInspection(
  state: PluginInspection["state"],
  message: string,
  candidates: string[] = [],
): PluginInspection {
  return {
    state,
    message,
    candidates,
    target: null,
    modes: {
      fixture: {
        available: true,
        detail: "The deterministic bb sidebar fixture is ready.",
      },
      harness: {
        available: false,
        sdkVersion: null,
        detail:
          "Choose one plugin package before loading the official harness.",
      },
      live: {
        available: false,
        pluginId: null,
        status: null,
        sourceKind: null,
        url: null,
        detail: "Choose one installed plugin package before opening live bb.",
      },
    },
    native: { bbVersion: null, connectUrl: null },
  };
}

export async function inspectPlugin(
  options: InspectPluginOptions,
): Promise<PluginInspection> {
  const candidates = options.targetPath
    ? [path.resolve(options.workspaceRoot, options.targetPath)]
    : await discoverPluginRoots(options.workspaceRoot);

  if (candidates.length === 0) {
    return emptyInspection(
      "missing",
      "No bb plugin packages were found. Set BB_MATE_PLUGIN to a plugin directory.",
    );
  }
  if (candidates.length > 1) {
    return emptyInspection(
      "ambiguous",
      "More than one plugin package was found. Set BB_MATE_PLUGIN to choose one.",
      candidates.map((candidate) =>
        displayPath(options.workspaceRoot, candidate),
      ),
    );
  }

  const pluginRoot = candidates[0]!;
  let packageJson: PluginPackageJson;
  try {
    packageJson = await readPackage(pluginRoot);
    if (!isPluginPackage(packageJson)) {
      return emptyInspection(
        "error",
        `${displayPath(options.workspaceRoot, pluginRoot)} does not declare bb.server or bb.app.`,
      );
    }
  } catch (error) {
    return emptyInspection(
      "error",
      `Could not read ${displayPath(options.workspaceRoot, pluginRoot)}/package.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const [serverBuild, appBuild, harnessVersion, native] = await Promise.all([
    readBuildMetadata(pluginRoot, "server"),
    readBuildMetadata(pluginRoot, "app"),
    (options.resolveHarness ?? defaultResolveHarness)(pluginRoot),
    readNativeState(pluginRoot, options.runBb ?? defaultRunBb),
  ]);

  const serverEntry = stringOrNull(packageJson.bb?.server);
  const appEntry = stringOrNull(packageJson.bb?.app);
  const packageName = stringOrNull(packageJson.name) ?? "unnamed-plugin";
  const target: PluginTarget = {
    displayPath: displayPath(options.workspaceRoot, pluginRoot),
    packageName,
    displayName: stringOrNull(packageJson.bb?.name) ?? packageName,
    version: stringOrNull(packageJson.version) ?? "0.0.0",
    serverEntry,
    appEntry,
    engines: {
      bb: stringOrNull(packageJson.engines?.bb),
      pluginSdk: stringOrNull(packageJson.engines?.bbPluginSdk),
    },
    build: { server: serverBuild, app: appBuild },
  };

  const installed = native.installed;
  const liveAvailable = Boolean(appEntry && installed);
  const liveUrl = liveAvailable ? native.connectUrl : null;

  return {
    state: "ready",
    message: null,
    candidates: [],
    target,
    modes: {
      fixture: {
        available: true,
        detail: "Deterministic, browser-only state for visual iteration.",
      },
      harness: {
        available: Boolean(appEntry && harnessVersion),
        sdkVersion: harnessVersion,
        detail: !appEntry
          ? "This plugin is headless; it has no bb.app surface to load."
          : harnessVersion
            ? `Official @bb/plugin-sdk ${harnessVersion} testing runtime resolved from the plugin.`
            : "Official @bb/plugin-sdk testing runtime is not installed for this plugin.",
      },
      live: {
        available: liveAvailable,
        pluginId: installed?.id ?? null,
        status: installed?.status ?? null,
        sourceKind: installed?.sourceKind ?? null,
        url: liveUrl,
        detail: !appEntry
          ? "This plugin is running in bb but does not declare a frontend entry."
          : installed
            ? `Plugin ${installed.id} is ${installed.status ?? "installed"} in native bb${installed.sourceKind ? ` from a ${installed.sourceKind} source` : ""}.`
            : "Install this plugin by path to validate its UI in native bb.",
      },
    },
    native: {
      bbVersion: native.bbVersion,
      connectUrl: native.connectUrl,
    },
  };
}

function inspectionMiddleware(options: InspectPluginOptions): (
  request: { url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  },
  next: () => void,
) => void {
  return (request, response, next) => {
    if (request.url?.split("?", 1)[0] !== "/bb-mate-plugin.json") {
      next();
      return;
    }
    void inspectPlugin(options)
      .then((inspection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify(inspection));
      })
      .catch((error: unknown) => {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
  };
}

export function pluginInspectionPlugin(options: InspectPluginOptions): Plugin {
  return {
    name: "bb-mate-plugin-inspection",
    configureServer(server) {
      server.middlewares.use(inspectionMiddleware(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(inspectionMiddleware(options));
    },
  };
}
