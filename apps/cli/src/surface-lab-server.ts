import type { ProcessExit } from "./commands.ts";
import {
  createFileSystemLabAssets,
  type LabAssetProvider,
} from "./lab-assets.ts";

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

function providerFor(source: string | LabAssetProvider): LabAssetProvider {
  return typeof source === "string"
    ? createFileSystemLabAssets(source)
    : source;
}

export function createSurfaceLabHandler(source: string | LabAssetProvider) {
  const assets = providerFor(source);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Invalid request path.\n", { status: 400 });
    }
    if (pathname.includes("\0")) {
      return new Response("Invalid request path.\n", { status: 400 });
    }
    if (pathname.split("/").some((segment) => segment === "..")) {
      return new Response("Not found.\n", { status: 404 });
    }

    const route = pathname === "/" ? "/index.html" : pathname;
    const asset = await assets.get(route);
    if (!asset) return new Response("Not found.\n", { status: 404 });

    const headers = new Headers({
      "Content-Type": asset.contentType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    return request.method === "HEAD"
      ? new Response(null, { status: 200, headers })
      : new Response(asset.body, { status: 200, headers });
  };
}

export async function runSurfaceLab(options: {
  root?: string;
  assets?: LabAssetProvider;
  host: string;
  port: number;
  stdout(value: string): void;
  stderr(value: string): void;
}): Promise<ProcessExit> {
  if (!isLoopbackHost(options.host)) {
    options.stderr(
      "The packaged surface lab is loopback-only; use 127.0.0.1, ::1, or localhost.\n",
    );
    return { exitCode: 1, signal: null };
  }
  const assets =
    options.assets ??
    (options.root ? createFileSystemLabAssets(options.root) : undefined);
  if (!assets || !(await assets.get("/index.html"))) {
    options.stderr("Packaged surface lab assets are unavailable.\n");
    return { exitCode: 1, signal: null };
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      fetch: createSurfaceLabHandler(assets),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    options.stderr(`Could not start the packaged surface lab: ${detail}\n`);
    return { exitCode: 1, signal: null };
  }

  const displayHost = options.host.includes(":")
    ? `[${options.host}]`
    : options.host;
  options.stdout(
    `Launching Fixture surface lab at http://${displayHost}:${options.port}\n`,
  );

  return new Promise((resolve) => {
    const finish = (signal: NodeJS.Signals) => {
      process.off("SIGINT", onInterrupt);
      process.off("SIGTERM", onTerminate);
      server.stop(true);
      resolve({ exitCode: null, signal });
    };
    const onInterrupt = () => finish("SIGINT");
    const onTerminate = () => finish("SIGTERM");
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onTerminate);
  });
}
