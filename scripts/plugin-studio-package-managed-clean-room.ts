import { promises as fs } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { inspectPluginStudioPackageDirectory } from "./inspect-plugin-studio-package.ts";
import { fingerprintProfileRoots } from "./profile-fingerprint.ts";
import {
  assertCatalogRefresh,
  callStudioRpc,
  type StudioSnapshot,
} from "./plugin-studio-managed-rpc.ts";
import {
  PLUGIN_STUDIO_PACKAGE_NAME,
  PLUGIN_STUDIO_PACKAGE_VERSION,
  startPluginStudioPackageRegistry,
} from "./plugin-studio-package-registry.ts";

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

async function createProject(args: {
  bbExecutable: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  machineId: string;
  name: string;
  root: string;
}): Promise<string> {
  const output = await run(
    args.bbExecutable,
    [
      "project",
      "create",
      "--name",
      args.name,
      "--root",
      args.root,
      "--machine",
      args.machineId,
      "--json",
    ],
    args.cwd,
    args.env,
  );
  const project = JSON.parse(output) as { id?: unknown };
  assert(
    typeof project.id === "string",
    `Disposable bb did not create ${args.name}.`,
  );
  return project.id;
}

function assertProjectOptions(
  snapshot: StudioSnapshot,
  expected: ReadonlyMap<string, string>,
): void {
  assert(
    snapshot.projects.state === "ready",
    "Studio project options are unavailable.",
  );
  for (const [id, label] of expected) {
    const option = snapshot.projects.items.find((item) => item.id === id);
    assert(
      option?.label === label && option.scan.state === "not_scanned",
      `Studio project option is not available: ${label}.`,
    );
  }
}

export function catalogFailureSummary(snapshot: StudioSnapshot) {
  const scans = {
    ready: 0,
    partial: 0,
    not_scanned: 0,
    unavailable: {
      source_changed: 0,
      scan_failed: 0,
      capacity_reached: 0,
    },
  };
  for (const project of snapshot.projects.items) {
    if (project.scan.state === "unavailable") {
      scans.unavailable[project.scan.reason] += 1;
    } else {
      scans[project.scan.state] += 1;
    }
  }
  return {
    runtimeState: snapshot.runtimeState,
    runtimeReason: snapshot.reason,
    runtimeVersion: snapshot.runtimeVersion,
    apiVersion: snapshot.apiVersion,
    projectState: snapshot.projects.state,
    projectCount: snapshot.projects.items.length,
    truncated:
      snapshot.projects.state === "unavailable"
        ? null
        : snapshot.projects.truncated,
    scans,
  };
}

function assertCatalog(
  snapshot: StudioSnapshot,
  expected: ReadonlyMap<
    string,
    readonly { readonly label: string; readonly pluginId: string }[]
  >,
): void {
  assert(
    snapshot.runtimeState === "ready" &&
      snapshot.apiVersion === 2 &&
      snapshot.runtimeVersion === "0.1.0-alpha.3" &&
      snapshot.projects.state === "ready",
    `Studio did not return a ready all-project catalog: ${JSON.stringify(catalogFailureSummary(snapshot))}.`,
  );
  assert(
    snapshot.projects.items.length === expected.size,
    "Studio returned an unexpected project count.",
  );
  for (const [projectId, targets] of expected) {
    const project = snapshot.projects.items.find(({ id }) => id === projectId);
    const actualTargets =
      project?.scan.state === "ready"
        ? project.scan.items
            .map(({ label, pluginId }) => ({ label, pluginId }))
            .sort((left, right) => left.pluginId.localeCompare(right.pluginId))
        : null;
    const expectedTargets = [...targets].sort((left, right) =>
      left.pluginId.localeCompare(right.pluginId),
    );
    assert(
      project?.scan.state === "ready" &&
        JSON.stringify(actualTargets) === JSON.stringify(expectedTargets),
      `Studio did not return the exact grouped targets for project ${projectId}: expected ${JSON.stringify(expectedTargets)}, received ${JSON.stringify(actualTargets)}.`,
    );
  }
}

async function assertMarkersAbsent(
  ...markers: readonly string[]
): Promise<void> {
  for (const marker of markers) {
    assert(
      !(await fs
        .access(marker)
        .then(() => true)
        .catch(() => false)),
      `Clean-room sentinel was executed: ${path.basename(marker)}.`,
    );
  }
}

function assertNoPrivateLeak(
  text: string,
  privateValues: readonly string[],
): void {
  for (const value of privateValues) {
    assert(
      !text.includes(value),
      "Managed Studio lifecycle logs leaked a private source value.",
    );
  }
  assert(
    !/(?:authorization\s*:|bearer\s+|rootKey|"token"\s*:|"baseUrl"\s*:)/iu.test(
      text,
    ),
    "Managed Studio lifecycle logs leaked a private runtime field.",
  );
}

