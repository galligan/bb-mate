import type { Plugin } from "vite";

import {
  assertLoopbackConfig,
  attachCatalogMiddleware,
} from "./server/http-policy";
import type {
  BrowserPluginCandidate,
  BrowserPluginSession,
} from "./server/public-session";
import {
  openWorkbenchSessionServer,
  type PluginSessionOptions,
} from "./server/workbench-session-server";

export type {
  BrowserPluginCandidate,
  BrowserPluginSession,
  PluginSessionOptions,
};

export async function inspectPluginSession(
  options: PluginSessionOptions,
): Promise<BrowserPluginSession> {
  const server = await openWorkbenchSessionServer(options);
  try {
    return server.session(options.selectedTargetId);
  } finally {
    server.close();
  }
}

export function pluginInspectionPlugin(options: PluginSessionOptions): Plugin {
  return {
    name: "bb-plugin-studio-plugin-inspection",
    configResolved: assertLoopbackConfig,
    async configureServer(server) {
      attachCatalogMiddleware(
        server,
        await openWorkbenchSessionServer(options),
      );
    },
    async configurePreviewServer(server) {
      attachCatalogMiddleware(
        server,
        await openWorkbenchSessionServer(options),
      );
    },
  };
}
