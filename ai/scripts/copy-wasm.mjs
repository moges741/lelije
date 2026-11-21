// Copies the MediaPipe wasm runtime into <repo>/public/wasm so the app can
// load it from its own origin (no CDN needed, works on weak internet).
//
// Run from the ai/ folder:  npm run copy-wasm
//
// Only the classic (non-module) pair is copied. That is the pair
// FilesetResolver.forVisionTasks(wasmPath) requests by default; the
// "_module_" pair is only used when its second argument is true, and
// skipping it halves the size of public/wasm (about 15 MB instead of 30 MB).

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(aiDir, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const targetDir = join(aiDir, "..", "public", "wasm");

const FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

mkdirSync(targetDir, { recursive: true });

for (const file of FILES) {
  const from = join(sourceDir, file);
  const to = join(targetDir, file);
  try {
    copyFileSync(from, to);
  } catch (err) {
    console.error(`Could not copy ${file}. Did you run "npm install" in ai/ first?`);
    console.error(String(err));
    process.exit(1);
  }
  const sizeMb = (statSync(to).size / (1024 * 1024)).toFixed(1);
  console.log(`copied ${file} (${sizeMb} MB) -> public/wasm/`);
}
