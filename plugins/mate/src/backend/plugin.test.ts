import { describe, expect, mock, test } from "bun:test";
import type { BbPluginApi } from "@bb/plugin-sdk";
import type { PluginWorkbenchSnapshot } from "./runtime-supervisor.ts";

mock.module("@bb/plugin-sdk", () => ({
  defineRpcContract: <T>(contract: T) => contract,
}));
const {
  default: plugin,
  createMatePlugin,
  rpcContract,
} = await import("./plugin.ts");

const idle: PluginWorkbenchSnapshot = {
  schemaVersion: 1,
  runtimeState: "idle",
  reason: null,
  runtimeVersion: null,
  apiVersion: null,
  canStart: true,
  browserLaunch: "unavailable",
  targets: "unavailable_pending_runtime_admission",
};

function hostFixture(factory = plugin, projectGet = async () => ({})) {
  let handlers: Record<string, (input: unknown) => unknown> | undefined;
  let service: { start(signal: AbortSignal): void | Promise<void> } | undefined;
  let dispose: (() => void | Promise<void>) | undefined;
  const bb = {
    rpc: {
      register(_contract: unknown, value: typeof handlers) {
        handlers = value;
      },
    },
    background: {
      service(_name: string, value: typeof service) {
        service = value;
      },
    },
    sdk: { projects: { get: projectGet } },
    onDispose(value: typeof dispose) {
      dispose = value;
    },
  } as unknown as BbPluginApi;
  factory(bb);
  return {
    handlers: () => handlers!,
    service: () => service!,
    dispose: () => dispose!,
  };
}

describe("Plugin Workbench backend", () => {
  test("exports strict separate status and ensure contracts", () => {
    expect(
      rpcContract.status.input.safeParse({ projectId: null }).success,
    ).toBe(true);
    expect(
      rpcContract.ensure.input.safeParse({ projectId: null }).success,
    ).toBe(false);
    expect(
      rpcContract.ensure.input.safeParse({ projectId: "p", extra: true })
        .success,
    ).toBe(false);
    expect(
      rpcContract.ensure.input.safeParse({ projectId: "é".repeat(65) }).success,
    ).toBe(false);
    expect(
      rpcContract.ensure.input.safeParse({ projectId: "../private" }).success,
    ).toBe(false);
    expect(
      rpcContract.status.output.safeParse({
        ...idle,
        executablePath: "/private",
      }).success,
    ).toBe(false);
    expect(
      rpcContract.status.output.safeParse({
        ...idle,
        runtimeState: "ready",
        canStart: false,
      }).success,
    ).toBe(false);
    expect(
      rpcContract.status.output.safeParse({
        ...idle,
        runtimeState: "ready",
        canStart: false,
        runtimeVersion: "https://private.invalid",
        apiVersion: 1,
      }).success,
    ).toBe(false);
  });

  test("keeps status read-only and makes ensure the sole start edge", async () => {
    let ensures = 0;
    let stops = 0;
    const host = hostFixture(
      createMatePlugin({
        status: () => idle,
        async ensure() {
          ensures += 1;
          return { ...idle, runtimeState: "starting", canStart: false };
        },
        async runService(signal) {
          await new Promise<void>((resolve) =>
            signal.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
        async stop() {
          stops += 1;
        },
      }),
    );

    expect(await host.handlers().status({ projectId: null })).toEqual(idle);
    expect(ensures).toBe(0);
    expect(
      await host.handlers().ensure({ projectId: "project-1" }),
    ).toMatchObject({ runtimeState: "starting" });
    expect(ensures).toBe(1);

    const unavailable = hostFixture(
      createMatePlugin({
        status: () => idle,
        async ensure() {
          ensures += 1;
          return idle;
        },
        async runService() {},
        async stop() {},
      }),
      async () => {
        throw new Error("private project detail");
      },
    );
    await expect(
      unavailable.handlers().ensure({ projectId: "stale-project" }),
    ).rejects.toThrow("Project is unavailable.");
    expect(ensures).toBe(1);

    const controller = new AbortController();
    let settled = false;
    const serving = Promise.resolve(
      host.service().start(controller.signal),
    ).then(() => {
      settled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    controller.abort();
    await serving;
    await host.dispose()();
    expect(stops).toBe(1);
  });
});
