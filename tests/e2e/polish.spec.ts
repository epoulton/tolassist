import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("supports keyboard row reordering", async ({ page }) => {
  await page.goto("/");
  const stage1 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Define the tolerance space" }),
  });
  const rows = stage1.getByRole("article");
  await rows.nth(0).getByLabel("Name").fill("first");
  await rows.nth(1).getByLabel("Name").fill("second");

  const handle = rows.nth(0).getByRole("button", { name: /Reorder first\./ });
  await handle.press("Space");
  // The active row moves in the DOM after ArrowDown, so continue through the
  // focused keyboard sensor instead of resolving the original nth-row locator.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(rows.nth(0).getByLabel("Name")).toHaveValue("second");
  await expect(rows.nth(1).getByLabel("Name")).toHaveValue("first");
});

test("fits the five-stage workflow in a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Configure the optimization problem" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review the result" }),
  ).toBeVisible();
});

test("removes meaningful animation when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const transitionDurations = await page
    .locator(".variable-row")
    .first()
    .evaluate((element) =>
      getComputedStyle(element).transitionDuration.split(", "),
    );
  expect(
    transitionDurations.every(
      (duration) => Number.parseFloat(duration) <= 0.001,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
});
