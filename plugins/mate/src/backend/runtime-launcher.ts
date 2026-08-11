import { randomBytes as nodeRandomBytes } from "node:crypto";
import {
  spawn as spawnChildProcess,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import { request as requestHttp } from "node:http";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import {
  parseRuntimeLaunchDescriptor,
  RUNTIME_API_VERSION,
  RUNTIME_CAPABILITIES,
  RUNTIME_DESCRIPTOR_MAX_BYTES,
  RuntimeCapabilityDocumentSchema,
  type RuntimeCapabilityDocument,
} from "@bb-mate/runtime/supervision";
import {
  attestPackagedRuntime,
  type RuntimeArtifactResolution,
} from "./runtime-resolver.ts";

type AvailableRuntimeArtifact = Extract<
  RuntimeArtifactResolution,
  { kind: "available" }
>;

export interface OwnedRuntimeIdentity {
  readonly runtimeVersion: string;
  readonly apiVersion: 1;
  readonly instanceId: string;
}

export interface OwnedRuntime {
  readonly identity: OwnedRuntimeIdentity;
  readonly closed: Promise<void>;
  stop(): Promise<void>;
}

export interface RuntimeCapabilityRequest {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs: number;
}

export interface RuntimeLauncherOptions {
  readonly parentPid?: number;
  readonly descriptorTimeoutMs?: number;
  readonly supervisorWriteTimeoutMs?: number;
  readonly handshakeTimeoutMs?: number;
  readonly gracefulStopMs?: number;
  readonly forceStopMs?: number;
  readonly randomBytes?: (size: number) => Buffer;
  readonly spawn?: typeof spawnChildProcess;
  readonly requestCapabilities?: (
    request: RuntimeCapabilityRequest,
  ) => Promise<RuntimeCapabilityDocument>;
  readonly killGroup?: (pid: number, signal: NodeJS.Signals) => void;
  readonly groupExists?: (pid: number) => boolean;
  readonly attest?: (artifact: AvailableRuntimeArtifact) => Promise<boolean>;
}

function watchSupervisorChannel(supervisor: Writable) {
  let stopping = false;
  let rejectFailure!: (error: Error) => void;
  const failed = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  void failed.catch(() => undefined);
  const onError = () =>
    rejectFailure(new Error("Packaged runtime supervisor channel failed."));
  const onClose = () => {
    if (!stopping) {
      rejectFailure(new Error("Packaged runtime supervisor channel closed."));
    }
  };
  supervisor.on("error", onError);
  supervisor.on("close", onClose);
  return {
    failed,
    markStopping() {
      stopping = true;
    },
    dispose() {
      supervisor.off("error", onError);
      supervisor.off("close", onClose);
    },
  };
}

async function writeSupervisorFrame(
  supervisor: Writable,
  frame: string,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error("Packaged runtime supervisor frame timed out.")),
      timeoutMs,
    );
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    try {
      supervisor.write(frame, (error) => finish(error));
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Frame write failed."));
    }
  });
}

export class RuntimeLaunchError extends Error {
  constructor(
    readonly kind:
      "artifact_invalid" | "runtime_incompatible" | "startup_failed",
    options?: ErrorOptions,
  ) {
    super("Packaged runtime launch failed.", options);
    this.name = "RuntimeLaunchError";
  }
}

function requiredStream<T>(value: T | null | undefined): T {
  if (!value) throw new Error("Packaged runtime pipe unavailable.");
  return value;
}

function observeClose(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const onError = () => undefined;
    child.on("error", onError);
    child.once("close", () => {
      child.off("error", onError);
      resolve();
    });
  });
}

