import { promises as fs } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { inspectMatePackageDirectory } from "./inspect-mate-package.ts";
import {
  MATE_PACKAGE_NAME,
  MATE_PACKAGE_VERSION,
  startMatePackageRegistry,
} from "./mate-package-registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const child = Bun.spawn([executable, ...args], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert(
    exitCode === 0,
    `${path.basename(executable)} ${args.join(" ")} exited with ${exitCode}: ${stderr.trim()}`,
  );
  return stdout;
}

async function freePortPair(): Promise<readonly [number, number]> {
  const first = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const second = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("probe"),
  });
  const ports = [first.port, second.port] as const;
  first.stop(true);
  second.stop(true);
  assert(
    ports[0] !== undefined && ports[1] !== undefined && ports[0] !== ports[1],
    "Could not allocate distinct clean-room server ports.",
  );
  return ports as readonly [number, number];
}

async function waitForServer(
  baseUrl: string,
  closed: Promise<number>,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const outcome = await Promise.race([
      fetch(`${baseUrl}/health`)
        .then((response) => (response.ok ? "ready" : "retry"))
        .catch(() => "retry"),
      closed.then((code) => `closed:${code}`),
    ]);
    assert(
      !outcome.startsWith("closed:"),
      `Disposable bb server exited before readiness (${outcome}).`,
    );
    if (outcome === "ready") return;
    await Bun.sleep(50);
  }
  throw new Error("Disposable bb server did not become ready within 10s.");
}

interface RuntimeSnapshot {
  schemaVersion: 1;
  runtimeState:
    "idle" | "starting" | "ready" | "stopping" | "unavailable" | "failed";
  reason: string | null;
  runtimeVersion: string | null;
  apiVersion: 1 | null;
  canStart: boolean;
  browserLaunch: "unavailable";
  targets: "unavailable_pending_runtime_admission";
}

function assertFinitePublicValue(value: unknown, key = "root"): void {
  assert(
    !/(?:path|pid|baseurl|token|command|host)/iu.test(key),
    `Mate RPC leaked forbidden field ${key}.`,
  );
  if (typeof value === "number") {
    assert(Number.isFinite(value), "Mate RPC returned a non-finite number.");
  } else if (Array.isArray(value)) {
    value.forEach((item) => assertFinitePublicValue(item));
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      assertFinitePublicValue(child, childKey);
    }
  }
}

function assertSnapshot(value: unknown): asserts value is RuntimeSnapshot {
  assert(
    value && typeof value === "object",
    "Mate RPC snapshot is not an object.",
  );
  const snapshot = value as Record<string, unknown>;
  assert(
    JSON.stringify(Object.keys(snapshot).sort()) ===
      JSON.stringify([
        "apiVersion",
        "browserLaunch",
        "canStart",
        "reason",
        "runtimeState",
        "runtimeVersion",
        "schemaVersion",
        "targets",
      ]),
    "Mate RPC snapshot keys differ.",
  );
  assertFinitePublicValue(snapshot);
  const states = [
    "idle",
    "starting",
    "ready",
    "stopping",
    "unavailable",
    "failed",
  ];
  const reasons = [
    "unsupported_platform",
    "artifact_missing",
    "artifact_invalid",
    "runtime_incompatible",
    "startup_failed",
  ];
  const state = String(snapshot.runtimeState);
  const reason = snapshot.reason;
  const runtimeVersion = snapshot.runtimeVersion;
  const hasIdentity =
    typeof runtimeVersion === "string" &&
    runtimeVersion.length <= 64 &&
    /^[0-9A-Za-z][0-9A-Za-z._+-]*$/u.test(runtimeVersion) &&
    snapshot.apiVersion === 1;
  const coherent =
    (state === "ready" || state === "stopping") === hasIdentity &&
    (state === "idle"
      ? snapshot.canStart === true && reason === null
      : state === "unavailable"
        ? snapshot.canStart === false &&
          typeof reason === "string" &&
          reason !== "startup_failed"
        : state === "failed"
          ? snapshot.canStart === true && reason === "startup_failed"
          : snapshot.canStart === false && reason === null);
  assert(
    snapshot.schemaVersion === 1 &&
      states.includes(state) &&
      (reason === null || reasons.includes(String(reason))) &&
      (runtimeVersion === null || typeof runtimeVersion === "string") &&
      (snapshot.apiVersion === null || snapshot.apiVersion === 1) &&
      typeof snapshot.canStart === "boolean" &&
      snapshot.browserLaunch === "unavailable" &&
      snapshot.targets === "unavailable_pending_runtime_admission" &&
      coherent,
    "Mate RPC snapshot values are invalid.",
  );
}

