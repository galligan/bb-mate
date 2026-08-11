import {
  launchPackagedRuntime,
  type OwnedRuntime,
  RuntimeLaunchError,
} from "./runtime-launcher.ts";
import {
  resolvePackagedRuntime,
  type RuntimeArtifactResolution,
  type RuntimeArtifactStamp,
} from "./runtime-resolver.ts";

export type RuntimeUnavailableReason =
  | "unsupported_platform"
  | "artifact_missing"
  | "artifact_invalid"
  | "runtime_incompatible"
  | "startup_failed";

export interface RuntimeSupervisorSnapshot {
  readonly schemaVersion: 2;
  readonly runtimeState:
    "idle" | "starting" | "ready" | "stopping" | "unavailable" | "failed";
  readonly reason: RuntimeUnavailableReason | null;
  readonly runtimeVersion: string | null;
  readonly apiVersion: 2 | null;
  readonly canStart: boolean;
  readonly browserLaunch: "unavailable";
}

interface RuntimeSupervisorDependencies {
  readonly resolve: () => Promise<RuntimeArtifactResolution>;
  readonly launch: (
    artifact: Extract<RuntimeArtifactResolution, { kind: "available" }>,
    dataRoot: string,
  ) => Promise<OwnedRuntime>;
}

const BASE = {
  schemaVersion: 2,
  browserLaunch: "unavailable",
} as const;

const idle = (): RuntimeSupervisorSnapshot =>
  Object.freeze({
    ...BASE,
    runtimeState: "idle",
    reason: null,
    runtimeVersion: null,
    apiVersion: null,
    canStart: true,
  });

function permanentFailure(
  reason: Exclude<RuntimeUnavailableReason, "startup_failed">,
): RuntimeSupervisorSnapshot {
  return Object.freeze({
    ...BASE,
    runtimeState: "unavailable",
    reason,
    runtimeVersion: null,
    apiVersion: null,
    canStart: false,
  });
}

function startupFailure(): RuntimeSupervisorSnapshot {
  return Object.freeze({
    ...BASE,
    runtimeState: "failed",
    reason: "startup_failed",
    runtimeVersion: null,
    apiVersion: null,
    canStart: true,
  });
}

function resolverReason(
  reason: Extract<RuntimeArtifactResolution, { kind: "unavailable" }>["reason"],
): Exclude<RuntimeUnavailableReason, "startup_failed"> {
  if (reason === "unsupported-platform") return "unsupported_platform";
  if (reason === "artifact-unavailable") return "artifact_missing";
  return "artifact_invalid";
}

export class RuntimeSupervisor {
  private snapshot = idle();
  private runtime: OwnedRuntime | undefined;
  private starting: Promise<RuntimeSupervisorSnapshot> | undefined;
  private stopping: Promise<void> | undefined;
  private demanded = false;
  private demandedDataRoot: string | undefined;
  private listeners = new Set<() => void>();

  constructor(private readonly dependencies: RuntimeSupervisorDependencies) {}

  status(): RuntimeSupervisorSnapshot {
    return this.snapshot;
  }

  async ensure(dataRoot: string): Promise<RuntimeSupervisorSnapshot> {
    if (this.demandedDataRoot && this.demandedDataRoot !== dataRoot)
      throw new Error("Runtime configuration unavailable.");
    this.demandedDataRoot = dataRoot;
    this.demanded = true;
    if (this.stopping) await this.stopping;
    if (this.runtime) return this.snapshot;
    const starting = this.starting ?? this.start(dataRoot);
    this.starting = starting;
    try {
      await starting;
      return this.snapshot;
    } finally {
      if (this.starting === starting) this.starting = undefined;
    }
  }

  private async start(dataRoot: string): Promise<RuntimeSupervisorSnapshot> {
    this.snapshot = Object.freeze({
      ...BASE,
      runtimeState: "starting",
      reason: null,
      runtimeVersion: null,
      apiVersion: null,
      canStart: false,
    });
    try {
      const artifact = await this.dependencies.resolve();
      if (artifact.kind === "unavailable") {
        this.snapshot = permanentFailure(resolverReason(artifact.reason));
        this.notify();
        return this.snapshot;
      }
      const runtime = await this.dependencies.launch(artifact, dataRoot);
      this.runtime = runtime;
      this.snapshot = Object.freeze({
        ...BASE,
        runtimeState: "ready",
        reason: null,
        runtimeVersion: runtime.identity.runtimeVersion,
        apiVersion: runtime.identity.apiVersion,
        canStart: false,
      });
      void runtime.closed.then(
        () => {
          if (this.runtime === runtime) {
            this.runtime = undefined;
            this.snapshot = startupFailure();
            this.notify();
          }
        },
        () => {
          if (this.runtime === runtime) {
            this.runtime = undefined;
            this.snapshot = startupFailure();
            this.notify();
          }
        },
      );
    } catch (error) {
      this.snapshot =
        error instanceof RuntimeLaunchError &&
        error.kind === "runtime_incompatible"
          ? permanentFailure("runtime_incompatible")
          : error instanceof RuntimeLaunchError &&
              error.kind === "artifact_invalid"
            ? permanentFailure("artifact_invalid")
            : startupFailure();
    }
    this.notify();
    return this.snapshot;
  }

  async admitCurrentProject(sourcePath: string) {
    const runtime = this.runtime;
    if (!runtime || this.snapshot.runtimeState !== "ready")
      throw new Error("Runtime target admission failed.");
    try {
      const admitted = await runtime.targets.admit(sourcePath);
      if (this.runtime !== runtime || this.snapshot.runtimeState !== "ready")
        throw new Error();
      return admitted;
    } catch {
      throw new Error("Runtime target admission failed.");
    }
  }

  async runService(signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      await this.stop();
      return;
    }
    if (
      this.demanded &&
      !this.runtime &&
      !this.starting &&
      this.snapshot.runtimeState !== "unavailable"
    ) {
      await this.ensure(this.demandedDataRoot!);
    }
    while (!signal.aborted) {
      if (this.snapshot.runtimeState === "unavailable") {
        const error = new Error("Packaged runtime is unavailable.");
        error.name = "NeedsConfigurationError";
        throw error;
      }
      if (this.snapshot.runtimeState === "failed" && this.demanded) {
        throw new Error("Packaged runtime stopped.");
      }
      await this.waitForChange(signal);
    }
    await this.stop();
  }

  private waitForChange(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener("abort", done);
        this.listeners.delete(done);
        resolve();
      };
      this.listeners.add(done);
      signal.addEventListener("abort", done, { once: true });
    });
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      if (this.starting) await this.starting;
      const runtime = this.runtime;
      if (!runtime) return;
      this.snapshot = Object.freeze({
        ...BASE,
        runtimeState: "stopping",
        reason: null,
        runtimeVersion: runtime.identity.runtimeVersion,
        apiVersion: runtime.identity.apiVersion,
        canStart: false,
      });
      this.runtime = undefined;
      await runtime.stop();
      this.snapshot = idle();
      this.notify();
    })().finally(() => {
      this.stopping = undefined;
    });
    return this.stopping;
  }
}

export function createRuntimeSupervisor(options: {
  readonly stamp: RuntimeArtifactStamp;
  readonly moduleUrl?: string;
}): RuntimeSupervisor {
  return new RuntimeSupervisor({
    resolve: () =>
      resolvePackagedRuntime({
        stamp: options.stamp,
        moduleUrl: options.moduleUrl,
      }),
    launch: (artifact, dataRoot) =>
      launchPackagedRuntime(artifact, { dataRoot }),
  });
}