async function settlesWithin(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => true,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readDescriptor(
  stdout: Readable,
  child: ChildProcess,
  timeoutMs: number,
) {
  return new Promise<ReturnType<typeof parseRuntimeLaunchDescriptor>>(
    (resolve, reject) => {
      let bytes = Buffer.alloc(0);
      const timer = setTimeout(
        () => finish(new Error("Packaged runtime descriptor timed out.")),
        timeoutMs,
      );
      const cleanup = () => {
        clearTimeout(timer);
        stdout.off("data", onData);
        child.off("error", onError);
        child.off("close", onClose);
      };
      const finish = (error?: Error, value?: Buffer) => {
        cleanup();
        if (error) reject(error);
        else {
          try {
            resolve(parseRuntimeLaunchDescriptor(value as Buffer));
          } catch (cause) {
            reject(new RuntimeLaunchError("runtime_incompatible", { cause }));
          }
        }
      };
      const onError = () =>
        finish(new Error("Packaged runtime failed to start."));
      const onClose = () =>
        finish(new Error("Packaged runtime closed before its descriptor."));
      const onData = (value: Buffer | string) => {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        bytes = Buffer.concat([bytes, chunk]);
        if (bytes.byteLength > RUNTIME_DESCRIPTOR_MAX_BYTES) {
          finish(new RuntimeLaunchError("runtime_incompatible"));
          return;
        }
        const newline = bytes.indexOf(0x0a);
        if (newline === -1) return;
        stdout.pause();
        if (newline !== bytes.byteLength - 1) {
          finish(new RuntimeLaunchError("runtime_incompatible"));
          return;
        }
        finish(undefined, bytes);
      };
      stdout.on("data", onData);
      child.once("error", onError);
      child.once("close", onClose);
    },
  );
}

async function requestCapabilities(
  request: RuntimeCapabilityRequest,
): Promise<RuntimeCapabilityDocument> {
  return new Promise((resolve, reject) => {
    const client = requestHttp(
      `${request.baseUrl}/v1/capabilities`,
      {
        agent: false,
        headers: { authorization: `Bearer ${request.token}` },
        method: "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (value: Buffer | string) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          bytes += chunk.byteLength;
          if (bytes > 64 * 1024) {
            response.destroy(
              new Error("Packaged runtime capability response was too large."),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () => {
          if (
            response.statusCode !== 200 ||
            response.headers["content-type"] !==
              "application/json;charset=utf-8"
          ) {
            reject(new RuntimeLaunchError("runtime_incompatible"));
            return;
          }
          try {
            resolve(
              RuntimeCapabilityDocumentSchema.parse(
                JSON.parse(Buffer.concat(chunks).toString("utf8")),
              ),
            );
          } catch (cause) {
            reject(new RuntimeLaunchError("runtime_incompatible", { cause }));
          }
        });
      },
    );
    client.setTimeout(request.timeoutMs, () => {
      client.destroy(
        new Error("Packaged runtime capability handshake timed out."),
      );
    });
    client.once("error", reject);
    client.end();
  });
}

function defaultKillGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ESRCH"
    ) {
      throw error;
    }
  }
}

function defaultGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return false;
    }
    return true;
  }
}

