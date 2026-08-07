import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PluginInspection } from "@bb-mate/inspection";
import { resolveCatalogSelection } from "@/surface-catalog";
import type { WorkbenchState } from "@/workbench-state";
import { MateOverlay } from "./MateOverlay";

afterEach(cleanup);

const state: WorkbenchState = {
  plugin: "workspace",
  surfaceId: "thread-list",
  fixtureId: "agents",
  mode: "fixture",
  theme: "light",
  viewport: "desktop",
};

const inspection: PluginInspection = {
  schemaVersion: 1,
  state: "ready",
  outcome: "ready",
  message: null,
  candidates: [],
  target: null,
  checks: [],
  modes: {
    fixture: { available: true, detail: "Fixture." },
    harness: {
      available: true,
      detail: "Official contract resolves.",
      sdkVersion: "0.4.1",
      resolution: "available",
      publication: "published",
      publishedVersion: "0.4.1",
    },
    live: {
      available: true,
      detail: "Native bb is ready.",
      pluginId: "workspace",
      status: "running",
      sourceKind: "path",
      url: "https://example.getbb.app",
    },
  },
  native: { bbVersion: "0.35.1", connectUrl: null },
  provenance: null,
  trust: {
    model: "full-trust-local-code",
    entrypoints: [],
    skills: [],
    themes: [],
    hasSettings: null,
    capabilities: [],
    services: [],
    undisclosedAccess: [],
    detail: "Local code.",
  },
};

function renderOverlay(
  overrides: Partial<Parameters<typeof MateOverlay>[0]> = {},
) {
  const callbacks = {
    onRefreshInspection: mock(() => {}),
    onPluginChange: mock((_plugin: string | null) => {}),
    onSurfaceChange: mock((_surface: string) => {}),
    onFixtureChange: mock((_fixture: string) => {}),
    onModeChange: mock((_mode: WorkbenchState["mode"]) => {}),
    onThemeChange: mock((_theme: WorkbenchState["theme"]) => {}),
    onViewportChange: mock((_viewport: WorkbenchState["viewport"]) => {}),
  };
  render(
    <MateOverlay
      selection={resolveCatalogSelection("thread-list", "agents")}
      state={state}
      inspection={inspection}
      inspectionError={null}
      selectionError={null}
      workspaceLabel="bb-mate"
      candidates={[
        {
          key: "workspace",
          label: "plugins/workspace",
          displayPath: "plugins/workspace",
        },
        { key: "other", label: "plugins/other", displayPath: "plugins/other" },
      ]}
      selectedKey="workspace"
      handoffs={{
        launchCommand: null,
        checkCommand: null,
        liveCommand: null,
        detail: "Run from the BB Mate repository root.",
      }}
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

describe("MateOverlay interactions", () => {
  test("minimizes, restores focus to the FAB, and reopens from the keyboard", async () => {
    const user = userEvent.setup();
    renderOverlay();

    await user.click(screen.getByRole("button", { name: "Minimize controls" }));
    const trigger = screen.getByRole("button", {
      name: "Show BB Mate controls",
    });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByText("Workbench controls")).toBeNull();

    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Workbench controls")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Workbench controls")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("keeps a plugin named workspace distinct and gates preview modes honestly", async () => {
    const user = userEvent.setup();
    const callbacks = renderOverlay();

    await user.click(
      screen.getByRole("combobox", { name: "Plugin / workspace" }),
    );
    await user.click(screen.getByRole("option", { name: "plugins/other" }));
    expect(callbacks.onPluginChange).toHaveBeenCalledWith("other");

    const harness = screen.getByRole("button", { name: /Harness/ });
    const live = screen.getByRole("button", { name: /Live bb/ });
    expect((harness as HTMLButtonElement).disabled).toBe(true);
    expect((live as HTMLButtonElement).disabled).toBe(false);
    await user.click(live);
    expect(callbacks.onModeChange).toHaveBeenCalledWith("live");
  });

  test("routes theme and viewport controls through one explicit callback", async () => {
    const user = userEvent.setup();
    const callbacks = renderOverlay();

    await user.click(screen.getByRole("button", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "Compact" }));

    expect(callbacks.onThemeChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onThemeChange).toHaveBeenCalledWith("dark");
    expect(callbacks.onViewportChange).toHaveBeenCalledTimes(1);
    expect(callbacks.onViewportChange).toHaveBeenCalledWith("compact");
  });
});
