// @ts-check
import { describe, expect, it } from "vitest";
import { createDifficultyController, paramsForLevel } from "../difficulty.js";

describe("createDifficultyController (F3)", () => {
  it("raises level when accuracy over 10 attempts exceeds 85%", () => {
    const ctrl = createDifficultyController({ startDifficulty: 2 });
    let last = ctrl.recordAttempt(true, 0);
    for (let i = 1; i < 9; i += 1) {
      last = ctrl.recordAttempt(true, i * 1000);
      expect(last.changed).toBe(false);
    }
    // 10th attempt -> 10/10 = 100% > 85%
    last = ctrl.recordAttempt(true, 10_000);
    expect(last.changed).toBe(true);
    expect(last.direction).toBe(1);
    expect(last.level).toBe(3);
  });

  it("lowers level when accuracy over 10 attempts falls below 50%", () => {
    const ctrl = createDifficultyController({ startDifficulty: 3 });
    let last = ctrl.recordAttempt(false, 0);
    for (let i = 1; i < 10; i += 1) {
      last = ctrl.recordAttempt(i < 4, i * 1000); // 3/10 = 30%
    }
    expect(last.changed).toBe(true);
    expect(last.direction).toBe(-1);
    expect(last.level).toBe(2);
  });

  it("enforces at most one difficulty change every 15 seconds", () => {
    const ctrl = createDifficultyController({ startDifficulty: 2 });
    for (let i = 0; i < 10; i += 1) ctrl.recordAttempt(true, i * 500);
    expect(ctrl.getLevel()).toBe(3); // changed at t = 4500

    // Another 10 hits within 15 s (at t = 15_000, only 10.5 s since change) -> must NOT raise yet
    for (let i = 0; i < 10; i += 1) ctrl.recordAttempt(true, 5000 + i * 1000);
    expect(ctrl.getLevel()).toBe(3);

    // At t = 20_000 (>= 15 s after 4500) -> raises to 4
    const raised = ctrl.recordAttempt(true, 20_000);
    expect(raised.changed).toBe(true);
    expect(raised.level).toBe(4);
  });

  it("clamps levels strictly between 1 and 5 and exposes valid parameters", () => {
    expect(paramsForLevel(0).level).toBe(1);
    expect(paramsForLevel(99).level).toBe(5);
    const l1 = paramsForLevel(1);
    const l5 = paramsForLevel(5);
    expect(l5.speedMultiplier).toBeGreaterThan(l1.speedMultiplier);
    expect(l5.spawnIntervalMs).toBeLessThan(l1.spawnIntervalMs);
    expect(l5.targetSizeMultiplier).toBeLessThan(l1.targetSizeMultiplier);
  });
});
