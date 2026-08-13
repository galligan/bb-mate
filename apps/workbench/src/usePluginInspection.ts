import { useEffect, useState } from "react";

import type { PluginInspection } from "@/plugin-inspection";
import {
  parsePluginSession,
  readBoundedJson,
  type PluginCandidate,
  type PluginHandoffs,
} from "@/plugin-session";
import { isOpaqueTargetId, unavailableTargetMessage } from "@/workbench-state";

export type { PluginCandidate, PluginHandoffs } from "@/plugin-session";

interface InspectionResult {
  inspection: PluginInspection | null;
  error: string | null;
  workspaceLabel: string | null;
  candidates: PluginCandidate[];
  selectedTargetId: string | null;
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

export function pluginSessionUrl(targetId: string | null): string {
  const params = new URLSearchParams();
  if (targetId && isOpaqueTargetId(targetId)) params.set("target", targetId);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `/bb-plugin-studio-session.json${query}`;
}

export function usePluginInspection(
  targetId: string | null,
  callerSelectionError: string | null = null,
): InspectionResult {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<InspectionResult>({
    inspection: null,
    error: null,
    workspaceLabel: null,
    candidates: [],
    selectedTargetId: null,
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
      selectedTargetId: null,
      selectionError: null,
      handoffs: emptyHandoffs,
    }));
    if (callerSelectionError) {
      setResult((current) => ({
        ...current,
        selectionError: callerSelectionError,
      }));
      return () => controller.abort();
    }
    if (targetId && !isOpaqueTargetId(targetId)) {
      setResult((current) => ({
        ...current,
        selectionError: unavailableTargetMessage,
      }));
      return () => controller.abort();
    }
    void fetch(pluginSessionUrl(targetId), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Plugin inspection failed with HTTP ${response.status}`,
          );
        }
        return parsePluginSession(await readBoundedJson(response));
      })
      .then((session) => {
        if (controller.signal.aborted) return;
        setResult((current) => ({
          ...current,
          inspection: session.inspection,
          error: null,
          workspaceLabel: session.workspace.label,
          candidates: session.workspace.candidates,
          selectedTargetId: session.workspace.selectedTargetId,
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
          selectedTargetId: null,
          selectionError: null,
          handoffs: emptyHandoffs,
        }));
      });
    return () => controller.abort();
  }, [callerSelectionError, targetId, revision]);

  return result;
}
