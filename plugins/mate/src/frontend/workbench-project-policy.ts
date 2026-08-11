import type {
  PluginWorkbenchEnsureInput,
  PluginWorkbenchSnapshot,
} from "./workbench-snapshot";

export function applyProjectDemandPolicy(
  snapshot: PluginWorkbenchSnapshot,
  projectId: string | null,
): PluginWorkbenchSnapshot {
  if (projectId !== null || !snapshot.canStart) return snapshot;
  return { ...snapshot, canStart: false };
}

export function createProjectDemandInput(
  projectId: string | null,
): PluginWorkbenchEnsureInput | null {
  return projectId === null ? null : { projectId };
}
