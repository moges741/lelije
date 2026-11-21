// @ts-check
// Movement detectors. Pure logic: no DOM, no camera, no network, no storage.
//
// Coordinates are MediaPipe normalised image coordinates and y grows DOWNWARD,
// so "the hips rise" means the hip y value gets SMALLER.
//
// Every distance threshold is a fraction of calibration.torsoLength, so the same
// settings work for a small child, a tall adult and any distance from the camera.

import { LANDMARK } from "./calibration.js";

/** @typedef {import("./poseEngine.js").Landmark} Landmark */
/** @typedef {import("./calibration.js").Calibration} Calibration */

/**
 * All detector thresholds in one place. Change a value here to tune every
 * detector created afterwards, or pass overrides to a single detector.
 */
export const DETECTOR_CONFIG = {
  /** A landmark is used only above this MediaPipe visibility score. */
  minVisibility: 0.5,

  jump: {
    /** The hips must rise this far above the standing height to start a jump (torso lengths). */
    riseFraction: 0.18,
    /** The jump is over once the hips are back within this distance of the standing height. */
    returnFraction: 0.06,
    /** Shortest time between two jump events. */
    cooldownMs: 400,
    /** Moving average: at most this many frames... */
    smoothingFrames: 4,
    /** ...and only frames this recent, so a slow phone does not smear a whole jump away. */
    smoothingWindowMs: 150,
    /** How quickly the standing height follows the child drifting nearer or farther (time constant). */
    baselineTauMs: 3000,
    /** Hips "in the air" for longer than this is not a jump: the child moved, so re-measure the standing height. */
    maxJumpMs: 1500,
    /** After a pause this long between frames, old samples are thrown away. */
    staleMs: 500,
  },

  armsUp: {
    /** Both wrists must be this far above their shoulders (torso lengths). */
    marginFraction: 0.1,
    /** The arms must stay up this long before the event fires. */
    holdMs: 150,
    /** Shortest time between two arms-up events. */
    cooldownMs: 500,
  },
};

/**
 * @typedef {object} JumpDetectorState
 * @property {number | null} baselineHipY  Current standing height of the hips (follows slow drift).
 * @property {number} offsetFraction  Hips above (+) or below (-) the standing height, in torso lengths.
 * @property {boolean} jumping  True between take-off and landing.
 */

/**
 * @typedef {object} JumpDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean} update
 *   Returns true exactly once per jump, at take-off (when the hips cross the rise threshold).
 * @property {() => void} reset
 * @property {JumpDetectorState} state  Live values for a debug overlay. The same object every frame.
 */

/**
 * Detects jumps from the height of the hip midpoint.
 *
 * A jump starts when the smoothed hip midpoint rises above the standing height
 * by riseFraction * torsoLength, and ends when it comes back within
 * returnFraction. The standing height is updated slowly, and ONLY while not
 * jumping, so a child drifting closer or farther does not break detection.
 *
 * @param {Partial<typeof DETECTOR_CONFIG.jump> & { minVisibility?: number }} [options]
 * @returns {JumpDetector}
 */
