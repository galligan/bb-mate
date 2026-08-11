import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PluginWorkbenchBoundary } from "./workbench-boundary";

describe("Plugin Workbench frontend boundary", () => {
  test("does not confuse a status fetch with runtime startup", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchBoundary state="pending" onRetry={() => {}} />,
    );

    expect(html).toContain("Checking runtime status");
    expect(html).not.toContain("Starting runtime");
    expect(html).not.toContain("Check again");
    expect(html).not.toContain("<main");
  });

  test("contains transport and decoding failures without echoing details", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchBoundary state="failed" onRetry={() => {}} />,
    );

    expect(html).toContain("Runtime status unavailable");
    expect(html).toContain("No server details were exposed");
    expect(html).toContain("Check again");
  });
});
