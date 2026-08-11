import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  observeChildClose,
  type StandaloneRuntimeDescriptor,
  validateStandaloneDescriptor,
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
});
