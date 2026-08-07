import { useEffect, useState } from "react";
import type { PluginInspection } from "@/plugin-inspection";

export interface PluginCandidate {
  key: string;
  label: string;
  displayPath: string;
}

export interface PluginHandoffs {
  launchCommand: string | null;
  checkCommand: string | null;
  liveCommand: string | null;
  detail: string;
}

interface PluginSession {
  schemaVersion: 1;
  workspace: {
    label: string;
    candidates: PluginCandidate[];
    selectedKey: string | null;
    selectionError: string | null;
  };
  inspection: PluginInspection;
  handoffs: PluginHandoffs;
}

interface InspectionResult {
  inspection: PluginInspection | null;
  error: string | null;
  workspaceLabel: string | null;
  candidates: PluginCandidate[];
  selectedKey: string | null;
  selectionError: string | null;
  handoffs: PluginHandoffs;
  refresh(): void;
}

const emptyHandoffs: PluginHandoffs = {
  launchCommand: null,
  checkCommand: null,
  liveCommand: null,
  detail: "Choose a discovered plugin before using terminal handoffs.",
};

export function pluginSessionUrl(plugin: string | null): string {
  const params = new URLSearchParams();
  if (plugin) params.set("plugin", plugin);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `/bb-mate-session.json${query}`;
}

export function usePluginInspection(plugin: string | null): InspectionResult {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<InspectionResult>({
    inspection: null,
    error: null,
    workspaceLabel: null,
    candidates: [],
    selectedKey: null,
    selectionError: null,
    handoffs: emptyHandoffs,
    refresh: () => setRevision((value) => value + 1),
  });

  useEffect(() => {
    const controller = new AbortController();
    setResult((current) => ({
      ...current,
      inspection: null,
      error: null,
      candidates: [],
      selectedKey: null,
      selectionError: null,
      handoffs: emptyHandoffs,
    }));
    void fetch(pluginSessionUrl(plugin), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Plugin inspection failed with HTTP ${response.status}`,
          );
        }
        return (await response.json()) as PluginSession;
      })
      .then((session) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({
          ...current,
          inspection: session.inspection,
          error: null,
          workspaceLabel: session.workspace.label,
          candidates: session.workspace.candidates,
          selectedKey: session.workspace.selectedKey,
          selectionError: session.workspace.selectionError,
          handoffs: session.handoffs,
        }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({
          ...current,
          inspection: null,
          error: error instanceof Error ? error.message : String(error),
          candidates: [],
          selectedKey: null,
          selectionError: null,
          handoffs: emptyHandoffs,
        }));
      });
    return () => controller.abort();
  }, [plugin, revision]);

  return result;
}
