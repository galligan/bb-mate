import { randomBytes } from "node:crypto";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";
import { RUNTIME_ARTIFACT_STAMP } from "../generated/runtime-artifact-stamp.ts";
import {
  deriveRuntimeDataRoot,
  loadProjectInventory,
  resolveProjectSource,
  sameProjectSource,
  type ProjectInventory,
  type ReleasedProjectSdk,
  type ResolvedProjectSource,
} from "./project-adapter.ts";
import {
  createRuntimeSupervisor,
  type RuntimeSupervisor,
  type RuntimeSupervisorSnapshot,
} from "./runtime-supervisor.ts";
import {
  projectCatalogSchema,
  targetSummarySchema,
  workbenchSnapshotSchema,
  type PluginWorkbenchSnapshotV3,
  type ProjectCatalog,
  type ProjectOption,
  type TargetSummary,
} from "./workbench-contract.ts";

export const rpcContract = defineRpcContract({
  status: {
    input: z.object({}).strict(),
    output: workbenchSnapshotSchema,
  },
  refresh: {
    input: z.object({}).strict(),
    output: workbenchSnapshotSchema,
  },
});

interface RuntimeTargetProjection {
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly manifest: { readonly pluginId: string };
}

interface RuntimeProjectAdmission {
  readonly projectKey: string;
  readonly state: "ready" | "partial";
  readonly targets: readonly RuntimeTargetProjection[];
}

interface StudioRuntimeSupervisor {
  status(): RuntimeSupervisorSnapshot;
  ensure(dataRoot: string): Promise<RuntimeSupervisorSnapshot>;
  admitProjects(input: {
    readonly inventoryState: "complete" | "partial";
    readonly projects: readonly {
      readonly projectKey: string;
      readonly sourcePath: string;
    }[];
  }): Promise<{
    readonly schemaVersion: 2;
    readonly state: "ready" | "partial";
    readonly projects: readonly RuntimeProjectAdmission[];
  }>;
  runService(signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

interface StudioPluginOptions {
  readonly createProjectKey?: () => string;
}

function snapshot(
  runtime: RuntimeSupervisorSnapshot,
  projects: ProjectCatalog,
): PluginWorkbenchSnapshotV3 {
  return Object.freeze(
    workbenchSnapshotSchema.parse({
      ...runtime,
      schemaVersion: 3,
      projects,
    }),
  );
}

function projectTargets(
  input: RuntimeProjectAdmission,
): TargetSummary[] | null {
  const targets: TargetSummary[] = [];
  for (const target of input.targets) {
    const projection = {
      id: target.id,
      label: target.displayName,
      pluginId: target.manifest.pluginId,
      revision: target.revision,
    };
    let parsed = targetSummarySchema.safeParse(projection);
    if (!parsed.success) {
      parsed = targetSummarySchema.safeParse({
        ...projection,
        label: target.manifest.pluginId,
      });
    }
    if (!parsed.success) return null;
    targets.push(parsed.data);
  }
  if (
    targets.length > 128 ||
    new Set(targets.map(({ id }) => id)).size !== targets.length
  )
    return null;
  return targets.sort(
    (left, right) =>
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
  );
}

function scannedCatalog(
  catalog: Extract<ProjectCatalog, { state: "ready" | "partial" }>,
  scans: ReadonlyMap<string, ProjectOption["scan"]>,
): ProjectCatalog {
  const items = catalog.items.map((project) => ({
    ...project,
    scan: scans.get(project.id) ?? {
      state: "unavailable" as const,
      reason: "scan_failed" as const,
      items: [] as const,
    },
  }));
  const state =
    catalog.truncated ||
    items.some(
      ({ scan }) => scan.state === "partial" || scan.state === "unavailable",
    )
      ? "partial"
      : "ready";
  return projectCatalogSchema.parse({
    state,
    truncated: catalog.truncated,
    items,
  });
}

function sourceMap(inventory: Extract<ProjectInventory, { state: "ready" }>) {
  return new Map(inventory.sources.map((source) => [source.projectId, source]));
}

function stableSource(
  before: ResolvedProjectSource,
  after: ReadonlyMap<string, ResolvedProjectSource>,
) {
  const current = after.get(before.projectId);
  return current && sameProjectSource(before, current) ? current : null;
}

function allocateProjectKey(
  createProjectKey: () => string,
  used: Set<string>,
): string | null {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    let projectKey: string;
    try {
      projectKey = createProjectKey();
    } catch {
      return null;
    }
    if (!/^[A-Za-z0-9_-]{32}$/u.test(projectKey) || used.has(projectKey))
      continue;
    used.add(projectKey);
    return projectKey;
  }
  return null;
}

export function createStudioPlugin(
  supervisor: StudioRuntimeSupervisor,
  options: StudioPluginOptions = {},
) {
  const createProjectKey =
    options.createProjectKey ?? (() => randomBytes(24).toString("base64url"));
  return function matePlugin(bb: BbPluginApi): void {
    let storageReady = false;
    let storageOpening: Promise<void> | undefined;
    let refreshing: Promise<PluginWorkbenchSnapshotV3> | undefined;
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
        async list(input) {
          return bb.sdk.projects.list(input);
        },
        async get({ projectId }) {
          return bb.sdk.projects.get({ projectId });
        },
      },
    };
    const status = async () => {
      const inventory = await loadProjectInventory(sdk);
      return snapshot(supervisor.status(), inventory.catalog);
    };

