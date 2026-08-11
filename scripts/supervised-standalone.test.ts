import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  observeChildClose,
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
