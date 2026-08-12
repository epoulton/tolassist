import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  const isPages = mode === "pages";
  const isolationHeaders = isPages
    ? undefined
    : {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      };

  return {
    base: isPages ? "/tolassist/" : "/",
    plugins: [react()],
    server: {
      headers: isolationHeaders,
    },
    preview: {
      headers: isolationHeaders,
    },
    define: {
      global: "globalThis",
    },
    build: {
      rollupOptions: {
        input: isPages
          ? resolve(import.meta.dirname, "index.html")
          : {
              app: resolve(import.meta.dirname, "index.html"),
              benchmark: resolve(import.meta.dirname, "benchmark.html"),
            },
      },
    },
    test: {
      environment: "jsdom",
      exclude: [...configDefaults.exclude, "tests/e2e/**", "tests/pages/**"],
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
    },
  };
});
