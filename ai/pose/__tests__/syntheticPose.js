// @ts-check
// Builds fake MediaPipe pose frames for tests. No camera or model needed.

import { LANDMARK } from "../calibration.js";

/** @typedef {import("../poseEngine.js").Landmark} Landmark */

/** Standing pose used as the default: torso length 0.25, hips at y = 0.55. */
export const STANDING = Object.freeze({
  shoulderY: 0.3,
  hipY: 0.55,
  kneeY: 0.75,
  ankleY: 0.92,
  wristY: 0.6,
});

/**
 * @typedef {object} PoseOptions
 * @property {number} [lift]  Moves the WHOLE body up by this much (normalised y). A jump.
 * @property {number} [scale]  Shrinks or grows the body around the hips (1 = default size).
 * @property {number} [leftWristY]
 * @property {number} [rightWristY]
 * @property {Record<number, number>} [visibility]  Per-landmark visibility overrides.
 */

/**
 * Returns 33 landmarks for a person standing in the middle of the picture.
 * @param {PoseOptions} [options]
 * @returns {Landmark[]}
 */
export function makePose(options = {}) {
  const { lift = 0, scale = 1, visibility = {} } = options;

  /** @param {number} y */
  const place = (y) => STANDING.hipY + (y - STANDING.hipY) * scale - lift;

  /** @type {Landmark[]} */
  const landmarks = [];
  for (let i = 0; i < 33; i += 1) {
    landmarks.push({ x: 0.5, y: place(0.2), z: 0, visibility: 0.99 });
  }

  /**
   * @param {number} index
   * @param {number} x
   * @param {number} y
   */
  const set = (index, x, y) => {
    landmarks[index].x = x;
    landmarks[index].y = y;
  };

  set(LANDMARK.NOSE, 0.5, place(0.18));
  set(LANDMARK.LEFT_SHOULDER, 0.56, place(STANDING.shoulderY));
  set(LANDMARK.RIGHT_SHOULDER, 0.44, place(STANDING.shoulderY));
  set(LANDMARK.LEFT_ELBOW, 0.6, place(0.45));
  set(LANDMARK.RIGHT_ELBOW, 0.4, place(0.45));
  set(LANDMARK.LEFT_WRIST, 0.61, options.leftWristY ?? place(STANDING.wristY));
  set(LANDMARK.RIGHT_WRIST, 0.39, options.rightWristY ?? place(STANDING.wristY));
  set(LANDMARK.LEFT_HIP, 0.54, place(STANDING.hipY));
  set(LANDMARK.RIGHT_HIP, 0.46, place(STANDING.hipY));
  set(LANDMARK.LEFT_KNEE, 0.54, place(STANDING.kneeY));
  set(LANDMARK.RIGHT_KNEE, 0.46, place(STANDING.kneeY));
  set(LANDMARK.LEFT_ANKLE, 0.54, place(STANDING.ankleY));
  set(LANDMARK.RIGHT_ANKLE, 0.46, place(STANDING.ankleY));

  for (const [index, value] of Object.entries(visibility)) {
    landmarks[Number(index)].visibility = value;
  }
  return landmarks;
}
