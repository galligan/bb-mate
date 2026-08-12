import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PluginWorkbenchMissingTarget,
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
} from "./workbench-panel";
import type {
  PluginWorkbenchSnapshot,
  ProjectOption,
} from "./workbench-snapshot";

const target = {
  id: "abcdefghijklmnopqrstuvwxzy012345",
  label: "Plugin Studio",
  pluginId: "mate",
  revision: 3,
} as const;

function project(
  overrides: Partial<ProjectOption> & Pick<ProjectOption, "id" | "label">,
): ProjectOption {
  return {
    activity: { active: false, lastThreadUpdatedAt: null },
    scan: { state: "ready", items: [] },
    ...overrides,
  };
}

function snapshot(
  projects:
    | { state: "unavailable"; items: [] }
    | {
        state: "ready" | "partial";
        truncated?: boolean;
        items: ProjectOption[];
      } = {
    state: "ready",
    items: [
      project({
        id: "project_01",
        label: "bb Plugin Studio",
        activity: { active: true, lastThreadUpdatedAt: 20 },
        scan: { state: "ready", items: [target] },
      }),
      project({ id: "project_02", label: "Empty" }),
    ],
  },
): PluginWorkbenchSnapshot {
  return {
    schemaVersion: 3,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.7.0",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects:
      projects.state === "unavailable"
        ? projects
        : { ...projects, truncated: projects.truncated ?? false },
  };
}

function render(
  value: PluginWorkbenchSnapshot,
  overrides: Partial<Parameters<typeof PluginWorkbenchView>[0]> = {},
) {
  return renderToStaticMarkup(
    <PluginWorkbenchView
      snapshot={value}
      refreshing={false}
      catalogMessage={null}
      onOpenTarget={() => {}}
      onRefresh={() => {}}
      {...overrides}
    />,
  );
}

