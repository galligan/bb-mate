import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import {
  RUNTIME_CAPABILITIES,
  RuntimeCapabilityDocumentSchema,
  serializeRuntimeLaunchDescriptor,
} from "@bb-mate/runtime/supervision";
import { launchPackagedRuntime } from "./runtime-launcher.ts";
import type { RuntimeArtifactResolution } from "./runtime-resolver.ts";

class FakeChild extends EventEmitter {
  readonly pid = 9001;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly supervisor: Writable;
  constructor(supervisor: Writable = new PassThrough()) {
    super();
    this.supervisor = supervisor;
  }
  get stdio() {
    return [null, this.stdout, this.stderr, this.supervisor] as const;
  }
  readonly exitCode = null;
  readonly signalCode = null;
}

class FailingWrite extends Writable {
  override _write(
    _chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const error = new Error("early EPIPE");
    this.destroy(error);
    callback(error);
  }
}

const artifact: Extract<RuntimeArtifactResolution, { kind: "available" }> = {
  kind: "available",
  executablePath: "/installed/bb-plugin-mate/runtime/darwin-arm64/bb-mate",
  runtimeVersion: "0.1.0-alpha.2",
  apiVersion: 1,
  size: 32,
  sha256: "a".repeat(64),
};

describe("packaged runtime launcher", () => {
  for (const mode of ["closed-before-write", "closed-during-write"] as const) {
    test(`bounds and cleans up an FD3 channel ${mode}`, async () => {
      const child = new FakeChild(
        mode === "closed-during-write" ? new FailingWrite() : undefined,
      );
      const signals: NodeJS.Signals[] = [];
      if (mode === "closed-before-write") child.supervisor.destroy();
      await expect(
        launchPackagedRuntime(artifact, {
          attest: async () => true,
          randomBytes: (size) => Buffer.alloc(size, size),
          spawn: (() => child) as never,
          supervisorWriteTimeoutMs: 5,
          gracefulStopMs: 1,
          forceStopMs: 1,
          killGroup: (_pid, signal) => {
            signals.push(signal);
            if (signal === "SIGKILL") child.emit("close", null, signal);
          },
        }),
      ).rejects.toMatchObject({
        name: "RuntimeLaunchError",
        kind: "startup_failed",
      });
      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    });
  }

  test("attests immediately before spawn and fails closed on drift", async () => {
    let spawns = 0;
    await expect(
      launchPackagedRuntime(artifact, {
        attest: async () => false,
        spawn: (() => {
          spawns += 1;
          throw new Error("must not spawn");
        }) as never,
      }),
    ).rejects.toMatchObject({
      name: "RuntimeLaunchError",
      kind: "artifact_invalid",
    });
    expect(spawns).toBe(0);
  });

  test("launches the exact supervised protocol and stops through FD3", async () => {
    const child = new FakeChild();
    const spawnCalls: unknown[][] = [];
    let frameText = "";
    child.supervisor.on("data", (chunk) => {
      frameText += chunk.toString("utf8");
    });
    child.supervisor.once("finish", () => child.emit("close", 0, null));
    let capabilityRequest:
      { baseUrl: string; token: string; timeoutMs: number } | undefined;

    const launching = launchPackagedRuntime(artifact, {
      parentPid: 4321,
      attest: async () => true,
      randomBytes: (size) => Buffer.alloc(size, size),
      spawn: ((...args: unknown[]) => {
        spawnCalls.push(args);
        return child;
      }) as never,
      requestCapabilities: async (request) => {
        capabilityRequest = request;
        return RuntimeCapabilityDocumentSchema.parse({
          schemaVersion: 1,
          runtimeVersion: artifact.runtimeVersion,
          apiVersion: 1,
          instanceId: "i".repeat(32),
          capabilities: RUNTIME_CAPABILITIES,
        });
      },
    });
    while (frameText === "") {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const frame = JSON.parse(frameText) as Record<string, unknown> & {
      token: string;
    };
    child.stdout.write(
      serializeRuntimeLaunchDescriptor({
        schemaVersion: 1,
        protocol: "bb-mate-runtime",
        runtimeVersion: artifact.runtimeVersion,
        apiVersion: 1,
        pid: child.pid,
        instanceId: "i".repeat(32),
        baseUrl: "http://127.0.0.1:41721",
        capabilities: RUNTIME_CAPABILITIES,
      }),
    );

    const runtime = await launching;
    expect(spawnCalls).toEqual([
      [
        artifact.executablePath,
        [
          "serve",
          "--port",
          "0",
          "--json",
          "--parent-pid",
          "4321",
          "--supervisor-fd",
          "3",
        ],
        {
          cwd: path.dirname(artifact.executablePath),
          detached: true,
          env: {},
          shell: false,
          stdio: ["ignore", "pipe", "pipe", "pipe"],
        },
      ],
    ]);
    expect(frame).toEqual({
      schemaVersion: 1,
      expectedRuntimeVersion: artifact.runtimeVersion,
      expectedApiVersion: 1,
      token: Buffer.alloc(32, 32).toString("base64url"),
      principalId: Buffer.alloc(24, 24).toString("base64url"),
      bbContextId: Buffer.alloc(24, 24).toString("base64url"),
    });
    expect(capabilityRequest).toEqual({
      baseUrl: "http://127.0.0.1:41721",
      token: frame.token,
      timeoutMs: 2_000,
    });
    expect(runtime.identity).toEqual({
      runtimeVersion: artifact.runtimeVersion,
      apiVersion: 1,
      instanceId: "i".repeat(32),
    });

    await runtime.stop();
    await expect(runtime.closed).resolves.toBeUndefined();
    expect(child.supervisor.writableEnded).toBe(true);
  });

  test("stops when the bounded descriptor identity does not match the child", async () => {
    const child = new FakeChild();
    let frameReceived = false;
    child.supervisor.once("data", () => {
      frameReceived = true;
    });
    child.supervisor.once("finish", () => child.emit("close", 0, null));
    let handshakeCalls = 0;
    const launching = launchPackagedRuntime(artifact, {
      attest: async () => true,
      randomBytes: (size) => Buffer.alloc(size, size),
      spawn: (() => child) as never,
      requestCapabilities: async () => {
        handshakeCalls += 1;
        throw new Error("must not handshake");
      },
    });
    while (!frameReceived) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    child.stdout.write(
      serializeRuntimeLaunchDescriptor({
        schemaVersion: 1,
        protocol: "bb-mate-runtime",
        runtimeVersion: artifact.runtimeVersion,
        apiVersion: 1,
        pid: child.pid + 1,
        instanceId: "i".repeat(32),
        baseUrl: "http://127.0.0.1:41721",
        capabilities: RUNTIME_CAPABILITIES,
      }),
    );

    await expect(launching).rejects.toThrow("Packaged runtime launch failed.");
    expect(handshakeCalls).toBe(0);
    expect(child.supervisor.writableEnded).toBe(true);
  });

  test("does not mistake a child error for process close during shutdown", async () => {
    const child = new FakeChild();
    let frameReceived = false;
    child.supervisor.once("data", () => {
      frameReceived = true;
    });
    const signals: NodeJS.Signals[] = [];
    const launching = launchPackagedRuntime(artifact, {
      attest: async () => true,
      randomBytes: (size) => Buffer.alloc(size, size),
      spawn: (() => child) as never,
      requestCapabilities: async () =>
        RuntimeCapabilityDocumentSchema.parse({
          schemaVersion: 1,
          runtimeVersion: artifact.runtimeVersion,
          apiVersion: 1,
          instanceId: "i".repeat(32),
          capabilities: RUNTIME_CAPABILITIES,
        }),
      gracefulStopMs: 1,
      forceStopMs: 1,
      killGroup: (_pid, signal) => {
        signals.push(signal);
        if (signal === "SIGKILL") child.emit("close", null, signal);
      },
    });
    while (!frameReceived) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    child.stdout.write(
      serializeRuntimeLaunchDescriptor({
        schemaVersion: 1,
        protocol: "bb-mate-runtime",
        runtimeVersion: artifact.runtimeVersion,
        apiVersion: 1,
        pid: child.pid,
        instanceId: "i".repeat(32),
        baseUrl: "http://127.0.0.1:41721",
        capabilities: RUNTIME_CAPABILITIES,
      }),
    );
    const runtime = await launching;
    child.emit("error", new Error("process error before close"));
    await runtime.stop();
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    await expect(runtime.closed).resolves.toBeUndefined();
  });

  test("cleans the owned process group after its leader closes", async () => {
    const child = new FakeChild();
    let frameReceived = false;
    child.supervisor.once("data", () => {
      frameReceived = true;
    });
    let groupAlive = true;
    const signals: NodeJS.Signals[] = [];
    const launching = launchPackagedRuntime(artifact, {
      attest: async () => true,
      randomBytes: (size) => Buffer.alloc(size, size),
      spawn: (() => child) as never,
      requestCapabilities: async () =>
        RuntimeCapabilityDocumentSchema.parse({
          schemaVersion: 1,
          runtimeVersion: artifact.runtimeVersion,
          apiVersion: 1,
          instanceId: "i".repeat(32),
          capabilities: RUNTIME_CAPABILITIES,
        }),
      gracefulStopMs: 1,
      forceStopMs: 1,
      groupExists: () => groupAlive,
      killGroup: (_pid, signal) => {
        signals.push(signal);
        if (signal === "SIGKILL") groupAlive = false;
      },
    });
    while (!frameReceived) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    child.stdout.write(
      serializeRuntimeLaunchDescriptor({
        schemaVersion: 1,
        protocol: "bb-mate-runtime",
        runtimeVersion: artifact.runtimeVersion,
        apiVersion: 1,
        pid: child.pid,
        instanceId: "i".repeat(32),
        baseUrl: "http://127.0.0.1:41721",
        capabilities: RUNTIME_CAPABILITIES,
      }),
    );
    const runtime = await launching;
    child.emit("close", 1, null);

    await expect(runtime.closed).resolves.toBeUndefined();
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(groupAlive).toBe(false);
  });
});
