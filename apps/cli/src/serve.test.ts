import { describe, expect, test } from "bun:test";
import { createOpaqueId } from "@bb-mate/runtime";
import {
  parseSupervisorFrame,
  RUNTIME_CAPABILITIES,
} from "@bb-mate/runtime/supervision";
import { runSupervisedServe, type SupervisedServePlatform } from "./serve.ts";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const token = Buffer.alloc(32, 7).toString("base64url");
const instanceId = createOpaqueId(() => Buffer.alloc(24, 13));
const frame = parseSupervisorFrame(
  JSON.stringify({
    schemaVersion: 1,
    expectedRuntimeVersion: "0.1.0-alpha.2",
    expectedApiVersion: 1,
    token,
    principalId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    bbContextId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  }),
);

describe("supervised serve", () => {
  test("emits one descriptor and stops exactly once when liveness closes", async () => {
    const liveness = deferred<void>();
    const signal = deferred<NodeJS.Signals>();
    const parentExit = deferred<void>();
    const stdout: string[] = [];
    const stderr: string[] = [];
    let stopCalls = 0;
    let fetchHandler: ((request: Request) => Promise<Response>) | undefined;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({ frame, closed: liveness.promise }),
      isParentAlive: () => true,
      waitForParentExit: () => parentExit.promise,
      waitForSignal: () => signal.promise,
      listen: (fetch) => {
        fetchHandler = fetch;
        return { port: 41721, stop: () => void (stopCalls += 1) };
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    };

    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    while (stdout.length === 0) await Bun.sleep(0);

    expect(stdout).toHaveLength(1);
    expect(JSON.parse(stdout[0] ?? "")).toEqual({
      apiVersion: 1,
      baseUrl: "http://127.0.0.1:41721",
      capabilities: RUNTIME_CAPABILITIES,
      instanceId,
      pid: 9001,
      protocol: "bb-mate-runtime",
      runtimeVersion: "0.1.0-alpha.2",
      schemaVersion: 1,
    });
    expect(fetchHandler).toBeFunction();
    expect(stderr).toEqual([]);

    liveness.resolve();
    await expect(running).resolves.toEqual({ exitCode: 0, signal: null });
    expect(stopCalls).toBe(1);
  });

  test("authenticates capabilities with only the inherited bearer token", async () => {
    const liveness = deferred<void>();
    let fetchHandler: ((request: Request) => Promise<Response>) | undefined;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({ frame, closed: liveness.promise }),
      isParentAlive: () => true,
      waitForParentExit: () => new Promise(() => undefined),
      waitForSignal: () => new Promise(() => undefined),
      listen: (fetch) => {
        fetchHandler = fetch;
        return { port: 41721, stop: () => undefined };
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    };
    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    while (!fetchHandler) await Bun.sleep(0);

    const request = (authorization?: string) =>
      new Request("http://127.0.0.1:41721/v1/capabilities", {
        headers: {
          host: "127.0.0.1:41721",
          ...(authorization ? { authorization } : {}),
        },
      });
    const denied = [
      await fetchHandler(request()),
      await fetchHandler(request("Bearer wrong")),
      await fetchHandler(request(`Bearer ${"a".repeat(64 * 1024)}`)),
    ];
    expect(denied.map((response) => response.status)).toEqual([401, 401, 401]);
    for (const response of denied) {
      expect(await response.text()).not.toContain(token);
    }
    const authorized = await fetchHandler(request(`Bearer ${token}`));
    expect(authorized.status).toBe(200);
    expect(await authorized.json()).toEqual({
      schemaVersion: 1,
      runtimeVersion: "0.1.0-alpha.2",
      apiVersion: 1,
      instanceId,
      capabilities: RUNTIME_CAPABILITIES,
    });
    expect(stdout.join("")).not.toContain(token);
    expect(stderr.join("")).not.toContain(token);

    liveness.resolve();
    await running;
  });

  test("refuses a mismatched supervisor before binding or describing a listener", async () => {
    const incompatible = parseSupervisorFrame(
      JSON.stringify({
        ...frame,
        expectedRuntimeVersion: "0.1.0-alpha.1",
      }),
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    let listened = false;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({
        frame: incompatible,
        closed: new Promise(() => undefined),
      }),
      isParentAlive: () => true,
      waitForParentExit: () => new Promise(() => undefined),
      waitForSignal: () => new Promise(() => undefined),
      listen: () => {
        listened = true;
        throw new Error("must not listen");
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    };

    await expect(
      runSupervisedServe(
        { port: 0, parentPid: 4321, supervisorFd: 3 },
        { runtimeVersion: "0.1.0-alpha.2", platform },
      ),
    ).resolves.toEqual({ exitCode: 1, signal: null });
    expect(listened).toBe(false);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toBe(
      "Supervised runtime version is incompatible.\n",
    );
    expect(stderr.join("")).not.toContain(token);
  });

  test("does not read credentials when the declared parent is already gone", async () => {
    let opened = false;
    let listened = false;
    const stderr: string[] = [];
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => {
        opened = true;
        throw new Error("must not open");
      },
      isParentAlive: () => false,
      waitForParentExit: () => new Promise(() => undefined),
      waitForSignal: () => new Promise(() => undefined),
      listen: () => {
        listened = true;
        throw new Error("must not listen");
      },
      stdout: () => undefined,
      stderr: (value) => stderr.push(value),
    };

    await expect(
      runSupervisedServe(
        { port: 0, parentPid: 4321, supervisorFd: 3 },
        { runtimeVersion: "0.1.0-alpha.2", platform },
      ),
    ).resolves.toEqual({ exitCode: 1, signal: null });
    expect(opened).toBe(false);
    expect(listened).toBe(false);
    expect(stderr).toEqual(["Supervised runtime parent is unavailable.\n"]);
  });

  test("returns the terminating signal after idempotent listener cleanup", async () => {
    const signal = deferred<NodeJS.Signals>();
    let stopCalls = 0;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({
        frame,
        closed: new Promise(() => undefined),
      }),
      isParentAlive: () => true,
      waitForParentExit: () => new Promise(() => undefined),
      waitForSignal: () => signal.promise,
      listen: () => ({
        port: 41721,
        stop: () => void (stopCalls += 1),
      }),
      stdout: () => undefined,
      stderr: () => undefined,
    };
    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    await Bun.sleep(0);

    signal.resolve("SIGTERM");
    await expect(running).resolves.toEqual({
      exitCode: null,
      signal: "SIGTERM",
    });
    expect(stopCalls).toBe(1);
  });

  test("fails closed and stops when the supervisor process disappears", async () => {
    const parentExit = deferred<void>();
    const stderr: string[] = [];
    let stopCalls = 0;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({
        frame,
        closed: new Promise(() => undefined),
      }),
      isParentAlive: () => true,
      waitForParentExit: () => parentExit.promise,
      waitForSignal: () => new Promise(() => undefined),
      listen: () => ({
        port: 41721,
        stop: () => void (stopCalls += 1),
      }),
      stdout: () => undefined,
      stderr: (value) => stderr.push(value),
    };
    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    await Bun.sleep(0);

    parentExit.resolve();
    await expect(running).resolves.toEqual({ exitCode: 1, signal: null });
    expect(stopCalls).toBe(1);
    expect(stderr).toEqual(["Supervised runtime stopped unexpectedly.\n"]);
  });

  test("stops when the one-frame channel reports post-frame bytes", async () => {
    const liveness = deferred<void>();
    let stopCalls = 0;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({ frame, closed: liveness.promise }),
      isParentAlive: () => true,
      waitForParentExit: () => new Promise(() => undefined),
      waitForSignal: () => new Promise(() => undefined),
      listen: () => ({
        port: 41721,
        stop: () => void (stopCalls += 1),
      }),
      stdout: () => undefined,
      stderr: () => undefined,
    };
    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    await Bun.sleep(0);

    liveness.reject(new Error("Supervisor channel accepts exactly one frame."));
    await expect(running).resolves.toEqual({ exitCode: 1, signal: null });
    expect(stopCalls).toBe(1);
  });

  test("stops once when shutdown sources settle together", async () => {
    const liveness = deferred<void>();
    const signal = deferred<NodeJS.Signals>();
    const parentExit = deferred<void>();
    let stopCalls = 0;
    const platform: SupervisedServePlatform = {
      pid: 9001,
      createInstanceId: () => instanceId,
      openChannel: async () => ({ frame, closed: liveness.promise }),
      isParentAlive: () => true,
      waitForParentExit: () => parentExit.promise,
      waitForSignal: () => signal.promise,
      listen: () => ({
        port: 41721,
        stop: async () => {
          stopCalls += 1;
        },
      }),
      stdout: () => undefined,
      stderr: () => undefined,
    };
    const running = runSupervisedServe(
      { port: 0, parentPid: 4321, supervisorFd: 3 },
      { runtimeVersion: "0.1.0-alpha.2", platform },
    );
    await Bun.sleep(0);

    liveness.resolve();
    signal.resolve("SIGTERM");
    parentExit.resolve();
    await running;
    expect(stopCalls).toBe(1);
  });
});
