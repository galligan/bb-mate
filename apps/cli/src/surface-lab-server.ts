import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProcessExit } from "./commands.ts";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
]);

function contained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

export function createSurfaceLabHandler(root: string) {
  const resolvedRoot = fs.realpath(path.resolve(root));

  return async (request: Request): Promise<Response> => {
    const labRoot = await resolvedRoot;
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

    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const candidate = path.resolve(labRoot, relative);
    if (!contained(labRoot, candidate)) {
      return new Response("Not found.\n", { status: 404 });
    }

    let filePath: string;
    try {
      filePath = await fs.realpath(candidate);
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || !contained(labRoot, filePath)) {
        return new Response("Not found.\n", { status: 404 });
      }
    } catch {
      return new Response("Not found.\n", { status: 404 });
    }

    const headers = new Headers({
      "Content-Type":
        contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    return request.method === "HEAD"
      ? new Response(null, { status: 200, headers })
      : new Response(Bun.file(filePath), { status: 200, headers });
  };
}

export async function runSurfaceLab(options: {
  root: string;
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
  try {
    await fs.access(path.join(options.root, "index.html"));
  } catch {
    options.stderr("Packaged surface lab assets are unavailable.\n");
    return { exitCode: 1, signal: null };
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: options.host,
      port: options.port,
      fetch: createSurfaceLabHandler(options.root),
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
