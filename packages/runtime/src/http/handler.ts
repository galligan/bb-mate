import { authorize } from "../auth/authorize.ts";
import type { RequestContext } from "../auth/context.ts";
import {
  BbContextIdSchema,
  PrincipalIdSchema,
  type BbContextId,
  type OpaqueId,
  type PrincipalId,
} from "../contracts/ids.ts";
import { RuntimeError, type RuntimeErrorCode } from "../errors.ts";
import {
  RUNTIME_API_VERSION,
  RuntimeCapabilityDocumentSchema,
  type RuntimeCapabilitiesV1,
} from "../supervision/protocol.ts";
import {
  CurrentProjectTargetAdmissionRequestSchema,
  DevelopmentTargetListResponseSchema,
  type CurrentProjectTargetAdmissionRequest,
  type DevelopmentTargetListResponse,
} from "../supervision/targets.ts";

export type RuntimeHttpAuthenticator = (
  request: Request,
) => Promise<RequestContext | undefined>;

export interface RuntimeHttpHandlerOptions {
  port: number;
  identity: RuntimeHttpIdentity;
  authenticate?: RuntimeHttpAuthenticator;
  targets?: RuntimeTargetController;
}

export interface RuntimeHttpIdentity {
  runtimeVersion: string;
  instanceId: OpaqueId;
  capabilities: RuntimeCapabilitiesV1;
}

export type RuntimeHttpHandler = (request: Request) => Promise<Response>;

