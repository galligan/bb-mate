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
  { state: "single", theme: "light", width: 420 },
  { state: "multiple", theme: "dark" },
] as const;

for (const fixture of fixtures) {
  const width = "width" in fixture ? fixture.width : null;
  test(`${fixture.state} ${fixture.theme}${width ? ` ${width}px` : ""} panel`, async ({
    page,
  }) => {
    if (width) await page.setViewportSize({ width, height: 900 });
    await page.goto(`?state=${fixture.state}&theme=${fixture.theme}`);
    if (width) {
      await page.locator(".fixture-host").evaluate((host) => {
        host.style.width = "100%";
        host.style.padding = "0";
      });
      await page.locator(".fixture-host > h1").evaluate((heading) => {
        heading.style.display = "none";
      });
    }
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
      `plugin-workbench-${fixture.state}-${fixture.theme}${width ? `-${width}` : ""}.png`,
    );
  });
}
