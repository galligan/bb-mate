import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { Writable } from "node:stream";
import {
  observeChildClose,
  requestRuntimeHealth,
  superviseWritable,
  type StandaloneRuntimeDescriptor,
  validateStandaloneDescriptor,
  waitForRuntimeHealth,
  within,
} from "./supervised-standalone.ts";

function descriptor(): StandaloneRuntimeDescriptor & Record<string, unknown> {
  return {
    schemaVersion: 1,
    protocol: "bb-mate-runtime",
    runtimeVersion: "0.1.0-alpha.2",
    apiVersion: 1,
    pid: 42,
    instanceId: "i".repeat(32),
    baseUrl: "http://127.0.0.1:41721",
    capabilities: {
      annotations: false,
      artifacts: false,
      browserBootstrap: false,
      captures: false,
      comparisons: false,
      events: false,
      mcp: false,
      pluginBriefs: false,
      reviews: false,
      sessions: false,
      targets: false,
    },
  };
}

describe("standalone supervision proof", () => {
  test("accepts only the exact bounded-loopback descriptor identity", () => {
    expect(
      validateStandaloneDescriptor(descriptor(), {
        runtimeVersion: "0.1.0-alpha.2",
        pid: 42,
      }),
    ).toEqual(descriptor());

    expect(() =>
      validateStandaloneDescriptor(
        { ...descriptor(), token: "secret" },
        { runtimeVersion: "0.1.0-alpha.2" },
      ),
    ).toThrow("V1 allowlist");
    expect(() =>
      validateStandaloneDescriptor(
        { ...descriptor(), baseUrl: "http://localhost:41721" },
        { runtimeVersion: "0.1.0-alpha.2" },
      ),
    ).toThrow("identity is invalid");
    expect(() =>
      validateStandaloneDescriptor(
        { ...descriptor(), capabilities: { targets: false } },
        { runtimeVersion: "0.1.0-alpha.2" },
      ),
    ).toThrow("identity is invalid");
  });

  test("bounds awaited runtime transitions", async () => {
    await expect(within(Promise.resolve("ready"), 50, "timeout")).resolves.toBe(
      "ready",
    );
    await expect(
      within(new Promise(() => undefined), 1, "bounded timeout"),
    ).rejects.toThrow("bounded timeout");
  });

  test("waits for stdio close so output arriving after exit is observable", async () => {
    const child = new EventEmitter();
    const chunks = ["descriptor\n"];
    let closed = false;
    const completed = observeChildClose(child).then(() => {
      closed = true;
    });

    child.emit("exit", 0, null);
    chunks.push("late secret output");
    await Promise.resolve();
    expect(closed).toBe(false);

    child.emit("close", 0, null);
    await completed;
    expect(closed).toBe(true);
    expect(chunks.join("")).toContain("late secret output");
  });

  test("awaits frame delivery and deliberate FD3 teardown", async () => {
    let deliver!: () => void;
    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        deliver = callback;
      },
    });
    const supervisor = superviseWritable(writable, "frame\n");
    let ready = false;
    void supervisor.ready.then(() => {
      ready = true;
    });

    await Promise.resolve();
    expect(ready).toBe(false);
    deliver();
    await supervisor.ready;
    expect(ready).toBe(true);
    await supervisor.end();
    expect(writable.closed).toBe(true);
  });

  test("retries connection refusal until health returns HTTP 200", async () => {
    let attempts = 0;
    let sleeps = 0;
    await waitForRuntimeHealth("http://127.0.0.1:41721", {
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("not listening yet"), {
            code: "ConnectionRefused",
          });
        }
        return new Response(null, { status: 200 });
      },
      sleep: async () => {
        sleeps += 1;
      },
      now: () => 0,
      timeoutMs: 100,
    });

    expect(attempts).toBe(2);
    expect(sleeps).toBe(1);
  });

  test("probes runtime health through a fresh connection", async () => {
    let connections = 0;
    const server = createServer((_request, response) => {
      response.end();
    });
    server.on("connection", () => {
      connections += 1;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test listener did not receive a port.");
    }
    try {
      expect(
        await requestRuntimeHealth(`http://127.0.0.1:${address.port}/healthz`),
      ).toEqual({ status: 200 });
      expect(
        await requestRuntimeHealth(`http://127.0.0.1:${address.port}/healthz`),
      ).toEqual({ status: 200 });
      expect(connections).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("destroys a pending health request when its bound is canceled", async () => {
    let received!: () => void;
    const requestReceived = new Promise<void>((resolve) => {
      received = resolve;
    });
    let closed!: () => void;
    const socketClosed = new Promise<void>((resolve) => {
      closed = resolve;
    });
    let socket: import("node:net").Socket | undefined;
    const server = createServer((request) => {
      socket = request.socket;
      socket.once("close", closed);
      received();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test listener did not receive a port.");
    }
    const controller = new AbortController();
    try {
      const requested = requestRuntimeHealth(
        `http://127.0.0.1:${address.port}/healthz`,
        controller.signal,
      ).then(
        () => "resolved",
        () => "aborted",
      );
      await requestReceived;
      controller.abort();
      expect(
        await Promise.race([
          requested,
          Bun.sleep(50).then(() => "still pending"),
        ]),
      ).toBe("aborted");
      expect(
        await Promise.race([
          socketClosed.then(() => "closed"),
          Bun.sleep(50).then(() => "still open"),
        ]),
      ).toBe("closed");
    } finally {
      socket?.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("allows bounded hosted startup beyond two seconds", async () => {
    let now = 0;
    await waitForRuntimeHealth("http://127.0.0.1:41721", {
      fetch: async () => {
        if (now < 2_500) {
          throw Object.assign(new Error("not listening yet"), {
            code: "ConnectionRefused",
          });
        }
        return new Response(null, { status: 200 });
      },
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      now: () => now,
    });

    expect(now).toBe(2_500);
  });

  test("reports a runtime exit instead of retrying a closed listener", async () => {
    const token = "A".repeat(43);
    const failure = waitForRuntimeHealth("http://127.0.0.1:41721", {
      fetch: async () => {
        throw Object.assign(new Error("not listening"), {
          code: "ConnectionRefused",
        });
      },
      runtime: {
        closed: Promise.resolve(),
        child: { exitCode: 1, signalCode: null },
        stderr: () => `parent unavailable ${token}`,
        token,
      },
    });

    await expect(failure).rejects.toThrow(
      'Supervised runtime exited before becoming healthy: exitCode=1, signal=null, stderr="parent unavailable [redacted]".',
    );
  });

  test("fails immediately on HTTP failure and bounds repeated refusal", async () => {
    let sleeps = 0;
    await expect(
      waitForRuntimeHealth("http://127.0.0.1:41721", {
        fetch: async () => new Response(null, { status: 503 }),
        sleep: async () => {
          sleeps += 1;
        },
      }),
    ).rejects.toThrow("returned HTTP 503");
    expect(sleeps).toBe(0);
    await expect(
      waitForRuntimeHealth("http://127.0.0.1:41721", {
        fetch: async () => {
          throw Object.assign(new Error("certificate failure"), {
            code: "CERT_INVALID",
          });
        },
        sleep: async () => {
          sleeps += 1;
        },
      }),
    ).rejects.toThrow("certificate failure");
    expect(sleeps).toBe(0);

    let now = 0;
    let attempts = 0;
    await expect(
      waitForRuntimeHealth("http://127.0.0.1:41721", {
        fetch: async () => {
          attempts += 1;
          throw Object.assign(new Error("not listening yet"), {
            code: "ConnectionRefused",
          });
        },
        sleep: async (milliseconds) => {
          now += milliseconds;
        },
        now: () => now,
        retryDelayMs: 5,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("did not become healthy");
    expect(attempts).toBe(2);
    expect(now).toBe(10);
  });
});
