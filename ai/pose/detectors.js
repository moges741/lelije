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

  squat: {
    /** Hips must drop this far below standing height to count as a squat (torso lengths). */
    dropFraction: 0.22,
    /** Standing back up within this fraction of baseline completes the squat rep. */
    returnFraction: 0.08,
    /** Shortest time between two completed squat reps. */
    cooldownMs: 450,
    /** How quickly the standing height follows slow drift while standing upright. */
    baselineTauMs: 3500,
    /** After a pause this long between frames, smoothing resets. */
    staleMs: 500,
    /** Moving average frame count. */
    smoothingFrames: 3,
    /** Moving average max age. */
    smoothingWindowMs: 150,
  },

  jumpingJack: {
    /** Both wrists above shoulders by at least this fraction of torsoLength. */
    armsMarginFraction: 0.08,
    /** Horizontal distance between ankles (or knees if ankles hidden) >= this * torsoLength. */
    feetSpreadFraction: 0.65,
    /** Feet returned close enough (<= this * torsoLength) to finish the rep. */
    feetCloseFraction: 0.48,
    /** Shortest time between two jumping jack reps. */
    cooldownMs: 350,
  },

  oneLegBalance: {
    /** Vertical separation between ankles (torso lengths) to count as standing on one leg. */
    ankleLiftFraction: 0.22,
    /** Fallback knee vertical separation (torso lengths) when ankles are not visible. */
    kneeLiftFraction: 0.16,
    /** Brief flicker grace so one dropped frame does not wipe the balance streak. */
    graceMs: 250,
    /** Max frame gap counted toward balance time (guards against paused tab jumps). */
    maxFrameGapMs: 500,
  },

  motionEnergy: {
    /** Displacement per second (in torso lengths / sec) above which the child counts as moving. */
    moveThreshold: 0.45,
    /** Shoulder oscillation delta (torso lengths) to detect an Eskista shoulder beat. */
    shoulderBeatFraction: 0.06,
    /** Minimum ms between counted Eskista shoulder beats. */
    shoulderBeatCooldownMs: 220,
    /** Ignore frame gaps longer than this (e.g. tab paused). */
    maxFrameGapMs: 500,
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
    } else if (elapsed > 0 && offset > -0.18) {
      // Standing: let the standing height follow slow drift, but do NOT pull
      // the baseline down during a deep squat (so standing back up won't false-jump).
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

/**
 * @typedef {object} SquatDetectorState
 * @property {number | null} baselineHipY
 * @property {number} dropFraction  Positive when hips are BELOW standing height (torso lengths).
 * @property {boolean} squatting  True while crouched below dropFraction (useful for ducking in Floor is Lava).
 */

/**
 * @typedef {object} SquatDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean} update
 *   Returns true once per completed squat (down past dropFraction, then back up within returnFraction).
 * @property {() => void} reset
 * @property {SquatDetectorState} state
 */

/**
 * Detects squats normalised by torsoLength.
 * Also exposes `state.squatting` continuously so games like Floor is Lava can detect ducking.
 * @param {Partial<typeof DETECTOR_CONFIG.squat> & { minVisibility?: number }} [options]
 * @returns {SquatDetector}
 */
export function createSquatDetector(options = {}) {
  const config = { minVisibility: DETECTOR_CONFIG.minVisibility, ...DETECTOR_CONFIG.squat, ...options };
  const size = Math.max(1, Math.floor(config.smoothingFrames));

  const values = new Float64Array(size);
  const times = new Float64Array(size);
  let filled = 0;
  let next = 0;

  /** @type {Calibration | null} */
  let activeCalibration = null;
  let baseline = 0;
  let squatting = false;
  let lastEventAt = Number.NEGATIVE_INFINITY;
  /** @type {number | null} */
  let lastFrameAt = null;

  /** @type {SquatDetectorState} */
  const state = { baselineHipY: null, dropFraction: 0, squatting: false };

  function clearSamples() {
    filled = 0;
    next = 0;
  }

  function reset() {
    clearSamples();
    activeCalibration = null;
    baseline = 0;
    squatting = false;
    lastEventAt = Number.NEGATIVE_INFINITY;
    lastFrameAt = null;
    state.baselineHipY = null;
    state.dropFraction = 0;
    state.squatting = false;
  }

  /**
   * @param {number} hipY
   * @param {number} nowMs
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
    if (!leftHip || !rightHip) return false;
    if (!(leftHip.visibility > config.minVisibility) || !(rightHip.visibility > config.minVisibility)) {
      return false;
    }

    if (calibration !== activeCalibration) {
      activeCalibration = calibration;
      baseline = calibration.baselineHipY;
      squatting = false;
      lastFrameAt = null;
      clearSamples();
    }

    const elapsed = lastFrameAt === null ? 0 : nowMs - lastFrameAt;
    lastFrameAt = nowMs;
    if (elapsed > config.staleMs) clearSamples();

    const hipY = smooth((leftHip.y + rightHip.y) / 2, nowMs);
    let drop = (hipY - baseline) / calibration.torsoLength;
    let fired = false;

    if (!squatting) {
      if (drop >= config.dropFraction) {
        squatting = true;
      } else if (elapsed > 0 && Math.abs(drop) < config.dropFraction * 0.6) {
        // Slowly track upright standing height without drifting during deep bends or jumps.
        const alpha = 1 - Math.exp(-elapsed / config.baselineTauMs);
        baseline += (hipY - baseline) * alpha;
        drop = (hipY - baseline) / calibration.torsoLength;
      }
    } else if (drop <= config.returnFraction) {
      squatting = false;
      if (nowMs - lastEventAt >= config.cooldownMs) {
        lastEventAt = nowMs;
        fired = true;
      }
    }

    state.baselineHipY = baseline;
    state.dropFraction = drop;
    state.squatting = squatting;
    return fired;
  }

  return { update, reset, state };
}

/**
 * @typedef {object} JumpingJackDetectorState
 * @property {boolean} open  True when arms are raised AND legs are spread wide.
 * @property {boolean} armsRaised
 * @property {number} feetSpreadFraction  Distance between ankles/knees in torso lengths.
 */

/**
 * @typedef {object} JumpingJackDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean} update
 *   Returns true once per full jumping jack (open -> closed).
 * @property {() => void} reset
 * @property {JumpingJackDetectorState} state
 */

/**
 * Detects full jumping jacks: arms overhead + legs spread wide -> arms down + legs together.
 * @param {Partial<typeof DETECTOR_CONFIG.jumpingJack> & { minVisibility?: number }} [options]
 * @returns {JumpingJackDetector}
 */
export function createJumpingJackDetector(options = {}) {
  const config = {
    minVisibility: DETECTOR_CONFIG.minVisibility,
    ...DETECTOR_CONFIG.jumpingJack,
    ...options,
  };

  let wasOpen = false;
  let lastEventAt = Number.NEGATIVE_INFINITY;

  /** @type {JumpingJackDetectorState} */
  const state = { open: false, armsRaised: false, feetSpreadFraction: 0 };

  function reset() {
    wasOpen = false;
    lastEventAt = Number.NEGATIVE_INFINITY;
    state.open = false;
    state.armsRaised = false;
    state.feetSpreadFraction = 0;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @param {Calibration | null | undefined} calibration
   * @returns {boolean}
   */
  function update(landmarks, nowMs, calibration) {
    if (!landmarks || !calibration || !(calibration.torsoLength > 0)) return false;

    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    const lw = landmarks[LANDMARK.LEFT_WRIST];
    const rw = landmarks[LANDMARK.RIGHT_WRIST];
    const la = landmarks[LANDMARK.LEFT_ANKLE];
    const ra = landmarks[LANDMARK.RIGHT_ANKLE];
    const lk = landmarks[LANDMARK.LEFT_KNEE];
    const rk = landmarks[LANDMARK.RIGHT_KNEE];

    const upperVisible =
      ls &&
      rs &&
      lw &&
      rw &&
      ls.visibility > config.minVisibility &&
      rs.visibility > config.minVisibility &&
      lw.visibility > config.minVisibility &&
      rw.visibility > config.minVisibility;

    if (!upperVisible) return false;

    const anklesVisible =
      la && ra && la.visibility > config.minVisibility && ra.visibility > config.minVisibility;
    const kneesVisible =
      lk && rk && lk.visibility > config.minVisibility && rk.visibility > config.minVisibility;
    if (!anklesVisible && !kneesVisible) return false;

    const margin = config.armsMarginFraction * calibration.torsoLength;
    const armsRaised = ls.y - lw.y >= margin && rs.y - rw.y >= margin;
    const armsDown = lw.y > ls.y && rw.y > rs.y;

    const spreadPx = anklesVisible ? Math.abs(la.x - ra.x) : Math.abs(lk.x - rk.x) * 1.25;
    const spreadFraction = spreadPx / calibration.torsoLength;
    const isOpen = armsRaised && spreadFraction >= config.feetSpreadFraction;
    const isClosed = armsDown && spreadFraction <= config.feetCloseFraction;

    state.armsRaised = armsRaised;
    state.feetSpreadFraction = spreadFraction;
    state.open = isOpen;

    if (!wasOpen) {
      if (isOpen) wasOpen = true;
      return false;
    }

    if (isClosed) {
      wasOpen = false;
      if (nowMs - lastEventAt >= config.cooldownMs) {
        lastEventAt = nowMs;
        return true;
      }
    }
    return false;
  }

  return { update, reset, state };
}

/**
 * @typedef {object} OneLegBalanceState
 * @property {boolean} balanced  Currently holding a one-leg balance pose.
 * @property {number} balancedMs  Cumulative balanced time in milliseconds.
 * @property {number} currentStreakMs  Current uninterrupted balance streak in ms.
 * @property {number} liftFraction  Vertical foot/knee separation in torso lengths.
 */

/**
 * @typedef {object} OneLegBalanceDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => number} update
 *   Returns the number of NEW whole seconds of balance completed on this frame (usually 0 or 1).
 * @property {() => void} reset
 * @property {OneLegBalanceState} state
 */

/**
 * Detects one-leg tree balance (ankles or knees vertically separated by liftFraction * torsoLength).
 * @param {Partial<typeof DETECTOR_CONFIG.oneLegBalance> & { minVisibility?: number }} [options]
 * @returns {OneLegBalanceDetector}
 */
export function createOneLegBalanceDetector(options = {}) {
  const config = {
    minVisibility: DETECTOR_CONFIG.minVisibility,
    ...DETECTOR_CONFIG.oneLegBalance,
    ...options,
  };

  /** @type {number | null} */
  let lastFrameAt = null;
  let lastBalancedAt = Number.NEGATIVE_INFINITY;
  let balancedMs = 0;
  let currentStreakMs = 0;
  let emittedSeconds = 0;

  /** @type {OneLegBalanceState} */
  const state = { balanced: false, balancedMs: 0, currentStreakMs: 0, liftFraction: 0 };

  function reset() {
    lastFrameAt = null;
    lastBalancedAt = Number.NEGATIVE_INFINITY;
    balancedMs = 0;
    currentStreakMs = 0;
    emittedSeconds = 0;
    state.balanced = false;
    state.balancedMs = 0;
    state.currentStreakMs = 0;
    state.liftFraction = 0;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @param {Calibration | null | undefined} calibration
   * @returns {number}
   */
  function update(landmarks, nowMs, calibration) {
    if (!landmarks || !calibration || !(calibration.torsoLength > 0)) {
      state.balanced = false;
      state.liftFraction = 0;
      return 0;
    }

    const la = landmarks[LANDMARK.LEFT_ANKLE];
    const ra = landmarks[LANDMARK.RIGHT_ANKLE];
    const lk = landmarks[LANDMARK.LEFT_KNEE];
    const rk = landmarks[LANDMARK.RIGHT_KNEE];

    const anklesVisible =
      la && ra && la.visibility > config.minVisibility && ra.visibility > config.minVisibility;
    const kneesVisible =
      lk && rk && lk.visibility > config.minVisibility && rk.visibility > config.minVisibility;

    if (!anklesVisible && !kneesVisible) {
      state.balanced = false;
      state.liftFraction = 0;
      return 0;
    }

    const dt = lastFrameAt === null ? 0 : Math.max(0, nowMs - lastFrameAt);
    lastFrameAt = nowMs;

    let liftFraction = 0;
    let balancedNow = false;
    if (anklesVisible) {
      liftFraction = Math.abs(la.y - ra.y) / calibration.torsoLength;
      balancedNow = liftFraction >= config.ankleLiftFraction;
    } else if (kneesVisible) {
      liftFraction = Math.abs(lk.y - rk.y) / calibration.torsoLength;
      balancedNow = liftFraction >= config.kneeLiftFraction;
    }

    state.liftFraction = liftFraction;

    if (balancedNow) {
      lastBalancedAt = nowMs;
      state.balanced = true;
      if (dt > 0 && dt <= config.maxFrameGapMs) {
        balancedMs += dt;
        currentStreakMs += dt;
      }
    } else if (nowMs - lastBalancedAt <= config.graceMs) {
      // Brief wobble grace: keep streak alive without adding time.
      state.balanced = true;
    } else {
      state.balanced = false;
      currentStreakMs = 0;
    }

    state.balancedMs = balancedMs;
    state.currentStreakMs = currentStreakMs;

    const wholeSeconds = Math.floor(balancedMs / 1000);
    const deltaSeconds = wholeSeconds - emittedSeconds;
    if (deltaSeconds > 0) {
      emittedSeconds = wholeSeconds;
      return deltaSeconds;
    }
    return 0;
  }

  return { update, reset, state };
}

/**
 * @typedef {object} MotionEnergyState
 * @property {number} energy  Normalised body velocity in torso lengths per second.
 * @property {boolean} moving  True when energy exceeds moveThreshold (used by Freeze Dance).
 * @property {boolean} shoulderBeat  True on the frame an Eskista shoulder pop is detected.
 */

/**
 * @typedef {object} MotionEnergyDetector
 * @property {(landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => MotionEnergyState} update
 * @property {() => void} reset
 * @property {MotionEnergyState} state
 */

const ENERGY_JOINTS = [
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.RIGHT_ELBOW,
  LANDMARK.LEFT_WRIST,
  LANDMARK.RIGHT_WRIST,
  LANDMARK.LEFT_HIP,
  LANDMARK.RIGHT_HIP,
  LANDMARK.LEFT_KNEE,
  LANDMARK.RIGHT_KNEE,
];

/**
 * Measures normalised full-body motion energy (torso lengths / second) and
 * Eskista shoulder bounce beats (alternating/rhythmic shoulder height delta).
 * Pure logic: zero per-frame array allocations.
 *
 * @param {Partial<typeof DETECTOR_CONFIG.motionEnergy> & { minVisibility?: number }} [options]
 * @returns {MotionEnergyDetector}
 */
export function createMotionEnergyDetector(options = {}) {
  const config = {
    minVisibility: DETECTOR_CONFIG.minVisibility,
    ...DETECTOR_CONFIG.motionEnergy,
    ...options,
  };

  const prevX = new Float64Array(ENERGY_JOINTS.length);
  const prevY = new Float64Array(ENERGY_JOINTS.length);
  const hasPrev = new Uint8Array(ENERGY_JOINTS.length);

  /** @type {number | null} */
  let lastFrameAt = null;
  /** @type {number | null} */
  let prevShoulderDiff = null;
  let lastBeatAt = Number.NEGATIVE_INFINITY;

  /** @type {MotionEnergyState} */
  const state = { energy: 0, moving: false, shoulderBeat: false };

  function reset() {
    hasPrev.fill(0);
    lastFrameAt = null;
    prevShoulderDiff = null;
    lastBeatAt = Number.NEGATIVE_INFINITY;
    state.energy = 0;
    state.moving = false;
    state.shoulderBeat = false;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @param {Calibration | null | undefined} calibration
   * @returns {MotionEnergyState}
   */
  function update(landmarks, nowMs, calibration) {
    state.shoulderBeat = false;
    if (!landmarks || !calibration || !(calibration.torsoLength > 0)) {
      state.energy = 0;
      state.moving = false;
      return state;
    }

    const dtMs = lastFrameAt === null ? 0 : nowMs - lastFrameAt;
    lastFrameAt = nowMs;

    if (dtMs <= 0 || dtMs > config.maxFrameGapMs) {
      // Capture reference positions without reporting artificial spike after pause.
      for (let i = 0; i < ENERGY_JOINTS.length; i += 1) {
        const pt = landmarks[ENERGY_JOINTS[i]];
        if (pt && pt.visibility > config.minVisibility) {
          prevX[i] = pt.x;
          prevY[i] = pt.y;
          hasPrev[i] = 1;
        } else {
          hasPrev[i] = 0;
        }
      }
      const ls = landmarks[LANDMARK.LEFT_SHOULDER];
      const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
      prevShoulderDiff =
        ls && rs && ls.visibility > config.minVisibility && rs.visibility > config.minVisibility
          ? (ls.y - rs.y) / calibration.torsoLength
          : null;
      state.energy = 0;
      state.moving = false;
      return state;
    }

    const dtSec = dtMs / 1000;
    let totalDist = 0;
    let count = 0;

    for (let i = 0; i < ENERGY_JOINTS.length; i += 1) {
      const pt = landmarks[ENERGY_JOINTS[i]];
      if (pt && pt.visibility > config.minVisibility) {
        if (hasPrev[i] === 1) {
          totalDist += Math.hypot(pt.x - prevX[i], pt.y - prevY[i]);
          count += 1;
        }
        prevX[i] = pt.x;
        prevY[i] = pt.y;
        hasPrev[i] = 1;
      } else {
        hasPrev[i] = 0;
      }
    }

    const energy = count > 0 ? totalDist / count / calibration.torsoLength / dtSec : 0;
    state.energy = energy;
    state.moving = energy >= config.moveThreshold;

    // Eskista beat: sharp shoulder tilt or twin shoulder pop relative to previous frame.
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    if (ls && rs && ls.visibility > config.minVisibility && rs.visibility > config.minVisibility) {
      const diff = (ls.y - rs.y) / calibration.torsoLength;
      if (
        prevShoulderDiff !== null &&
        Math.abs(diff - prevShoulderDiff) >= config.shoulderBeatFraction &&
        nowMs - lastBeatAt >= config.shoulderBeatCooldownMs
      ) {
        lastBeatAt = nowMs;
        state.shoulderBeat = true;
      }
      prevShoulderDiff = diff;
    }

    return state;
  }

  return { update, reset, state };
}