describe("Plugin Studio nav panel", () => {
  test("uses host semantic styling, one scroll owner, and compact runtime refresh", async () => {
    const css = await Bun.file(
      new URL("./workbench-panel.css", import.meta.url),
    ).text();
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(css).toContain("prefers-reduced-motion: reduce");
    const html = render(snapshot());
    expect(html).not.toContain("<main");
    expect(html).toContain("Runtime ready");
    expect(html).toContain("0.7.0 · API 2");
    expect(html).toContain('aria-label="Reload Plugin Studio data"');
    expect(html).not.toContain("Workbench");
    expect(html).toContain('data-icon="RotateCcw"');
  });

  test("renders every project and plugin expanded without project controls", () => {
    const html = render(snapshot());
    expect(html).toContain("Development plugins in bb projects");
    expect(html).toContain("bb Plugin Studio");
    expect(html).toContain("Empty");
    expect(html).toContain("Plugin Studio");
    expect(html).toContain("mate · revision 3");
    expect(html).toContain("No development plugins found.");
    expect(html).toContain("Active");
    expect(html).toContain(
      'aria-label="Open Plugin Studio in bb Plugin Studio"',
    );
    expect(html).not.toContain("Open</button>");
    expect(html).not.toContain("Refresh</button>");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("Admit");
  });

  test("orders active then recent projects without filtering idle projects", () => {
    const html = render(
      snapshot({
        state: "ready",
        items: [
          project({ id: "idle", label: "Idle" }),
          project({
            id: "recent",
            label: "Recent",
            activity: { active: false, lastThreadUpdatedAt: 20 },
          }),
          project({
            id: "active",
            label: "Active Project",
            activity: { active: true, lastThreadUpdatedAt: 1 },
          }),
        ],
      }),
    );
    expect(html.indexOf("Active Project")).toBeLessThan(html.indexOf("Recent"));
    expect(html.indexOf("Recent")).toBeLessThan(html.indexOf("Idle"));
    expect(html).toContain("Idle");
  });

  test("preserves backend project order when activity and recency tie", () => {
    const html = render(
      snapshot({
        state: "ready",
        items: [
          project({ id: "zulu", label: "Zulu Project" }),
          project({ id: "alpha", label: "Alpha Project" }),
        ],
      }),
    );

    expect(html.indexOf("Zulu Project")).toBeLessThan(
      html.indexOf("Alpha Project"),
    );
  });

  test("includes project context in duplicate plugin accessible names", () => {
    const html = render(
      snapshot({
        state: "ready",
        items: [
          project({
            id: "project_a",
            label: "Project A",
            scan: { state: "ready", items: [target] },
          }),
          project({
            id: "project_b",
            label: "Project B",
            scan: { state: "ready", items: [target] },
          }),
        ],
      }),
    );
    expect(html).toContain('aria-label="Open Plugin Studio in Project A"');
    expect(html).toContain('aria-label="Open Plugin Studio in Project B"');
  });

  test("keeps partial, partial-empty, unavailable, and unscanned projects quiet and distinct", () => {
    const html = render(
      snapshot({
        state: "partial",
        items: [
          project({
            id: "partial_results",
            label: "Partial results",
            scan: { state: "partial", items: [target] },
          }),
          project({
            id: "partial_empty",
            label: "Partial empty",
            scan: { state: "partial", items: [] },
          }),
          project({
            id: "changed",
            label: "Changed",
            scan: {
              state: "unavailable",
              reason: "source_changed",
              items: [],
            },
          }),
          project({
            id: "capacity",
            label: "Capacity",
            scan: {
              state: "unavailable",
              reason: "capacity_reached",
              items: [],
            },
          }),
          project({
            id: "pending",
            label: "Pending",
            scan: { state: "not_scanned", items: [] },
          }),
        ],
      }),
    );
    expect(html).toContain("Scan incomplete. Available plugins are shown.");
    expect(html).toContain(
      "Scan incomplete. No plugins were found within the safety limits.",
    );
    expect(html).toContain("The project changed during scanning.");
    expect(html).toContain("The shared scan limit was reached");
    expect(html).toContain("Finding development plugins…");
    expect(html).not.toContain("Project inventory incomplete");
    expect(html).not.toContain("Some plugins could not be opened");
  });

  test("surfaces an incomplete project inventory when every visible scan is ready", () => {
    const html = render(
      snapshot({
        state: "partial",
        truncated: true,
        items: [
          project({ id: "project_a", label: "Project A" }),
          project({ id: "project_b", label: "Project B" }),
        ],
      }),
    );

    expect(html).toContain("Project inventory incomplete");
    expect(html).toContain("Some bb projects may not be shown.");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Incomplete scan");
  });

  test("keeps inventory truncation and project scan warnings independently visible", () => {
    const html = render(
      snapshot({
        state: "partial",
        truncated: true,
        items: [
          project({
            id: "project_a",
            label: "Project A",
            scan: { state: "partial", items: [target] },
          }),
        ],
      }),
    );

    expect(html).toContain("Project inventory incomplete");
    expect(html).toContain("Incomplete scan");
    expect(html).toContain("Scan incomplete. Available plugins are shown.");
  });

  test("renders honest global unavailable, empty, reload failure, and busy states", () => {
    expect(render(snapshot({ state: "unavailable", items: [] }))).toContain(
      "Project list unavailable",
    );
    expect(render(snapshot({ state: "ready", items: [] }))).toContain(
      "No local projects found",
    );
    const message = render(snapshot(), {
      catalogMessage: "Plugin Studio reload failed safely. Try again.",
    });
    expect(message).toContain("Plugin Studio reload failed safely. Try again.");
    const busy = render(snapshot(), { refreshing: true });
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('aria-label="Reloading Plugin Studio data"');
  });

  test("shows permanent runtime failure reasons to sighted users", () => {
    const html = render({
      ...snapshot(),
      runtimeState: "unavailable",
      reason: "artifact_invalid",
      runtimeVersion: null,
      apiVersion: null,
      canStart: false,
    });

    expect(html).toContain(
      "The packaged runtime did not pass integrity checks.",
    );
    expect(html).not.toContain(
      'class="sr-only">The packaged runtime did not pass integrity checks.',
    );
  });

  test("renders hostile labels inertly", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const html = render(
      snapshot({
        state: "ready",
        items: [
          project({
            id: "project_01",
            label: hostile,
            scan: {
              state: "ready",
              items: [{ ...target, label: hostile }],
            },
          }),
        ],
      }),
    );
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });

  test("renders target detail task states and keeps refresh busy visible", () => {
    const detail = (state: "loading" | "unavailable" | "ready") =>
      renderToStaticMarkup(
        <PluginWorkbenchTargetDetail
          snapshot={snapshot()}
          projectLabel="bb Plugin Studio"
          target={target}
          threads={
            state === "ready"
              ? {
                  state,
                  items: [
                    { id: "thread_01", title: "Native design", updatedAt: 1 },
                  ],
                }
              : { state, items: [] }
          }
          refreshing
          catalogMessage="Plugin Studio reload failed safely. Try again."
          onBack={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
          onRefresh={() => {}}
        />,
      );
    expect(detail("ready")).toContain("Back to projects");
    expect(detail("ready")).toContain("Native design");
    expect(detail("ready")).toContain("New task");
    expect(detail("ready")).toContain(
      'aria-label="Reloading Plugin Studio data"',
    );
    expect(detail("ready")).toContain("Plugin Studio reload failed safely");
    expect(detail("ready")).not.toContain("Workbench");
    expect(detail("loading")).toContain('aria-live="polite" aria-busy="true"');
    expect(detail("loading")).toContain("Loading project tasks…");
    expect(detail("unavailable")).toContain(
      'aria-live="polite" aria-busy="false"',
    );
    expect(detail("unavailable")).toContain("Project tasks unavailable.");
  });

  test("gives stale detail routes finite Back and reload recovery", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchMissingTarget
        snapshot={snapshot()}
        refreshing={false}
        catalogMessage={null}
        reason="removed"
        onBack={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("Plugin no longer available");
    expect(html).toContain("Back to projects");
    expect(html).toContain("Reload Plugin Studio data");
    expect(html).not.toContain("Workbench");
  });

  test("keeps callbacks explicit", () => {
    expect(() =>
      render(snapshot(), {
        onOpenTarget: mock(() => {}),
        onRefresh: mock(() => {}),
      }),
    ).not.toThrow();
  });
});
