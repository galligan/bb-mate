import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  Failed,
  HostileVersion,
  Idle,
  Ready,
  Starting,
  Stopping,
  Unavailable,
} from "./workbench-panel.stories";

describe("Plugin Studio visual fixtures", () => {
  test("keeps every finite runtime state deterministic and renderable", () => {
    for (const Story of [
      Idle,
      Starting,
      Ready,
      Stopping,
      Unavailable,
      Failed,
      HostileVersion,
    ]) {
      const html = renderToStaticMarkup(<Story />);
      expect(html).toMatch(/runtime/iu);
      expect(html).toContain("Projects");
      expect(html).not.toContain("Plugin Studio preview");
      expect(html).not.toContain("Workbench");
    }
  });

  test("keeps the hostile fixture inert", () => {
    const html = renderToStaticMarkup(<HostileVersion />);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");
  });
});
