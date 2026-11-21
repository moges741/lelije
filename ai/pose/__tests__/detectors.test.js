// @ts-check
import { describe, expect, it } from "vitest";
import { LANDMARK } from "../calibration.js";
import { createArmsUpDetector, createJumpDetector, DETECTOR_CONFIG } from "../detectors.js";
import { makePose, STANDING } from "./syntheticPose.js";

const FRAME_MS = 33; // about 30 FPS

/** Calibration that matches makePose(): hips at 0.55, torso 0.25. */
const CALIBRATION = Object.freeze({ baselineHipY: STANDING.hipY, torsoLength: 0.25 });

/**
 * Small repeatable camera jitter (about +/- 0.003, roughly 1.5 px at 480p).
 * @param {number} frame
 */
const jitter = (frame) => 0.003 * Math.sin(frame * 12.9898);

/**
 * How far the body is lifted at time t for a jump that starts at `startMs`:
 * a short crouch, then up and back down.
 * @param {number} t
 * @param {number} startMs
 * @param {number} height  Peak lift in normalised units.
 * @param {number} [airMs]
 */
function jumpLift(t, startMs, height, airMs = 500) {
  if (t >= startMs - 200 && t < startMs) return -0.02; // crouch before take-off
  if (t >= startMs && t <= startMs + airMs) return height * Math.sin((Math.PI * (t - startMs)) / airMs);
  return 0;
}

/**
 * Runs a detector over a time range and returns the time of every event.
 * @param {{ update: (landmarks: any, nowMs: number, calibration: any) => boolean }} detector
 * @param {number} fromMs
 * @param {number} toMs
 * @param {(t: number, frame: number) => ReturnType<typeof makePose> | null} poseAt
 * @param {{ calibration?: typeof CALIBRATION, frameMs?: number }} [options]
 * @returns {number[]}
 */
function run(detector, fromMs, toMs, poseAt, options = {}) {
  const calibration = options.calibration ?? CALIBRATION;
  const frameMs = options.frameMs ?? FRAME_MS;
  /** @type {number[]} */
  const events = [];
  let frame = 0;
  for (let t = fromMs; t <= toMs; t += frameMs) {
    if (detector.update(poseAt(t, frame), t, calibration)) events.push(t);
    frame += 1;
  }
  return events;
}

