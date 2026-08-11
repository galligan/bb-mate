import { expect, test, type Page } from "@playwright/test";
import { storyUrl, visualCases } from "./visual-matrix";

async function settleFixture(page: Page, selector: string): Promise<void> {
  await page.locator(selector).waitFor({ state: "visible" });
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

for (const item of visualCases) {
  test(`fixture visual: ${item.name}`, async ({ page }) => {
    await page.setViewportSize(item.size);
    await page.goto(storyUrl(item));
    await settleFixture(page, ".surface-lab-theme");

    await expect(page).toHaveScreenshot(`${item.name}.png`, {
      fullPage: true,
    });
  });
}

test("Mate overlay and minimized FAB remain visually stable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:5173");
  await settleFixture(page, ".mate-popover");
  await expect(page.getByText("Example", { exact: true })).toBeVisible();

  await expect(page).toHaveScreenshot("mate-overlay-open.png", {
    fullPage: true,
  });

  await page.getByRole("button", { name: "Minimize controls" }).click();
  await expect(
    page.getByRole("button", { name: "Show bb Plugin Studio controls" }),
  ).toBeFocused();
  await expect(page).toHaveScreenshot("mate-overlay-minimized.png", {
    fullPage: true,
  });
});

test("sidebar and composer measured geometry stays explicit", async ({
  page,
}) => {
  const item = visualCases[0];
  await page.setViewportSize(item.size);
  await page.goto(storyUrl(item));
  await settleFixture(page, ".surface-lab-theme");

  const geometry = await page.locator(".bb-app").evaluate((app) => {
    const rootStyle = getComputedStyle(app);
    const rect = (selector: string) => {
      const element = app.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing measured element: ${selector}`);
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, top: bounds.top };
    };

    return {
      tokens: {
        sidebarWidth: rootStyle.getPropertyValue("--bb-sidebar-width").trim(),
        rowHeight: rootStyle.getPropertyValue("--bb-sidebar-row-height").trim(),
      },
      sidebar: rect(".bb-sidebar"),
      chrome: rect(".bb-sidebar-chrome"),
      row: rect(".bb-sidebar-row"),
      composer: rect(".bb-composer"),
      composerWrap: rect(".bb-compose-wrap"),
    };
  });

  expect(geometry).toEqual({
    tokens: { sidebarWidth: "320px", rowHeight: "1.75rem" },
    sidebar: { width: 320, height: 900, top: 0 },
    chrome: { width: 319, height: 48, top: 0 },
    row: { width: 303, height: 28, top: 56 },
    composer: { width: 796, height: 128, top: 70 },
    composerWrap: { width: 796, height: 830, top: 70 },
  });
});
