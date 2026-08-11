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
  { state: "partial", theme: "light" },
  { state: "unavailable", theme: "light" },
  { state: "changed", theme: "light" },
  { state: "hostile", theme: "light" },
  { state: "multiple", theme: "dark" },
] as const;

for (const fixture of fixtures) {
  test(`${fixture.state} ${fixture.theme} panel`, async ({ page }) => {
    await page.goto(`?state=${fixture.state}&theme=${fixture.theme}`);
    const panel = page.locator("#panel-fixture");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Supervised runtime", { exact: true }),
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
      const radios = panel.getByRole("radio");
      await expect(radios).toHaveCount(2);
      await radios.first().focus();
      await page.keyboard.press("ArrowDown");
      await expect(radios.nth(1)).toBeChecked();
      await expect(radios.nth(1)).toBeFocused();
    }

    await expect(panel).toHaveScreenshot(
      `plugin-workbench-${fixture.state}-${fixture.theme}.png`,
    );
  });
}