async function rpc(
  serverUrl: string,
  method: "status" | "ensure",
  input: Record<string, unknown>,
): Promise<RuntimeSnapshot> {
  const response = await fetch(
    `${serverUrl}/api/v1/plugins/mate/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  assert(
    response.status === 200,
    `Mate RPC ${method} returned HTTP ${response.status}.`,
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert(
    JSON.stringify(Object.keys(body).sort()) ===
      JSON.stringify(["ok", "result"]) && body.ok === true,
    `Mate RPC ${method} returned an invalid envelope.`,
  );
  assertSnapshot(body.result);
  return body.result;
}

async function runtimeProcesses(executablePath: string): Promise<number[]> {
  const child = Bun.spawn(["/bin/ps", "-axo", "pid=,command="], {
    env: {},
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  assert(exitCode === 0, "Could not inspect clean-room runtime processes.");
  return stdout
    .split("\n")
    .filter((line) => line.includes(`${executablePath} serve`))
    .map((line) => Number.parseInt(line.trim().split(/\s+/u)[0]!, 10))
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

async function serverChildProcesses(processGroupId: number): Promise<number[]> {
  const child = Bun.spawn(["/bin/ps", "-axo", "pid=,pgid=,command="], {
    env: {},
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  assert(exitCode === 0, "Could not inspect disposable bb process group.");
  return stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/u))
    .filter(
      (parts) =>
        Number.parseInt(parts[1] ?? "", 10) === processGroupId &&
        parts.join(" ").includes("bb-app/server/dist/index.js"),
    )
    .map((parts) => Number.parseInt(parts[0]!, 10));
}

async function runtimeListenerPort(pid: number): Promise<number> {
  const child = Bun.spawn(
    [
      "/usr/sbin/lsof",
      "-Pan",
      "-p",
      String(pid),
      "-iTCP",
      "-sTCP:LISTEN",
      "-Fn",
    ],
    { env: {}, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  assert(exitCode === 0, `Could not inspect runtime listener for PID ${pid}.`);
  const ports = stdout
    .split("\n")
    .filter((line) => line.startsWith("n127.0.0.1:"))
    .map((line) => Number.parseInt(line.slice(line.lastIndexOf(":") + 1), 10))
    .filter((port) => Number.isSafeInteger(port) && port > 0 && port <= 65_535);
  assert(
    ports.length === 1,
    `Runtime PID ${pid} does not own one loopback listener.`,
  );
  return ports[0]!;
}

async function assertPortClosed(port: number): Promise<void> {
  const connected = await new Promise<boolean>((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(true);
    }, 1_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  assert(!connected, `Runtime listener port ${port} remains reachable.`);
}

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  label: string,
): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await Bun.sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

export async function verifyManagedMatePackage(args: {
  artifactPath: string;
  integrity: string;
  shasum: string;
  temporaryRoot: string;
  hostileCwd: string;
  env: NodeJS.ProcessEnv;
  bbExecutable: string;
  bbAppExecutable: string;
  canonicalStandaloneRoot: string;
}): Promise<void> {
  const registry = startMatePackageRegistry({
    artifactPath: args.artifactPath,
    integrity: args.integrity,
    shasum: args.shasum,
  });
  const [serverPort, hostDaemonPort] = await freePortPair();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const dataDir = path.join(args.temporaryRoot, "managed-bb-data");
  await fs.mkdir(dataDir, { recursive: true });
  const env = {
    ...args.env,
    BB_DATA_DIR: dataDir,
    BB_SERVER_URL: serverUrl,
    npm_config_registry: registry.baseUrl,
  };
  const serverCommand: string[] = [
    args.bbAppExecutable,
    "--data-dir",
    dataDir,
    "--server-bind-host",
    "127.0.0.1",
    "--server-port",
    String(serverPort),
    "--host-daemon-port",
    String(hostDaemonPort),
  ];
  const serverOptions = {
    cwd: args.hostileCwd,
    detached: true,
    env,
    stdin: "ignore" as const,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  };
  const server = Bun.spawn(serverCommand, {
    ...serverOptions,
  });
  const stdout = new Response(server.stdout).text();
  const stderr = new Response(server.stderr).text();
  try {
    await waitForServer(serverUrl, server.exited);
    const installOutput = await run(
      args.bbExecutable,
      [
        "plugin",
        "install",
        `npm:${MATE_PACKAGE_NAME}@${MATE_PACKAGE_VERSION}`,
        "--yes",
        "--json",
      ],
      args.hostileCwd,
      env,
    );
    const installed = JSON.parse(installOutput) as {
      ok?: unknown;
      plugin?: { id?: unknown; version?: unknown; source?: unknown };
    };
    assert(
      installed.ok === true &&
        installed.plugin?.id === "mate" &&
        installed.plugin.version === MATE_PACKAGE_VERSION &&
        installed.plugin.source ===
          `npm:${MATE_PACKAGE_NAME}@${MATE_PACKAGE_VERSION}`,
      "Disposable bb did not report the exact managed-npm Mate install.",
    );
    const installedPackageRoot = path.join(
      dataDir,
      "plugins",
      "cache",
      "npm",
      MATE_PACKAGE_NAME,
      MATE_PACKAGE_VERSION,
      "node_modules",
      MATE_PACKAGE_NAME,
    );
    await inspectMatePackageDirectory(
      installedPackageRoot,
      args.canonicalStandaloneRoot,
    );
    const machineId = await waitFor(async () => {
      const output = await run(
        args.bbExecutable,
        ["machine", "list", "--json"],
        args.hostileCwd,
        env,
      ).catch(() => undefined);
      if (output === undefined) return undefined;
      const machines = JSON.parse(output) as Array<{
        id?: unknown;
        status?: unknown;
      }>;
      const connected = machines.find(
        (machine) =>
          machine.status === "connected" && typeof machine.id === "string",
      );
      return connected?.id as string | undefined;
    }, "disposable host enrollment");
    const projectOutput = await run(
      args.bbExecutable,
      [
        "project",
        "create",
        "--name",
        "Mate clean room",
        "--root",
        args.hostileCwd,
        "--machine",
        machineId,
        "--json",
      ],
      args.hostileCwd,
      env,
    );
    const project = JSON.parse(projectOutput) as { id?: unknown };
    assert(
      typeof project.id === "string",
      "Disposable bb did not create a project.",
    );
    const idle = await rpc(serverUrl, "status", {});
    assert(
      idle.runtimeState === "idle" &&
        idle.runtimeVersion === null &&
        idle.apiVersion === null &&
        idle.canStart,
      "Mate runtime was not idle before demand.",
    );
    assert(
      (
        await runtimeProcesses(
          path.join(installedPackageRoot, "runtime", "darwin-arm64", "bb-mate"),
        )
      ).length === 0,
      "Mate runtime started before demand.",
    );
    const ensured = await Promise.all(
      Array.from({ length: 100 }, () => rpc(serverUrl, "ensure", {})),
    );
    assert(
      ensured.every(
        (snapshot) => JSON.stringify(snapshot) === JSON.stringify(ensured[0]),
      ) &&
        ensured[0]?.runtimeState === "ready" &&
        ensured[0].runtimeVersion !== null &&
        ensured[0].apiVersion === 1,
      "Concurrent Mate ensure calls did not converge on one ready snapshot.",
    );
    const runtimeExecutable = path.join(
      installedPackageRoot,
      "runtime",
      "darwin-arm64",
      "bb-mate",
    );
    const firstRuntimePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "one Mate runtime child");
    const firstRuntimePort = await runtimeListenerPort(firstRuntimePid);
    process.kill(-firstRuntimePid, "SIGKILL");
    const restartedRuntimePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      const status = await rpc(serverUrl, "status", {});
      return processes.length === 1 &&
        processes[0] !== firstRuntimePid &&
        status.runtimeState === "ready"
        ? processes[0]
        : undefined;
    }, "one restarted Mate runtime child");
    assert(
      restartedRuntimePid !== firstRuntimePid,
      "Mate runtime did not restart after crash.",
    );
    await assertPortClosed(firstRuntimePort);
    const restartedRuntimePort = await runtimeListenerPort(restartedRuntimePid);
    await run(
      args.bbExecutable,
      ["plugin", "reload", "mate", "--json"],
      args.hostileCwd,
      env,
    );
    await waitFor(
      async () =>
        (await runtimeProcesses(runtimeExecutable)).length === 0
          ? true
          : undefined,
      "runtime cleanup after reload",
    );
    await assertPortClosed(restartedRuntimePort);
    assert(
      (await rpc(serverUrl, "status", {})).runtimeState === "idle",
      "Reloaded Mate was not idle.",
    );
    await rpc(serverUrl, "ensure", {});
    const beforeDisablePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "runtime before disable");
    const beforeDisablePort = await runtimeListenerPort(beforeDisablePid);
    await run(
      args.bbExecutable,
      ["plugin", "disable", "mate", "--json"],
      args.hostileCwd,
      env,
    );
    await waitFor(
      async () =>
        (await runtimeProcesses(runtimeExecutable)).length === 0
          ? true
          : undefined,
      "runtime cleanup after disable",
    );
    await assertPortClosed(beforeDisablePort);
    const disabledRpc = await fetch(
      `${serverUrl}/api/v1/plugins/mate/rpc/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert(disabledRpc.status === 503, "Disabled Mate RPC remained available.");
    await run(
      args.bbExecutable,
      ["plugin", "enable", "mate", "--json"],
      args.hostileCwd,
      env,
    );
    assert(
      (await rpc(serverUrl, "status", {})).runtimeState === "idle",
      "Enabled Mate was not idle before redemand.",
    );
    await rpc(serverUrl, "ensure", {});
    const beforeRemovePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "runtime before remove");
    const beforeRemovePort = await runtimeListenerPort(beforeRemovePid);
    await run(
      args.bbExecutable,
      ["plugin", "remove", "mate", "--json"],
      args.hostileCwd,
      env,
    );
    await waitFor(
      async () =>
        (await runtimeProcesses(runtimeExecutable)).length === 0
          ? true
          : undefined,
      "runtime cleanup after remove",
    );
    await assertPortClosed(beforeRemovePort);
    assert(
      await fs
        .access(installedPackageRoot)
        .then(() => true)
        .catch(() => false),
      "Released bb unexpectedly removed its immutable managed artifact cache.",
    );
    await inspectMatePackageDirectory(
      installedPackageRoot,
      args.canonicalStandaloneRoot,
    );
    await run(
      args.bbExecutable,
      [
        "plugin",
        "install",
        `npm:${MATE_PACKAGE_NAME}@${MATE_PACKAGE_VERSION}`,
        "--yes",
        "--json",
      ],
      args.hostileCwd,
      env,
    );
    await rpc(serverUrl, "ensure", {});
    const beforeGracefulPid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "runtime before graceful server shutdown");
    const beforeGracefulPort = await runtimeListenerPort(beforeGracefulPid);
    process.kill(-server.pid, "SIGTERM");
    await waitFor(
      async () =>
        (await runtimeProcesses(runtimeExecutable)).length === 0
          ? true
          : undefined,
      "runtime cleanup after graceful server shutdown",
    );
    await assertPortClosed(beforeGracefulPort);
    await waitFor(
      async () =>
        (await fetch(`${serverUrl}/health`)
          .then(() => false)
          .catch(() => true))
          ? true
          : undefined,
      "listener cleanup after graceful server shutdown",
    );

    const forcedServer = Bun.spawn(serverCommand, { ...serverOptions });
    const forcedStdout = new Response(forcedServer.stdout).text();
    const forcedStderr = new Response(forcedServer.stderr).text();
    try {
      await waitForServer(serverUrl, forcedServer.exited);
      const restartedIdle = await waitFor(
        () => rpc(serverUrl, "status", {}).catch(() => undefined),
        "Mate activation after fresh server start",
      );
      assert(
        restartedIdle.runtimeState === "idle",
        "Fresh forced-parent server did not begin idle.",
      );
      await rpc(serverUrl, "ensure", {});
      const beforeForcedPid = await waitFor(async () => {
        const processes = await runtimeProcesses(runtimeExecutable);
        return processes.length === 1 ? processes[0] : undefined;
      }, "runtime before forced server-child loss");
      const beforeForcedPort = await runtimeListenerPort(beforeForcedPid);
      const actualServerPid = await waitFor(async () => {
        const pids = await serverChildProcesses(forcedServer.pid);
        return pids.length === 1 ? pids[0] : undefined;
      }, "one actual bb server child");
      process.kill(actualServerPid, "SIGKILL");
      await waitFor(
        async () =>
          (await runtimeProcesses(runtimeExecutable)).length === 0
            ? true
            : undefined,
        "runtime cleanup after forced server-child loss",
      );
      await assertPortClosed(beforeForcedPort);
      await run(
        args.bbExecutable,
        ["project", "delete", project.id, "--yes", "--json"],
        args.hostileCwd,
        env,
      ).catch(() => "server already stopped");
    } finally {
      try {
        process.kill(-forcedServer.pid, "SIGTERM");
      } catch {}
      let forcedExit = await Promise.race([
        forcedServer.exited,
        Bun.sleep(5_000).then(() => null),
      ]);
      if (forcedExit === null) {
        try {
          process.kill(-forcedServer.pid, "SIGKILL");
        } catch {}
        forcedExit = await Promise.race([
          forcedServer.exited,
          Bun.sleep(2_000).then(() => null),
        ]);
      }
      const [forcedOut, forcedErr] = await Promise.all([
        forcedStdout,
        forcedStderr,
      ]);
      assert(
        forcedExit !== null,
        `Forced-parent bb app did not stop: ${(forcedErr || forcedOut).trim().slice(-2_000)}`,
      );
    }
  } finally {
    registry.stop();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    let exitCode = await Promise.race([
      server.exited,
      Bun.sleep(5_000).then(() => null),
    ]);
    if (exitCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {}
      exitCode = await Promise.race([
        server.exited,
        Bun.sleep(2_000).then(() => null),
      ]);
    }
    assert(exitCode !== null, "Disposable bb server did not stop within 7s.");
    const [serverStdout, serverStderr] = await Promise.all([stdout, stderr]);
    assert(
      exitCode === 0 || exitCode === 128 || exitCode === 143,
      `Disposable bb app exited with ${exitCode}: ${(serverStderr || serverStdout).trim().slice(-2_000)}`,
    );
    assert(
      await fetch(`${serverUrl}/health`)
        .then(() => false)
        .catch(() => true),
      "Disposable bb server listener remains after shutdown.",
    );
  }
}
