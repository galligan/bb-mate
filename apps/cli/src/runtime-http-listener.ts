import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";

export interface RuntimeHttpListener {
  readonly port: number;
  stop(): Promise<void>;
}

const INVALID_REQUEST_BODY = JSON.stringify({
  error: { code: "invalid_request", message: "Invalid request" },
});
const SECURITY_HEADERS = {
  "Content-Type": "application/json;charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function setSecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

function canonicalOriginForm(target: string, origin: string): URL | undefined {
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\") ||
    target.includes("#")
  ) {
    return undefined;
  }
  try {
    const parsed = new URL(target, origin);
    return parsed.origin === origin &&
      `${parsed.pathname}${parsed.search}` === target
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    headers.append(
      request.rawHeaders[index] ?? "",
      request.rawHeaders[index + 1] ?? "",
    );
  }
  return headers;
}

function hasRawHeader(request: IncomingMessage, name: string): boolean {
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      return true;
    }
  }
  return false;
}

function hasReadBodyFraming(request: IncomingMessage): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return (
    hasRawHeader(request, "content-length") ||
    hasRawHeader(request, "transfer-encoding")
  );
}

function toRequest(request: IncomingMessage, url: URL): Request {
  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers: requestHeaders(request),
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(url.toString(), init);
}

async function sendResponse(
  nodeResponse: ServerResponse,
  response: Response,
): Promise<void> {
  nodeResponse.statusCode = response.status;
  for (const [name, value] of response.headers) {
    nodeResponse.setHeader(name, value);
  }
  const body = Buffer.from(await response.arrayBuffer());
  nodeResponse.end(body);
}

function rejectBeforeDispatch(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.statusCode = 400;
  response.shouldKeepAlive = false;
  response.setHeader("Connection", "close");
  setSecurityHeaders(response);
  response.once("finish", () => request.destroy());
  response.end(INVALID_REQUEST_BODY);
}

export async function listenRuntimeHttp(
  handle: (request: Request) => Promise<Response>,
): Promise<RuntimeHttpListener> {
  let port = 0;
  const server = createServer(
    { joinDuplicateHeaders: true },
    (request, response) => {
      const target = request.url ?? "";
      const origin = `http://127.0.0.1:${port}`;
      const url = canonicalOriginForm(target, origin);
      if (!url) {
        rejectBeforeDispatch(request, response);
        return;
      }
      if (hasReadBodyFraming(request)) {
        rejectBeforeDispatch(request, response);
        return;
      }
      void handle(toRequest(request, url))
        .then((handled) => sendResponse(response, handled))
        .catch(() => {
          if (response.headersSent) {
            response.destroy();
            return;
          }
          response.statusCode = 500;
          setSecurityHeaders(response);
          response.end(
            JSON.stringify({
              error: { code: "internal", message: "Internal error" },
            }),
          );
        });
    },
  );
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Supervised runtime did not receive a listener port.");
  }
  port = address.port;

  return {
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
