import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("runs the production workflow from the Pages project path", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("request", (request) => requests.push(request.url()));

  const response = await page.goto("./");
  expect(response?.ok()).toBe(true);
  await expect(page.getByText("Runs in your browser")).toBeVisible();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  expect(requests.some((url) => /worker-.*\.js/.test(url))).toBe(false);
  expect(requests.some((url) => /pyodide|scipy/i.test(url))).toBe(false);

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
    has: page.getByRole("heading", { name: "Define what must hold true" }),
  });
  await stage3.getByRole("button", { name: "Add constraint" }).click();
  await stage3.getByRole("button", { name: "Add constraint" }).click();
  const constraints = stage3.getByRole("textbox");
  await constraints.nth(0).fill("a >= 0 m");
  await constraints.nth(1).fill("a <= 10 m");
  await constraints.nth(1).blur();

  const stage4 = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Configure the optimization problem",
    }),
  });
  await stage4.getByLabel("by updating").selectOption({ label: "a (m)" });
  await stage4.getByRole("button", { name: "Optimize" }).click();
  await expect(stage4.getByText(/optimization succeeded/i)).toBeVisible();
  expect(requests.some((url) => /worker-.*\.js/.test(url))).toBe(true);

  const stage5 = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Review the result" }),
  });
  await expect(stage5.getByText("All cases pass")).toHaveCount(2);
  const downloadPromise = page.waitForEvent("download");
  await stage5.getByRole("button", { name: "Export result" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^TolAssist-result-.*\.json$/);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