    const executeRefresh = async (): Promise<PluginWorkbenchSnapshotV3> => {
      const before = await loadProjectInventory(sdk);
      if (before.state === "unavailable")
        return snapshot(supervisor.status(), before.catalog);

      let dataRoot: string;
      try {
        await ensureStorage();
        dataRoot = await deriveRuntimeDataRoot(before.dataDir);
      } catch {
        return snapshot(supervisor.status(), {
          state: "unavailable",
          items: [],
        });
      }
      const runtime = await supervisor.ensure(dataRoot);
      if (runtime.runtimeState !== "ready") {
        const scans = new Map<string, ProjectOption["scan"]>(
          before.sources.map((source) => [
            source.projectId,
            {
              state: "unavailable" as const,
              reason: "scan_failed" as const,
              items: [],
            },
          ]),
        );
        return snapshot(
          supervisor.status(),
          scannedCatalog(before.catalog, scans),
        );
      }

      const after = await loadProjectInventory(sdk);
      if (
        after.state === "unavailable" ||
        after.primaryHostId !== before.primaryHostId ||
        after.dataDir !== before.dataDir
      ) {
        const scans = new Map<string, ProjectOption["scan"]>(
          before.sources.map((source) => [
            source.projectId,
            {
              state: "unavailable" as const,
              reason: "source_changed" as const,
              items: [],
            },
          ]),
        );
        return snapshot(
          supervisor.status(),
          scannedCatalog(before.catalog, scans),
        );
      }

      const afterSources = sourceMap(after);
      const scans = new Map<string, ProjectOption["scan"]>();
      let responseRuntime = runtime;
      const listedSources = before.sources.map((source) =>
        stableSource(source, afterSources),
      );
      if (
        after.sources.length !== before.sources.length ||
        listedSources.some((source) => source === null)
      ) {
        for (const source of before.sources) {
          scans.set(source.projectId, {
            state: "unavailable",
            reason: "source_changed",
            items: [],
          });
        }
        return snapshot(
          supervisor.status(),
          scannedCatalog(before.catalog, scans),
        );
      }
      const stableSources = await Promise.all(
        listedSources.map(async (source) => {
          try {
            const current = await resolveProjectSource(sdk, source!.projectId);
            return sameProjectSource(source!, current) ? current : null;
          } catch {
            return null;
          }
        }),
      );
      if (stableSources.some((source) => source === null)) {
        for (const source of before.sources) {
          scans.set(source.projectId, {
            state: "unavailable",
            reason: "source_changed",
            items: [],
          });
        }
        return snapshot(
          supervisor.status(),
          scannedCatalog(before.catalog, scans),
        );
      }
      const projectKeys = new Set<string>();
      const admitted: {
        projectId: string;
        projectKey: string;
        sourcePath: string;
      }[] = [];
      for (const [index, source] of before.sources.entries()) {
        const current = stableSources[index]!;
        const projectKey = allocateProjectKey(createProjectKey, projectKeys);
        if (!projectKey) {
          scans.set(source.projectId, {
            state: "unavailable",
            reason: "scan_failed",
            items: [],
          });
          continue;
        }
        admitted.push({
          projectId: source.projectId,
          projectKey,
          sourcePath: current.path,
        });
      }

      if (admitted.length !== before.sources.length) {
        responseRuntime = supervisor.status();
        for (const source of before.sources) {
          scans.set(source.projectId, {
            state: "unavailable",
            reason: "scan_failed",
            items: [],
          });
        }
      } else {
        try {
          const result = await supervisor.admitProjects({
            inventoryState:
              before.inventoryState === "complete" &&
              after.inventoryState === "complete"
                ? "complete"
                : "partial",
            projects: admitted.map(({ projectKey, sourcePath }) => ({
              projectKey,
              sourcePath,
            })),
          });
          const byKey = new Map(
            result.projects.map((project) => [project.projectKey, project]),
          );
          for (const project of admitted) {
            const group = byKey.get(project.projectKey);
            const targets = group ? projectTargets(group) : null;
            scans.set(
              project.projectId,
              group && targets
                ? {
                    state: group.state,
                    items: targets,
                  }
                : {
                    state: "unavailable",
                    reason: "scan_failed",
                    items: [],
                  },
            );
          }
        } catch {
          responseRuntime = supervisor.status();
          for (const project of admitted) {
            scans.set(project.projectId, {
              state: "unavailable",
              reason: "scan_failed",
              items: [],
            });
          }
        }
      }
      return snapshot(responseRuntime, scannedCatalog(before.catalog, scans));
    };

    const refresh = () => {
      const current = refreshing ?? executeRefresh();
      refreshing = current;
      return current.finally(() => {
        if (refreshing === current) refreshing = undefined;
      });
    };

    bb.rpc.register(rpcContract, {
      status: () => status(),
      refresh: () => refresh(),
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
  createStudioPlugin(supervisor)(bb);
}