export async function verifyManagedPluginStudioPackage(args: {
  artifactPath: string;
  integrity: string;
  shasum: string;
  temporaryRoot: string;
  hostileCwd: string;
  env: NodeJS.ProcessEnv;
  bbExecutable: string;
  bbAppExecutable: string;
  canonicalStandaloneRoot: string;
  bbPluginStudioSourceRoot: string;
  gridSourceRoot: string;
  targetMarker: string;
  ambientMarker: string;
}): Promise<void> {
  const registry = startPluginStudioPackageRegistry({
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
        `npm:${PLUGIN_STUDIO_PACKAGE_NAME}@${PLUGIN_STUDIO_PACKAGE_VERSION}`,
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
        installed.plugin?.id === "studio" &&
        installed.plugin.version === PLUGIN_STUDIO_PACKAGE_VERSION &&
        installed.plugin.source ===
          `npm:${PLUGIN_STUDIO_PACKAGE_NAME}@${PLUGIN_STUDIO_PACKAGE_VERSION}`,
      "Disposable bb did not report the exact managed-npm Studio install.",
    );
    const installedPackageRoot = path.join(
      dataDir,
      "plugins",
      "cache",
      "npm",
      PLUGIN_STUDIO_PACKAGE_NAME,
      PLUGIN_STUDIO_PACKAGE_VERSION,
      "node_modules",
      PLUGIN_STUDIO_PACKAGE_NAME,
    );
    await inspectPluginStudioPackageDirectory(
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
    const [bbStudioProjectId, gridProjectId] = await Promise.all([
      createProject({
        bbExecutable: args.bbExecutable,
        cwd: args.hostileCwd,
        env,
        machineId,
        name: "bb Plugin Studio",
        root: args.bbPluginStudioSourceRoot,
      }),
      createProject({
        bbExecutable: args.bbExecutable,
        cwd: args.hostileCwd,
        env,
        machineId,
        name: "grid",
        root: args.gridSourceRoot,
      }),
    ]);
    const expectedProjects = new Map([
      [bbStudioProjectId, "bb Plugin Studio"],
      [gridProjectId, "grid"],
    ]);
    const expectedCatalog = new Map([
      [
        bbStudioProjectId,
        [
          { label: "Linear", pluginId: "linear" },
          { label: "Plugin Studio", pluginId: "plugin-studio" },
        ],
      ],
      [gridProjectId, []],
    ]);
    const idle = await callStudioRpc(serverUrl, "status", {});
    assert(
      idle.runtimeState === "idle" &&
        idle.runtimeVersion === null &&
        idle.apiVersion === null &&
        idle.canStart &&
        idle.projects.state === "ready" &&
        idle.projects.items.every(({ scan }) => scan.state === "not_scanned"),
      `Studio runtime was not idle before demand: ${JSON.stringify(idle)}.`,
    );
    assertProjectOptions(idle, expectedProjects);
    const runtimeDataRoot = path.join(dataDir, "plugins", "studio", "runtime");
    assert(
      !(await fs
        .access(runtimeDataRoot)
        .then(() => true)
        .catch(() => false)),
      "Studio created its runtime catalog before admission.",
    );
    const invalidRefresh = await fetch(
      `${serverUrl}/api/v1/plugins/studio/rpc/refresh`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: bbStudioProjectId,
          path: args.bbPluginStudioSourceRoot,
        }),
      },
    );
    assert(
      invalidRefresh.status === 400,
      "Studio refresh accepted browser-supplied project or path selection.",
    );
    const invalidStatus = await fetch(
      `${serverUrl}/api/v1/plugins/studio/rpc/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: bbStudioProjectId }),
      },
    );
    assert(
      invalidStatus.status === 400,
      "Studio status accepted browser-supplied project selection.",
    );
    const obsoleteAdmit = await fetch(
      `${serverUrl}/api/v1/plugins/studio/rpc/admit`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: bbStudioProjectId }),
      },
    );
    assert(
      obsoleteAdmit.status === 404,
      "Studio exposed the obsolete per-project admit RPC.",
    );
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    assert(
      (
        await runtimeProcesses(
          path.join(
            installedPackageRoot,
            "runtime",
            "darwin-arm64",
            "bb-plugin-studio-runtime",
          ),
        )
      ).length === 0,
      "Studio runtime started before demand.",
    );
    const concurrentRefreshes = await Promise.all(
      Array.from({ length: 100 }, () =>
        callStudioRpc(serverUrl, "refresh", {}),
      ),
    );
    let catalog = concurrentRefreshes[0]!;
    assertCatalog(catalog, expectedCatalog);
    assert(
      concurrentRefreshes.every(
        (snapshot) => JSON.stringify(snapshot) === JSON.stringify(catalog),
      ),
      "Concurrent all-project Studio refresh calls did not converge.",
    );
    const firstRepeatedRefresh = await callStudioRpc(serverUrl, "refresh", {});
    assertCatalog(firstRepeatedRefresh, expectedCatalog);
    assertCatalogRefresh(catalog, firstRepeatedRefresh);
    catalog = firstRepeatedRefresh;
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    const runtimeExecutable = path.join(
      installedPackageRoot,
      "runtime",
      "darwin-arm64",
      "bb-plugin-studio-runtime",
    );
    const firstRuntimePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "one Studio runtime child");
    const firstRuntimePort = await runtimeListenerPort(firstRuntimePid);
    process.kill(-firstRuntimePid, "SIGKILL");
    const restartedRuntimePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      const status = await callStudioRpc(serverUrl, "status", {});
      return processes.length === 1 &&
        processes[0] !== firstRuntimePid &&
        status.runtimeState === "ready"
        ? processes[0]
        : undefined;
    }, "one restarted Studio runtime child");
    assert(
      restartedRuntimePid !== firstRuntimePid,
      "Studio runtime did not restart after crash.",
    );
    await assertPortClosed(firstRuntimePort);
    assertProjectOptions(
      await callStudioRpc(serverUrl, "status", {}),
      expectedProjects,
    );
    const afterCrash = await callStudioRpc(serverUrl, "refresh", {});
    assertCatalog(afterCrash, expectedCatalog);
    assertCatalogRefresh(catalog, afterCrash);
    catalog = afterCrash;
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    const restartedRuntimePort = await runtimeListenerPort(restartedRuntimePid);
    await run(
      args.bbExecutable,
      ["plugin", "reload", "studio", "--json"],
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
    const afterReloadStatus = await callStudioRpc(serverUrl, "status", {});
    assert(
      afterReloadStatus.runtimeState === "idle",
      "Reloaded Studio was not idle.",
    );
    assertProjectOptions(afterReloadStatus, expectedProjects);
    const afterReload = await callStudioRpc(serverUrl, "refresh", {});
    assertCatalog(afterReload, expectedCatalog);
    assertCatalogRefresh(catalog, afterReload);
    catalog = afterReload;
    const beforeDisablePid = await waitFor(async () => {
      const processes = await runtimeProcesses(runtimeExecutable);
      return processes.length === 1 ? processes[0] : undefined;
    }, "runtime before disable");
    const beforeDisablePort = await runtimeListenerPort(beforeDisablePid);
    await run(
      args.bbExecutable,
      ["plugin", "disable", "studio", "--json"],
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
    await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
    const disabledRpc = await fetch(
      `${serverUrl}/api/v1/plugins/studio/rpc/status`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    assert(
      disabledRpc.status === 503,
      "Disabled Studio RPC remained available.",
    );
    await run(
      args.bbExecutable,
      ["plugin", "enable", "studio", "--json"],
      args.hostileCwd,
      env,
    );
    const afterEnableStatus = await callStudioRpc(serverUrl, "status", {});
    assert(
      afterEnableStatus.runtimeState === "idle",
      "Enabled Studio was not idle before redemand.",
    );
    assertProjectOptions(afterEnableStatus, expectedProjects);
    const afterEnable = await callStudioRpc(serverUrl, "refresh", {});
    assertCatalog(afterEnable, expectedCatalog);
    assertCatalogRefresh(catalog, afterEnable);
    catalog = afterEnable;
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
        () => callStudioRpc(serverUrl, "status", {}).catch(() => undefined),
        "Studio activation after fresh server start",
      );
      assert(
        restartedIdle.runtimeState === "idle",
        "Fresh forced-parent server did not begin idle.",
      );
      assertProjectOptions(restartedIdle, expectedProjects);
      const afterServerReopen = await callStudioRpc(serverUrl, "refresh", {});
      assertCatalog(afterServerReopen, expectedCatalog);
      assertCatalogRefresh(catalog, afterServerReopen);
      catalog = afterServerReopen;
      const beforeRemovePid = await waitFor(async () => {
        const processes = await runtimeProcesses(runtimeExecutable);
        return processes.length === 1 ? processes[0] : undefined;
      }, "runtime before remove");
      const beforeRemovePort = await runtimeListenerPort(beforeRemovePid);
      await run(
        args.bbExecutable,
        ["plugin", "remove", "studio", "--json"],
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
      await inspectPluginStudioPackageDirectory(
        installedPackageRoot,
        args.canonicalStandaloneRoot,
      );
      const retainedState = await fingerprintProfileRoots([
        installedPackageRoot,
        runtimeDataRoot,
      ]);
      await Bun.sleep(200);
      assert(
        (await fingerprintProfileRoots([
          installedPackageRoot,
          runtimeDataRoot,
        ])) === retainedState,
        "Removed Studio cache or runtime catalog remained active.",
      );
      await run(
        args.bbExecutable,
        [
          "plugin",
          "install",
          `npm:${PLUGIN_STUDIO_PACKAGE_NAME}@${PLUGIN_STUDIO_PACKAGE_VERSION}`,
          "--yes",
          "--json",
        ],
        args.hostileCwd,
        env,
      );
      const afterReinstall = await callStudioRpc(serverUrl, "refresh", {});
      assertCatalog(afterReinstall, expectedCatalog);
      assertCatalogRefresh(catalog, afterReinstall);
      catalog = afterReinstall;
      await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
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
      assertNoPrivateLeak(`${forcedOut}\n${forcedErr}`, [
        args.bbPluginStudioSourceRoot,
        args.gridSourceRoot,
        args.targetMarker,
        args.ambientMarker,
      ]);
      assert(
        forcedExit !== null,
        `Forced-parent bb app did not stop: ${(forcedErr || forcedOut).trim().slice(-2_000)}`,
      );
    }

    const recoveredServer = Bun.spawn(serverCommand, { ...serverOptions });
    const recoveredStdout = new Response(recoveredServer.stdout).text();
    const recoveredStderr = new Response(recoveredServer.stderr).text();
    try {
      await waitForServer(serverUrl, recoveredServer.exited);
      const recoveredIdle = await waitFor(
        () => callStudioRpc(serverUrl, "status", {}).catch(() => undefined),
        "Studio activation after forced server-child loss",
      );
      assert(
        recoveredIdle.runtimeState === "idle",
        "Studio was not idle after forced server-child loss.",
      );
      assertProjectOptions(recoveredIdle, expectedProjects);
      const afterParentLoss = await callStudioRpc(serverUrl, "refresh", {});
      assertCatalog(afterParentLoss, expectedCatalog);
      assertCatalogRefresh(catalog, afterParentLoss);
      catalog = afterParentLoss;
      await assertMarkersAbsent(args.targetMarker, args.ambientMarker);
      const finalRuntimePid = await waitFor(async () => {
        const processes = await runtimeProcesses(runtimeExecutable);
        return processes.length === 1 ? processes[0] : undefined;
      }, "runtime after forced server-child recovery");
      const finalRuntimePort = await runtimeListenerPort(finalRuntimePid);
      await run(
        args.bbExecutable,
        ["plugin", "remove", "studio", "--json"],
        args.hostileCwd,
        env,
      );
      await waitFor(
        async () =>
          (await runtimeProcesses(runtimeExecutable)).length === 0
            ? true
            : undefined,
        "runtime cleanup after final remove",
      );
      await assertPortClosed(finalRuntimePort);
      await inspectPluginStudioPackageDirectory(
        installedPackageRoot,
        args.canonicalStandaloneRoot,
      );
      await Promise.all(
        [bbStudioProjectId, gridProjectId].map((projectId) =>
          run(
            args.bbExecutable,
            ["project", "delete", projectId, "--yes", "--json"],
            args.hostileCwd,
            env,
          ),
        ),
      );
    } finally {
      try {
        process.kill(-recoveredServer.pid, "SIGTERM");
      } catch {}
      let recoveredExit = await Promise.race([
        recoveredServer.exited,
        Bun.sleep(5_000).then(() => null),
      ]);
      if (recoveredExit === null) {
        try {
          process.kill(-recoveredServer.pid, "SIGKILL");
        } catch {}
        recoveredExit = await Promise.race([
          recoveredServer.exited,
          Bun.sleep(2_000).then(() => null),
        ]);
      }
      const [recoveredOut, recoveredErr] = await Promise.all([
        recoveredStdout,
        recoveredStderr,
      ]);
      assertNoPrivateLeak(`${recoveredOut}\n${recoveredErr}`, [
        args.bbPluginStudioSourceRoot,
        args.gridSourceRoot,
        args.targetMarker,
        args.ambientMarker,
      ]);
      assert(
        recoveredExit !== null,
        `Recovered bb app did not stop: ${(recoveredErr || recoveredOut).trim().slice(-2_000)}`,
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
    assertNoPrivateLeak(`${serverStdout}\n${serverStderr}`, [
      args.bbPluginStudioSourceRoot,
      args.gridSourceRoot,
      args.targetMarker,
      args.ambientMarker,
    ]);
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
