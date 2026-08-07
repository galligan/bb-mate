import type { InspectPluginOptions } from "@bb-mate/inspection";
import { inspectPlugin } from "@bb-mate/inspection";
import type { Plugin } from "vite";

export { inspectPlugin } from "@bb-mate/inspection";
export type { InspectPluginOptions } from "@bb-mate/inspection";

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
