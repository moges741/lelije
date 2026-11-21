// @ts-check
import { describe, expect, it } from "vitest";
import { LANDMARK } from "../calibration.js";
import {
  createJumpDetector,
  createJumpingJackDetector,
  createMotionEnergyDetector,
  createOneLegBalanceDetector,
  createSquatDetector,
} from "../detectors.js";
import { makePose, STANDING } from "./syntheticPose.js";

const CALIBRATION = Object.freeze({ baselineHipY: STANDING.hipY, torsoLength: 0.25 });
const FRAME_MS = 33;

/**
 * Helper to make a pose with arbitrary landmark tweaks.
 * @param {(lm: ReturnType<typeof makePose>) => void} mutate
 * @param {import("./syntheticPose.js").PoseOptions} [opts]
 */
function customPose(mutate, opts = {}) {
  const lm = makePose(opts);
  mutate(lm);
  return lm;
}

describe("createSquatDetector", () => {
  it("counts one squat when hips drop below threshold and stand back up", () => {
    const det = createSquatDetector();
    let count = 0;
    let sawSquatting = false;

    for (let t = 0; t <= 3000; t += FRAME_MS) {
      // Drop hips by 0.08 (0.32 torso lengths) between 800..1500 ms.
      const drop = t >= 800 && t <= 1500 ? -0.08 : 0;
      if (det.update(makePose({ lift: drop }), t, CALIBRATION)) count += 1;
      if (det.state.squatting) sawSquatting = true;
    }

    expect(sawSquatting).toBe(true);
    expect(count).toBe(1);
  });

  it("ignores shallow knee bends below dropFraction", () => {
    const det = createSquatDetector();
    let count = 0;
    for (let t = 0; t <= 2000; t += FRAME_MS) {
      const drop = t >= 500 && t <= 1000 ? -0.03 : 0; // 0.12 torso < 0.22
      if (det.update(makePose({ lift: drop }), t, CALIBRATION)) count += 1;
    }
    expect(count).toBe(0);
  });

  it("does not cause a false jump when standing back up from a long deep squat", () => {
    const jump = createJumpDetector();
    const squat = createSquatDetector();
    let jumps = 0;
    let squats = 0;

    for (let t = 0; t <= 4500; t += FRAME_MS) {
      const lift = t >= 600 && t <= 3000 ? -0.09 : 0; // 2.4 s deep squat
      const pose = makePose({ lift });
      if (jump.update(pose, t, CALIBRATION)) jumps += 1;
      if (squat.update(pose, t, CALIBRATION)) squats += 1;
    }

    expect(squats).toBe(1);
    expect(jumps).toBe(0);
  });
});

describe("createJumpingJackDetector", () => {
  it("counts a full open-to-closed jumping jack and scales by torsoLength", () => {
    const det = createJumpingJackDetector();
    const openPose = () =>
      customPose((lm) => {
        lm[LANDMARK.LEFT_WRIST].y = STANDING.shoulderY - 0.06;
        lm[LANDMARK.RIGHT_WRIST].y = STANDING.shoulderY - 0.06;
        lm[LANDMARK.LEFT_ANKLE].x = 0.62;
        lm[LANDMARK.RIGHT_ANKLE].x = 0.38; // spread 0.24 = 0.96 torso
      });
    const closedPose = () => makePose(); // wrists down, ankles spread 0.08 = 0.32 torso

    let reps = 0;
    for (let t = 0; t <= 3000; t += FRAME_MS) {
      const isOpen = (t >= 400 && t <= 700) || (t >= 1600 && t <= 1900);
      if (det.update(isOpen ? openPose() : closedPose(), t, CALIBRATION)) reps += 1;
    }
    expect(reps).toBe(2);
  });

  it("does not count arms-only raises when feet stay together", () => {
    const det = createJumpingJackDetector();
    const armsOnly = () =>
      makePose({ leftWristY: STANDING.shoulderY - 0.06, rightWristY: STANDING.shoulderY - 0.06 });

    let reps = 0;
    for (let t = 0; t <= 2000; t += FRAME_MS) {
      const pose = t >= 400 && t <= 800 ? armsOnly() : makePose();
      if (det.update(pose, t, CALIBRATION)) reps += 1;
    }
    expect(reps).toBe(0);
  });
});

describe("createOneLegBalanceDetector", () => {
  it("accumulates balanced whole seconds when one ankle is lifted", () => {
    const det = createOneLegBalanceDetector();
    const lifted = () =>
      customPose((lm) => {
        lm[LANDMARK.LEFT_ANKLE].y = STANDING.ankleY - 0.08; // 0.32 torso > 0.22
      });

    let totalSeconds = 0;
    for (let t = 0; t <= 3200; t += 100) {
      totalSeconds += det.update(lifted(), t, CALIBRATION);
    }
    expect(totalSeconds).toBe(3);
    expect(det.state.balanced).toBe(true);
  });

  it("does not accrue balance time when both feet are on the floor", () => {
    const det = createOneLegBalanceDetector();
    let totalSeconds = 0;
    for (let t = 0; t <= 2500; t += 100) {
      totalSeconds += det.update(makePose(), t, CALIBRATION);
    }
    expect(totalSeconds).toBe(0);
    expect(det.state.balanced).toBe(false);
  });
});

describe("createMotionEnergyDetector", () => {
  it("distinguishes standing still from active dancing", () => {
    const det = createMotionEnergyDetector();
    let movingFramesStill = 0;
    for (let t = 0; t <= 1000; t += 50) {
      if (det.update(makePose(), t, CALIBRATION).moving) movingFramesStill += 1;
    }
    expect(movingFramesStill).toBe(0);

    let movingFramesDance = 0;
    for (let t = 1050; t <= 2050; t += 50) {
      const sway = 0.05 * Math.sin(t / 80);
      const pose = customPose((lm) => {
        for (const p of lm) p.x += sway;
      });
      if (det.update(pose, t, CALIBRATION).moving) movingFramesDance += 1;
    }
    expect(movingFramesDance).toBeGreaterThan(5);
  });

  it("detects Eskista shoulder rhythm beats", () => {
    const det = createMotionEnergyDetector();
    let beats = 0;
    for (let t = 0; t <= 2000; t += 100) {
      const upLeft = Math.floor(t / 300) % 2 === 0;
      const pose = customPose((lm) => {
        lm[LANDMARK.LEFT_SHOULDER].y = STANDING.shoulderY + (upLeft ? -0.025 : 0.025);
        lm[LANDMARK.RIGHT_SHOULDER].y = STANDING.shoulderY + (upLeft ? 0.025 : -0.025);
      });
      if (det.update(pose, t, CALIBRATION).shoulderBeat) beats += 1;
    }
    expect(beats).toBeGreaterThanOrEqual(4);
  });
});
