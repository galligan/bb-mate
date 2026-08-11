import {
  spawn as spawnChildProcess,
  type ChildProcess,
} from "node:child_process";
import type { Readable, Writable } from "node:stream";

export interface StandaloneRuntimeDescriptor {
  schemaVersion: 1;
  protocol: "bb-mate-runtime";
  runtimeVersion: string;
  apiVersion: 1;
  pid: number;
  instanceId: string;
  baseUrl: string;
  capabilities: unknown;
}

export interface SupervisedRuntime {
  child: ChildProcess;
  descriptor: Promise<Record<string, unknown>>;
  stdout: () => string;
  stderr: () => string;
  supervisor: Writable;
  token: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const expectedCapabilityKeys = [
  "annotations",
  "artifacts",
  "browserBootstrap",
  "captures",
  "comparisons",
  "events",
  "mcp",
  "pluginBriefs",
  "reviews",
  "sessions",
  "targets",
] as const;

function hasExpectedCapabilities(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const capabilities = value as Record<string, unknown>;
  return (
    JSON.stringify(Object.keys(capabilities).sort()) ===
      JSON.stringify([...expectedCapabilityKeys]) &&
    expectedCapabilityKeys.every((key) => capabilities[key] === false)
  );
}

export async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requireReadable(value: Readable | null, name: string): Readable {
  assert(value, `Supervised runtime ${name} was not piped.`);
  return value;
}

export function spawnSupervisedRuntime(options: {
  executable: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runtimeVersion: string;
  parentPid?: number;
}): SupervisedRuntime {
  const child = spawnChildProcess(
    options.executable,
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
    {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  const stdoutStream = requireReadable(child.stdout, "stdout");
  const stderrStream = requireReadable(child.stderr, "stderr");
  const supervisor = child.stdio[3];
  assert(supervisor && "write" in supervisor, "Supervisor FD3 was not piped.");

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let descriptorBytes = 0;
  let descriptorText = "";
  let settled = false;
  const descriptor = new Promise<Record<string, unknown>>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (!settled) {
        reject(
          new Error(
            `Supervised runtime exited before its descriptor: ${code ?? signal}.`,
          ),
        );
      }
    });
    stdoutStream.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      if (settled) return;
      descriptorBytes += chunk.byteLength;
      if (descriptorBytes > 8 * 1024) {
        settled = true;
        reject(new Error("Supervised runtime descriptor exceeded 8 KiB."));
        return;
      }
      descriptorText += chunk.toString("utf8");
      const newline = descriptorText.indexOf("\n");
      if (newline === -1) return;
      settled = true;
      const line = descriptorText.slice(0, newline);
      try {
        resolve(JSON.parse(line) as Record<string, unknown>);
      } catch (error) {
        reject(
          new AggregateError(
            [error],
            "Supervised runtime descriptor was not JSON.",
          ),
        );
      }
    });
  });
  stderrStream.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const token = "A".repeat(43);
  supervisor.write(
    `${JSON.stringify({
      schemaVersion: 1,
      expectedRuntimeVersion: options.runtimeVersion,
      expectedApiVersion: 1,
      token,
      principalId: "p".repeat(32),
      bbContextId: "b".repeat(32),
    })}\n`,
  );

  return {
    child,
    descriptor,
    stdout: () => Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: () => Buffer.concat(stderrChunks).toString("utf8"),
    supervisor,
    token,
  };
}

export function validateStandaloneDescriptor(
  descriptor: Record<string, unknown>,
  options: { runtimeVersion: string; pid?: number },
): StandaloneRuntimeDescriptor {
  const expectedKeys = [
    "apiVersion",
    "baseUrl",
    "capabilities",
    "instanceId",
    "pid",
    "protocol",
    "runtimeVersion",
    "schemaVersion",
  ].sort();
  assert(
    JSON.stringify(Object.keys(descriptor).sort()) ===
      JSON.stringify(expectedKeys),
    "Supervised descriptor fields differ from the V1 allowlist.",
  );
  assert(
    descriptor.schemaVersion === 1 &&
      descriptor.protocol === "bb-mate-runtime" &&
      descriptor.runtimeVersion === options.runtimeVersion &&
      descriptor.apiVersion === 1 &&
      (options.pid === undefined || descriptor.pid === options.pid) &&
      Number.isSafeInteger(descriptor.pid) &&
      (descriptor.pid as number) > 0 &&
      typeof descriptor.instanceId === "string" &&
      /^[A-Za-z0-9_-]{32}$/u.test(descriptor.instanceId) &&
      typeof descriptor.baseUrl === "string" &&
      /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(descriptor.baseUrl) &&
      Number(
        descriptor.baseUrl.slice(descriptor.baseUrl.lastIndexOf(":") + 1),
      ) <= 65_535 &&
      hasExpectedCapabilities(descriptor.capabilities),
    "Supervised descriptor identity is invalid.",
  );
  return descriptor as unknown as StandaloneRuntimeDescriptor;
}

export function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => resolve());
  });
}

export async function assertListenerUnavailable(
  baseUrl: string,
): Promise<void> {
  await fetch(`${baseUrl}/healthz`, {
    signal: AbortSignal.timeout(1_000),
  }).then(
    () => {
      throw new Error("Standalone listener remained reachable after shutdown.");
    },
    () => undefined,
  );
}
