import type { PreviewServer, ResolvedConfig, ViteDevServer } from "vite";

import type { WorkbenchSessionServer } from "./workbench-session-server";

const RESPONSE_LIMIT_BYTES = 128 * 1024;

export function assertLoopbackConfig(config: ResolvedConfig): void {
  for (const host of [config.server.host, config.preview.host]) {
    if (
      host !== undefined &&
      host !== false &&
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      host !== "::1"
    ) {
      throw new TypeError("Plugin Workbench catalog must remain loopback-only");
    }
  }
}

export function attachCatalogMiddleware(
  server: ViteDevServer | PreviewServer,
  sessionServer: WorkbenchSessionServer,
): void {
  server.httpServer?.once("close", () => sessionServer.close());
  server.middlewares.use((request, response, next) => {
    const requestTarget = request.url ?? "/";
    if (
      !requestTarget.startsWith("/") ||
      requestTarget.startsWith("//") ||
      requestTarget.includes("\\")
    ) {
      response.statusCode = 400;
      setSecurityHeaders(response);
      response.end(JSON.stringify({ error: "Request unavailable." }));
      return;
    }
    let url: URL;
    try {
      url = new URL(requestTarget, "http://bb-mate.local");
    } catch {
      response.statusCode = 400;
      setSecurityHeaders(response);
      response.end(JSON.stringify({ error: "Request unavailable." }));
      return;
    }
    if (url.pathname !== "/bb-mate-session.json") {
      next();
      return;
    }
    if (!isSameOriginLoopback(request)) {
      response.statusCode = 403;
      setSecurityHeaders(response);
      response.end(JSON.stringify({ error: "Request unavailable." }));
      return;
    }
    if (request.method && request.method !== "GET") {
      response.statusCode = 405;
      setSecurityHeaders(response);
      response.setHeader("Allow", "GET");
      response.end(JSON.stringify({ error: "Method unavailable." }));
      return;
    }
    const targetId = readTargetQuery(url);
    if (targetId === undefined) {
      response.statusCode = 400;
      setSecurityHeaders(response);
      response.end(JSON.stringify({ error: "Request unavailable." }));
      return;
    }
    const body = JSON.stringify(sessionServer.session(targetId));
    if (Buffer.byteLength(body, "utf8") > RESPONSE_LIMIT_BYTES) {
      response.statusCode = 500;
      setSecurityHeaders(response);
      response.end(JSON.stringify({ error: "Plugin session unavailable." }));
      return;
    }
    response.statusCode = 200;
    setSecurityHeaders(response);
    response.end(body);
  });
}

function readTargetQuery(url: URL): string | null | undefined {
  const entries = [...url.searchParams.entries()];
  if (entries.length === 0) return null;
  if (entries.length !== 1 || entries[0]![0] !== "target") return undefined;
  const targetId = entries[0]![1];
  return /^[A-Za-z0-9_-]{32}$/u.test(targetId) ? targetId : undefined;
}

function isSameOriginLoopback(request: {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { localAddress?: string; localPort?: number };
}): boolean {
  const rawHost = request.headers?.host;
  if (typeof rawHost !== "string") return false;
  const hostPort = loopbackHostPort(rawHost);
  if (hostPort === null || hostPort !== request.socket?.localPort) return false;
  const localAddress = request.socket?.localAddress;
  if (
    !localAddress ||
    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(localAddress)
  ) {
    return false;
  }
  const origin = request.headers?.origin;
  if (origin === undefined) return true;
  if (typeof origin !== "string") return false;
  return origin === `http://${rawHost}`;
}

function loopbackHostPort(value: string): number | null {
  if (value.trim() !== value || /[,\s@/\\]/u.test(value)) return null;
  const match = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::([0-9]+))?$/u.exec(
    value,
  );
  if (!match) return null;
  if (!match[1]) return 80;
  if (match[1].startsWith("0")) return null;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535
    ? port
    : null;
}

function setSecurityHeaders(response: {
  setHeader(name: string, value: string): void;
}): void {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}
