// @ts-check
import { describe, expect, it } from "vitest";
import {
  createFloorIsLavaEngine,
  createFreezeDanceEngine,
  createRepTargetEngine,
} from "../activities.js";
import { LANDMARK } from "../calibration.js";
import { computeDressUpAnchor } from "../dressUp.js";
import { createJuiceEngine } from "../juice.js";
import { createKeyboardController, mapKeyToAction } from "../keyboardMode.js";
import { buildActivityResult, POSE_ERROR_CODES } from "../result.js";
import { makePose } from "./syntheticPose.js";

describe("createRepTargetEngine (squats, jumping_jacks, eskista, tree_balance)", () => {
  it("completes immediately when target reps are reached", () => {
    const engine = createRepTargetEngine({ target: 3, durationSec: 60 });
    engine.step(0);
    engine.step(1000);
    expect(engine.addRep(1200).some((e) => e.type === "rep")).toBe(true);
    expect(engine.addRep(2200).some((e) => e.type === "rep")).toBe(true);
    const finalEvts = engine.addRep(3200);
    expect(finalEvts.some((e) => e.type === "finish")).toBe(true);
    expect(engine.getSnapshot().completed).toBe(true);
    expect(engine.getSnapshot().reps).toBe(3);
  });
});

describe("createFreezeDanceEngine (F1)", () => {
  it("awards clean rounds for holding still during freeze and deducts 1 point when moving during freeze", () => {
    const game = createFreezeDanceEngine({ rounds: 3, danceMs: 2000, freezeMs: 2000, freezeGraceMs: 200 });
    let t = 0;
    game.step(t, true);

    // Round 1: dance then hold still during freeze -> +10 pts, 1 rep.
    for (let i = 0; i < 40; i += 1) {
      t += 100;
      const snap = game.getSnapshot();
      game.step(t, snap.phase === "dance");
    }
    expect(game.getSnapshot().reps).toBe(1);
    expect(game.getSnapshot().score).toBe(10);

    // Round 2: wiggle during freeze -> lose 1 point (score becomes 9), rep not incremented.
    let sawPenalty = false;
    for (let i = 0; i < 40; i += 1) {
      t += 100;
      const evts = game.step(t, true); // moving during both dance AND freeze
      if (evts.some((e) => e.type === "miss")) sawPenalty = true;
    }
    expect(sawPenalty).toBe(true);
    expect(game.getSnapshot().score).toBeLessThan(10);
    expect(game.getSnapshot().reps).toBe(1);
  });
});

describe("createFloorIsLavaEngine (F4)", () => {
  it("dodges lava waves with a jump and overhead beams with a squat", () => {
    // First spawn lava_wave (0.1 < 0.55), second spawn overhead_beam (0.9 >= 0.55).
    const seq = [0.1, 0.9, 0.1];
    let idx = 0;
    const game = createFloorIsLavaEngine({
      durationSec: 30,
      target: 5,
      rng: () => seq[idx++ % seq.length],
    });

    game.step(0);
    for (let t = 100; t <= 6500; t += 100) {
      const snap = game.getSnapshot();
      const incoming = snap.obstacles.find((o) => !o.resolved && o.x <= 0.36 && o.x >= 0.22);
      if (incoming?.kind === "lava_wave") {
        game.triggerJump(t);
        game.setDucking(false);
      } else if (incoming?.kind === "overhead_beam") {
        game.setDucking(true);
      } else {
        game.setDucking(false);
      }
      game.step(t);
    }

    const endSnap = game.getSnapshot();
    expect(endSnap.reps).toBeGreaterThanOrEqual(2);
    expect(endSnap.hearts).toBe(3);
  });

  it("ends gently when all 3 hearts are spent", () => {
    const game = createFloorIsLavaEngine({ durationSec: 60, hearts: 3, rng: () => 0.1 });
    game.step(0);
    let finished = false;
    for (let t = 100; t <= 20_000; t += 100) {
      const evts = game.step(t);
      if (evts.some((e) => e.type === "finish")) {
        finished = true;
        break;
      }
    }
    expect(finished).toBe(true);
    expect(game.getSnapshot().hearts).toBe(0);
    expect(game.getSnapshot().lastMessage).toMatch(/Great effort/i);
  });
});

describe("keyboardMode & result payload (P5)", () => {
  it("maps standard keys and strictly forces input_mode to keyboard if any key/tap occurred", () => {
    expect(mapKeyToAction({ code: "Space" })).toBe("jump");
    expect(mapKeyToAction({ code: "KeyA" })).toBe("armsUp");
    expect(mapKeyToAction({ code: "ArrowDown" })).toBe("squat");
    expect(mapKeyToAction({ code: "KeyB" })).toBe("balance");

    /** @type {string[]} */
    const seen = [];
    const kb = createKeyboardController({
      target: null,
      onAction: (action) => seen.push(action),
    });
    expect(kb.hasUsedInput()).toBe(false);
    kb.trigger("jump", 100);
    expect(kb.hasUsedInput()).toBe(true);
    expect(seen).toEqual(["jump"]);

    // Even if session started in camera mode, any keyboard/tap event MUST yield input_mode: "keyboard".
    const payload = buildActivityResult({
      missionId: "m_1",
      game: "catch_the_stars",
      startedAtIso: "2026-11-21T15:00:00.000Z",
      elapsedMs: 60_000,
      reps: 12,
      target: 12,
      mode: "camera",
      usedKeyboardOrTap: kb.hasUsedInput(),
      jumps: 10,
      armRaises: 4,
      performance: { accuracy: 0.9, avg_rep_sec: 5, max_combo: 4, difficulty_level: 3 },
    });

    expect(payload.input_mode).toBe("keyboard");
    expect(payload.completed).toBe(true);
    expect(payload.client_session_id).toBeTruthy();
    expect(payload.performance?.difficulty_level).toBe(3);
    expect(Object.values(POSE_ERROR_CODES).sort()).toEqual([
      "camera_denied",
      "model_load_failed",
      "no_camera",
      "unsupported",
    ]);
  });
});

describe("juice engine (F2) & dressUp overlay (F5)", () => {
  it("reduces effects below 15 FPS, toggles mute, and invokes host voice-cheer hook", () => {
    /** @type {string[]} */
    const cheers = [];
    const juice = createJuiceEngine({ onVoiceCheer: (e) => cheers.push(e.type) });

    juice.setFps(10);
    expect(juice.isReducedEffects()).toBe(true);
    juice.emit({ type: "combo", value: 4, timeMs: 1000 });
    expect(juice.getShakeOffset()).toEqual({ dx: 0, dy: 0 }); // disabled under low FPS
    expect(cheers).toContain("combo");

    juice.setMuted(true);
    expect(juice.isMuted()).toBe(true);
  });

  it("scales dress-up anchor by torsoLength and hides when visibility is low", () => {
    const visibleCrown = computeDressUpAnchor("crown", makePose(), 0.25);
    expect(visibleCrown).not.toBeNull();
    expect(visibleCrown?.scale).toBe(0.25);

    const hiddenNose = makePose({ visibility: { [LANDMARK.NOSE]: 0.1 } });
    expect(computeDressUpAnchor("crown", hiddenNose, 0.25)).toBeNull();
    expect(computeDressUpAnchor("none", makePose(), 0.25)).toBeNull();
  });
});
