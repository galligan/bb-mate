import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import {
  createOpaqueId,
  createRequestContext,
  createRuntimeHttpHandler,
} from "@bb-plugin-studio/runtime";
import { RUNTIME_CAPABILITIES } from "@bb-plugin-studio/runtime/supervision";
import { listenRuntimeHttp } from "./runtime-http-listener.ts";

const LISTENER_CAPABILITIES = Object.freeze({
  ...RUNTIME_CAPABILITIES,
  targets: false,
});

async function rawRequest(
  port: number,
  target: string,
  init: {
    readonly method?: string;
    readonly host?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly rawHeaderLines?: readonly string[];
    readonly body?: string;
  } = {},
) {
  const socket = connect({ host: "127.0.0.1", port });
  const chunks: Buffer[] = [];
  socket.on("data", (chunk) =>
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
  );
  const closed = new Promise<void>((resolve, reject) => {
    socket.once("close", () => resolve());
    socket.once("error", reject);
  });
  const headers = Object.entries(init.headers ?? {})
    .map(([name, value]) => `${name}: ${value}\r\n`)
    .concat((init.rawHeaderLines ?? []).map((line) => `${line}\r\n`))
    .join("");
  socket.once("connect", () =>
    socket.write(
      `${init.method ?? "GET"} ${target} HTTP/1.1\r\nHost: ${init.host ?? `127.0.0.1:${port}`}\r\n${headers}Connection: close\r\n\r\n${init.body ?? ""}`,
    ),
  );
  await closed;
  return Buffer.concat(chunks).toString("utf8");
}

async function openSlowRequest(port: number, request: string) {
  const socket = connect({ host: "127.0.0.1", port });
  const response = new Promise<string>((resolve, reject) => {
    socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
    socket.once("error", reject);
  });
  const closed = new Promise<boolean>((resolve) =>
    socket.once("close", () => resolve(true)),
  );
  await new Promise<void>((resolve) => socket.once("connect", resolve));
  socket.write(request);
  return { socket, response, closed };
}