export function createJumpDetector(options = {}) {
  const config = { minVisibility: DETECTOR_CONFIG.minVisibility, ...DETECTOR_CONFIG.jump, ...options };
  const size = Math.max(1, Math.floor(config.smoothingFrames));

  // Ring buffer of recent hip heights, reused for the whole session.
  const values = new Float64Array(size);
  const times = new Float64Array(size);
  let filled = 0;
  let next = 0;

  /** @type {Calibration | null} */
  let activeCalibration = null;
  let baseline = 0;
  let jumping = false;
  let jumpStartedAt = 0;
  let lastEventAt = Number.NEGATIVE_INFINITY;
  /** @type {number | null} */
  let lastFrameAt = null;

  /** @type {JumpDetectorState} */
  const state = { baselineHipY: null, offsetFraction: 0, jumping: false };

  function clearSamples() {
    filled = 0;
    next = 0;
  }

  function reset() {
    clearSamples();
    activeCalibration = null;
    baseline = 0;
    jumping = false;
    jumpStartedAt = 0;
    lastEventAt = Number.NEGATIVE_INFINITY;
    lastFrameAt = null;
    state.baselineHipY = null;
    state.offsetFraction = 0;
    state.jumping = false;
  }

  /**
   * @param {number} hipY
   * @param {number} nowMs
   * @returns {number} Average of the recent samples, including this one.
   */
  function smooth(hipY, nowMs) {
    values[next] = hipY;
    times[next] = nowMs;
    next = (next + 1) % size;
    if (filled < size) filled += 1;

    let sum = 0;
    let count = 0;
    for (let i = 0; i < filled; i += 1) {
      if (nowMs - times[i] <= config.smoothingWindowMs) {
        sum += values[i];
        count += 1;
      }
    }
    return count > 0 ? sum / count : hipY;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @param {Calibration | null | undefined} calibration
   * @returns {boolean}
   */
  function update(landmarks, nowMs, calibration) {
    if (!landmarks || !calibration || !(calibration.torsoLength > 0)) return false;

    const leftHip = landmarks[LANDMARK.LEFT_HIP];
    const rightHip = landmarks[LANDMARK.RIGHT_HIP];
    // Hips we cannot see tell us nothing: skip the frame and keep the current state.
    if (!leftHip || !rightHip) return false;
    if (!(leftHip.visibility > config.minVisibility) || !(rightHip.visibility > config.minVisibility)) {
      return false;
    }

    if (calibration !== activeCalibration) {
      // New calibration: start again from its standing height.
      activeCalibration = calibration;
      baseline = calibration.baselineHipY;
      jumping = false;
      lastFrameAt = null;
      clearSamples();
    }

    const elapsed = lastFrameAt === null ? 0 : nowMs - lastFrameAt;
    lastFrameAt = nowMs;
    if (elapsed > config.staleMs) clearSamples();

    const hipY = smooth((leftHip.y + rightHip.y) / 2, nowMs);
    let offset = (baseline - hipY) / calibration.torsoLength;
    let fired = false;

    if (jumping) {
      if (offset <= config.returnFraction) {
        jumping = false;
      } else if (nowMs - jumpStartedAt > config.maxJumpMs) {
        // Nobody stays in the air this long. The child stepped closer or stood taller,
        // so this height is the new standing height.
        baseline = hipY;
        offset = 0;
        jumping = false;
      }
    } else if (offset >= config.riseFraction) {
      if (nowMs - lastEventAt >= config.cooldownMs) {
        jumping = true;
        jumpStartedAt = nowMs;
        lastEventAt = nowMs;
        fired = true;
      }
      // Still inside the cooldown: no event, and no baseline update while the hips are high.
    } else if (elapsed > 0) {
      // Standing (or crouching): let the standing height follow slow drift.
      const alpha = 1 - Math.exp(-elapsed / config.baselineTauMs);
      baseline += (hipY - baseline) * alpha;
      offset = (baseline - hipY) / calibration.torsoLength;
    }

    state.baselineHipY = baseline;
    state.offsetFraction = offset;
    state.jumping = jumping;
    return fired;
  }

  return { update, reset, state };
}

/**
 * @typedef {object} ArmsUpDetectorState
 * @property {boolean} raised  Both wrists are currently above the shoulders by the margin.
 * @property {number} heldMs  How long they have been raised without a break.
 */

/**
 * @typedef {object} ArmsUpDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean} update
 *   Returns true exactly once each time both arms are raised and held.
 * @property {() => void} reset
 * @property {ArmsUpDetectorState} state  Live values for a debug overlay. The same object every frame.
 */

/**
 * Detects "both arms up": BOTH wrists above their shoulders by
 * marginFraction * torsoLength, held for holdMs. The arms must come down
 * again before the next event can fire.
 *
 * @param {Partial<typeof DETECTOR_CONFIG.armsUp> & { minVisibility?: number }} [options]
 * @returns {ArmsUpDetector}
 */
export function createArmsUpDetector(options = {}) {
  const config = { minVisibility: DETECTOR_CONFIG.minVisibility, ...DETECTOR_CONFIG.armsUp, ...options };

  /** @type {number | null} */
  let raisedSince = null;
  /** False after an event until the arms are seen down again. */
  let armed = true;
  let lastEventAt = Number.NEGATIVE_INFINITY;

  /** @type {ArmsUpDetectorState} */
  const state = { raised: false, heldMs: 0 };

  function reset() {
    raisedSince = null;
    armed = true;
    lastEventAt = Number.NEGATIVE_INFINITY;
    state.raised = false;
    state.heldMs = 0;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @param {Calibration | null | undefined} calibration
   * @returns {boolean}
   */
  function update(landmarks, nowMs, calibration) {
    if (!landmarks || !calibration || !(calibration.torsoLength > 0)) return false;

    const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
    const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
    const leftWrist = landmarks[LANDMARK.LEFT_WRIST];
    const rightWrist = landmarks[LANDMARK.RIGHT_WRIST];

    const visible =
      leftShoulder &&
      rightShoulder &&
      leftWrist &&
      rightWrist &&
      leftShoulder.visibility > config.minVisibility &&
      rightShoulder.visibility > config.minVisibility &&
      leftWrist.visibility > config.minVisibility &&
      rightWrist.visibility > config.minVisibility;

    if (!visible) {
      // We cannot tell where the arms are: the hold has to start again,
      // but this does not count as "arms came down".
      raisedSince = null;
      state.raised = false;
      state.heldMs = 0;
      return false;
    }

    const margin = config.marginFraction * calibration.torsoLength;
    const raised = leftShoulder.y - leftWrist.y >= margin && rightShoulder.y - rightWrist.y >= margin;

    if (!raised) {
      raisedSince = null;
      armed = true;
      state.raised = false;
      state.heldMs = 0;
      return false;
    }

    if (raisedSince === null) raisedSince = nowMs;
    const heldMs = nowMs - raisedSince;
    state.raised = true;
    state.heldMs = heldMs;

    if (armed && heldMs >= config.holdMs && nowMs - lastEventAt >= config.cooldownMs) {
      armed = false;
      lastEventAt = nowMs;
      return true;
    }
    return false;
  }

  return { update, reset, state };
}
