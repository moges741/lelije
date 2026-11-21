// Dev-only config for the AI modules (demo page + Vitest).
// The real app is built by the frontend's own Vite setup, not by this file.
//
// The Vite root is the repo root, so the demo is served at
// /ai/pose/demo/index.html and <repo>/public is served at "/"
// (which gives /models/... and /wasm/... exactly like the real app).

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cacheDir = fileURLToPath(new URL("node_modules/.vite", import.meta.url));
const testCacheDir = fileURLToPath(new URL("node_modules/.vitest-cache", import.meta.url));

export default defineConfig({
  root: repoRoot,
  publicDir: "public",
  // Keep Vite's cache inside ai/node_modules so nothing is written elsewhere in the repo.
  cacheDir,
  optimizeDeps: {
    // Only scan our own demo page, never teammates' files.
    entries: ["ai/pose/demo/index.html"],
  },
  server: {
    open: "/ai/pose/demo/index.html",
  },
  test: {
    environment: "node",
    include: ["ai/**/__tests__/**/*.test.js"],
    // Without this Vitest writes its cache to <repo>/node_modules, outside ai/.
    fsModuleCachePath: testCacheDir,
  },
});
