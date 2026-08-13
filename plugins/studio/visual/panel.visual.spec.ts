import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtures = [
  { state: "idle", theme: "light", width: 1120 },
  { state: "failed", theme: "light", width: 1120 },
  { state: "refreshing", theme: "light", width: 1120 },
  { state: "no-projects", theme: "light", width: 1120 },
  { state: "all-projects", theme: "light", width: 1120 },
  { state: "all-projects", theme: "dark", width: 1120 },
  { state: "all-projects", theme: "light", width: 420 },
  { state: "partial", theme: "light", width: 1120 },
  { state: "partial", theme: "dark", width: 1120 },
  { state: "partial", theme: "light", width: 420 },
  { state: "partial-empty", theme: "light", width: 1120 },
  { state: "project-unavailable", theme: "light", width: 1120 },
  { state: "catalog-unavailable", theme: "light", width: 1120 },
  { state: "changed", theme: "light", width: 1120 },
  { state: "hostile", theme: "light", width: 420 },
  { state: "detail", theme: "light", width: 1120 },
  { state: "detail", theme: "dark", width: 1120 },
  { state: "detail-empty", theme: "light", width: 420 },
  { state: "detail-unavailable", theme: "light", width: 1120 },
  { state: "stale-detail", theme: "light", width: 1120 },
] as const;

for (const fixture of fixtures) {
  test(`${fixture.state} ${fixture.theme} ${fixture.width}px panel`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: fixture.width, height: 900 });
    await page.goto(`?state=${fixture.state}&theme=${fixture.theme}`);
    const panel = page.locator("#panel-fixture");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText(/Runtime (idle|ready|stopped|unavailable)/).first(),
    ).toBeVisible();
    await expect(page.locator("main main")).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Open", exact: true }),
    ).toHaveCount(0);
    await expect(panel.locator('[aria-expanded="true"]')).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page })
      .include("#panel-fixture")
      .analyze();
    expect(accessibility.violations).toEqual([]);

    if (fixture.state === "hostile") {
      await expect(panel.locator("img, script")).toHaveCount(0);
      await expect(panel.getByText(/<script>alert\("x"\)/)).toBeVisible();
    }
    if (fixture.state === "all-projects") {
      const targets = panel.getByRole("button", { name: /^Open / });
      await expect(targets).toHaveCount(3);
      await targets.first().focus();
      await expect(targets.first()).toBeFocused();
      await page.keyboard.press("Enter");
    }
    if (fixture.state === "partial") {
      await expect(
        panel.getByText("Project inventory incomplete."),
      ).toBeVisible();
      await expect(
        panel.getByText("Incomplete scan", { exact: true }),
      ).toBeVisible();
    }
    if (fixture.state === "partial-empty") {
      await expect(
        panel.getByText("Project inventory incomplete."),
      ).toHaveCount(0);
      await expect(
        panel.getByText("Incomplete scan", { exact: true }),
      ).toBeVisible();
    }
    if (fixture.width === 420) {
      const horizontallyClipped = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(horizontallyClipped).toBe(false);
    }
    if (fixture.state === "stale-detail") {
      await expect(panel.getByText("Plugin no longer available")).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Back to projects" }),
      ).toBeVisible();
    }

    await expect(panel).toHaveScreenshot(
      `plugin-studio-${fixture.state}-${fixture.theme}-${fixture.width}.png`,
    );
  });
}
