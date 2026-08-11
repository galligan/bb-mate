import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PluginWorkbenchView } from "./workbench-panel";
import type { PluginWorkbenchSnapshot } from "./workbench-snapshot";

function snapshot(
  runtimeState: PluginWorkbenchSnapshot["runtimeState"],
  overrides: Partial<PluginWorkbenchSnapshot> = {},
): PluginWorkbenchSnapshot {
  const failed = runtimeState === "failed";
  const unavailable = runtimeState === "unavailable";
  return {
    schemaVersion: 1,
    runtimeState,
    reason: failed ? "startup_failed" : unavailable ? "artifact_missing" : null,
    runtimeVersion: runtimeState === "ready" ? "0.6.0" : null,
    apiVersion: runtimeState === "ready" ? 1 : null,
    canStart: runtimeState === "idle" || failed,
    browserLaunch: "unavailable",
    targets: "unavailable_pending_runtime_admission",
    ...overrides,
  };
}

describe("Plugin Workbench nav panel", () => {
  test("inherits muted microcopy from the bb host theme", async () => {
    const css = await Bun.file(
      new URL("./workbench-panel.css", import.meta.url),
    ).text();

    expect(css).toContain("--pw-muted: var(--muted-foreground, #6a6f75);");
  });

  test("does not nest a main landmark inside the bb nav panel host", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchView snapshot={snapshot("idle")} onDemand={() => {}} />,
    );

    expect(html).not.toContain("<main");
  });

  test("renders every finite supervisor state with an actionable status", () => {
    for (const [state, copy] of [
      ["idle", "Runtime idle"],
      ["starting", "Starting runtime"],
      ["ready", "Runtime ready"],
      ["stopping", "Stopping runtime"],
      ["unavailable", "Runtime unavailable"],
      ["failed", "Runtime stopped"],
    ] as const) {
      const html = renderToStaticMarkup(
        <PluginWorkbenchView snapshot={snapshot(state)} onDemand={() => {}} />,
      );
      expect(html).toContain(copy);
      expect(html).toContain('aria-live="polite"');
    }
  });

  test("offers explicit Start and Retry demand only when allowed", () => {
    const start = renderToStaticMarkup(
      <PluginWorkbenchView
        snapshot={snapshot("idle")}
        onDemand={mock(() => {})}
      />,
    );
    const retry = renderToStaticMarkup(
      <PluginWorkbenchView
        snapshot={snapshot("failed")}
        onDemand={mock(() => {})}
      />,
    );
    const ready = renderToStaticMarkup(
      <PluginWorkbenchView
        snapshot={snapshot("ready")}
        onDemand={mock(() => {})}
      />,
    );

    expect(start).toContain("Start runtime");
    expect(retry).toContain("Retry runtime");
    expect(ready).not.toContain("Start runtime");
    expect(ready).not.toContain("Retry runtime");
  });

  test("keeps browser launch and target discovery explicitly unavailable", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchView snapshot={snapshot("ready")} onDemand={() => {}} />,
    );

    expect(html).toContain("Open Workbench");
    expect(html).toContain("disabled");
    expect(html).toContain("Target discovery is not connected yet");
    expect(html).toContain("Source-first admission lands next");
  });

  test("renders hostile version text inertly", () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const html = renderToStaticMarkup(
      <PluginWorkbenchView
        snapshot={snapshot("ready", { runtimeVersion: hostile })}
        onDemand={() => {}}
      />,
    );

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });
});
