import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PluginInspection } from "@bb-plugin-studio/inspection";
import { StudioOverlay } from "@/components/StudioOverlay";
import { PreviewCanvas } from "@/components/PreviewCanvas";
import { resolveCatalogSelection } from "@/surface-catalog";
import type { WorkbenchState } from "@/workbench-state";
import "@/styles.css";

const inspection: PluginInspection = {
  schemaVersion: 1,
  state: "ready",
  outcome: "ready",
  message: null,
  candidates: [],
  target: {
    rootPath: "/fixture/plugins/example",
    displayPath: "plugins/example",
    packageName: "bb-plugin-example",
    displayName: "Example",
    version: "0.1.0",
    serverEntry: "server.ts",
    appEntry: null,
    engines: { bb: ">=0.35.1", pluginSdk: null },
    build: { server: null, app: null },
  },
  checks: [
    {
      id: "fixture.contract",
      status: "pass",
      summary: "Deterministic fixture contract ready.",
    },
  ],
  modes: {
    fixture: { available: true, detail: "Deterministic approximation." },
    harness: {
      available: false,
      detail: "This deterministic example is headless.",
      sdkVersion: null,
      resolution: "headless",
      publication: "not-applicable",
      publishedVersion: null,
    },
    live: {
      available: false,
      detail: "This deterministic example has no frontend target.",
      pluginId: null,
      status: null,
      sourceKind: "path",
      url: null,
    },
  },
  native: { bbVersion: null, connectUrl: null },
  provenance: {
    kind: "path",
    requested: "plugins/example",
    resolved: "plugins/example",
    registry: null,
  },
  trust: {
    model: "full-trust-local-code",
    entrypoints: ["server.ts"],
    skills: [],
    themes: [],
    hasSettings: false,
    capabilities: [],
    services: [],
    undisclosedAccess: [],
    detail: "Deterministic example metadata declares no external access.",
  },
};

const exampleTargetId = "e".repeat(32);

const initialState: WorkbenchState = {
  targetId: exampleTargetId,
  selectionError: null,
  surfaceId: "thread-list",
  fixtureId: "agents",
  mode: "fixture",
  theme: "light",
  viewport: "desktop",
};

function Harness() {
  const [state, setState] = useState(initialState);
  const selection = resolveCatalogSelection(state.surfaceId, state.fixtureId);
  const update = (patch: Partial<WorkbenchState>) =>
    setState((current) => ({ ...current, ...patch }));

  return (
    <>
      <PreviewCanvas
        selection={selection}
        mode="fixture"
        theme={state.theme}
        viewport={state.viewport}
      />
      <StudioOverlay
        selection={selection}
        state={state}
        inspection={inspection}
        inspectionError={null}
        selectionError={null}
        workspaceLabel="fixture-workspace"
        candidates={[
          {
            id: exampleTargetId,
            label: "plugins/example",
            displayPath: "plugins/example",
          },
        ]}
        selectedTargetId={exampleTargetId}
        handoffs={{
          launchCommand: "bun run bb-plugin-studio plugins/example",
          checkCommand: "bun run bb-plugin-studio check plugins/example",
          liveCommand: null,
          detail: "Deterministic copy-only commands for visual coverage.",
        }}
        onRefreshInspection={() => {}}
        onTargetChange={(targetId) => update({ targetId, mode: "fixture" })}
        onSurfaceChange={(surfaceId) => {
          const next = resolveCatalogSelection(surfaceId, "");
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

const root = document.getElementById("root");
if (!root) throw new Error("Missing visual harness root");
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
