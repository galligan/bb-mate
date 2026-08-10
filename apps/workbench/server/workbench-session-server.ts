import path from "node:path";

import {
  openPreparedWorkbenchCatalog,
  type WorkbenchConfiguredRoot,
} from "./development-target-adapter";
import { projectSession, type BrowserPluginSession } from "./public-session";

export interface PluginSessionOptions {
  dataRoot: string;
  workspaceRoot: string;
  targetPath?: string;
  selectedTargetId?: string | null;
  startupPaths?: readonly string[];
  pinnedPaths?: readonly string[];
}

export interface WorkbenchSessionServer {
  session(targetId?: string | null): BrowserPluginSession;
  close(): void;
}

export async function openWorkbenchSessionServer(
  options: PluginSessionOptions,
): Promise<WorkbenchSessionServer> {
  const catalog = await openPreparedWorkbenchCatalog({
    dataRoot: options.dataRoot,
    roots: configuredRoots(options),
  });
  return {
    session(targetId = null) {
      return projectSession(catalog, targetId);
    },
    close() {
      catalog.close();
    },
  };
}

function configuredRoots(
  options: PluginSessionOptions,
): WorkbenchConfiguredRoot[] {
  if (options.targetPath) {
    const explicitPath = path.resolve(
      options.workspaceRoot,
      options.targetPath,
    );
    return [
      {
        slot: "explicit:target",
        kind: "explicit",
        path: explicitPath,
        displayName: path.basename(explicitPath),
      },
    ];
  }
  return [
    {
      slot: "current-project:workspace",
      kind: "current-project",
      path: options.workspaceRoot,
      displayName: path.basename(options.workspaceRoot),
    },
    ...(options.startupPaths ?? []).map((configuredPath, index) => ({
      slot: `explicit:startup-${index}`,
      kind: "explicit" as const,
      path: configuredPath,
      displayName: path.basename(configuredPath),
    })),
    ...(options.pinnedPaths ?? []).map((configuredPath, index) => ({
      slot: `pinned:record-${index}`,
      kind: "pinned" as const,
      path: configuredPath,
      displayName: path.basename(configuredPath),
    })),
  ];
}
