import { useEffect, useMemo } from "react";
import { MateOverlay } from "@/components/MateOverlay";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { previewModeCapabilities } from "@/preview-mode";
import { resolveCatalogSelection } from "@/surface-catalog";
import { usePluginInspection } from "@/usePluginInspection";
import { useWorkbenchState } from "@/workbench-state";

export function App() {
  const { state, update } = useWorkbenchState();
  const selection = resolveCatalogSelection(state.surfaceId, state.fixtureId);
  const inspection = usePluginInspection(state.plugin);
  const modeCapabilities = useMemo(
    () => previewModeCapabilities(inspection.inspection),
    [inspection.inspection],
  );
  const renderedMode = modeCapabilities[state.mode].available
    ? state.mode
    : "fixture";

  useEffect(() => {
    if (inspection.selectionError) {
      update({ plugin: inspection.selectedKey }, { replace: true });
    } else if (
      !state.plugin &&
      inspection.selectedKey &&
      inspection.candidates.length === 1
    ) {
      update({ plugin: inspection.selectedKey }, { replace: true });
    }
  }, [
    inspection.candidates.length,
    inspection.selectionError,
    inspection.selectedKey,
    state.plugin,
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
      <MateOverlay
        selection={selection}
        state={state}
        inspection={inspection.inspection}
        inspectionError={inspection.error}
        selectionError={inspection.selectionError}
        workspaceLabel={inspection.workspaceLabel}
        candidates={inspection.candidates}
        selectedKey={inspection.selectedKey}
        handoffs={inspection.handoffs}
        onRefreshInspection={inspection.refresh}
        onPluginChange={(plugin) => update({ plugin, mode: "fixture" })}
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
