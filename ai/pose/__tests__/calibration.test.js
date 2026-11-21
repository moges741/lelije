// @ts-check
import { describe, expect, it } from "vitest";
import {
  bodyInFrame,
  CALIBRATION_HINTS,
  createCalibrator,
  hipMidY,
  LANDMARK,
  torsoLength,
} from "../calibration.js";
import { makePose, STANDING } from "./syntheticPose.js";

const FRAME_MS = 33; // about 30 FPS

/**
 * Feeds one frame every FRAME_MS from `fromMs` up to and including `toMs`.
 * Returns a copy of the last update (the calibrator reuses its result object).
 * @param {ReturnType<typeof createCalibrator>} calibrator
 * @param {number} fromMs
 * @param {number} toMs
 * @param {(timeMs: number) => ReturnType<typeof makePose> | null} frameAt
 */
function feed(calibrator, fromMs, toMs, frameAt) {
  let last = null;
  for (let t = fromMs; t <= toMs; t += FRAME_MS) {
    last = { ...calibrator.update(frameAt(t), t) };
  }
  if (!last) throw new Error("feed() produced no frames");
  return last;
}

const standing = () => makePose();

describe("bodyInFrame", () => {
  it("is true for a fully visible standing body", () => {
    expect(bodyInFrame(makePose())).toBe(true);
  });

  it("is false when there is no pose", () => {
    expect(bodyInFrame(null)).toBe(false);
    expect(bodyInFrame(undefined)).toBe(false);
    expect(bodyInFrame([])).toBe(false);
  });

  it("is false when a knee has low visibility", () => {
    expect(bodyInFrame(makePose({ visibility: { [LANDMARK.LEFT_KNEE]: 0.3 } }))).toBe(false);
  });

  it("is false when a shoulder or hip has low visibility", () => {
    expect(bodyInFrame(makePose({ visibility: { [LANDMARK.RIGHT_SHOULDER]: 0.2 } }))).toBe(false);
    expect(bodyInFrame(makePose({ visibility: { [LANDMARK.LEFT_HIP]: 0.5 } }))).toBe(false);
  });

  it("is false when the knees are below the bottom of the picture", () => {
    // Child too close: the whole body is shifted down, knees end up at y = 1.05.
    expect(bodyInFrame(makePose({ lift: -0.3 }))).toBe(false);
  });

  it("does not need ankles or wrists", () => {
    const pose = makePose({
      visibility: {
        [LANDMARK.LEFT_ANKLE]: 0.1,
        [LANDMARK.RIGHT_ANKLE]: 0.1,
        [LANDMARK.LEFT_WRIST]: 0.1,
        [LANDMARK.RIGHT_WRIST]: 0.1,
      },
    });
    expect(bodyInFrame(pose)).toBe(true);
  });
});

describe("body measurements", () => {
  it("measures the hip midpoint and torso length", () => {
    const pose = makePose();
    expect(hipMidY(pose)).toBeCloseTo(STANDING.hipY, 6);
    expect(torsoLength(pose)).toBeCloseTo(STANDING.hipY - STANDING.shoulderY, 6);
  });

  it("gives a shorter torso for a smaller or more distant body", () => {
    expect(torsoLength(makePose({ scale: 0.5 }))).toBeCloseTo(0.125, 6);
  });
});

