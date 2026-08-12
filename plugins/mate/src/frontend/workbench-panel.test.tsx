import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PluginWorkbenchTargetDetail,
  PluginWorkbenchView,
} from "./workbench-panel";
import type { PluginWorkbenchSnapshot } from "./workbench-snapshot";

const targetId = "abcdefghijklmnopqrstuvwxzy012345";

function snapshot(
  overrides: Partial<PluginWorkbenchSnapshot> = {},
): PluginWorkbenchSnapshot {
  return {
    schemaVersion: 2,
    runtimeState: "ready",
    reason: null,
    runtimeVersion: "0.7.0",
    apiVersion: 2,
    canStart: false,
    browserLaunch: "unavailable",
    projects: {
      state: "ready",
      items: [
        { id: "project_01", label: "BB Mate", admission: "available" },
        { id: "project_02", label: "Remote", admission: "no_source" },
      ],
    },
    targets: { state: "project_not_selected", items: [] },
    ...overrides,
  };
}

function render(
  value: PluginWorkbenchSnapshot,
  overrides: Partial<Parameters<typeof PluginWorkbenchView>[0]> = {},
) {
  return renderToStaticMarkup(
    <PluginWorkbenchView
      snapshot={value}
      openedProjectId={null}
      admittingProjectId={null}
      selectionMessage={null}
      onOpenProject={() => {}}
      onOpenTarget={() => {}}
      onRefresh={() => {}}
      {...overrides}
    />,
  );
}

