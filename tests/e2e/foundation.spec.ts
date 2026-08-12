import { expect, test } from "@playwright/test";

test("defines and converts a base variable", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Confidence in tolerance design" }),
  ).toBeVisible();

  const firstRow = page.getByRole("article").first();
  const inputs = firstRow.getByRole("textbox");
  await inputs.nth(0).fill("offset");
  await inputs.nth(1).fill("0");
  await inputs.nth(2).fill("3");
  await inputs.nth(3).fill("10");
  await inputs.nth(4).fill("mm");
  await inputs.nth(4).blur();

  await expect(firstRow.getByText(/ready · 0 \/ 3 \/ 10 mm/i)).toBeVisible();
  await firstRow.getByRole("button", { name: "Nom ± Tol" }).click();
  await expect(firstRow.getByLabel("Nominal")).toHaveValue("5");
  await expect(firstRow.getByLabel("Tolerance")).toHaveValue("5");
});

test("calculates an expression and classifies a constraint", async ({
  page,
}) => {
  await page.goto("/");

  const stage1 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Define the tolerance space" }),
  });
  const baseRow = stage1.getByRole("article").first();
  const baseInputs = baseRow.getByRole("textbox");
  await baseInputs.nth(0).fill("a");
  await baseInputs.nth(1).fill("1");
  await baseInputs.nth(2).fill("2");
  await baseInputs.nth(3).fill("3");
  await baseInputs.nth(4).fill("mm");
  await baseInputs.nth(4).blur();

  const stage2 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Build the calculation chain" }),
  });
  const expressionInputs = stage2.getByRole("textbox");
  await expressionInputs.nth(0).fill("doubled");
  await expressionInputs.nth(1).fill("2*a");
  await expressionInputs.nth(1).blur();
  await stage2.getByRole("button", { name: "Results" }).click();
  await expect(stage2.getByText("4 mm", { exact: true })).toBeVisible();

  const stage3 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Define what must hold true" }),
  });
  await stage3.getByRole("button", { name: "Add constraint" }).click();
  const constraint = stage3.getByRole("textbox");
  await constraint.fill("doubled <= 5 mm");
  await constraint.blur();

  await expect(
    stage3.getByText("Nominal passes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "All populated inputs are valid and calculated results are current.",
    ),
  ).toBeVisible();
});
