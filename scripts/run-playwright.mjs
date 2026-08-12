import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

const targets = {
  e2e: {
    port: 4173,
    url: "http://127.0.0.1:4173/",
    viteArgs: ["preview", "--host", "127.0.0.1", "--port", "4173"],
    playwrightArgs: ["test"],
  },
  pages: {
    port: 4174,
    url: "http://127.0.0.1:4174/tolassist/",
    viteArgs: [
      "preview",
      "--mode",
      "pages",
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
    ],
    playwrightArgs: ["test", "--config", "playwright.pages.config.ts"],
  },
};

const selected = targets[target];
if (!selected) {
  throw new Error(
    `Expected a Playwright target (${Object.keys(targets).join(", ")}).`,
  );
}

const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const playwrightCli = path.join(
  root,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

function runNode(script, args) {
  return spawn(process.execPath, [script, ...args], {
    cwd: root,
    stdio: "inherit",
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Vite preview exited before ${url} became ready.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server may not be listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}.`);
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    waitForExit(child),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

const preview = runNode(viteCli, selected.viteArgs);
let exitCode;

try {
  await waitUntilReady(selected.url, preview);
  const tests = runNode(playwrightCli, selected.playwrightArgs);
  const result = await waitForExit(tests);
  exitCode = result.code ?? 1;
} finally {
  await stop(preview);
}

process.exitCode = exitCode ?? 1;
