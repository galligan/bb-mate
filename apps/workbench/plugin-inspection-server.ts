import { promises as fs } from "node:fs";
import path from "node:path";
import {
  discoverPluginRoots,
  inspectPlugin,
  type InspectPluginOptions,
  type PluginInspection,
} from "@bb-mate/inspection";
import type { Plugin } from "vite";

export { inspectPlugin } from "@bb-mate/inspection";
export type { InspectPluginOptions } from "@bb-mate/inspection";

export interface BrowserPluginCandidate {
  key: string;
  label: string;
  displayPath: string;
}

export interface BrowserPluginSession {
  schemaVersion: 1;
  workspace: {
    label: string;
    candidates: BrowserPluginCandidate[];
    selectedKey: string | null;
    selectionError: string | null;
  };
  inspection: PluginInspection;
  handoffs: {
    launchCommand: string | null;
    checkCommand: string | null;
    liveCommand: string | null;
    detail: string;
  };
}

interface PluginSessionOptions extends Omit<
  InspectPluginOptions,
  "targetPath"
> {
  targetPath?: string;
  selectedKey?: string | null;
  commandWorkspaceRoot?: string;
}

function displayPath(workspaceRoot: string, pluginRoot: string): string {
  const relative = path.relative(workspaceRoot, pluginRoot);
  return relative || ".";
}

function shellArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}'`;
}

function handoffCommand(
  commandWorkspaceRoot: string,
  command: "dev" | "check" | "live",
  pluginRoot: string,
): string {
  const commandPath = displayPath(commandWorkspaceRoot, pluginRoot);
  return `bun run bb-mate ${command} ${shellArgument(commandPath)}`;
}

async function realPathOrSelf(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch {
    return value;
  }
}

