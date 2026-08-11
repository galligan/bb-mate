import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PluginWorkbenchView } from "./workbench-panel";
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
      selectedProjectId=""
      selectedTargetId={null}
      admitting={false}
      selectionMessage={null}
      onProjectChange={() => {}}
      onTargetChange={() => {}}
      onAdmit={() => {}}
      onRefresh={() => {}}
      {...overrides}
    />,
  );
}

describe("Plugin Workbench nav panel", () => {
  test("inherits muted microcopy from the bb host theme", async () => {
    const css = await Bun.file(
      new URL("./workbench-panel.css", import.meta.url),
    ).text();
    expect(css).toContain("--pw-muted: var(--muted-foreground, #6a6f75);");
  });

  test("does not nest a main landmark inside the bb nav panel host", () => {
    expect(render(snapshot())).not.toContain("<main");
  });

  test("renders an explicit project chooser and disables unavailable sources", () => {
    const html = render(snapshot());
    expect(html).toContain('aria-label="Development project"');
    expect(html).toContain("BB Mate");
    expect(html).toContain("Remote — No eligible local source");
    expect(html).not.toContain("Start runtime");
    expect(html).not.toContain("Admit project</button>");

    const selected = render(snapshot(), { selectedProjectId: "project_01" });
    expect(selected).toContain("Admit project</button>");

    const noEligible = render(
      snapshot({
        projects: {
          state: "ready",
          items: [
            { id: "project_02", label: "Remote", admission: "no_source" },
          ],
        },
      }),
    );
    expect(noEligible).toContain(
      "No project has an eligible local development source",
    );
  });

  test("renders unavailable and empty project states", () => {
    const unavailable = render(
      snapshot({ projects: { state: "unavailable", items: [] } }),
    );
    const empty = render(snapshot({ projects: { state: "ready", items: [] } }));
    expect(unavailable).toContain("Project list unavailable");
    expect(unavailable).toContain("Refresh status");
    expect(empty).toContain("No eligible local projects");
    expect(empty).toContain(
      "Open a project with a local source on this machine",
    );
    expect(empty).not.toContain("Create a project in bb");
  });

  test("renders empty, one, many, partial, and unavailable target states", () => {
    const item = {
      id: targetId,
      label: "Plugin Workbench",
      pluginId: "mate",
      revision: 3,
    };
    expect(
      render(snapshot({ targets: { state: "ready", items: [] } }), {
        selectedProjectId: "project_01",
      }),
    ).toContain("No development plugins found in this project");

    const partialEmpty = render(
      snapshot({ targets: { state: "partial", items: [] } }),
      { selectedProjectId: "project_01" },
    );
    expect(partialEmpty).toContain("No development targets could be admitted");
    expect(partialEmpty).not.toContain(
      "No development plugins found in this project",
    );

    const one = render(
      snapshot({ targets: { state: "ready", items: [item] } }),
      { selectedProjectId: "project_01", selectedTargetId: targetId },
    );
    expect(one).toContain('type="radio"');
    expect(one).toContain("Plugin Workbench");
    expect(one).toContain("mate · revision 3");
    expect(one).toContain("checked");

    const many = render(
      snapshot({
        targets: {
          state: "partial",
          items: [
            item,
            {
              id: "0123456789abcdefghijklmnopqrstuv",
              label: "Linear",
              pluginId: "linear",
              revision: 1,
            },
          ],
        },
      }),
      { selectedProjectId: "project_01" },
    );
    expect(many.match(/type="radio"/g)).toHaveLength(2);
    expect(many).toContain("Some development plugins could not be admitted");

    expect(
      render(
        snapshot({
          targets: {
            state: "unavailable",
            reason: "catalog_unavailable",
            items: [],
          },
        }),
        { selectedProjectId: "project_01" },
      ),
    ).toContain("Development targets unavailable");
  });

  test("exposes busy and live states without color-only meaning", () => {
    const html = render(snapshot(), {
      selectedProjectId: "project_01",
      admitting: true,
      selectionMessage: "The target list changed. Choose a target.",
    });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Admitting…");
    expect(html).toContain('role="status"');
    expect(html).toContain("The target list changed. Choose a target.");
  });

  test("keeps browser launch explicitly unavailable", () => {
    const html = render(snapshot());
    expect(html).toContain("Open Workbench");
    expect(html).toContain("disabled");
    expect(html).toContain("Browser launch is unavailable in this build");
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
      { selectedProjectId: "project_01", selectedTargetId: targetId },
    );
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });

  test("keeps callbacks as explicit actions", () => {
    const props = {
      selectedProjectId: "project_01",
      selectedTargetId: null,
      admitting: false,
      selectionMessage: null,
      onProjectChange: mock(() => {}),
      onTargetChange: mock(() => {}),
      onAdmit: mock(() => {}),
      onRefresh: mock(() => {}),
    };
    expect(() => render(snapshot(), props)).not.toThrow();
  });
});
