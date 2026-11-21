// @ts-check
// Body-in-frame checks and calibration. Pure logic: no DOM, no camera, no network.
//
// Coordinates are MediaPipe normalised image coordinates: x and y in 0..1,
// and y grows DOWNWARD (a jump makes the hip y value SMALLER).

/** @typedef {import("./poseEngine.js").Landmark} Landmark */

/**
 * What calibration measures. Every detector threshold is a fraction of
 * torsoLength, so detection works for small children, tall adults and
 * different distances from the camera.
 * @typedef {object} Calibration
 * @property {number} baselineHipY  Standing height of the hip midpoint (normalised y).
 * @property {number} torsoLength  Distance from the shoulder midpoint to the hip midpoint.
 */

/** @typedef {"no_body" | "calibrating" | "ready"} CalibrationStatus */

/**
 * @typedef {object} CalibrationUpdate
 * @property {CalibrationStatus} status
 * @property {number} progress  0..1, how much of the calibration time has passed.
 * @property {CalibrationHintKey} hintKey  Which hint applies; use this key to show translated text.
 * @property {string} hint  The same hint as default English text.
 * @property {Calibration | null} calibration  Set once status is "ready".
 */

/** @typedef {"no_body" | "too_far" | "calibrating" | "ready"} CalibrationHintKey */

/** MediaPipe pose landmark indices used by LeLije. */
export const LANDMARK = Object.freeze({
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
});

/** Tunable calibration settings, all in one place. */
export const CALIBRATION_CONFIG = {
  /** A landmark counts as visible above this MediaPipe visibility score. */
  minVisibility: 0.5,
  /** How long the child must stand in view before the game starts. */
  durationMs: 3000,
  /**
   * A gap in good frames shorter than this does not restart the timer
   * (one flickering knee should not send a child back to zero).
   * Set to 0 for strictly continuous frames.
   */
  lostGraceMs: 300,
  /**
   * If no frame at all arrives for longer than this (model warm-up, a frozen
   * tab, a stalled camera), the time in between was not "standing still in
   * view", so the timer restarts.
   */
  maxFrameGapMs: 500,
  /** Fewest good frames needed, so a flickering pose cannot calibrate on almost no data. */
  minSamples: 10,
  /**
   * Smallest usable torso (normalised). A child standing very far away has a
   * torso of only a few pixels, and thresholds based on it would be noise.
   */
  minTorsoLength: 0.08,
};

/** Default English hints, keyed by hintKey. The app should translate by key, not by this text. */
export const CALIBRATION_HINTS = {
  no_body: "Step back until I see your whole body",
  too_far: "Come a little closer so I can see you better",
  calibrating: "Great! Stand still for a moment",
  ready: "Ready! Let's play",
};

/** Shoulders, hips and knees must all be visible for the body to count as in frame. */
const REQUIRED_LANDMARKS = [
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_HIP,
  LANDMARK.RIGHT_HIP,
  LANDMARK.LEFT_KNEE,
  LANDMARK.RIGHT_KNEE,
];

/**
 * True when shoulders, hips and knees are all visible and inside the picture.
 * @param {Landmark[] | null | undefined} landmarks
 * @param {number} [minVisibility]
 * @returns {boolean}
 */
export function bodyInFrame(landmarks, minVisibility = CALIBRATION_CONFIG.minVisibility) {
  if (!landmarks || landmarks.length <= LANDMARK.RIGHT_KNEE) return false;
  for (const index of REQUIRED_LANDMARKS) {
    const point = landmarks[index];
    if (!point || !(point.visibility > minVisibility)) return false;
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return false;
  }
  return true;
}

/**
 * Height of the point halfway between the hips (normalised y, smaller = higher).
 * @param {Landmark[]} landmarks
 * @returns {number}
 */
export function hipMidY(landmarks) {
  return (landmarks[LANDMARK.LEFT_HIP].y + landmarks[LANDMARK.RIGHT_HIP].y) / 2;
}

