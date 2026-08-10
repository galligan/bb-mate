import { authorize } from "../auth/authorize.ts";
import type { RequestContext } from "../auth/context.ts";
import { RuntimeError, type RuntimeErrorCode } from "../errors.ts";

export type RuntimeHttpAuthenticator = (
  request: Request,
) => Promise<RequestContext | undefined>;

export interface RuntimeHttpHandlerOptions {
  port: number;
  authenticate?: RuntimeHttpAuthenticator;
}

export type RuntimeHttpHandler = (request: Request) => Promise<Response>;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_CONCURRENT_REQUESTS = 32;
const CAPABILITIES_DOCUMENT = Object.freeze({
  schemaVersion: 1,
  apiVersion: 1,
  capabilities: Object.freeze({
    browserBootstrap: false,
    targets: false,
    sessions: false,
    annotations: false,
    captures: false,
    comparisons: false,
    pluginBriefs: false,
    reviews: false,
    events: false,
    artifacts: false,
    mcp: false,
  }),
});

interface JsonResponseInit {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
}

function json(
  body: unknown,
  init?: JsonResponseInit,
  allowedOrigin?: string,
): Response {
  const headers = new Headers();
  for (const [name, value] of Object.entries(init?.headers ?? {})) {
    headers.set(name, value);
  }
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (allowedOrigin !== undefined) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("vary", "Origin");
  }
  return Response.json(body, { status: init?.status, headers });
}

function runtimeProblem(
  status: number,
  code: RuntimeErrorCode,
  allowedOrigin?: string,
  headers?: Readonly<Record<string, string>>,
): Response {
  return json(
    { error: new RuntimeError(code).toJSON() },
    { status, headers },
    allowedOrigin,
  );
}

function forRequestMethod(request: Request, response: Response): Response {
  return request.method === "HEAD"
    ? new Response(null, {
        status: response.status,
        headers: response.headers,
      })
    : response;
}

type RequestBodyPolicyResult = "accepted" | "invalid" | "too-large";

async function validateRequestBody(
  request: Request,
): Promise<RequestBodyPolicyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return "invalid";
    if (BigInt(contentLength) > BigInt(MAX_REQUEST_BODY_BYTES)) {
      return "too-large";
    }
  }

  if (request.body === null) return "accepted";
  const reader = request.body.getReader();
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return "accepted";
      bytes += chunk.value.byteLength;
      if (bytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return "too-large";
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function statusForRuntimeError(error: RuntimeError): number {
  switch (error.code) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "unsupported_schema":
      return 422;
    case "invalid_request":
      return 400;
    case "corrupt_data":
    case "internal":
      return 500;
  }
}

export function createRuntimeHttpHandler({
  port,
  authenticate = async () => undefined,
}: RuntimeHttpHandlerOptions): RuntimeHttpHandler {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(
      "Runtime HTTP port must be an integer from 1 through 65535",
    );
  }

  const origin = `http://127.0.0.1:${port}`;
  const authority = `127.0.0.1:${port}`;

  let activeRequests = 0;
  const handleRequest: RuntimeHttpHandler = async (request) => {
    if (request.headers.get("host") !== authority) {
      return runtimeProblem(400, "invalid_request");
    }

    const url = new URL(request.url);
    if (
      url.origin !== origin ||
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== String(port) ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return runtimeProblem(400, "invalid_request");
    }

    const requestOrigin = request.headers.get("origin") ?? undefined;
    if (requestOrigin !== undefined && requestOrigin !== origin) {
      return runtimeProblem(403, "forbidden");
    }

    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      return runtimeProblem(503, "conflict", requestOrigin);
    }
    activeRequests += 1;

    try {
      if (request.headers.has("content-encoding")) {
        return runtimeProblem(415, "invalid_request", requestOrigin);
      }

      let bodyPolicy: RequestBodyPolicyResult;
      try {
        bodyPolicy = await validateRequestBody(request);
      } catch {
        return runtimeProblem(400, "invalid_request", requestOrigin);
      }
      if (bodyPolicy === "invalid") {
        return runtimeProblem(400, "invalid_request", requestOrigin);
      }
      if (bodyPolicy === "too-large") {
        return runtimeProblem(413, "invalid_request", requestOrigin);
      }

      const routePath =
        url.search === "" && url.hash === "" ? url.pathname : undefined;

      if (request.method === "OPTIONS") {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow: "GET, HEAD",
        });
      }

      if (
        (routePath === "/healthz" || routePath === "/v1/capabilities") &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow: "GET, HEAD",
        });
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        routePath === "/healthz"
      ) {
        const response = json({ status: "ok" }, undefined, requestOrigin);
        return forRequestMethod(request, response);
      }

      if (
        (request.method === "GET" || request.method === "HEAD") &&
        routePath === "/v1/capabilities"
      ) {
        try {
          const context = await authenticate(request);
          const authorized = authorize(context, { scope: "runtime:read" });
          if (
            requestOrigin === undefined &&
            authorized.principal.kind === "browser-session"
          ) {
            throw new RuntimeError("forbidden");
          }
          return forRequestMethod(
            request,
            json(CAPABILITIES_DOCUMENT, undefined, requestOrigin),
          );
        } catch (error) {
          const runtimeError =
            error instanceof RuntimeError
              ? error
              : new RuntimeError("internal", { cause: error });
          return runtimeProblem(
            statusForRuntimeError(runtimeError),
            runtimeError.code,
            requestOrigin,
          );
        }
      }

      return runtimeProblem(404, "not_found", requestOrigin);
    } finally {
      activeRequests -= 1;
    }
  };

  return async (request) =>
    forRequestMethod(request, await handleRequest(request));
}
