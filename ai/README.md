# LeLije `ai/` Modules

Self-contained ES modules (+ JSDoc & TypeScript `.d.ts` definitions) powering LeLije's on-device pose movement games and child-safe Ethiopian mission generation.

- **`ai/pose/`** — On-device MediaPipe Pose Landmarker Lite games, calibration, torso-normalised detectors, adaptive difficulty, WebAudio/particle juice, optional dress-up & 2-player coop, and full keyboard/touch fallback. See [`ai/pose/README.md`](./pose/README.md).
- **`ai/missions/`** — Strict mission schema validation, child-safety filter, Ethiopian real-world prompts, multi-provider LLM adapters (`anthropic | gemini | openai`), LLM-free exercise builder, storyteller + scripted companion lines, DB/client mappers, and Express-compatible HTTP routes. See [`ai/missions/README.md`](./missions/README.md).
- **`ai/api/missions.js`** — Thin backend entry point with `MOCK_AI` support.
- **`ai/index.d.ts`** — Combined TypeScript declarations for backend consumers.

## Commands (run inside `ai/`)

```bash
npm install
npx vitest run
npm run demo
```

- `npx vitest run` runs the full unit test suite across `ai/pose/` and `ai/missions/`.
- `npm run demo` starts the standalone Vite demo at `/ai/pose/demo/index.html` where all 7 activities can be played with camera or keyboard/touch fallback (`?mode=keyboard&debug=1&duration=20`).
