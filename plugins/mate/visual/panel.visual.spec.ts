import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixtures = [
  { state: "idle", theme: "light" },
  { state: "ready", theme: "light" },
  { state: "unavailable", theme: "light" },
  { state: "hostile", theme: "light" },
  { state: "ready", theme: "dark" },
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
      await expect(panel.locator("img")).toHaveCount(0);
      await expect(
        panel.getByText('<img src=x onerror="alert(1)">'),
      ).toBeVisible();
    }

    await expect(panel).toHaveScreenshot(
      `plugin-workbench-${fixture.state}-${fixture.theme}.png`,
    );
  });
}
