import type { PluginInspection } from "@bb-mate/inspection";
import type { PreviewMode } from "@/workbench-state";

export interface LauncherPreviewCapability {
  available: boolean;
  detail: string;
}

export function previewModeCapabilities(
  inspection: PluginInspection | null,
): Record<PreviewMode, LauncherPreviewCapability> {
  const harness = inspection?.modes.harness;
  const live = inspection?.modes.live;

  return {
    fixture: {
      available: true,
      detail: "Deterministic approximation rendered by BB Mate.",
    },
    harness: {
      available: false,
      detail: harness?.available
        ? "The official Harness contract resolves, but BB Mate has no upstream-backed Harness adapter yet."
        : (harness?.detail ?? "Inspecting the official SDK testing contract."),
    },
    live: {
      available: Boolean(live?.available),
      detail: live?.detail ?? "Inspecting native bb.",
    },
  };
}