export interface RuntimeTargetController {
  readonly principalId: PrincipalId;
  readonly bbContextId: BbContextId;
  admit(
    context: RequestContext,
    input: CurrentProjectTargetAdmissionRequest,
  ): DevelopmentTargetListResponse | Promise<DevelopmentTargetListResponse>;
  list(
    context: RequestContext,
  ): DevelopmentTargetListResponse | Promise<DevelopmentTargetListResponse>;
}

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
const RuntimeHttpIdentitySchema = RuntimeCapabilityDocumentSchema.pick({
  runtimeVersion: true,
  instanceId: true,
  capabilities: true,
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

type RequestBodyPolicyResult =
  | { readonly kind: "accepted"; readonly bytes: Uint8Array }
  | { readonly kind: "invalid" }
  | { readonly kind: "too-large" };

async function readRequestBody(
  request: Request,
): Promise<RequestBodyPolicyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return { kind: "invalid" };
    if (BigInt(contentLength) > BigInt(MAX_REQUEST_BODY_BYTES)) {
      return { kind: "too-large" };
    }
  }

  if (request.body === null) {
    return { kind: "accepted", bytes: new Uint8Array() };
  }
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const value of chunks) {
          body.set(value, offset);
          offset += value.byteLength;
        }
        return { kind: "accepted", bytes: body };
      }
      bytes += chunk.value.byteLength;
      if (bytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(chunk.value);
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

function parseTargetAdmissionRequest(
  bytes: Uint8Array,
): CurrentProjectTargetAdmissionRequest {
  try {
    return CurrentProjectTargetAdmissionRequestSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (error) {
    throw new RuntimeError("invalid_request", { cause: error });
  }
}

function parseTargetResponse(input: unknown): DevelopmentTargetListResponse {
  try {
    return DevelopmentTargetListResponseSchema.parse(input);
  } catch (error) {
    throw new RuntimeError("internal", { cause: error });
  }
}

export function createRuntimeHttpHandler({
  port,
  identity,
  authenticate = async () => undefined,
  targets,
}: RuntimeHttpHandlerOptions): RuntimeHttpHandler {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new TypeError(
      "Runtime HTTP port must be an integer from 1 through 65535",
    );
  }

  let parsedIdentity: RuntimeHttpIdentity;
  try {
    parsedIdentity = RuntimeHttpIdentitySchema.parse(identity);
    if (parsedIdentity.capabilities.targets !== (targets !== undefined)) {
      throw new TypeError();
    }
    if (targets !== undefined) {
      if (
        typeof targets.admit !== "function" ||
        typeof targets.list !== "function"
      ) {
        throw new TypeError();
      }
      PrincipalIdSchema.parse(targets.principalId);
      BbContextIdSchema.parse(targets.bbContextId);
    }
  } catch {
    throw new TypeError("Invalid runtime HTTP identity");
  }
  const capabilitiesDocument = Object.freeze({
    schemaVersion: 2 as const,
    runtimeVersion: parsedIdentity.runtimeVersion,
    apiVersion: RUNTIME_API_VERSION,
    instanceId: parsedIdentity.instanceId,
    capabilities: Object.freeze(parsedIdentity.capabilities),
  });

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

    const routePath =
      url.search === "" && url.hash === "" ? url.pathname : undefined;

    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      return runtimeProblem(503, "conflict", requestOrigin);
    }
    activeRequests += 1;

    try {
      let authenticatedContext: RequestContext | undefined;
      const isPublicHealth =
        routePath === "/healthz" &&
        (request.method === "GET" || request.method === "HEAD");
      if (requestOrigin === undefined && !isPublicHealth) {
        try {
          authenticatedContext = authorize(await authenticate(request), {
            scope: "runtime:read",
          });
          if (authenticatedContext.principal.kind === "browser-session") {
            throw new RuntimeError("forbidden");
          }
        } catch (error) {
          const runtimeError =
            error instanceof RuntimeError
              ? error
              : new RuntimeError("internal", { cause: error });
          return runtimeProblem(
            statusForRuntimeError(runtimeError),
            runtimeError.code,
          );
        }
      }

      if (request.headers.has("content-encoding")) {
        return runtimeProblem(415, "invalid_request", requestOrigin);
      }

      let bodyPolicy: RequestBodyPolicyResult;
      try {
        bodyPolicy = await readRequestBody(request);
      } catch {
        return runtimeProblem(400, "invalid_request", requestOrigin);
      }
      if (bodyPolicy.kind === "invalid") {
        return runtimeProblem(400, "invalid_request", requestOrigin);
      }
      if (bodyPolicy.kind === "too-large") {
        return runtimeProblem(413, "invalid_request", requestOrigin);
      }
      const bodyBytes = bodyPolicy.bytes;

      const isTargetRoute =
        targets !== undefined &&
        (routePath === "/v2/targets" || routePath === "/v2/targets/admit");
      if (isTargetRoute && requestOrigin !== undefined) {
        return runtimeProblem(403, "forbidden");
      }

      if (request.method === "OPTIONS") {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow:
            routePath === "/v2/targets/admit" && isTargetRoute
              ? "POST"
              : "GET, HEAD",
        });
      }

      if (
        (routePath === "/healthz" || routePath === "/v2/capabilities") &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow: "GET, HEAD",
        });
      }

      if (
        isTargetRoute &&
        routePath === "/v2/targets" &&
        request.method !== "GET" &&
        request.method !== "HEAD"
      ) {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow: "GET, HEAD",
        });
      }

      if (
        isTargetRoute &&
        routePath === "/v2/targets/admit" &&
        request.method !== "POST"
      ) {
        return runtimeProblem(405, "invalid_request", requestOrigin, {
          allow: "POST",
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
        routePath === "/v2/capabilities"
      ) {
        try {
          const authorized =
            authenticatedContext ??
            authorize(await authenticate(request), { scope: "runtime:read" });
          if (
            requestOrigin === undefined &&
            authorized.principal.kind === "browser-session"
          ) {
            throw new RuntimeError("forbidden");
          }
          return forRequestMethod(
            request,
            json(capabilitiesDocument, undefined, requestOrigin),
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

      if (targets !== undefined && isTargetRoute) {
        try {
          const scope =
            routePath === "/v2/targets/admit"
              ? "targets:write"
              : "targets:read";
          const authorized = authorize(authenticatedContext, { scope });
          const principal = authorized.principal;
          if (
            principal.kind !== "supervisor" ||
            principal.id !== targets.principalId ||
            principal.bbContextId !== targets.bbContextId ||
            principal.targetId !== undefined ||
            principal.sessionId !== undefined
          ) {
            throw new RuntimeError("forbidden");
          }
          const result =
            routePath === "/v2/targets/admit"
              ? await targets.admit(
                  authorized,
                  (() => {
                    if (
                      request.headers.get("content-type") !== "application/json"
                    ) {
                      throw new RuntimeError("invalid_request");
                    }
                    return parseTargetAdmissionRequest(bodyBytes);
                  })(),
                )
              : await targets.list(authorized);
          const response = json(parseTargetResponse(result));
          return forRequestMethod(request, response);
        } catch (error) {
          const runtimeError =
            error instanceof RuntimeError
              ? error
              : new RuntimeError("internal", { cause: error });
          return runtimeProblem(
            statusForRuntimeError(runtimeError),
            runtimeError.code,
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
