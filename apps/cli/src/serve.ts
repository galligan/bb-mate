import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  createOpaqueId,
  createRequestContext,
  createRuntimeHttpHandler,
  type OpaqueId,
  type RuntimeIdentity,
} from "@bb-mate/runtime";
import {
  parseSupervisorFrame,
  RUNTIME_API_VERSION,
  RUNTIME_CAPABILITIES,
  serializeRuntimeLaunchDescriptor,
  SUPERVISOR_FRAME_MAX_BYTES,
  type SupervisorFrame,
} from "@bb-mate/runtime/supervision";
import type { ProcessExit } from "./commands.ts";
import {
  readSupervisorChannel,
  type SupervisorChannel,
} from "./supervisor-channel.ts";
import { listenRuntimeHttp } from "./runtime-http-listener.ts";
import {
  openRuntimeTargetResources,
  type RuntimeTargetResources,
} from "./runtime-target-resources.ts";

interface RuntimeServer {
  readonly port: number;
  stop(): void | Promise<void>;
}

export interface SupervisedServePlatform {
  readonly pid: number;
  createInstanceId(): OpaqueId;
  openChannel(fd: number): Promise<SupervisorChannel<SupervisorFrame>>;
  isParentAlive(pid: number): boolean;
  waitForParentExit(pid: number, signal: AbortSignal): Promise<void>;
  waitForSignal(signal: AbortSignal): Promise<NodeJS.Signals>;
  listen(
    fetch: (request: Request) => Promise<Response>,
  ): RuntimeServer | Promise<RuntimeServer>;
  openTargetResources(dataRoot: string): Promise<RuntimeTargetResources>;
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface SupervisedServeOptions {
  readonly port: 0;
  readonly parentPid: number;
  readonly supervisorFd: number;
}

function tokenMatches(request: Request, expected: Buffer): boolean {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{43})$/u);
  if (!match?.[1]) return false;
  const received = Buffer.from(match[1], "base64url");
  try {
    return (
      received.byteLength === expected.byteLength &&
      received.toString("base64url") === match[1] &&
      timingSafeEqual(received, expected)
    );
  } finally {
    received.fill(0);
  }
}

function authenticatedContext(
  identity: RuntimeIdentity,
  token: Buffer,
  request: Request,
) {
  if (!tokenMatches(request, token)) return undefined;
  return createRequestContext({
    id: identity.principalId,
    kind: "supervisor",
    scopes: ["runtime:read", "targets:read", "targets:write"],
    revoked: false,
    bbContextId: identity.bbContextId,
  });
}

function productionPlatform(): SupervisedServePlatform {
  return {
    pid: process.pid,
    createInstanceId: createOpaqueId,
    openChannel: (fd) =>
      readSupervisorChannel(
        createReadStream("", { fd, autoClose: true }),
        parseSupervisorFrame,
        { maxBytes: SUPERVISOR_FRAME_MAX_BYTES },
      ),
    isParentAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EPERM"
        );
      }
    },
    waitForParentExit: (pid, signal) =>
      new Promise((resolve) => {
        const poll = () => {
          try {
            process.kill(pid, 0);
          } catch (error) {
            if (!(
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "EPERM"
            )) {
              finish();
            }
          }
        };
        const timer = setInterval(poll, 250);
        const finish = () => {
          clearInterval(timer);
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          clearInterval(timer);
          resolve();
        };
        signal.addEventListener("abort", cancel, { once: true });
        poll();
      }),
    waitForSignal: (signal) =>
      new Promise((resolve) => {
        const finish = (received: NodeJS.Signals) => {
          cleanup();
          resolve(received);
        };
        const onInterrupt = () => finish("SIGINT");
        const onTerminate = () => finish("SIGTERM");
        const cleanup = () => {
          process.off("SIGINT", onInterrupt);
          process.off("SIGTERM", onTerminate);
          signal.removeEventListener("abort", cleanup);
        };
        process.once("SIGINT", onInterrupt);
        process.once("SIGTERM", onTerminate);
        signal.addEventListener("abort", cleanup, { once: true });
      }),
    listen: listenRuntimeHttp,
    openTargetResources: openRuntimeTargetResources,
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}

