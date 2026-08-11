import {
  spawn as spawnChildProcess,
  type ChildProcess,
} from "node:child_process";
import {
  assertListenerUnavailable,
  spawnSupervisedRuntime,
  type SupervisedRuntime,
  validateStandaloneDescriptor,
  waitForRuntimeHealth,
  within,
} from "./supervised-standalone.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertProcessAlive(pid: number, message: string): void {
  try {
    process.kill(pid, 0);
  } catch {
    throw new Error(message);
  }
}

function assertCleanOutput(
  runtime: SupervisedRuntime,
  descriptor: object,
  message: string,
): void {
  const stdout = runtime.stdout();
  assert(
    stdout === `${JSON.stringify(descriptor)}\n` &&
      !stdout.includes(runtime.token) &&
      !runtime.stderr().includes(runtime.token),
    message,
  );
}

export async function verifyStandaloneSupervision(options: {
  executable: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  runtimeVersion: string;
  temporaryRoot: string;
}): Promise<void> {
  let runtime: SupervisedRuntime | null = null;
  let monitoredParent: ChildProcess | null = null;
  let monitoredParentClosed: Promise<void> | null = null;
  try {
    runtime = spawnSupervisedRuntime(options);
    const descriptor = validateStandaloneDescriptor(
      await within(
        runtime.descriptor,
        10_000,
        "Moved standalone did not emit its supervised descriptor.",
      ),
      { runtimeVersion: options.runtimeVersion, pid: runtime.child.pid },
    );
    await waitForRuntimeHealth(descriptor.baseUrl, { runtime });
    const unauthorized = await fetch(`${descriptor.baseUrl}/v2/capabilities`);
    assert(
      unauthorized.status === 401,
      "Supervised runtime capabilities were available without authentication.",
    );
    const capabilitiesResponse = await fetch(
      `${descriptor.baseUrl}/v2/capabilities`,
      { headers: { authorization: `Bearer ${runtime.token}` } },
    );
    assert(
      capabilitiesResponse.ok,
      "Authenticated supervised capabilities handshake failed.",
    );
    const capabilities = (await capabilitiesResponse.json()) as Record<
      string,
      unknown
    >;
    assert(
      capabilities.schemaVersion === descriptor.schemaVersion &&
        capabilities.runtimeVersion === descriptor.runtimeVersion &&
        capabilities.apiVersion === descriptor.apiVersion &&
        capabilities.instanceId === descriptor.instanceId &&
        JSON.stringify(capabilities.capabilities) ===
          JSON.stringify(descriptor.capabilities),
      "Descriptor and authenticated capability identity differ.",
    );

    await within(
      runtime.supervisor.end(),
      5_000,
      "Supervised runtime FD3 writer did not close after EOF.",
    );
    await within(
      runtime.closed,
      5_000,
      "Supervised runtime did not exit when FD3 reached EOF.",
    );
    await assertListenerUnavailable(descriptor.baseUrl);
    assertCleanOutput(
      runtime,
      descriptor,
      "Supervised runtime stdout or stderr was not pure.",
    );
    runtime = null;

    monitoredParent = spawnChildProcess("/bin/cat", [], {
      cwd: options.temporaryRoot,
      env: options.env,
      stdio: ["pipe", "ignore", "ignore"],
    });
    monitoredParentClosed = new Promise<void>((resolve, reject) => {
      monitoredParent!.once("error", reject);
      monitoredParent!.once("close", () => resolve());
    });
    const monitoredParentPid = monitoredParent.pid;
    assert(
      monitoredParentPid !== undefined,
      "Orphan-cleanup sentinel did not receive a PID.",
    );
    assertProcessAlive(
      monitoredParentPid,
      "Orphan-cleanup sentinel exited before runtime launch.",
    );
    runtime = spawnSupervisedRuntime({
      ...options,
      parentPid: monitoredParentPid,
    });
    const orphanDescriptor = validateStandaloneDescriptor(
      await within(
        runtime.descriptor,
        10_000,
        "Orphan-cleanup runtime did not emit its descriptor.",
      ),
      { runtimeVersion: options.runtimeVersion, pid: runtime.child.pid },
    );
    assertProcessAlive(
      monitoredParentPid,
      "Orphan-cleanup sentinel exited before descriptor validation.",
    );
    await waitForRuntimeHealth(orphanDescriptor.baseUrl, {
      runtime,
      context: "Orphan-cleanup runtime",
    });
    assertProcessAlive(
      monitoredParentPid,
      "Orphan-cleanup sentinel exited before forced parent loss.",
    );
    monitoredParent.kill("SIGKILL");
    await monitoredParentClosed;
    monitoredParent = null;
    monitoredParentClosed = null;
    await within(
      runtime.closed,
      5_000,
      "Supervised runtime survived its monitored parent's disappearance.",
    );
    await assertListenerUnavailable(orphanDescriptor.baseUrl);
    assertCleanOutput(
      runtime,
      orphanDescriptor,
      "Orphan-cleanup runtime emitted unexpected or secret output.",
    );
    await within(
      runtime.supervisor.destroy(),
      5_000,
      "Orphan-cleanup FD3 writer did not close.",
    );
    runtime = null;

    runtime = spawnSupervisedRuntime(options);
    const signalDescriptor = validateStandaloneDescriptor(
      await within(
        runtime.descriptor,
        10_000,
        "Signal-cleanup runtime did not emit its descriptor.",
      ),
      { runtimeVersion: options.runtimeVersion, pid: runtime.child.pid },
    );
    await waitForRuntimeHealth(signalDescriptor.baseUrl, {
      runtime,
      context: "Signal-cleanup runtime",
    });
    runtime.child.kill("SIGTERM");
    await within(
      runtime.closed,
      5_000,
      "Supervised runtime did not stop after SIGTERM.",
    );
    await assertListenerUnavailable(signalDescriptor.baseUrl);
    assertCleanOutput(
      runtime,
      signalDescriptor,
      "Signal-cleanup runtime emitted unexpected or secret output.",
    );
    await within(
      runtime.supervisor.destroy(),
      5_000,
      "Signal-cleanup FD3 writer did not close.",
    );
    runtime = null;
  } finally {
    if (runtime) {
      await within(
        runtime.supervisor.destroy(),
        5_000,
        "Supervision cleanup FD3 writer did not close.",
      ).catch(() => undefined);
      runtime.child.kill("SIGKILL");
      await runtime.closed.catch(() => undefined);
    }
    if (monitoredParent) {
      monitoredParent.kill("SIGKILL");
      await monitoredParentClosed?.catch(() => undefined);
    }
  }
}