async function waitForGroupExit(
  pid: number,
  timeoutMs: number,
  groupExists: (pid: number) => boolean,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    if (!groupExists(pid)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  return !groupExists(pid);
}

export async function launchPackagedRuntime(
  artifact: AvailableRuntimeArtifact,
  options: RuntimeLauncherOptions = {},
): Promise<OwnedRuntime> {
  if (artifact.apiVersion !== RUNTIME_API_VERSION) {
    throw new RuntimeLaunchError("runtime_incompatible");
  }
  // This is the final package-stamp tripwire before spawn. It deliberately
  // does not claim atomicity against the same user replacing both trusted
  // plugin code and its executable after this closed-FD check.
  if (!(await (options.attest ?? attestPackagedRuntime)(artifact))) {
    throw new RuntimeLaunchError("artifact_invalid");
  }
  const spawn = options.spawn ?? spawnChildProcess;
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString("base64url");
  const principalId = randomBytes(24).toString("base64url");
  const bbContextId = randomBytes(24).toString("base64url");
  const spawnOptions: SpawnOptions = {
    cwd: path.dirname(artifact.executablePath),
    detached: true,
    env: {},
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe"],
  };
  let child: ChildProcess | undefined;
  let stop: (() => Promise<void>) | undefined;
  let channel: ReturnType<typeof watchSupervisorChannel> | undefined;
  try {
    child = spawn(
      artifact.executablePath,
      [
        "serve",
        "--port",
        "0",
        "--json",
        "--parent-pid",
        String(options.parentPid ?? process.pid),
        "--supervisor-fd",
        "3",
      ],
      spawnOptions,
    );
    if (!child.pid || child.pid < 1) {
      throw new Error("Packaged runtime PID unavailable.");
    }
    const stdout = requiredStream(child.stdout);
    const stderr = requiredStream(child.stderr);
    const supervisor = requiredStream(child.stdio[3]) as Writable;
    channel = watchSupervisorChannel(supervisor);
    stderr.on("data", () => undefined);
    const leaderClosed = observeClose(child);
    const killGroup = options.killGroup ?? defaultKillGroup;
    const groupExists = options.groupExists ?? defaultGroupExists;
    const closed = leaderClosed.then(async () => {
      if (!groupExists(child!.pid!)) return;
      killGroup(child!.pid!, "SIGTERM");
      if (
        await waitForGroupExit(
          child!.pid!,
          options.gracefulStopMs ?? 2_000,
          groupExists,
        )
      ) {
        return;
      }
      killGroup(child!.pid!, "SIGKILL");
      if (
        !(await waitForGroupExit(
          child!.pid!,
          options.forceStopMs ?? 1_000,
          groupExists,
        ))
      ) {
        throw new Error("Packaged runtime process group did not stop.");
      }
    });
    let stopPromise: Promise<void> | undefined;
    stop = () => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        channel?.markStopping();
        supervisor.end();
        if (
          await settlesWithin(leaderClosed, options.gracefulStopMs ?? 2_000)
        ) {
          await closed;
          return;
        }
        killGroup(child!.pid!, "SIGTERM");
        if (await settlesWithin(leaderClosed, options.forceStopMs ?? 1_000)) {
          await closed;
          return;
        }
        killGroup(child!.pid!, "SIGKILL");
        if (
          !(await settlesWithin(leaderClosed, options.forceStopMs ?? 1_000))
        ) {
          throw new Error("Packaged runtime process group did not stop.");
        }
        await closed;
      })();
      return stopPromise;
    };

    await Promise.race([
      writeSupervisorFrame(
        supervisor,
        `${JSON.stringify({
          schemaVersion: 1,
          expectedRuntimeVersion: artifact.runtimeVersion,
          expectedApiVersion: artifact.apiVersion,
          token,
          principalId,
          bbContextId,
        })}\n`,
        options.supervisorWriteTimeoutMs ?? 2_000,
      ),
      channel.failed,
    ]);
    const descriptor = await Promise.race([
      readDescriptor(stdout, child, options.descriptorTimeoutMs ?? 10_000),
      channel.failed,
    ]);
    if (
      descriptor.pid !== child.pid ||
      descriptor.runtimeVersion !== artifact.runtimeVersion ||
      descriptor.apiVersion !== artifact.apiVersion ||
      !isDeepStrictEqual(descriptor.capabilities, RUNTIME_CAPABILITIES)
    ) {
      throw new RuntimeLaunchError("runtime_incompatible");
    }

    let unexpectedStdout = false;
    stdout.on("data", () => {
      unexpectedStdout = true;
      void stop?.();
    });
    stdout.resume();
    const capabilityDocument = await Promise.race([
      (options.requestCapabilities ?? requestCapabilities)({
        baseUrl: descriptor.baseUrl,
        token,
        timeoutMs: options.handshakeTimeoutMs ?? 2_000,
      }),
      channel.failed,
    ]);
    if (
      unexpectedStdout ||
      capabilityDocument.runtimeVersion !== descriptor.runtimeVersion ||
      capabilityDocument.apiVersion !== descriptor.apiVersion ||
      capabilityDocument.instanceId !== descriptor.instanceId ||
      !isDeepStrictEqual(
        capabilityDocument.capabilities,
        descriptor.capabilities,
      )
    ) {
      throw new RuntimeLaunchError("runtime_incompatible");
    }

    void channel.failed.catch(() => {
      void stop?.().catch(() => undefined);
    });
    void closed.then(
      () => channel?.dispose(),
      () => channel?.dispose(),
    );
    return {
      identity: {
        runtimeVersion: descriptor.runtimeVersion,
        apiVersion: descriptor.apiVersion,
        instanceId: descriptor.instanceId,
      },
      closed,
      stop,
    };
  } catch (cause) {
    let cleanupCause: unknown;
    try {
      await stop?.();
    } catch (error) {
      cleanupCause = error;
    }
    channel?.dispose();
    if (cause instanceof RuntimeLaunchError && cleanupCause === undefined) {
      throw cause;
    }
    throw new RuntimeLaunchError("startup_failed", {
      cause:
        cleanupCause === undefined
          ? cause
          : new AggregateError(
              [cause, cleanupCause],
              "Runtime cleanup failed.",
            ),
    });
  } finally {
    tokenBytes.fill(0);
  }
}
