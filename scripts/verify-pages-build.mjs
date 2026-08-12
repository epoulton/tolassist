import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = new URL("../dist/", import.meta.url);
const outputPath = fileURLToPath(outputDirectory);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : path;
    }),
  );
  return files.flat();
}

const files = await collectFiles(outputPath);
const relativeFiles = files.map((path) => path.slice(outputPath.length));
const html = await readFile(join(outputPath, "index.html"), "utf8");

function fail(message) {
  throw new Error(`Pages artifact verification failed: ${message}`);
}

if (relativeFiles.some((path) => path.endsWith("benchmark.html"))) {
  fail("benchmark.html was emitted");
}

if (!html.includes("/tolassist/assets/")) {
  fail("index.html does not use the /tolassist/ asset base");
}

for (const path of files.filter((file) => /\.(?:html|js|css)$/.test(file))) {
  const contents = await readFile(path, "utf8");
  if (/pyodide|scipy-cobyla|scipy\/engine/i.test(contents)) {
    fail(`benchmark-only SciPy/Pyodide code was emitted in ${path}`);
  }
}

if (!relativeFiles.some((path) => /worker-.*\.js$/.test(path))) {
  fail("the lazy NLopt worker asset is missing");
}

console.log(
  `Verified Pages artifact: ${relativeFiles.length} files, product entry only, /tolassist/ base, no SciPy/Pyodide.`,
);
