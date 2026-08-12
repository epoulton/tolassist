import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const solverId = process.argv[2];
if (!new Set(["nlopt-cobyla", "scipy-cobyla"]).has(solverId)) {
  throw new Error("Pass nlopt-cobyla or scipy-cobyla.");
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173/benchmark.html");
  const report = await page.evaluate(
    async (id) => globalThis.tolAssistSolvers.runBenchmark(id),
    solverId,
  );
  const outputDirectory = resolve("benchmark-results");
  await mkdir(outputDirectory, { recursive: true });
  const shortName = solverId.startsWith("nlopt") ? "nlopt" : "scipy";
  const outputPath = resolve(outputDirectory, `${shortName}-latest.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await browser.close();
}