describe("createCalibrator", () => {
  it("reports no_body with a hint while nobody is in view", () => {
    const calibrator = createCalibrator();
    const update = feed(calibrator, 0, 1000, () => null);
    expect(update.status).toBe("no_body");
    expect(update.progress).toBe(0);
    expect(update.hint).toBe(CALIBRATION_HINTS.no_body);
    expect(update.calibration).toBeNull();
  });

  it("shows growing progress, then becomes ready after 3 seconds", () => {
    const calibrator = createCalibrator();

    const early = feed(calibrator, 0, 990, standing);
    expect(early.status).toBe("calibrating");
    expect(early.progress).toBeCloseTo(0.33, 2);

    const almost = feed(calibrator, 1023, 2970, standing);
    expect(almost.status).toBe("calibrating");
    expect(almost.calibration).toBeNull();

    const done = feed(calibrator, 3003, 3003, standing);
    expect(done.status).toBe("ready");
    expect(done.progress).toBe(1);
    expect(done.calibration?.baselineHipY).toBeCloseTo(0.55, 6);
    expect(done.calibration?.torsoLength).toBeCloseTo(0.25, 6);
    expect(calibrator.getCalibration()).toEqual(done.calibration);
  });

  it("restarts the timer when the body is lost", () => {
    const calibrator = createCalibrator();
    feed(calibrator, 0, 1485, standing);

    // Out of view for about 600 ms: longer than the grace period.
    const lost = feed(calibrator, 1518, 2112, () => null);
    expect(lost.status).toBe("no_body");
    expect(lost.progress).toBe(0);

    // Back in view at 2145: a full 3 seconds is needed again.
    const notYet = feed(calibrator, 2145, 2145 + 2970, standing);
    expect(notYet.status).toBe("calibrating");

    const done = feed(calibrator, 2145 + 3003, 2145 + 3003, standing);
    expect(done.status).toBe("ready");
  });

  it("does not restart for a flicker shorter than the grace period", () => {
    const calibrator = createCalibrator();
    // Two bad frames (66 ms) in the middle of calibration.
    const flicker = (/** @type {number} */ t) =>
      t === 1485 || t === 1518 ? makePose({ visibility: { [LANDMARK.LEFT_KNEE]: 0.2 } }) : makePose();

    const duringFlicker = feed(calibrator, 0, 1518, flicker);
    expect(duringFlicker.status).toBe("calibrating");

    const done = feed(calibrator, 1551, 3003, flicker);
    expect(done.status).toBe("ready");
  });

  it("restarts on a single bad frame when lostGraceMs is 0", () => {
    const calibrator = createCalibrator({ lostGraceMs: 0 });
    feed(calibrator, 0, 1485, standing);
    const bad = feed(calibrator, 1518, 1518, () => null);
    expect(bad.status).toBe("no_body");

    const notYet = feed(calibrator, 1551, 3003, standing);
    expect(notYet.status).toBe("calibrating");
  });

  it("uses the median, so a hop during calibration does not move the baseline", () => {
    const calibrator = createCalibrator();
    const hop = (/** @type {number} */ t) => makePose({ lift: t >= 1000 && t <= 1300 ? 0.1 : 0 });
    const done = feed(calibrator, 0, 3003, hop);
    expect(done.status).toBe("ready");
    expect(done.calibration?.baselineHipY).toBeCloseTo(0.55, 6);
  });

  it("calibrates a small child with a proportionally smaller torso", () => {
    const calibrator = createCalibrator();
    const done = feed(calibrator, 0, 3003, () => makePose({ scale: 0.5 }));
    expect(done.status).toBe("ready");
    expect(done.calibration?.torsoLength).toBeCloseTo(0.125, 6);
    expect(done.calibration?.baselineHipY).toBeCloseTo(0.55, 6);
  });

  it("asks the child to come closer when the body is too small to measure", () => {
    const calibrator = createCalibrator();
    const update = feed(calibrator, 0, 3500, () => makePose({ scale: 0.2 }));
    expect(update.status).toBe("no_body");
    expect(update.hint).toBe(CALIBRATION_HINTS.too_far);
    expect(update.calibration).toBeNull();
  });

  it("does not count a long stall between frames as standing still", () => {
    const calibrator = createCalibrator();
    // First frame, then the model warm-up freezes everything for 3.5 seconds.
    feed(calibrator, 0, 0, standing);
    const afterStall = feed(calibrator, 3500, 3500 + 12 * FRAME_MS, standing);
    expect(afterStall.status).toBe("calibrating");
    expect(afterStall.progress).toBeLessThan(0.2);

    const notYet = feed(calibrator, 3500 + 13 * FRAME_MS, 3500 + 2970, standing);
    expect(notYet.status).toBe("calibrating");

    const done = feed(calibrator, 3500 + 3003, 3500 + 3003, standing);
    expect(done.status).toBe("ready");
  });

  it("needs a minimum number of good frames, not only elapsed time", () => {
    const calibrator = createCalibrator();
    // A very slow device: one good frame every 400 ms.
    let last = null;
    for (let t = 0; t <= 3200; t += 400) last = { ...calibrator.update(makePose(), t) };
    // 3200 ms have passed, but that is only 9 samples.
    expect(last?.status).toBe("calibrating");

    last = { ...calibrator.update(makePose(), 3600) }; // 10th sample
    expect(last.status).toBe("ready");
  });

  it("stays ready once calibrated, and reset() starts over", () => {
    const calibrator = createCalibrator();
    feed(calibrator, 0, 3003, standing);

    const stillReady = feed(calibrator, 3036, 3500, () => null);
    expect(stillReady.status).toBe("ready");
    expect(stillReady.calibration).not.toBeNull();

    calibrator.reset();
    expect(calibrator.getCalibration()).toBeNull();
    const again = feed(calibrator, 4000, 4000, standing);
    expect(again.status).toBe("calibrating");
    expect(again.progress).toBe(0);
  });
});