describe("createJumpDetector", () => {
  it("produces no events while standing still", () => {
    const detector = createJumpDetector();
    const events = run(detector, 0, 10_000, (_t, frame) => makePose({ lift: jitter(frame) }));
    expect(events).toEqual([]);
  });

  it("produces exactly one event for one jump", () => {
    const detector = createJumpDetector();
    const events = run(detector, 0, 3000, (t, frame) => makePose({ lift: jumpLift(t, 1000, 0.08) + jitter(frame) }));
    expect(events).toHaveLength(1);
  });

  it("fires at take-off, on the way up", () => {
    const detector = createJumpDetector();
    const events = run(detector, 0, 3000, (t) => makePose({ lift: jumpLift(t, 1000, 0.08) }));
    expect(events[0]).toBeGreaterThan(1000);
    expect(events[0]).toBeLessThan(1250); // the top of the jump is at 1250
  });

  it("counts three separate jumps as three", () => {
    const detector = createJumpDetector();
    const lift = (/** @type {number} */ t) =>
      jumpLift(t, 1000, 0.08) + jumpLift(t, 2500, 0.08) + jumpLift(t, 4000, 0.08);
    const events = run(detector, 0, 6000, (t, frame) => makePose({ lift: lift(t) + jitter(frame) }));
    expect(events).toHaveLength(3);
  });

  it("ignores a small bounce below the rise threshold", () => {
    const detector = createJumpDetector();
    // 0.03 is 0.12 torso lengths: under the 0.18 needed.
    const events = run(detector, 0, 3000, (t) => makePose({ lift: jumpLift(t, 1000, 0.03) }));
    expect(events).toEqual([]);
  });

  it("produces no events when the hips have low visibility", () => {
    const detector = createJumpDetector();
    const hidden = { [LANDMARK.LEFT_HIP]: 0.2, [LANDMARK.RIGHT_HIP]: 0.2 };
    const events = run(detector, 0, 3000, (t) =>
      makePose({ lift: jumpLift(t, 1000, 0.08), visibility: hidden })
    );
    expect(events).toEqual([]);
  });

  it("ignores frames with one hidden hip but still counts the jump from the visible frames", () => {
    const detector = createJumpDetector();
    const events = run(detector, 0, 3000, (t, frame) =>
      makePose({
        lift: jumpLift(t, 1000, 0.08),
        // Every third frame loses the left hip.
        visibility: frame % 3 === 0 ? { [LANDMARK.LEFT_HIP]: 0.1 } : {},
      })
    );
    expect(events).toHaveLength(1);
  });

  it("uses the cooldown to prevent double counting", () => {
    // Two peaks only 200 ms apart, with a dip back to standing in between.
    const doublePeak = (/** @type {number} */ t) =>
      (t >= 1000 && t <= 1100) || (t >= 1200 && t <= 1300) ? 0.08 : 0;

    const withCooldown = createJumpDetector({ smoothingFrames: 1 });
    expect(run(withCooldown, 0, 3000, (t) => makePose({ lift: doublePeak(t) }))).toHaveLength(1);

    // Without the cooldown the same movement is counted twice, so the cooldown is what stops it.
    const noCooldown = createJumpDetector({ smoothingFrames: 1, cooldownMs: 0 });
    expect(run(noCooldown, 0, 3000, (t) => makePose({ lift: doublePeak(t) }))).toHaveLength(2);
  });

  it("scales with body size: the same lift is a jump for a small child but not for an adult", () => {
    const lift = (/** @type {number} */ t) => jumpLift(t, 1000, 0.04);

    // Small child: torso 0.125, so 0.04 is 0.32 torso lengths.
    const child = createJumpDetector();
    const childCalibration = { baselineHipY: STANDING.hipY, torsoLength: 0.125 };
    const childEvents = run(child, 0, 3000, (t) => makePose({ scale: 0.5, lift: lift(t) }), {
      calibration: childCalibration,
    });
    expect(childEvents).toHaveLength(1);

    // Adult-sized body: torso 0.25, so 0.04 is only 0.16 torso lengths.
    const adult = createJumpDetector();
    expect(run(adult, 0, 3000, (t) => makePose({ lift: lift(t) }))).toEqual([]);
  });

  it("follows slow drift without events, then detects a jump from the new position", () => {
    const detector = createJumpDetector();
    // Over 10 s the child drifts so the hips end 0.06 higher in the picture
    // (0.24 torso lengths: more than the rise threshold, but slow).
    const drift = (/** @type {number} */ t) => 0.06 * Math.min(t / 10_000, 1);

    const whileDrifting = run(detector, 0, 12_000, (t, frame) => makePose({ lift: drift(t) + jitter(frame) }));
    expect(whileDrifting).toEqual([]);
    // The standing height has followed the drift (it trails slightly behind by design).
    const followed = STANDING.hipY - (detector.state.baselineHipY ?? 0);
    expect(followed).toBeGreaterThan(0.045);
    expect(followed).toBeLessThanOrEqual(0.06);

    const afterDrift = run(detector, 12_033, 15_000, (t) => makePose({ lift: 0.06 + jumpLift(t, 13_000, 0.08) }));
    expect(afterDrift).toHaveLength(1);
  });

  it("does not move the standing height while the child is in the air", () => {
    const detector = createJumpDetector();
    run(detector, 0, 990, () => makePose());

    // Feed "in the air" frames until take-off is detected, and note the standing height.
    let t = 1023;
    while (!detector.update(makePose({ lift: 0.08 }), t, CALIBRATION)) t += FRAME_MS;
    const atTakeOff = detector.state.baselineHipY;
    // Take-off is recognised within a few frames, and the standing height has barely moved by then.
    expect(t).toBeLessThan(1023 + 5 * FRAME_MS);
    expect(Math.abs((atTakeOff ?? 0) - STANDING.hipY) / CALIBRATION.torsoLength).toBeLessThan(0.01);

    // Stay in the air for another 800 ms (less than maxJumpMs): no change at all.
    run(detector, t + FRAME_MS, t + 800, () => makePose({ lift: 0.08 }));
    expect(detector.state.jumping).toBe(true);
    expect(detector.state.baselineHipY).toBe(atTakeOff);
  });

  it("recovers when the child steps closer instead of jumping", () => {
    const detector = createJumpDetector();
    run(detector, 0, 990, () => makePose());

    // The hips move up in the picture and STAY there: it looks like one jump that never lands.
    const step = run(detector, 1023, 4000, () => makePose({ lift: 0.08 }));
    expect(step).toHaveLength(1);
    expect(detector.state.jumping).toBe(false);
    expect(detector.state.baselineHipY).toBeCloseTo(STANDING.hipY - 0.08, 3);

    // A real jump from the new position is still detected.
    const jump = run(detector, 4033, 6000, (t) => makePose({ lift: 0.08 + jumpLift(t, 5000, 0.08) }));
    expect(jump).toHaveLength(1);
  });

  it("still detects a jump on a slow phone (about 8 FPS)", () => {
    const detector = createJumpDetector();
    const events = run(detector, 0, 3000, (t) => makePose({ lift: jumpLift(t, 1000, 0.08) }), { frameMs: 125 });
    expect(events).toHaveLength(1);
  });

  it("returns false without a pose or without calibration", () => {
    const detector = createJumpDetector();
    expect(detector.update(null, 0, CALIBRATION)).toBe(false);
    expect(detector.update(makePose({ lift: 0.1 }), 33, null)).toBe(false);
    expect(detector.update(makePose({ lift: 0.1 }), 66, undefined)).toBe(false);
  });

  it("starts fresh after reset()", () => {
    const detector = createJumpDetector();
    run(detector, 0, 3000, (t) => makePose({ lift: jumpLift(t, 1000, 0.08) }));
    detector.reset();
    expect(detector.state).toEqual({ baselineHipY: null, offsetFraction: 0, jumping: false });
    const events = run(detector, 5000, 8000, (t) => makePose({ lift: jumpLift(t, 6000, 0.08) }));
    expect(events).toHaveLength(1);
  });

  it("exposes its default thresholds in DETECTOR_CONFIG", () => {
    expect(DETECTOR_CONFIG.jump).toMatchObject({ riseFraction: 0.18, returnFraction: 0.06, cooldownMs: 400 });
    expect(DETECTOR_CONFIG.armsUp).toMatchObject({ marginFraction: 0.1, holdMs: 150, cooldownMs: 500 });
  });
});

