import { useEffect, useMemo } from "react";
import { StudioOverlay } from "@/components/StudioOverlay";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { previewModeCapabilities } from "@/preview-mode";
import { resolveCatalogSelection } from "@/surface-catalog";
import { usePluginInspection } from "@/usePluginInspection";
import { automaticTargetId, useWorkbenchState } from "@/workbench-state";

export function App() {
  const { state, update } = useWorkbenchState();
  const selection = resolveCatalogSelection(state.surfaceId, state.fixtureId);
  const inspection = usePluginInspection(state.targetId, state.selectionError);
  const modeCapabilities = useMemo(
    () => previewModeCapabilities(inspection.inspection),
    [inspection.inspection],
  );
  const renderedMode = modeCapabilities[state.mode].available
    ? state.mode
    : "fixture";

  useEffect(() => {
    const targetId = automaticTargetId(
      state.targetId,
      state.selectionError ?? inspection.selectionError,
      inspection.candidates.length,
      inspection.selectedTargetId,
    );
    if (targetId) {
      update({ targetId }, { replace: true });
    }
  }, [
    inspection.candidates.length,
    inspection.selectionError,
    inspection.selectedTargetId,
    state.selectionError,
    state.targetId,
    update,
  ]);

  useEffect(() => {
    if (
      (inspection.inspection || inspection.error) &&
      !modeCapabilities[state.mode].available
    ) {
      update({ mode: "fixture" }, { replace: true });
    }
  }, [
    inspection.error,
    inspection.inspection,
    modeCapabilities,
    state.mode,
    update,
  ]);

  return (
    <>
      <PreviewCanvas
        selection={selection}
        mode={renderedMode}
        theme={state.theme}
        viewport={state.viewport}
      />
      <StudioOverlay
        selection={selection}
        state={state}
        inspection={inspection.inspection}
        inspectionError={inspection.error}
        selectionError={state.selectionError ?? inspection.selectionError}
        workspaceLabel={inspection.workspaceLabel}
        candidates={inspection.candidates}
        selectedTargetId={inspection.selectedTargetId}
        handoffs={inspection.handoffs}
        onRefreshInspection={inspection.refresh}
        onTargetChange={(targetId) => update({ targetId, mode: "fixture" })}
        onSurfaceChange={(nextSurfaceId) => {
          const next = resolveCatalogSelection(nextSurfaceId, "");
          update({
            surfaceId: next.surface.id,
            fixtureId: next.fixture.id,
          });
        }}
        onFixtureChange={(fixtureId) => update({ fixtureId })}
        onModeChange={(mode) => update({ mode })}
        onThemeChange={(theme) => update({ theme })}
        onViewportChange={(viewport) => update({ viewport })}
      />
    </>
  );
}
