import { describe, expect, test } from "bun:test";
import type { OwnedRuntime } from "./runtime-launcher.ts";
import type { RuntimeArtifactResolution } from "./runtime-resolver.ts";
import { RuntimeSupervisor } from "./runtime-supervisor.ts";

const available: Extract<RuntimeArtifactResolution, { kind: "available" }> = {
  kind: "available",
  executablePath: "/package/runtime/darwin-arm64/bb-mate",
  runtimeVersion: "0.1.0-alpha.2",
  apiVersion: 2,
  size: 32,
  sha256: "a".repeat(64),
};

function controlledRuntime() {
  let close!: () => void;
  let stops = 0;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  const runtime: OwnedRuntime = {
    identity: {
      runtimeVersion: available.runtimeVersion,
      apiVersion: 2,
      instanceId: "i".repeat(32),
    },
    targets: {
      async list() {
        return { schemaVersion: 1, state: "ready", targets: [] };
      },
      async admitProjects(input) {
        return {
          schemaVersion: 2,
          state: "ready",
          projects: input.projects.map(({ projectKey }) => ({
            projectKey,
            state: "ready" as const,
            targets: [],
          })),
        };
      },
      dispose() {},
    },
    closed,
    async stop() {
      stops += 1;
      close();
    },
  };
  return { runtime, close, stops: () => stops };
}