export async function runSupervisedServe(
  options: SupervisedServeOptions,
  runtime: {
    readonly runtimeVersion: string;
    readonly platform?: SupervisedServePlatform;
  },
): Promise<ProcessExit> {
  const platform = runtime.platform ?? productionPlatform();
  if (!platform.isParentAlive(options.parentPid)) {
    platform.stderr("Supervised runtime parent is unavailable.\n");
    return { exitCode: 1, signal: null };
  }

  let server: RuntimeServer | undefined;
  let expectedToken: Buffer | undefined;
  let targetResources: RuntimeTargetResources | undefined;
  const inFlight = new Set<Promise<Response>>();
  const lifecycle = new AbortController();
  try {
    const channel = await platform.openChannel(options.supervisorFd);
    if (
      channel.frame.expectedRuntimeVersion !== runtime.runtimeVersion ||
      channel.frame.expectedApiVersion !== RUNTIME_API_VERSION
    ) {
      platform.stderr("Supervised runtime version is incompatible.\n");
      return { exitCode: 1, signal: null };
    }

    const instanceId = platform.createInstanceId();
    const token = Buffer.from(channel.frame.token, "base64url");
    expectedToken = token;
    targetResources = await platform.openTargetResources(
      channel.frame.dataRoot,
    );
    let handler: ((request: Request) => Promise<Response>) | undefined;
    server = await platform.listen((request) => {
      const pending = handler
        ? handler(request)
        : Promise.resolve(new Response(null, { status: 503 }));
      inFlight.add(pending);
      pending.then(
        () => inFlight.delete(pending),
        () => inFlight.delete(pending),
      );
      return pending;
    });
    handler = createRuntimeHttpHandler({
      port: server.port,
      identity: {
        runtimeVersion: runtime.runtimeVersion,
        instanceId,
        capabilities: RUNTIME_CAPABILITIES,
      },
      authenticate: async (request) =>
        authenticatedContext(targetResources!.identity, token, request),
      targets: targetResources.controller,
    });

    platform.stdout(
      serializeRuntimeLaunchDescriptor({
        schemaVersion: 2,
        protocol: "bb-mate-runtime",
        runtimeVersion: runtime.runtimeVersion,
        apiVersion: RUNTIME_API_VERSION,
        pid: platform.pid,
        instanceId,
        baseUrl: `http://127.0.0.1:${server.port}`,
        capabilities: RUNTIME_CAPABILITIES,
      }),
    );

    const outcome = await Promise.race([
      channel.closed.then(
        () => ({ kind: "channel" as const }),
        (error: unknown) => ({ kind: "failure" as const, error }),
      ),
      platform
        .waitForParentExit(options.parentPid, lifecycle.signal)
        .then(() => ({ kind: "parent" as const })),
      platform
        .waitForSignal(lifecycle.signal)
        .then((signal) => ({ kind: "signal" as const, signal })),
    ]);

    if (outcome.kind === "signal") {
      return { exitCode: null, signal: outcome.signal };
    }
    if (outcome.kind === "channel") {
      return { exitCode: 0, signal: null };
    }
    platform.stderr("Supervised runtime stopped unexpectedly.\n");
    return { exitCode: 1, signal: null };
  } catch {
    platform.stderr("Supervised runtime could not start.\n");
    return { exitCode: 1, signal: null };
  } finally {
    lifecycle.abort();
    expectedToken?.fill(0);
    let listenerError: unknown;
    try {
      await server?.stop();
    } catch (error) {
      listenerError = error;
    }
    await Promise.allSettled([...inFlight]);
    targetResources?.close();
    if (listenerError !== undefined) throw listenerError;
  }
}