describe("Plugin Workbench nav panel", () => {
  test("uses only host semantic color classes for its custom styling", async () => {
    const css = await Bun.file(
      new URL("./workbench-panel.css", import.meta.url),
    ).text();
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  test("does not nest a main landmark inside the bb nav panel host", () => {
    expect(render(snapshot())).not.toContain("<main");
  });

  test("uses a compact runtime line and the native icon refresh affordance", () => {
    const html = render(snapshot());
    expect(html).toContain("Runtime ready");
    expect(html).toContain("0.7.0 · API 2");
    expect(html).toContain('aria-label="Reload Workbench data"');
    expect(html).toContain('data-icon="RotateCcw"');
    expect(html).not.toContain('data-native-settings-section="Runtime"');
    expect(html).not.toContain("The supervised runtime passed");
  });

  test("renders projects as the primary objects with Open actions", () => {
    const html = render(snapshot());
    expect(html).toContain("Projects with local sources");
    expect(html).toContain("BB Mate");
    expect(html).toContain("Remote");
    expect(html).toContain("Open</button>");
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("Admit project");
  });

  test("lists detected plugins inside the opened project", () => {
    const html = render(
      snapshot({
        targets: {
          state: "partial",
          items: [
            {
              id: targetId,
              label: "Plugin Workbench",
              pluginId: "mate",
              revision: 3,
            },
          ],
        },
      }),
      { openedProjectId: "project_01" },
    );
    expect(html).toContain("Plugins in BB Mate");
    expect(html).toContain("Plugin Workbench");
    expect(html).toContain("mate · revision 3");
    expect(html).toContain("The project scan was not exhaustive");
    expect(html).toContain("Plugins found within the safety limits are shown");
    expect(html).not.toContain("Some plugins could not be opened");
    expect(html).toContain('aria-label="Open Plugin Workbench"');
  });

  test("gives honest recovery when no local projects are available", () => {
    const empty = render(snapshot({ projects: { state: "ready", items: [] } }));
    expect(empty).toContain("No local projects found");
    expect(empty).toContain(
      "Add a project from bb&#x27;s sidebar, then reload",
    );
  });

  test("keeps reload and open failures visible without an opened project", () => {
    const html = render(snapshot(), {
      selectionMessage: "Project open failed safely. Try again.",
    });

    expect(html).toContain("Project open failed safely. Try again.");
    expect(html).toContain('role="status"');
  });

  test("keeps project-switch failures visible above an opened empty project", () => {
    const html = render(snapshot({ targets: { state: "ready", items: [] } }), {
      openedProjectId: "project_01",
      selectionMessage: "Project open failed safely. Try again.",
    });

    expect(html).toContain("Project open failed safely. Try again.");
    expect(html).toContain('role="status"');
    expect(html).toContain("No development plugins found");
  });

  test("keeps failure, partial-empty, and empty plugin states distinct", () => {
    const unavailable = render(
      snapshot({ projects: { state: "unavailable", items: [] } }),
    );
    expect(unavailable).toContain("Project list unavailable");

    const partialEmpty = render(
      snapshot({ targets: { state: "partial", items: [] } }),
      { openedProjectId: "project_01" },
    );
    expect(partialEmpty).toContain("No plugins could be opened");

    const empty = render(snapshot({ targets: { state: "ready", items: [] } }), {
      openedProjectId: "project_01",
    });
    expect(empty).toContain("No development plugins found");
  });

  test("explains a permanent runtime incompatibility without offering reload", () => {
    const html = render(
      snapshot({
        targets: {
          state: "unavailable",
          reason: "runtime_incompatible",
          items: [],
        },
      }),
      { openedProjectId: "project_01" },
    );

    expect(html).toContain(
      "Update or replace the packaged runtime before opening plugins.",
    );
    expect(html).not.toContain("Reload this project");
  });

  test("shows permanent runtime failure reasons to sighted users", () => {
    const html = render(
      snapshot({
        runtimeState: "unavailable",
        reason: "artifact_invalid",
        runtimeVersion: null,
        apiVersion: null,
        canStart: false,
      }),
    );

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
        projects: {
          state: "ready",
          items: [{ id: "project_01", label: hostile, admission: "available" }],
        },
        targets: {
          state: "ready",
          items: [
            {
              id: targetId,
              label: hostile,
              pluginId: "mate",
              revision: 1,
            },
          ],
        },
      }),
      { openedProjectId: "project_01" },
    );
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });

  test("renders a target detail with Back and project-thread actions", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchTargetDetail
        snapshot={snapshot()}
        busy={false}
        message="Project open failed safely. Try again."
        projectLabel="BB Mate"
        target={{
          id: targetId,
          label: "Plugin Workbench",
          pluginId: "mate",
          revision: 3,
        }}
        threads={[
          { id: "thread_01", title: "Native design pass", updatedAt: 1 },
        ]}
        threadsState="ready"
        onBack={() => {}}
        onOpenThread={() => {}}
        onNewThread={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(html).toContain("Back to projects");
    expect(html).toContain("Plugin Workbench");
    expect(html).toContain("Preview unavailable");
    expect(html).toContain("Native design pass");
    expect(html).toContain("New thread");
    expect(html).toContain("Project open failed safely. Try again.");
  });

  test("disables the detail refresh affordance while reloading", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchTargetDetail
        snapshot={snapshot()}
        busy
        message={null}
        projectLabel="BB Mate"
        target={{
          id: targetId,
          label: "Plugin Workbench",
          pluginId: "mate",
          revision: 3,
        }}
        threads={[]}
        threadsState="ready"
        onBack={() => {}}
        onOpenThread={() => {}}
        onNewThread={() => {}}
        onRefresh={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Reloading Workbench data"');
    expect(html).toContain("disabled");
  });

  test("distinguishes loading and unavailable project-thread states", () => {
    const renderDetail = (threadsState: "loading" | "unavailable") =>
      renderToStaticMarkup(
        <PluginWorkbenchTargetDetail
          snapshot={snapshot()}
          busy={false}
          message={null}
          projectLabel="BB Mate"
          target={{
            id: targetId,
            label: "Plugin Workbench",
            pluginId: "mate",
            revision: 3,
          }}
          threads={[]}
          threadsState={threadsState}
          onBack={() => {}}
          onOpenThread={() => {}}
          onNewThread={() => {}}
          onRefresh={() => {}}
        />,
      );

    expect(renderDetail("loading")).toContain("Loading project threads");
    expect(renderDetail("unavailable")).toContain(
      "Project threads unavailable",
    );
  });

  test("keeps callbacks as explicit actions", () => {
    const props = {
      openedProjectId: "project_01",
      admittingProjectId: null,
      selectionMessage: null,
      onOpenProject: mock(() => {}),
      onOpenTarget: mock(() => {}),
      onRefresh: mock(() => {}),
    };
    expect(() => render(snapshot(), props)).not.toThrow();
  });
});