describe("createArmsUpDetector", () => {
  /** Wrists 0.05 above the shoulders: 0.2 torso lengths, twice the margin. */
  const UP = STANDING.shoulderY - 0.05;

  /**
   * Both arms up between fromMs and toMs.
   * @param {number} fromMs
   * @param {number} toMs
   */
  const raisedBetween = (fromMs, toMs) => (/** @type {number} */ t) =>
    t >= fromMs && t <= toMs ? makePose({ leftWristY: UP, rightWristY: UP }) : makePose();

  it("produces no events while the arms are down", () => {
    const detector = createArmsUpDetector();
    expect(run(detector, 0, 10_000, (_t, frame) => makePose({ lift: jitter(frame) }))).toEqual([]);
  });

  it("produces exactly one event when both arms are raised", () => {
    const detector = createArmsUpDetector();
    const events = run(detector, 0, 3000, raisedBetween(1000, 2000));
    expect(events).toHaveLength(1);
    // Fires after the 150 ms hold, not immediately.
    expect(events[0]).toBeGreaterThanOrEqual(1150);
    expect(events[0]).toBeLessThan(1300);
  });

  it("does not fire again while the arms stay up", () => {
    const detector = createArmsUpDetector();
    expect(run(detector, 0, 6000, raisedBetween(1000, 5000))).toHaveLength(1);
  });

  it("ignores a raise shorter than the hold time", () => {
    const detector = createArmsUpDetector();
    expect(run(detector, 0, 3000, raisedBetween(1000, 1100))).toEqual([]);
  });

  it("needs BOTH arms", () => {
    const detector = createArmsUpDetector();
    const events = run(detector, 0, 3000, (t) => (t >= 1000 && t <= 2000 ? makePose({ leftWristY: UP }) : makePose()));
    expect(events).toEqual([]);
  });

  it("ignores wrists that are above the shoulders by less than the margin", () => {
    const detector = createArmsUpDetector();
    const barely = STANDING.shoulderY - 0.01; // 0.04 torso lengths, margin is 0.10
    const events = run(detector, 0, 3000, () => makePose({ leftWristY: barely, rightWristY: barely }));
    expect(events).toEqual([]);
  });

  it("produces no events when the wrists have low visibility", () => {
    const detector = createArmsUpDetector();
    const hidden = { [LANDMARK.LEFT_WRIST]: 0.2, [LANDMARK.RIGHT_WRIST]: 0.2 };
    const events = run(detector, 0, 3000, () => makePose({ leftWristY: UP, rightWristY: UP, visibility: hidden }));
    expect(events).toEqual([]);
  });

  it("counts a second raise after the arms came down", () => {
    const detector = createArmsUpDetector();
    const twice = (/** @type {number} */ t) =>
      (t >= 1000 && t <= 1500) || (t >= 2500 && t <= 3000)
        ? makePose({ leftWristY: UP, rightWristY: UP })
        : makePose();
    expect(run(detector, 0, 4000, twice)).toHaveLength(2);
  });

  it("uses the cooldown to prevent double counting", () => {
    // Up, a brief drop, and up again: the second hold finishes inside the cooldown.
    const flap = (/** @type {number} */ t) =>
      (t >= 1000 && t <= 1250) || (t >= 1320 && t <= 1560)
        ? makePose({ leftWristY: UP, rightWristY: UP })
        : makePose();

    const withCooldown = createArmsUpDetector();
    expect(run(withCooldown, 0, 3000, flap)).toHaveLength(1);

    const noCooldown = createArmsUpDetector({ cooldownMs: 0 });
    expect(run(noCooldown, 0, 3000, flap)).toHaveLength(2);
  });

  it("scales the margin with body size", () => {
    // Small child (torso 0.125): wrists 0.02 above the shoulders is 0.16 torso lengths.
    const child = createArmsUpDetector();
    const childCalibration = { baselineHipY: STANDING.hipY, torsoLength: 0.125 };
    const childShoulderY = STANDING.hipY - 0.125;
    const pose = () => makePose({ scale: 0.5, leftWristY: childShoulderY - 0.02, rightWristY: childShoulderY - 0.02 });
    expect(run(child, 0, 2000, pose, { calibration: childCalibration })).toHaveLength(1);

    // The same 0.02 on an adult-sized body is only 0.08 torso lengths: not enough.
    const adult = createArmsUpDetector();
    const adultPose = () =>
      makePose({ leftWristY: STANDING.shoulderY - 0.02, rightWristY: STANDING.shoulderY - 0.02 });
    expect(run(adult, 0, 2000, adultPose)).toEqual([]);
  });

  it("works while the child is jumping", () => {
    const detector = createArmsUpDetector();
    // Whole body lifted by 0.08; wrists are measured against the shoulders, not the picture.
    const events = run(detector, 0, 2000, () =>
      makePose({ lift: 0.08, leftWristY: UP - 0.08, rightWristY: UP - 0.08 })
    );
    expect(events).toHaveLength(1);
  });

  it("returns false without a pose or without calibration, and starts fresh after reset()", () => {
    const detector = createArmsUpDetector();
    expect(detector.update(null, 0, CALIBRATION)).toBe(false);
    expect(detector.update(makePose({ leftWristY: UP, rightWristY: UP }), 33, null)).toBe(false);

    expect(run(detector, 100, 1000, raisedBetween(100, 1000))).toHaveLength(1);
    detector.reset();
    expect(detector.state).toEqual({ raised: false, heldMs: 0 });
    expect(run(detector, 1033, 2000, raisedBetween(1033, 2000))).toHaveLength(1);
  });
});
