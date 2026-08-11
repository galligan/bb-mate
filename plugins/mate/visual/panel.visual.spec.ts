import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtures = [
  { state: "idle", theme: "light" },
  { state: "failed", theme: "light" },
  { state: "admitting", theme: "light" },
  { state: "no-projects", theme: "light" },
  { state: "empty", theme: "light" },
  { state: "single", theme: "light" },
  { state: "multiple", theme: "light" },
  { state: "partial-empty", theme: "light" },
  { state: "partial", theme: "light" },
  { state: "unavailable", theme: "light" },
  { state: "changed", theme: "light" },
  { state: "hostile", theme: "light" },
  { state: "detail", theme: "light" },
  { state: "multiple", theme: "dark" },
] as const;

for (const fixture of fixtures) {
  test(`${fixture.state} ${fixture.theme} panel`, async ({ page }) => {
    await page.goto(`?state=${fixture.state}&theme=${fixture.theme}`);
    const panel = page.locator("#panel-fixture");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText(/Runtime (idle|ready|stopped|unavailable)/).first(),
    ).toBeVisible();
    await expect(page.locator("main main")).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page })
      .include("#panel-fixture")
      .analyze();
    expect(accessibility.violations).toEqual([]);

    if (fixture.state === "hostile") {
      await expect(panel.locator("img, script")).toHaveCount(0);
      await expect(panel.getByText('<script>alert("x")')).toBeVisible();
    }
    if (fixture.state === "multiple") {
      const targets = panel.getByRole("button", { name: /^Open / });
      await expect(targets).toHaveCount(2);
      await targets.first().focus();
      await expect(targets.first()).toBeFocused();
      await page.keyboard.press("Enter");
    }

    await expect(panel).toHaveScreenshot(
      `plugin-workbench-${fixture.state}-${fixture.theme}.png`,
    );
  });
}