/**
 * Distance from the shoulder midpoint to the hip midpoint (normalised units).
 * @param {Landmark[]} landmarks
 * @returns {number}
 */
export function torsoLength(landmarks) {
  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];
  const dx = (leftShoulder.x + rightShoulder.x) / 2 - (leftHip.x + rightHip.x) / 2;
  const dy = (leftShoulder.y + rightShoulder.y) / 2 - (leftHip.y + rightHip.y) / 2;
  return Math.hypot(dx, dy);
}

/**
 * Median of a non-empty list. Sorts a copy, so it is only called once per calibration.
 * @param {number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Creates a calibrator. Feed it every pose frame until status is "ready".
 *
 * update() returns the SAME object every call (no garbage in the frame loop),
 * so read it immediately and do not keep a reference to it.
 *
 * @param {Partial<typeof CALIBRATION_CONFIG>} [options]
 * @returns {{
 *   update: (landmarks: Landmark[] | null | undefined, nowMs: number) => CalibrationUpdate,
 *   reset: () => void,
 *   getCalibration: () => Calibration | null,
 * }}
 */
export function createCalibrator(options = {}) {
  const config = { ...CALIBRATION_CONFIG, ...options };

  /** @type {number[]} */
  const hipSamples = [];
  /** @type {number[]} */
  const torsoSamples = [];
  /** @type {number | null} */
  let startedAt = null;
  let lastGoodAt = 0;
  /** @type {Calibration | null} */
  let calibration = null;

  /** @type {CalibrationUpdate} */
  const result = {
    status: "no_body",
    progress: 0,
    hintKey: "no_body",
    hint: CALIBRATION_HINTS.no_body,
    calibration: null,
  };

  /** @param {CalibrationHintKey} key */
  function setHint(key) {
    result.hintKey = key;
    result.hint = CALIBRATION_HINTS[key];
  }

  function restart() {
    hipSamples.length = 0;
    torsoSamples.length = 0;
    startedAt = null;
  }

  function reset() {
    restart();
    calibration = null;
    result.status = "no_body";
    result.progress = 0;
    setHint("no_body");
    result.calibration = null;
  }

  /**
   * @param {Landmark[] | null | undefined} landmarks
   * @param {number} nowMs
   * @returns {CalibrationUpdate}
   */
  function update(landmarks, nowMs) {
    if (calibration) return result;

    const inFrame = bodyInFrame(landmarks, config.minVisibility);
    const torso = inFrame && landmarks ? torsoLength(landmarks) : 0;
    const good = inFrame && torso >= config.minTorsoLength;

    if (!good || !landmarks) {
      const briefGap = startedAt !== null && nowMs - lastGoodAt <= config.lostGraceMs;
      if (briefGap) {
        // Keep the timer running through a flicker, but do not sample this frame.
        return result;
      }
      restart();
      result.status = "no_body";
      result.progress = 0;
      setHint(inFrame ? "too_far" : "no_body");
      return result;
    }

    // A long silence between frames breaks "continuous": start counting again from this frame.
    if (startedAt !== null && nowMs - lastGoodAt > config.maxFrameGapMs) restart();

    if (startedAt === null) startedAt = nowMs;
    lastGoodAt = nowMs;
    hipSamples.push(hipMidY(landmarks));
    torsoSamples.push(torso);

    const elapsed = nowMs - startedAt;
    if (elapsed >= config.durationMs && hipSamples.length >= config.minSamples) {
      calibration = {
        baselineHipY: median(hipSamples),
        torsoLength: median(torsoSamples),
      };
      hipSamples.length = 0;
      torsoSamples.length = 0;
      result.status = "ready";
      result.progress = 1;
      setHint("ready");
      result.calibration = calibration;
      return result;
    }

    result.status = "calibrating";
    result.progress = Math.min(elapsed / config.durationMs, 1);
    setHint("calibrating");
    return result;
  }

  return {
    update,
    reset,
    getCalibration: () => calibration,
  };
}
