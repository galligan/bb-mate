import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";
import { RUNTIME_ARTIFACT_STAMP } from "../generated/runtime-artifact-stamp.ts";
import {
  deriveRuntimeDataRoot,
  listProjectOptions,
  resolveProjectSource,
  sameProjectSource,
  type ReleasedProjectSdk,
} from "./project-adapter.ts";
import {
  createRuntimeSupervisor,
  type RuntimeSupervisor,
  type RuntimeSupervisorSnapshot,
} from "./runtime-supervisor.ts";
import {
  projectIdSchema,
  workbenchSnapshotSchema,
  type PluginWorkbenchSnapshotV2,
  type ProjectCatalog,
  type TargetCatalog,
  type TargetSummary,
} from "./workbench-contract.ts";

export const rpcContract = defineRpcContract({
  status: {
    input: z.object({}).strict(),
    output: workbenchSnapshotSchema,
  },
  admit: {
    input: z.object({ projectId: projectIdSchema }).strict(),
    output: workbenchSnapshotSchema,
  },
});

interface MateRuntimeSupervisor {
  status(): RuntimeSupervisorSnapshot;
  ensure(dataRoot: string): Promise<RuntimeSupervisorSnapshot>;
  admitCurrentProject(sourcePath: string): Promise<{
    readonly state: "ready" | "partial";
    readonly targets: readonly RuntimeTargetProjection[];
  }>;
  runService(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

interface RuntimeTargetProjection {
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly manifest: { readonly pluginId: string };
}

function unavailableTargets(runtime: RuntimeSupervisorSnapshot): TargetCatalog {
  if (runtime.runtimeState === "ready")
    return { state: "project_not_selected", items: [] };
  return {
    state: "unavailable",
    reason:
      runtime.reason === "runtime_incompatible"
        ? "runtime_incompatible"
        : "runtime_not_ready",
    items: [],
  };
}

function projectTargets(input: {
  readonly state: "ready" | "partial";
  readonly targets: readonly RuntimeTargetProjection[];
}): TargetCatalog {
  const items: TargetSummary[] = input.targets
    .map((target) => ({
      id: target.id,
      label: target.displayName,
      pluginId: target.manifest.pluginId,
      revision: target.revision,
    }))
    .sort(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.id.localeCompare(right.id),
    );
  return { state: input.state, items };
}

function snapshot(
  runtime: RuntimeSupervisorSnapshot,
  projects: ProjectCatalog,
  targets: TargetCatalog,
): PluginWorkbenchSnapshotV2 {
  return Object.freeze(
    workbenchSnapshotSchema.parse({ ...runtime, projects, targets }),
  );
}

export function createMatePlugin(supervisor: MateRuntimeSupervisor) {
  return function matePlugin(bb: BbPluginApi): void {
    let storageReady = false;
    let storageOpening: Promise<void> | undefined;
    const ensureStorage = async () => {
      if (storageReady) return;
      const opening =
        storageOpening ??
        Promise.resolve().then(() => {
          void bb.storage.database();
          storageReady = true;
        });
      storageOpening = opening;
      try {
        await opening;
      } finally {
        if (storageOpening === opening) storageOpening = undefined;
      }
    };
    const sdk: ReleasedProjectSdk = {
      system: {
        async config() {
          const { primaryHostId, dataDir } = await bb.sdk.system.config();
          return { primaryHostId, dataDir };
        },
      },
      projects: {
        async list() {
          return bb.sdk.projects.list();
        },
        async get({ projectId }) {
          return bb.sdk.projects.get({ projectId });
        },
      },
    };
    const status = async (targets?: TargetCatalog) => {
      const runtime = supervisor.status();
      return snapshot(
        runtime,
        await listProjectOptions(sdk),
        targets ?? unavailableTargets(runtime),
      );
    };

    bb.rpc.register(rpcContract, {
      status: () => status(),
      async admit({ projectId }) {
        const before = await resolveProjectSource(sdk, projectId);
        let dataRoot: string;
        try {
          await ensureStorage();
          dataRoot = await deriveRuntimeDataRoot(
            (await sdk.system.config()).dataDir,
          );
        } catch {
          throw new Error("Project source unavailable.");
        }
        const runtime = await supervisor.ensure(dataRoot);
        if (runtime.runtimeState !== "ready") return status();
        const after = await resolveProjectSource(sdk, projectId);
        if (!sameProjectSource(before, after))
          throw new Error("Project source unavailable.");
        try {
          const admitted = await supervisor.admitCurrentProject(after.path);
          return snapshot(
            runtime,
            await listProjectOptions(sdk),
            projectTargets(admitted),
          );
        } catch {
          const current = supervisor.status();
          return snapshot(
            current,
            await listProjectOptions(sdk),
            current.runtimeState === "ready"
              ? {
                  state: "unavailable",
                  reason: "catalog_unavailable",
                  items: [],
                }
              : unavailableTargets(current),
          );
        }
      },
    });
    bb.background.service("runtime", {
      start: (signal) => supervisor.runService(signal),
    });
    bb.onDispose(() => supervisor.stop());
  };
}

export default function plugin(bb: BbPluginApi): void {
  const supervisor: RuntimeSupervisor = createRuntimeSupervisor({
    stamp: RUNTIME_ARTIFACT_STAMP,
  });
  createMatePlugin(supervisor)(bb);
}
