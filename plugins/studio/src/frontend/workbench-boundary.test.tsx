import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PluginWorkbenchBoundary } from "./workbench-boundary";

describe("Plugin Studio frontend boundary", () => {
  test("does not confuse a status fetch with runtime startup", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchBoundary state="pending" onRetry={() => {}} />,
    );

    expect(html).toContain("Finding development plugins");
    expect(html).not.toContain("Starting runtime");
    expect(html).not.toContain("Check again");
    expect(html).not.toContain("admitted");
    expect(html).not.toContain("<main");
  });

  test("contains transport and decoding failures without echoing details", () => {
    const html = renderToStaticMarkup(
      <PluginWorkbenchBoundary state="failed" onRetry={() => {}} />,
    );

    expect(html).toContain("Plugin Studio unavailable");
    expect(html).not.toContain("Workbench");
    expect(html).toContain("No server details were exposed");
    expect(html).toContain("Check again");
  });
});
