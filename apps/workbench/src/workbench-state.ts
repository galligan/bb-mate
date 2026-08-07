import { useCallback, useEffect, useRef, useState } from "react";
import { resolveCatalogSelection, surfaceCatalog } from "@/surface-catalog";

export type PreviewMode = "fixture" | "harness" | "live";
export type PreviewTheme = "light" | "dark";
export type PreviewViewport = "desktop" | "compact";

export interface WorkbenchState {
  plugin: string | null;
  surfaceId: string;
  fixtureId: string;
  mode: PreviewMode;
  theme: PreviewTheme;
  viewport: PreviewViewport;
}

const modes = new Set<PreviewMode>(["fixture", "harness", "live"]);
const themes = new Set<PreviewTheme>(["light", "dark"]);
const viewports = new Set<PreviewViewport>(["desktop", "compact"]);

export function readWorkbenchState(search: string): WorkbenchState {
  const params = new URLSearchParams(search);
  const selection = resolveCatalogSelection(
    params.get("surface") ?? surfaceCatalog[0].id,
    params.get("scenario") ?? "",
  );
  const requestedMode = params.get("mode") as PreviewMode | null;
  const requestedTheme = params.get("theme") as PreviewTheme | null;
  const requestedViewport = params.get("viewport") as PreviewViewport | null;

  return {
    plugin: params.get("plugin") || null,
    surfaceId: selection.surface.id,
    fixtureId: selection.fixture.id,
    mode: requestedMode && modes.has(requestedMode) ? requestedMode : "fixture",
    theme:
      requestedTheme && themes.has(requestedTheme) ? requestedTheme : "light",
    viewport:
      requestedViewport && viewports.has(requestedViewport)
        ? requestedViewport
        : "desktop",
  };
}

export function writeWorkbenchState(
  state: WorkbenchState,
  existingSearch = "",
): string {
  const params = new URLSearchParams(existingSearch);
  for (const key of [
    "plugin",
    "surface",
    "scenario",
    "mode",
    "theme",
    "viewport",
  ]) {
    params.delete(key);
  }
  if (state.plugin) params.set("plugin", state.plugin);
  params.set("surface", state.surfaceId);
  params.set("scenario", state.fixtureId);
  params.set("mode", state.mode);
  params.set("theme", state.theme);
  params.set("viewport", state.viewport);
  return `?${params.toString()}`;
}

function browserState(): WorkbenchState {
  return readWorkbenchState(window.location.search);
}

interface WorkbenchLocation {
  pathname: string;
  search: string;
  hash: string;
}

interface WorkbenchHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export function commitWorkbenchState(
  current: WorkbenchState,
  patch: Partial<WorkbenchState>,
  location: WorkbenchLocation,
  history: WorkbenchHistory,
  options: { replace?: boolean } = {},
): WorkbenchState {
  const next = readWorkbenchState(
    writeWorkbenchState({ ...current, ...patch }),
  );
  history[options.replace ? "replaceState" : "pushState"](
    null,
    "",
    `${location.pathname}${writeWorkbenchState(next, location.search)}${location.hash}`,
  );
  return next;
}

export function useWorkbenchState() {
  const [state, setState] = useState(browserState);
  const stateRef = useRef(state);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${writeWorkbenchState(browserState(), window.location.search)}${window.location.hash}`,
    );
    const onPopState = () => {
      const next = browserState();
      stateRef.current = next;
      setState(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const update = useCallback(
    (patch: Partial<WorkbenchState>, options: { replace?: boolean } = {}) => {
      const next = commitWorkbenchState(
        stateRef.current,
        patch,
        window.location,
        window.history,
        options,
      );
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  return { state, update };
}
