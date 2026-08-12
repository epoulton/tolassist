import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("runs the product NLopt flow and exports the complete snapshot", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/");

  const stage1 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Define the tolerance space" }),
  });
  const baseInputs = stage1.getByRole("article").first().getByRole("textbox");
  await baseInputs.nth(0).fill("a");
  await baseInputs.nth(1).fill("0");
  await baseInputs.nth(2).fill("5");
  await baseInputs.nth(3).fill("10");
  await baseInputs.nth(4).fill("m");
  await baseInputs.nth(4).blur();

  const stage3 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Define what must remain true" }),
  });
  await stage3.getByRole("button", { name: "Add constraint" }).click();
  await stage3.getByRole("button", { name: "Add constraint" }).click();
  const constraints = stage3.getByRole("textbox");
  await constraints.nth(0).fill("a >= 0 m");
  await constraints.nth(1).fill("a <= 10 m");
  await constraints.nth(1).blur();

  const stage4 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Configure optimization" }),
  });
  await stage4.getByLabel("by updating").selectOption({ label: "a (m)" });
  await stage4.getByRole("button", { name: "Optimize" }).click();
  await expect(stage4.getByText(/optimization succeeded/i)).toBeVisible();

  const stage5 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Review the result" }),
  });
  await expect(stage5.getByText("Optimized", { exact: true })).toBeVisible();
  await expect(stage5.getByText("All cases pass")).toHaveCount(2);
  await expect(
    stage5.getByRole("cell", { name: "5 m", exact: true }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await stage5.getByRole("button", { name: "Export result" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^TolAssist-result-.*\.json$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  const exported = JSON.parse(await readFile(path, "utf8")) as {
    schemaVersion: number;
    variables: readonly { name: string; optimized: boolean }[];
    constraints: readonly { status: string }[];
    optimization: {
      objectiveId: string;
      selectedVariables: readonly { name: string }[];
      solver: { id: string };
    };
  };
  expect(exported).toMatchObject({
    schemaVersion: 1,
    variables: [{ name: "a", optimized: true }],
    optimization: {
      objectiveId: "maximize-minimum-tolerance",
      selectedVariables: [{ name: "a" }],
      solver: { id: "nlopt-cobyla" },
    },
  });
  expect(exported.constraints).toHaveLength(2);
  expect(exported.constraints.every((item) => item.status === "green")).toBe(
    true,
  );

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