describe("runtime HTTP listener", () => {
  test("aborts the dispatched request when the client disconnects", async () => {
    let startedResolve!: () => void;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    let abortedResolve!: () => void;
    const aborted = new Promise<void>((resolve) => {
      abortedResolve = resolve;
    });
    const listener = await listenRuntimeHttp(async (request) => {
      startedResolve();
      if (request.signal.aborted) abortedResolve();
      request.signal.addEventListener("abort", abortedResolve, { once: true });
      await aborted;
      return Response.json({ reached: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        `GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\n\r\n`,
      );
      await started;
      socket.destroy();

      expect(
        await Promise.race([
          aborted.then(() => true),
          Bun.sleep(250).then(() => false),
        ]),
      ).toBe(true);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("aborts a dispatched request at the runtime deadline", async () => {
    let observedAbort = false;
    const listener = await listenRuntimeHttp(
      async (request) => {
        await new Promise<void>((resolve) =>
          request.signal.addEventListener(
            "abort",
            () => {
              observedAbort = true;
              resolve();
            },
            { once: true },
          ),
        );
        return Response.json({ cancelled: true });
      },
      { requestTimeoutMs: 10 },
    );
    try {
      const response = await rawRequest(listener.port, "/healthz");
      expect(response).toStartWith("HTTP/1.1 200");
      expect(observedAbort).toBe(true);
    } finally {
      await listener.stop();
    }
  });

  test("force-closes an incomplete mutation body at the runtime deadline", async () => {
    let handlerSettled = false;
    const listener = await listenRuntimeHttp(
      async (request) => {
        try {
          await request.text();
          return Response.json({ reached: true });
        } finally {
          handlerSettled = true;
        }
      },
      { requestTimeoutMs: 10 },
    );
    const attack = await openSlowRequest(
      listener.port,
      `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nContent-Length: 10\r\n\r\nabc`,
    );
    try {
      expect(
        await Promise.race([attack.closed, Bun.sleep(250).then(() => false)]),
      ).toBe(true);
      const deadline = Date.now() + 250;
      while (!handlerSettled && Date.now() < deadline) await Bun.sleep(1);
      expect(handlerSettled).toBe(true);
    } finally {
      attack.socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes a slow framed invalid target without dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    const response = new Promise<string>((resolve, reject) => {
      socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
      socket.once("error", reject);
    });
    const closed = new Promise<boolean>((resolve) =>
      socket.once("close", () => resolve(true)),
    );
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        `GET /%2e%2e/healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      );
      const firstBytes = await response;

      expect(firstBytes).toStartWith("HTTP/1.1 400");
      expect(firstBytes.toLowerCase()).toContain("cache-control: no-store");
      expect(handlerCalls).toBe(0);
      expect(
        await Promise.race([closed, Bun.sleep(250).then(() => false)]),
      ).toBe(true);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes slow invalid HEAD and POST targets before dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const attacks = await Promise.all([
      openSlowRequest(
        listener.port,
        `HEAD /healthz#fragment HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      ),
      openSlowRequest(
        listener.port,
        `POST http://127.0.0.1:${listener.port}/v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      ),
    ]);
    try {
      for (const attack of attacks) {
        const response = await attack.response;
        expect(response).toStartWith("HTTP/1.1 400");
        expect(response.toLowerCase()).toContain("connection: close");
        expect(response.toLowerCase()).toContain("cache-control: no-store");
        expect(
          await Promise.race([attack.closed, Bun.sleep(250).then(() => false)]),
        ).toBe(true);
      }
      expect(handlerCalls).toBe(0);
    } finally {
      for (const attack of attacks) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("releases 33 concurrent slow invalid requests without dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const requestLines = [
      "GET /%2e%2e/healthz",
      "HEAD /healthz#fragment",
      `POST http://127.0.0.1:${listener.port}/v2/capabilities`,
    ];
    const attacks = await Promise.all(
      Array.from({ length: 33 }, (_, index) =>
        openSlowRequest(
          listener.port,
          `${requestLines[index % requestLines.length]} HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
        ),
      ),
    );
    try {
      const responses = await Promise.all(
        attacks.map((attack) => attack.response),
      );
      expect(
        responses.every((response) => response.startsWith("HTTP/1.1 400")),
      ).toBe(true);
      expect(
        responses.every((response) =>
          response.toLowerCase().includes("connection: close"),
        ),
      ).toBe(true);
      expect(
        await Promise.race([
          Promise.all(attacks.map((attack) => attack.closed)).then(() => true),
          Bun.sleep(1_000).then(() => false),
        ]),
      ).toBe(true);
      expect(handlerCalls).toBe(0);
    } finally {
      for (const attack of attacks) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes a slow valid-target POST after an early Host rejection", async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp((request) => {
      handlerCalls += 1;
      return handler!(request);
    });
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
    });
    const attack = await openSlowRequest(
      listener.port,
      `POST /v2/capabilities HTTP/1.1\r\nHost: evil.example\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
    );
    try {
      const response = await attack.response;
      expect(response).toStartWith("HTTP/1.1 400");
      expect(response.toLowerCase()).toContain("cache-control: no-store");
      expect(handlerCalls).toBe(1);
      expect(
        await Promise.race([attack.closed, Bun.sleep(250).then(() => false)]),
      ).toBe(true);
    } finally {
      attack.socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes slow POSTs after early Origin and auth rejection", async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp((request) => {
      handlerCalls += 1;
      return handler!(request);
    });
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
    });
    const attacks = await Promise.all([
      openSlowRequest(
        listener.port,
        `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nOrigin: http://evil.example\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      ),
      openSlowRequest(
        listener.port,
        `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      ),
    ]);
    try {
      const responses = await Promise.all(
        attacks.map((attack) => attack.response),
      );
      expect(responses[0]).toStartWith("HTTP/1.1 403");
      expect(responses[1]).toStartWith("HTTP/1.1 401");
      for (const response of responses) {
        expect(response.toLowerCase()).toContain("connection: close");
        expect(response.toLowerCase()).toContain("cache-control: no-store");
      }
      expect(
        await Promise.race([
          Promise.all(attacks.map((attack) => attack.closed)).then(() => true),
          Bun.sleep(250).then(() => false),
        ]),
      ).toBe(true);
      expect(handlerCalls).toBe(2);
    } finally {
      for (const attack of attacks) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes slow POSTs after encoding and declared-size rejection", async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const listener = await listenRuntimeHttp((request) => handler!(request));
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
    });
    const attacks = await Promise.all([
      openSlowRequest(
        listener.port,
        `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nOrigin: http://127.0.0.1:${listener.port}\r\nContent-Encoding: gzip\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
      ),
      openSlowRequest(
        listener.port,
        `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nOrigin: http://127.0.0.1:${listener.port}\r\nContent-Length: ${256 * 1024 + 1}\r\n\r\na`,
      ),
    ]);
    try {
      const responses = await Promise.all(
        attacks.map((attack) => attack.response),
      );
      expect(responses[0]).toStartWith("HTTP/1.1 415");
      expect(responses[1]).toStartWith("HTTP/1.1 413");
      expect(
        responses.every((response) =>
          response.toLowerCase().includes("connection: close"),
        ),
      ).toBe(true);
      expect(
        await Promise.race([
          Promise.all(attacks.map((attack) => attack.closed)).then(() => true),
          Bun.sleep(250).then(() => false),
        ]),
      ).toBe(true);
    } finally {
      for (const attack of attacks) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("releases 33 concurrent slow valid-target policy rejections", async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp((request) => {
      handlerCalls += 1;
      return handler!(request);
    });
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
    });
    const attackHeaders = [
      "Host: evil.example",
      `Host: 127.0.0.1:${listener.port}\r\nOrigin: http://evil.example`,
      `Host: 127.0.0.1:${listener.port}`,
    ];
    const attacks = await Promise.all(
      Array.from({ length: 33 }, (_, index) =>
        openSlowRequest(
          listener.port,
          `POST /v2/capabilities HTTP/1.1\r\n${attackHeaders[index % attackHeaders.length]}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
        ),
      ),
    );
    try {
      const responses = await Promise.all(
        attacks.map((attack) => attack.response),
      );
      expect(
        responses.every((response) =>
          ["HTTP/1.1 400", "HTTP/1.1 403", "HTTP/1.1 401"].some((status) =>
            response.startsWith(status),
          ),
        ),
      ).toBe(true);
      expect(
        responses.every((response) =>
          response.toLowerCase().includes("connection: close"),
        ),
      ).toBe(true);
      expect(
        await Promise.race([
          Promise.all(attacks.map((attack) => attack.closed)).then(() => true),
          Bun.sleep(1_000).then(() => false),
        ]),
      ).toBe(true);
      expect(handlerCalls).toBe(33);
    } finally {
      for (const attack of attacks) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("force-closes the overloaded request while 32 bodies remain accounted", async () => {
    let handler: ((request: Request) => Promise<Response>) | undefined;
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp((request) => {
      handlerCalls += 1;
      return handler!(request);
    });
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
    });
    const request = `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nOrigin: http://127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`;
    const accounted = await Promise.all(
      Array.from({ length: 32 }, () => openSlowRequest(listener.port, request)),
    );
    let overloaded: Awaited<ReturnType<typeof openSlowRequest>> | undefined;
    try {
      const deadline = Date.now() + 1_000;
      while (handlerCalls < 32 && Date.now() < deadline) await Bun.sleep(1);
      expect(handlerCalls).toBe(32);

      overloaded = await openSlowRequest(listener.port, request);
      const response = await overloaded.response;
      expect(response).toStartWith("HTTP/1.1 503");
      expect(response.toLowerCase()).toContain("connection: close");
      expect(
        await Promise.race([
          overloaded.closed,
          Bun.sleep(250).then(() => false),
        ]),
      ).toBe(true);
      expect(handlerCalls).toBe(33);
    } finally {
      overloaded?.socket.destroy();
      for (const attack of accounted) attack.socket.destroy();
      await listener.stop();
    }
  });

  test("preserves keep-alive after a completed mutation body", async () => {
    const bodies: string[] = [];
    const listener = await listenRuntimeHttp(async (request) => {
      bodies.push(request.body ? await request.text() : "");
      return Response.json({ accepted: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    const closed = new Promise<boolean>((resolve) =>
      socket.once("close", () => resolve(true)),
    );
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      const firstResponse = new Promise<string>((resolve, reject) => {
        socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
        socket.once("error", reject);
      });
      socket.write(
        `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nContent-Length: 3\r\n\r\nabc`,
      );
      const firstBytes = await firstResponse;
      expect(firstBytes).toStartWith("HTTP/1.1 200");
      expect(firstBytes.toLowerCase()).not.toContain("connection: close");
      expect(
        await Promise.race([closed, Bun.sleep(50).then(() => false)]),
      ).toBe(false);

      const secondResponse = new Promise<string>((resolve, reject) => {
        socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
        socket.once("error", reject);
      });
      socket.write(
        `GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nConnection: close\r\n\r\n`,
      );
      expect(await secondResponse).toStartWith("HTTP/1.1 200");
      expect(
        await Promise.race([closed, Bun.sleep(250).then(() => false)]),
      ).toBe(true);
      expect(bodies).toEqual(["abc", ""]);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("keeps unread-body closure authoritative over handler headers", async () => {
    const listener = await listenRuntimeHttp(async () =>
      Response.json(
        { rejected: true },
        { status: 401, headers: { Connection: "keep-alive" } },
      ),
    );
    const attack = await openSlowRequest(
      listener.port,
      `POST /v2/capabilities HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`,
    );
    try {
      const response = await attack.response;
      expect(response).toStartWith("HTTP/1.1 401");
      expect(response.toLowerCase()).toContain("connection: close");
      expect(
        await Promise.race([attack.closed, Bun.sleep(250).then(() => false)]),
      ).toBe(true);
    } finally {
      attack.socket.destroy();
      await listener.stop();
    }
  });

  test("rejects a slow chunked GET before handler dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    const response = new Promise<string>((resolve, reject) => {
      socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
      socket.once("error", reject);
    });
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        `GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n1\r\na\r\n`,
      );
      const firstBytes = await Promise.race([
        response,
        Bun.sleep(1_000).then(() => {
          throw new Error("Listener did not reject the framed GET promptly.");
        }),
      ]);

      expect(firstBytes).toStartWith("HTTP/1.1 400");
      expect(firstBytes.toLowerCase()).toContain("cache-control: no-store");
      expect(handlerCalls).toBe(0);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("rejects a slow chunked HEAD before handler dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    const response = new Promise<string>((resolve, reject) => {
      socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
      socket.once("error", reject);
    });
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        `HEAD /healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n1\r\na\r\n`,
      );
      const firstBytes = await Promise.race([
        response,
        Bun.sleep(1_000).then(() => {
          throw new Error("Listener did not reject the framed HEAD promptly.");
        }),
      ]);

      expect(firstBytes).toStartWith("HTTP/1.1 400");
      expect(firstBytes.toLowerCase()).toContain("cache-control: no-store");
      expect(handlerCalls).toBe(0);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("rejects Content-Length zero before trailing bytes can escape accounting", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    const socket = connect({ host: "127.0.0.1", port: listener.port });
    const response = new Promise<string>((resolve, reject) => {
      socket.once("data", (chunk) => resolve(chunk.toString("utf8")));
      socket.once("error", reject);
    });
    try {
      await new Promise<void>((resolve) => socket.once("connect", resolve));
      socket.write(
        `GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:${listener.port}\r\nContent-Length: 0\r\n\r\nG`,
      );
      const firstBytes = await Promise.race([
        response,
        Bun.sleep(1_000).then(() => {
          throw new Error("Listener did not reject the framed GET promptly.");
        }),
      ]);

      expect(firstBytes).toStartWith("HTTP/1.1 400");
      expect(firstBytes.toLowerCase()).toContain("connection: close");
      expect(firstBytes.toLowerCase()).toContain("cache-control: no-store");
      expect(handlerCalls).toBe(0);
    } finally {
      socket.destroy();
      await listener.stop();
    }
  });

  test("rejects every GET or HEAD body-framing header without dispatch", async () => {
    let handlerCalls = 0;
    const listener = await listenRuntimeHttp(async () => {
      handlerCalls += 1;
      return Response.json({ reached: true });
    });
    try {
      const responses = await Promise.all([
        rawRequest(listener.port, "/healthz", {
          headers: { "Content-Length": "1" },
        }),
        rawRequest(listener.port, "/healthz", {
          method: "HEAD",
          headers: { "Content-Length": "0" },
        }),
        rawRequest(listener.port, "/healthz", {
          rawHeaderLines: ["Content-Length: 0", "Content-Length: 0"],
        }),
      ]);

      for (const [index, response] of responses.entries()) {
        expect(response, `framing case ${index}`).toStartWith("HTTP/1.1 400");
        expect(response.toLowerCase(), `framing case ${index}`).toContain(
          "cache-control: no-store",
        );
        expect(response.toLowerCase(), `framing case ${index}`).toContain(
          "connection: close",
        );
      }
      expect(handlerCalls).toBe(0);
    } finally {
      await listener.stop();
    }
  });

  test("preserves bodyless GET and HEAD plus streamed mutation bodies", async () => {
    const calls: Array<{ method: string; body: string }> = [];
    const listener = await listenRuntimeHttp(async (request) => {
      const body = request.body ? await request.text() : "";
      calls.push({ method: request.method, body });
      return Response.json({ method: request.method, body });
    });
    try {
      const get = await rawRequest(listener.port, "/healthz");
      const head = await rawRequest(listener.port, "/healthz", {
        method: "HEAD",
      });
      const post = await rawRequest(listener.port, "/v2/capabilities", {
        method: "POST",
        headers: { "Content-Length": "3" },
        body: "abc",
      });

      expect(get).toStartWith("HTTP/1.1 200");
      expect(head).toStartWith("HTTP/1.1 200");
      expect(post).toStartWith("HTTP/1.1 200");
      expect(calls).toEqual([
        { method: "GET", body: "" },
        { method: "HEAD", body: "" },
        { method: "POST", body: "abc" },
      ]);
    } finally {
      await listener.stop();
    }
  });

  test("rejects encoded-dot route aliases before Request normalization", async () => {
    const token = Buffer.alloc(32, 7).toString("base64url");
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const listener = await listenRuntimeHttp((request) => handler!(request));
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? createRequestContext({
              id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              kind: "supervisor",
              scopes: ["runtime:read"],
              revoked: false,
              bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            })
          : undefined,
    });

    try {
      const health = await rawRequest(listener.port, "/%2e%2e/healthz");
      const capabilities = await rawRequest(
        listener.port,
        "/v2/%2e%2e/v2/capabilities",
        { headers: { Authorization: `Bearer ${token}` } },
      );

      for (const response of [health, capabilities]) {
        expect(response).toStartWith("HTTP/1.1 400");
        expect(response.toLowerCase()).toContain("cache-control: no-store");
        expect(response.toLowerCase()).toContain(
          "x-content-type-options: nosniff",
        );
      }
    } finally {
      await listener.stop();
    }
  });

  test("rejects non-origin-form targets without broadening canonical routes", async () => {
    const listener = await listenRuntimeHttp(async () =>
      Response.json({ reached: true }),
    );
    try {
      for (const target of [
        `http://127.0.0.1:${listener.port}/healthz`,
        "//evil.example/healthz",
        "/\\evil.example/healthz",
        "/healthz#fragment",
      ]) {
        const response = await rawRequest(listener.port, target);
        expect(response, target).toStartWith("HTTP/1.1 400");
        expect(response, target).not.toContain('"reached":true');
      }
      const asterisk = await rawRequest(listener.port, "*", {
        method: "OPTIONS",
      });
      const authority = await rawRequest(
        listener.port,
        `127.0.0.1:${listener.port}`,
        { method: "CONNECT" },
      );
      expect(asterisk).toStartWith("HTTP/1.1 400");
      expect(asterisk).not.toContain('"reached":true');
      expect(authority).toBe("");

      const canonical = await rawRequest(listener.port, "/healthz");
      expect(canonical).toStartWith("HTTP/1.1 200");
      expect(canonical).toContain('"reached":true');
    } finally {
      await listener.stop();
    }
  });

  test("preserves runtime Host, Origin, auth, headers, and body policies", async () => {
    const token = Buffer.alloc(32, 7).toString("base64url");
    let handler: ((request: Request) => Promise<Response>) | undefined;
    const listener = await listenRuntimeHttp((request) => handler!(request));
    handler = createRuntimeHttpHandler({
      port: listener.port,
      identity: {
        runtimeVersion: "0.1.0-alpha.2",
        instanceId: createOpaqueId(() => Buffer.alloc(24, 13)),
        capabilities: LISTENER_CAPABILITIES,
      },
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${token}`
          ? createRequestContext({
              id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              kind: "supervisor",
              scopes: ["runtime:read"],
              revoked: false,
              bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            })
          : undefined,
    });

    try {
      const health = await rawRequest(listener.port, "/healthz", {
        headers: { Origin: `http://127.0.0.1:${listener.port}` },
      });
      const capabilities = await rawRequest(listener.port, "/v2/capabilities", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hostileHost = await rawRequest(listener.port, "/healthz", {
        host: "evil.example",
      });
      const hostileOrigin = await rawRequest(listener.port, "/healthz", {
        headers: { Origin: "http://evil.example" },
      });
      const oversized = await rawRequest(listener.port, "/v2/capabilities", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Length": String(256 * 1024 + 1),
        },
      });

      expect(health).toStartWith("HTTP/1.1 200");
      expect(capabilities).toStartWith("HTTP/1.1 200");
      expect(capabilities).toContain('"runtimeVersion":"0.1.0-alpha.2"');
      expect(hostileHost).toStartWith("HTTP/1.1 400");
      expect(hostileOrigin).toStartWith("HTTP/1.1 403");
      expect(oversized).toStartWith("HTTP/1.1 413");
      for (const response of [
        health,
        capabilities,
        hostileHost,
        hostileOrigin,
        oversized,
      ]) {
        expect(response.toLowerCase()).toContain("cache-control: no-store");
        expect(response.toLowerCase()).toContain(
          "x-content-type-options: nosniff",
        );
        expect(response).not.toContain(token);
      }
    } finally {
      await listener.stop();
    }
  });
});
