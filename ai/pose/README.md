# `ai/pose` — Frontend Integration Contract

On-device movement games powered by MediaPipe Pose Landmarker Lite, with automatic calibration, adaptive difficulty, celebratory visual/audio feedback, and a full keyboard/touch fallback.

> **Privacy guarantee:** Camera frames and pose landmarks never leave the device. `ai/pose` makes zero network calls (other than loading the local model and WASM files from `/models` and `/wasm`) and never stores video or landmarks.

## Public Entry Point

Import **only** from `ai/pose/index.js` (TypeScript types are provided in `ai/pose/index.d.ts`):

```js
import {
  startActivity,
  startCatchTheStars,
  getActivityCatalog,
  POSE_ERROR_CODES,
} from "../ai/pose/index.js";
```

### Static Assets

Serve these static files from the app's public root (or override with `modelPath` / `wasmPath`):

- `/models/pose_landmarker_lite.task`
- `/wasm/vision_wasm_internal.js` (and sibling `.wasm` binaries copied via `npm run copy-wasm`)

## Activity Catalog (`getActivityCatalog()`)

Single source of truth for all 7 supported activities:

| `id` | `labelKey` | Default Target | Min–Max Target | Duration | Keyboard | `repsMeaning` | `minSecPerRep` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `catch_the_stars` | `activity.catch_the_stars` | 12 | 5–40 | 60 s | Yes | stars and clouds caught | 1.2 s |
| `squats` | `activity.squats` | 10 | 5–15 | 60 s | Yes | squats completed | 1.5 s |
| `jumping_jacks` | `activity.jumping_jacks` | 15 | 10–30 | 60 s | Yes | jumping jacks completed | 0.8 s |
| `freeze_dance` | `activity.freeze_dance` | 5 | 3–8 | 60 s | Yes | freeze rounds held still | 5.0 s |
| `tree_balance` | `activity.tree_balance` | 15 | 5–30 | 45 s | Yes | seconds balanced on one leg | 1.0 s |
| `eskista` | `activity.eskista` | 20 | 10–60 | 60 s | Yes | eskista shoulder beats | 0.4 s |
| `floor_is_lava` | `activity.floor_is_lava` | 12 | 5–30 | 60 s | Yes | lava obstacles dodged | 1.8 s |

## Running an Activity (`startActivity`)

```js
const controller = startActivity({
  activity: "floor_is_lava",
  canvas: canvasElement,
  video: videoElement,          // required when mode === "camera"
  missionId: "mission_123",     // optional
  target: 12,                   // optional, clamped to catalog [minTarget, maxTarget]
  durationSec: 60,              // optional, defaults to catalog durationSec
  mode: "camera",               // "camera" | "keyboard"
  startDifficulty: 2,           // optional 1..5
  coop: false,                  // optional 2-player cooperative mode (gracefully falls back to 1)
  dressUp: "none",              // optional "none" | "crown" | "cat_ears" | "cape"
  muted: false,                 // optional audio mute state
  debug: false,                 // optional skeleton + FPS debug overlay
  modelPath: "/models/pose_landmarker_lite.task",
  wasmPath: "/wasm",
  labels: {},                   // optional translated UI strings
  onStatus(status) { /* { state, hint?, hintKey?, progress?, code?, message? } */ },
  onEvent(event) { /* { type, value, timeMs } */ },
  onFinish(result) { /* ActivityResult payload (called once) */ },
  onVoiceCheer(event) { /* optional host-provided voice cheer hook */ },
});
```

`startCatchTheStars(options)` is kept as a backwards-compatible wrapper around `startActivity({ ...options, activity: "catch_the_stars" })` (and also bridges Contract A `{ canvas, engine, durationMs }`).

### Controller Methods

- `controller.stop()` — Releases the camera, cancels animation frames, detaches keyboard listeners, closes audio context, and clears the canvas. Safe to call during loading.
- `controller.pause()` / `controller.resume()` — Pauses and resumes the game clock (automatically triggered on `document.visibilitychange` when the tab is hidden).
- `controller.setMuted(boolean)` — Toggles the WebAudio tone engine.
- `controller.setDressUp("none" | "crown" | "cat_ears" | "cape")` — Switches landmark overlay live.
- `controller.triggerAction(action)` / `controller.setActionHeld(action, held)` — Programmatic tap/touch controls (`"jump" | "armsUp" | "squat" | "jumpingJack" | "balance" | "move"`). Calling these sets `result.input_mode = "keyboard"`.

## Events (`onEvent`)

```json
{ "type": "catch", "value": 10, "timeMs": 14210.5 }
```

Event `type` values: `"jump" | "armsUp" | "rep" | "catch" | "miss" | "combo" | "levelUp" | "freeze" | "go" | "finish"`.

## Result Payload (`onFinish`)

Delivered **exactly once** when the activity naturally ends (camera is automatically turned off before `onFinish` runs):

```json
{
  "client_session_id": "a4f3b8c0-...",
  "mission_id": "mission_123",
  "game": "catch_the_stars",
  "started_at": "2026-11-21T15:00:00.000Z",
  "duration_sec": 60,
  "reps": 14,
  "target": 12,
  "completed": true,
  "points": 24,
  "input_mode": "camera",
  "jumps": 11,
  "arm_raises": 6,
  "performance": {
    "accuracy": 0.875,
    "avg_rep_sec": 4.29,
    "max_combo": 5,
    "difficulty_level": 3
  }
}
```

- `input_mode`: `"camera"` or `"keyboard"`. **Always `"keyboard"` if any keyboard or on-screen tap event occurred during the session.**
- `coop` (included only when `coop: true`): `{ enabled, players_detected, player1_score, player2_score, team_score }`.

## Error Codes (`POSE_ERROR_CODES`)

Emitted via `onStatus({ state: "error", code, message })`:

- `camera_denied` — User declined camera permission or browser blocked it.
- `no_camera` — No camera found, camera disconnected, or device busy.
- `model_load_failed` — Could not load the lite `.task` model or WASM runtime.
- `unsupported` — Browser lacks `mediaDevices.getUserMedia` or insecure HTTP context.

When an error occurs, the host UI should offer `mode: "keyboard"` so the child can still play immediately.

## Keyboard Controls (`keyboardMode.js`)

| Action | Keys |
| --- | --- |
| Jump | `Space`, `ArrowUp`, `W`, `J` |
| Arms Up | `A`, `E`, `U` |
| Squat / Duck (hold or tap) | `ArrowDown`, `S`, `D` |
| Jumping Jack | `X` |
| Tree Balance (hold) | `B` |
| Dance / Eskista Beat | `M` |

## Performance Guarantees (P6)

- Uses `pose_landmarker_lite.task` with GPU-first, automatic CPU fallback.
- Requests `640x480` user-facing camera resolution.
- Adaptive frame skipping automatically engages when processed FPS drops below `15 FPS` and detection time exceeds `30 ms`.
- Visual juice automatically reduces particle count and disables screen shake below `15 FPS`.
- Detectors and calibrator reuse fixed typed arrays / state objects per frame to prevent memory growth.
- Pauses game clock and pose detection automatically when the browser tab is hidden.
