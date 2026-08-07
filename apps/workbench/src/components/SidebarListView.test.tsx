import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { threadListFixtures } from "../thread-list-fixtures";
import { SidebarListView } from "./SidebarListView";

describe("SidebarListView", () => {
  test("renders the loading fixture as loading rather than empty", () => {
    const fixture = threadListFixtures.find(({ id }) => id === "loading-empty");

    expect(fixture).toBeDefined();
    const markup = renderToStaticMarkup(
      <SidebarListView model={fixture!.state} />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading threads…");
    expect(markup).not.toContain("No threads");
  });
});
