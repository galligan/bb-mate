export interface VisualCase {
  name: string;
  story: string;
  fixture: string;
  theme: "light" | "dark";
  viewport: "desktop" | "compact";
  size: { width: number; height: number };
}

export const visualCases: readonly VisualCase[] = [
  {
    name: "sidebar-composer-light-desktop",
    story: "surfaces--sidebar-thread-list--catalog-fixtures",
    fixture: "agents",
    theme: "light",
    viewport: "desktop",
    size: { width: 1440, height: 900 },
  },
  {
    name: "sidebar-composer-dark-compact",
    story: "surfaces--sidebar-thread-list--catalog-fixtures",
    fixture: "gitbutler",
    theme: "dark",
    viewport: "compact",
    size: { width: 430, height: 860 },
  },
  {
    name: "composer-plugin-surface",
    story: "surfaces--composer-customization--catalog-fixtures",
    fixture: "expanded-draft",
    theme: "light",
    viewport: "desktop",
    size: { width: 1100, height: 760 },
  },
  {
    name: "thread-header-host-action",
    story: "surfaces--thread-header-action--catalog-fixtures",
    fixture: "desktop-thread",
    theme: "dark",
    viewport: "desktop",
    size: { width: 1100, height: 760 },
  },
];

export function storyUrl(item: VisualCase): string {
  const query = new URLSearchParams({
    story: item.story,
    mode: "preview",
    "arg-fixtureId": item.fixture,
    "arg-theme": item.theme,
    "arg-viewport": item.viewport,
  });
  return `/?${query.toString()}`;
}
