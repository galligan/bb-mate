import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { storyUrl, visualCases } from "./visual-matrix";

const sidebarStory = storyUrl(visualCases[0]);

async function settle(page: Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible" });
  await page.evaluate(async () => document.fonts.ready);
}

async function expectNoAxeViolations(
  page: Page,
  include: string,
): Promise<void> {
  const results = await new AxeBuilder({ page }).include(include).analyze();
  expect(results.violations).toEqual([]);
}

async function activeControl(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return null;
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      label: element.getAttribute("aria-label") ?? element.textContent?.trim(),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
}

for (const item of visualCases) {
  test(`axe: ${item.name}`, async ({ page }) => {
    await page.setViewportSize(item.size);
    await page.goto(storyUrl(item));
    await settle(page, ".surface-lab-theme");
    await expectNoAxeViolations(page, ".surface-lab-theme");
  });
}

test("keyboard traverses multiple labeled controls with visible focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sidebarStory);
  await settle(page, ".surface-lab-theme");

  const labels: Array<string | undefined> = [];
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await activeControl(page);
    expect(focus?.tag).toBe("BUTTON");
    expect(focus?.label).toBeTruthy();
    expect(
      focus?.outlineStyle !== "none" ||
        focus?.outlineWidth !== "0px" ||
        focus?.boxShadow !== "none",
    ).toBe(true);
    labels.push(focus?.label);
  }
  expect(labels).toEqual([
    "Hide sidebar",
    "Go back",
    "Go forward",
    "New thread",
    "Extensions",
    "Automations",
  ]);
});

test("Mate overlay and minimized FAB pass axe and restore focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173");
  await settle(page, ".mate-popover");
  await expectNoAxeViolations(page, ".mate-popover");

  await page.keyboard.press("Escape");
  const fab = page.getByRole("button", { name: "Show BB Mate controls" });
  await expect(fab).toBeVisible();
  await expect(fab).toBeFocused();
  await expect(fab).toHaveAttribute("aria-haspopup", "dialog");
  await expectNoAxeViolations(page, ".mate-overlay");

  await fab.press("Enter");
  await expect(page.locator(".mate-popover")).toBeVisible();

  const traversed = new Set<string>();
  const initialFocus = await activeControl(page);
  expect(initialFocus?.label).toBe("Minimize controls");
  traversed.add(initialFocus?.label ?? "");
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await activeControl(page);
    expect(focus?.label).toBeTruthy();
    expect(
      focus?.outlineStyle !== "none" ||
        focus?.outlineWidth !== "0px" ||
        focus?.boxShadow !== "none",
    ).toBe(true);
    if (focus?.label) traversed.add(focus.label);
  }
  expect(traversed.size).toBeGreaterThanOrEqual(4);
  expect(traversed).toContain("Minimize controls");
});

test("reduced-motion preference collapses transitions and animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(sidebarStory);
  await settle(page, ".surface-lab-theme");

  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const durations = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.animationDuration = "1s";
    probe.style.scrollBehavior = "smooth";
    probe.style.transitionDuration = "1s";
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const values = {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
      scrollBehavior: style.scrollBehavior,
    };
    probe.remove();
    return values;
  });
  expect(Number.parseFloat(durations.animationDuration)).toBeLessThanOrEqual(
    0.00001,
  );
  expect(Number.parseFloat(durations.transitionDuration)).toBeLessThanOrEqual(
    0.00001,
  );
  expect(durations.scrollBehavior).toBe("auto");
});

test("static story metadata covers every catalog surface", async ({
  request,
}) => {
  const response = await request.get("/meta.json");
  expect(response.ok()).toBe(true);
  const metadata = (await response.json()) as {
    stories: Record<string, unknown>;
  };
  expect(Object.keys(metadata.stories).sort()).toEqual([
    "surfaces--composer-customization--catalog-fixtures",
    "surfaces--content-script-lifecycle--catalog-fixtures",
    "surfaces--file-opener--catalog-fixtures",
    "surfaces--homepage-section--catalog-fixtures",
    "surfaces--message-action--catalog-fixtures",
    "surfaces--message-directive--catalog-fixtures",
    "surfaces--navigation-panel--catalog-fixtures",
    "surfaces--pending-interaction--catalog-fixtures",
    "surfaces--settings-section--catalog-fixtures",
    "surfaces--sidebar-footer-action--catalog-fixtures",
    "surfaces--sidebar-thread-list--catalog-fixtures",
    "surfaces--thread-header-action--catalog-fixtures",
    "surfaces--thread-panel-action--catalog-fixtures",
  ]);
});