function redactInspection(
  inspection: PluginInspection,
  replacements: ReadonlyArray<readonly [absolutePath: string, label: string]>,
  selectedDisplayPath: string | null,
): PluginInspection {
  const ordered = [...replacements]
    .filter(([absolutePath]) => path.isAbsolute(absolutePath))
    .sort(([left], [right]) => right.length - left.length);
  const redact = (value: string): string => {
    let visible = value;
    for (const [absolutePath, label] of ordered) {
      visible = visible.replaceAll(absolutePath, label);
    }
    // Native diagnostics can mention paths unrelated to the selected plugin.
    // Keep URLs intact while removing remaining POSIX and Windows path tokens.
    visible = visible.replace(
      /(\bfile:)\/{2,3}[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    visible = visible.replace(
      /(\b(?:path|file):)\/(?!\/)[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    visible = visible.replace(
      /(^|:(?!\/\/)|[\s"'=(\[`;,])\/(?!\/)[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    visible = visible.replace(
      /(\b(?:path|file):)[A-Za-z]:\\[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    visible = visible.replace(
      /(^|:(?!\/\/)|[\s"'=(\[`;,])[A-Za-z]:\\[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    visible = visible.replace(
      /(^|[\s"'=(\[`;,:])\\\\[^\s"',)\]]+/g,
      "$1[redacted-path]",
    );
    return visible;
  };
  const sanitize = (value: unknown): unknown => {
    if (typeof value === "string") return redact(value);
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item)]),
    );
  };
  const visible = sanitize(inspection) as PluginInspection;

  if (visible.target && selectedDisplayPath) {
    visible.target.rootPath = selectedDisplayPath;
    visible.target.displayPath = selectedDisplayPath;
  }
  if (
    visible.provenance?.kind === "path" &&
    selectedDisplayPath &&
    inspection.provenance
  ) {
    visible.provenance.requested = inspection.provenance.requested
      ? `path:${selectedDisplayPath}`
      : null;
    visible.provenance.resolved = inspection.provenance.resolved
      ? `path:${selectedDisplayPath}`
      : null;
  }
  return visible;
}

export async function inspectPluginSession(
  options: PluginSessionOptions,
): Promise<BrowserPluginSession> {
  const roots = await discoverPluginRoots(options.workspaceRoot);
  const explicitRoot = options.targetPath
    ? path.resolve(options.workspaceRoot, options.targetPath)
    : null;
  const allRoots = [...roots];
  if (explicitRoot && !allRoots.includes(explicitRoot))
    allRoots.push(explicitRoot);

  const usedKeys = new Set<string>();
  const candidates = allRoots.map((root) => {
    const candidatePath = displayPath(options.workspaceRoot, root);
    const baseKey = roots.includes(root)
      ? path.basename(root)
      : "selected-plugin";
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${baseKey}-${suffix++}`;
    usedKeys.add(key);
    return {
      root,
      key,
      label: candidatePath,
      displayPath: candidatePath,
    };
  });

  const requested = options.selectedKey
    ? candidates.find(({ key }) => key === options.selectedKey)
    : null;
  const selectionError =
    options.selectedKey && !requested
      ? "The requested plugin selection is unavailable. The launcher reset to a server-discovered target."
      : null;
  const selected =
    requested ??
    (explicitRoot
      ? candidates.find(({ root }) => root === explicitRoot)
      : candidates.length === 1
        ? candidates[0]
        : null);

  const {
    targetPath: _targetPath,
    selectedKey: _selectedKey,
    commandWorkspaceRoot: _commandWorkspaceRoot,
    ...inspectionOptions
  } = options;
  const inspection = await inspectPlugin({
    ...inspectionOptions,
    ...(selected ? { targetPath: selected.root } : {}),
  });
  const realWorkspaceRoot = await realPathOrSelf(options.workspaceRoot);
  const realSelectedRoot = selected
    ? await realPathOrSelf(selected.root)
    : null;
  const selectedDisplayPath = selected?.displayPath ?? null;
  const visibleInspection = redactInspection(
    inspection,
    [
      [options.workspaceRoot, "."],
      [realWorkspaceRoot, "."],
      ...(selected ? ([[selected.root, selected.displayPath]] as const) : []),
      ...(realSelectedRoot && selected
        ? ([[realSelectedRoot, selected.displayPath]] as const)
        : []),
    ],
    selectedDisplayPath,
  );
  const commandWorkspaceRoot = path.resolve(
    options.commandWorkspaceRoot ?? options.workspaceRoot,
  );
  const realCommandWorkspaceRoot = await realPathOrSelf(commandWorkspaceRoot);
  const handoffsAvailable = realCommandWorkspaceRoot === realWorkspaceRoot;

  return {
    schemaVersion: 1,
    workspace: {
      label: path.basename(options.workspaceRoot),
      candidates: candidates.map(({ key, label, displayPath }) => ({
        key,
        label,
        displayPath,
      })),
      selectedKey: selected?.key ?? null,
      selectionError,
    },
    inspection: visibleInspection,
    handoffs: {
      launchCommand:
        selected && handoffsAvailable
          ? handoffCommand(commandWorkspaceRoot, "dev", selected.root)
          : null,
      checkCommand:
        selected && handoffsAvailable
          ? handoffCommand(commandWorkspaceRoot, "check", selected.root)
          : null,
      liveCommand:
        selected && handoffsAvailable
          ? handoffCommand(commandWorkspaceRoot, "live", selected.root)
          : null,
      detail: !selected
        ? "Choose a discovered plugin before using terminal handoffs."
        : handoffsAvailable
          ? "Run from the BB Mate repository root."
          : "Copyable handoffs are unavailable because the inspected workspace is outside the BB Mate command workspace.",
    },
  };
}

function sessionMiddleware(options: PluginSessionOptions): (
  request: { method?: string; url?: string },
  response: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
  },
  next: () => void,
) => void {
  return (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://bb-mate.local");
    if (url.pathname !== "/bb-mate-session.json") {
      next();
      return;
    }
    if (request.method && request.method !== "GET") {
      response.statusCode = 405;
      response.setHeader("Allow", "GET");
      response.end();
      return;
    }
    void inspectPluginSession({
      ...options,
      selectedKey: url.searchParams.get("plugin"),
    })
      .then((session) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.end(JSON.stringify(session));
      })
      .catch(() => {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(
          JSON.stringify({
            error: "Plugin inspection failed.",
          }),
        );
      });
  };
}

export function pluginInspectionPlugin(options: PluginSessionOptions): Plugin {
  return {
    name: "bb-mate-plugin-inspection",
    configureServer(server) {
      server.middlewares.use(sessionMiddleware(options));
    },
    configurePreviewServer(server) {
      server.middlewares.use(sessionMiddleware(options));
    },
  };
}
