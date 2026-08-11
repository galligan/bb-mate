import { describe, expect, test } from "bun:test";

import { createRuntimeHttpHandler } from "./handler.test-support.ts";

const URL = "http://127.0.0.1:41721";
const HOST = "127.0.0.1:41721";

function request(
  path: string,
  init: RequestInit = {},
  host: string = HOST,
): Request {
  const headers = new Headers(init.headers);
  headers.set("host", host);
  if (!headers.has("origin")) headers.set("origin", URL);
  return new Request(`${URL}${path}`, { ...init, headers });
}

function expectSecurityHeaders(response: Response): void {
  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("permissions-policy")).toBe(
    "camera=(), microphone=(), geolocation=()",
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("runtime HTTP response headers", () => {
  test("sets the full security policy on every response class", async () => {
    const ordinary = createRuntimeHttpHandler({ port: 41_721 });
    const internalFailure = createRuntimeHttpHandler({
      port: 41_721,
      authenticate: async () => {
        throw new Error("private diagnostic");
      },
    });
    const responses = await Promise.all([
      ordinary(request("/healthz")),
      ordinary(request("/healthz", {}, "localhost:41721")),
      ordinary(
        request("/v2/capabilities", {
          headers: { origin: URL },
        }),
      ),
      ordinary(
        request("/healthz", {
          headers: { origin: "https://evil.example" },
        }),
      ),
      ordinary(request("/missing")),
      ordinary(request("/healthz", { method: "OPTIONS" })),
      ordinary(
        request("/healthz", {
          method: "POST",
          headers: { "content-length": "262145" },
          body: "{}",
        }),
      ),
      ordinary(
        request("/healthz", {
          method: "POST",
          headers: { "content-encoding": "gzip" },
          body: "{}",
        }),
      ),
      internalFailure(request("/v2/capabilities")),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([
      200, 400, 401, 403, 404, 405, 413, 415, 500,
    ]);
    for (const response of responses) expectSecurityHeaders(response);
  });
});
