import {
  assertListenerUnavailable,
  spawnSupervisedRuntime,
  type SupervisedRuntime,
  validateStandaloneDescriptor,
  waitForChildExit,
  within,
} from "./supervised-standalone.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
  let monitoredParent: ReturnType<typeof Bun.spawn> | null = null;
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
    const health = await fetch(`${descriptor.baseUrl}/healthz`);
    assert(health.ok, "Supervised runtime health check failed.");
    const unauthorized = await fetch(`${descriptor.baseUrl}/v1/capabilities`);
    assert(
      unauthorized.status === 401,
      "Supervised runtime capabilities were available without authentication.",
    );
    const capabilitiesResponse = await fetch(
      `${descriptor.baseUrl}/v1/capabilities`,
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

    runtime.supervisor.end();
    await within(
      waitForChildExit(runtime.child),
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

    monitoredParent = Bun.spawn(["/bin/sleep", "30"], {
      cwd: options.temporaryRoot,
      env: options.env,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    runtime = spawnSupervisedRuntime({
      ...options,
      parentPid: monitoredParent.pid,
    });
    const orphanDescriptor = validateStandaloneDescriptor(
      await within(
        runtime.descriptor,
        10_000,
        "Orphan-cleanup runtime did not emit its descriptor.",
      ),
      { runtimeVersion: options.runtimeVersion, pid: runtime.child.pid },
    );
    const orphanHealth = await fetch(`${orphanDescriptor.baseUrl}/healthz`);
    assert(orphanHealth.ok, "Orphan-cleanup runtime did not become healthy.");
    monitoredParent.kill("SIGKILL");
    await monitoredParent.exited;
    monitoredParent = null;
    await within(
      waitForChildExit(runtime.child),
      5_000,
      "Supervised runtime survived its monitored parent's disappearance.",
    );
    await assertListenerUnavailable(orphanDescriptor.baseUrl);
    assertCleanOutput(
      runtime,
      orphanDescriptor,
      "Orphan-cleanup runtime emitted unexpected or secret output.",
    );
    runtime.supervisor.destroy();
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
    const signalHealth = await fetch(`${signalDescriptor.baseUrl}/healthz`);
    assert(signalHealth.ok, "Signal-cleanup runtime did not become healthy.");
    runtime.child.kill("SIGTERM");
    await within(
      waitForChildExit(runtime.child),
      5_000,
      "Supervised runtime did not stop after SIGTERM.",
    );
    await assertListenerUnavailable(signalDescriptor.baseUrl);
    assertCleanOutput(
      runtime,
      signalDescriptor,
      "Signal-cleanup runtime emitted unexpected or secret output.",
    );
    runtime.supervisor.destroy();
    runtime = null;
  } finally {
    if (runtime) {
      runtime.supervisor.destroy();
      runtime.child.kill("SIGKILL");
      await waitForChildExit(runtime.child).catch(() => undefined);
    }
    if (monitoredParent) {
      monitoredParent.kill("SIGKILL");
      await monitoredParent.exited.catch(() => undefined);
    }
  }
}