describe("runtime supervisor", () => {
  test("keeps its service idle until demand and reports deterministic failure without restart churn", async () => {
    let resolves = 0;
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        resolves += 1;
        return { kind: "unavailable", reason: "artifact-unavailable" };
      },
      async launch() {
        throw new Error("must not launch");
      },
    });
    const controller = new AbortController();
    const service = supervisor.runService(controller.signal);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(resolves).toBe(0);
    expect(() => {
      (supervisor.status() as { canStart: boolean }).canStart = false;
    }).toThrow();
    expect(supervisor.status().canStart).toBe(true);

    await supervisor.ensure("/bb-data/plugins/mate/runtime");
    await expect(service).rejects.toMatchObject({
      name: "NeedsConfigurationError",
    });
    expect(resolves).toBe(1);
  });

  test("is lazy and serializes concurrent explicit demand", async () => {
    const owned = controlledRuntime();
    let resolves = 0;
    let launches = 0;
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        resolves += 1;
        return available;
      },
      async launch() {
        launches += 1;
        return owned.runtime;
      },
    });

    expect(supervisor.status()).toEqual({
      schemaVersion: 2,
      runtimeState: "idle",
      reason: null,
      runtimeVersion: null,
      apiVersion: null,
      canStart: true,
      browserLaunch: "unavailable",
    });
    expect(resolves).toBe(0);

    const [first, second] = await Promise.all([
      supervisor.ensure("/bb-data/plugins/mate/runtime"),
      supervisor.ensure("/bb-data/plugins/mate/runtime"),
    ]);
    expect(first).toEqual(second);
    expect(first.runtimeState).toBe("ready");
    expect(first.runtimeVersion).toBe(available.runtimeVersion);
    expect(resolves).toBe(1);
    expect(launches).toBe(1);

    await supervisor.stop();
    expect(owned.stops()).toBe(1);
    expect(supervisor.status().runtimeState).toBe("idle");
  });

  test("maps permanent package failures without launching", async () => {
    const cases = [
      ["unsupported-platform", "unsupported_platform"],
      ["artifact-unavailable", "artifact_missing"],
      ["invalid-stamp", "artifact_invalid"],
      ["artifact-invalid", "artifact_invalid"],
    ] as const;
    for (const [resolverReason, snapshotReason] of cases) {
      let launches = 0;
      const supervisor = new RuntimeSupervisor({
        async resolve() {
          return { kind: "unavailable", reason: resolverReason };
        },
        async launch() {
          launches += 1;
          throw new Error("must not launch");
        },
      });
      expect(
        await supervisor.ensure("/bb-data/plugins/mate/runtime"),
      ).toMatchObject({
        runtimeState: "unavailable",
        reason: snapshotReason,
        canStart: false,
      });
      expect(launches).toBe(0);
    }
  });

  test("redacts a rejecting resolver and releases concurrent demand, service, and stop", async () => {
    let rejectResolve!: (error: Error) => void;
    const resolution = new Promise<RuntimeArtifactResolution>(
      (_resolve, reject) => {
        rejectResolve = reject;
      },
    );
    let resolves = 0;
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        resolves += 1;
        return resolution;
      },
      async launch() {
        throw new Error("must not launch");
      },
    });
    const controller = new AbortController();
    const service = supervisor.runService(controller.signal);
    const serviceSettled = service.then(
      () => new Error("service unexpectedly resolved"),
      (error: unknown) => error,
    );
    const first = supervisor.ensure("/bb-data/plugins/mate/runtime");
    const second = supervisor.ensure("/bb-data/plugins/mate/runtime");
    const stopping = supervisor.stop();
    rejectResolve(new Error("private resolver detail"));

    await expect(first).resolves.toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      canStart: true,
    });
    await expect(second).resolves.toMatchObject({ runtimeState: "failed" });
    expect(await serviceSettled).toMatchObject({
      message: "Packaged runtime stopped.",
    });
    await expect(stopping).resolves.toBeUndefined();
    expect(resolves).toBe(1);
    expect(supervisor.status()).toMatchObject({ runtimeState: "failed" });
  });

  test("turns launch failure and unexpected exit into retryable failure", async () => {
    let attempts = 0;
    const owned = controlledRuntime();
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        return available;
      },
      async launch() {
        attempts += 1;
        if (attempts === 1) throw new Error("private launch detail");
        return owned.runtime;
      },
    });

    expect(
      await supervisor.ensure("/bb-data/plugins/mate/runtime"),
    ).toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      canStart: true,
    });
    expect(
      await supervisor.ensure("/bb-data/plugins/mate/runtime"),
    ).toMatchObject({ runtimeState: "ready" });
    owned.close();
    await owned.runtime.closed;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(supervisor.status()).toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      canStart: true,
    });
  });

  test("never returns ready when an immediately closed runtime is already failed", async () => {
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        return available;
      },
      async launch() {
        return {
          identity: {
            runtimeVersion: available.runtimeVersion,
            apiVersion: 2,
            instanceId: "i".repeat(32),
          },
          targets: {
            async list() {
              return { schemaVersion: 1, state: "ready", targets: [] };
            },
            async admitProjects(input) {
              return {
                schemaVersion: 2,
                state: "ready",
                projects: input.projects.map(({ projectKey }) => ({
                  projectKey,
                  state: "ready" as const,
                  targets: [],
                })),
              };
            },
            dispose() {},
          },
          closed: Promise.resolve(),
          async stop() {},
        };
      },
    });

    const returned = await supervisor.ensure("/bb-data/plugins/mate/runtime");
    expect(returned).toMatchObject({
      runtimeState: "failed",
      reason: "startup_failed",
      canStart: true,
    });
    expect(returned).toBe(supervisor.status());
  });

  test("retains demand and relaunches when bb restarts the service after a crash", async () => {
    const first = controlledRuntime();
    const second = controlledRuntime();
    let launches = 0;
    const supervisor = new RuntimeSupervisor({
      async resolve() {
        return available;
      },
      async launch() {
        launches += 1;
        return launches === 1 ? first.runtime : second.runtime;
      },
    });
    const controller = new AbortController();
    const firstService = supervisor.runService(controller.signal);
    await supervisor.ensure("/bb-data/plugins/mate/runtime");
    first.close();
    await expect(firstService).rejects.toThrow("Packaged runtime stopped.");

    const restartedService = supervisor.runService(controller.signal);
    while (launches !== 2) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(supervisor.status().runtimeState).toBe("ready");
    controller.abort();
    await restartedService;
    expect(second.stops()).toBe(1);
  });
});
