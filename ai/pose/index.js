// @ts-check
// Public entry point for ai/pose.
// The frontend and demo page should import pose capabilities ONLY from this file.

export {
  ACTIVITY_CATALOG,
  clampActivityTarget,
  getActivityById,
  getActivityCatalog,
} from "./catalog.js";

export {
  bodyInFrame,
  CALIBRATION_CONFIG,
  CALIBRATION_HINTS,
  createCalibrator,
  hipMidY,
  LANDMARK,
  torsoLength,
} from "./calibration.js";

export {
  createArmsUpDetector,
  createJumpDetector,
  createJumpingJackDetector,
  createMotionEnergyDetector,
  createOneLegBalanceDetector,
  createSquatDetector,
  DETECTOR_CONFIG,
} from "./detectors.js";

export { createDifficultyController, DIFFICULTY_CONFIG, paramsForLevel } from "./difficulty.js";
export { createJuiceEngine } from "./juice.js";
export { computeDressUpAnchor, drawDressUpOverlay, DRESS_UP_ITEMS } from "./dressUp.js";
export { createKeyboardController, KEY_BINDINGS, mapKeyToAction } from "./keyboardMode.js";
export {
  buildActivityResult,
  computeActivityPoints,
  generateSessionId,
  POSE_ERROR_CODES,
} from "./result.js";
export {
  CATCH_THE_STARS_DEFAULTS,
  createCatchTheStarsEngine,
  drawCatchTheStarsOverlay,
} from "./catchTheStars.js";
export {
  createFloorIsLavaEngine,
  createFreezeDanceEngine,
  createRepTargetEngine,
  startActivity,
  startCatchTheStars,
} from "./activities.js";

import { createCalibrator } from "./calibration.js";
import { createArmsUpDetector, createJumpDetector } from "./detectors.js";
import { createPoseEngine as createLowLevelPoseEngine, ENGINE_CONFIG } from "./poseEngine.js";

export { ENGINE_CONFIG };

/** Contract A action constants for frontend interoperability. */
export const ACTIONS = Object.freeze({
  JUMP: "jump",
  ARMS_UP: "armsUp",
});

/** Contract A engine state constants for frontend interoperability. */
export const STATES = Object.freeze({
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  NEEDS_PERMISSION: "needs-permission",
  RUNNING: "running",
  NO_PERSON: "no-person",
  ERROR: "error",
});

/**
 * Creates a pose engine.
 * - Direct ai/pose usage: `createPoseEngine({ videoEl, modelPath, wasmPath, onFrame, onError })`
 * - Contract A frontend usage: `createPoseEngine({ video, modelUrl, wasmUrl, mock })`
 *
 * @param {any} options
 */
export function createPoseEngine(options) {
  if (options && "videoEl" in options) {
    return createLowLevelPoseEngine(options);
  }
  return createContractAPoseEngine(options);
}

/**
 * Contract A frontend wrapper around our low-level poseEngine + calibrator + detectors.
 * @param {{ video: HTMLVideoElement, modelUrl?: string, wasmUrl?: string, targetFps?: number, mock?: boolean }} options
 */
function createContractAPoseEngine(options) {
  const listeners = new Map();
  let state = STATES.IDLE;
  let armsUp = false;
  let personVisible = false;
  let destroyed = false;
  let calibrated = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let armsTimer = null;
  /** @type {ReturnType<typeof createLowLevelPoseEngine> | null} */
  let inner = null;
  const calibrator = createCalibrator();
  const jump = createJumpDetector();
  const arms = createArmsUpDetector();
  /** @type {((e: KeyboardEvent) => void) | null} */
  let keyHandler = null;

  /** @param {string} event @param {any} payload */
  function emit(event, payload) {
    listeners.get(event)?.forEach((fn) => fn(payload));
  }

  /** @param {string} next @param {string} [message] */
  function setState(next, message) {
    state = next;
    emit("status", { state: next, message });
  }

  function clearArmsTimer() {
    if (armsTimer !== null) {
      clearTimeout(armsTimer);
      armsTimer = null;
    }
  }

  function removeKeys() {
    clearArmsTimer();
    if (!keyHandler || typeof window === "undefined") return;
    window.removeEventListener("keydown", keyHandler);
    keyHandler = null;
  }

  return {
    async init() {
      if (destroyed) return;
      setState(STATES.LOADING, "initialising pose engine");
      setState(STATES.READY, "ready");
    },
    async start() {
      if (destroyed) return;
      if (options.mock) {
        personVisible = true;
        calibrated = true;
        removeKeys();
        keyHandler = (e) => {
          if (state !== STATES.RUNNING || e.repeat) return;
          const k = e.key.toLowerCase();
          if (k === "j" || k === " ") emit("action", { type: ACTIONS.JUMP, t: performance.now(), confidence: 0.95 });
          if (k === "a") {
            armsUp = true;
            emit("action", { type: ACTIONS.ARMS_UP, t: performance.now(), confidence: 0.95 });
            clearArmsTimer();
            armsTimer = setTimeout(() => {
              armsUp = false;
              armsTimer = null;
            }, 350);
          }
        };
        if (typeof window !== "undefined") window.addEventListener("keydown", keyHandler);
        setState(STATES.RUNNING, "keyboard fallback running");
        return;
      }

      calibrated = false;
      inner = createLowLevelPoseEngine({
        videoEl: options.video,
        modelPath: options.modelUrl ?? "/models/pose_landmarker_lite.task",
        wasmPath: options.wasmUrl ?? "/wasm",
        onFrame(landmarks, ts) {
          if (destroyed) return;
          const visible = Boolean(landmarks);
          personVisible = visible;
          if (landmarks) emit("landmarks", { t: ts, landmarks });

          if (!visible) {
            armsUp = false;
            if (calibrated && state === STATES.RUNNING) {
              setState(STATES.NO_PERSON, "no person in frame");
            }
            return;
          }

          const upd = calibrator.update(landmarks, ts);
          if (upd.calibration) {
            if (!calibrated) {
              calibrated = true;
              emit("calibrated", { torso: upd.calibration.torsoLength, baselineHipY: upd.calibration.baselineHipY });
            }
            if (state !== STATES.RUNNING) {
              setState(STATES.RUNNING);
            }
            if (jump.update(landmarks, ts, upd.calibration)) {
              emit("action", { type: ACTIONS.JUMP, t: ts, confidence: 0.95 });
            }
            if (arms.update(landmarks, ts, upd.calibration)) {
              armsUp = true;
              emit("action", { type: ACTIONS.ARMS_UP, t: ts, confidence: 0.95 });
            } else {
              armsUp = arms.state.raised;
            }
          }
        },
        onError(error) {
          setState(error.code === "camera_denied" ? STATES.NEEDS_PERMISSION : STATES.ERROR, error.message);
        },
      });
      await inner.start();
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    calibrate() {
      if (options.mock) {
        calibrated = true;
        emit("calibrated", { torso: 0.3, baselineHipY: 0.58 });
      } else {
        calibrated = false;
        calibrator.reset();
      }
    },
    getState() {
      return { state, armsUp, personVisible, fps: inner ? inner.getFps() : options.targetFps ?? 15 };
    },
    stop() {
      removeKeys();
      inner?.stop();
      personVisible = false;
      armsUp = false;
      calibrated = false;
      if (!destroyed) setState(STATES.READY, "stopped");
    },
    destroy() {
      removeKeys();
      inner?.stop();
      inner = null;
      destroyed = true;
      calibrated = false;
      state = STATES.IDLE;
      listeners.clear();
    },
  };
}
