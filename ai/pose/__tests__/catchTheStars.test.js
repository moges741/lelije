// @ts-check
import { describe, expect, it } from "vitest";
import { createCatchTheStarsEngine } from "../catchTheStars.js";

describe("createCatchTheStarsEngine (P4)", () => {
  it("catches a star in the catch zone with a jump and awards +10", () => {
    // rng returning 0.1 always spawns stars (< 0.55).
    const game = createCatchTheStarsEngine({ durationSec: 20, rng: () => 0.1 });
    game.step(0);
    // Advance until the first star enters the catch zone [0.25, 0.75].
    for (let t = 100; t <= 2600; t += 100) game.step(t);
    const before = game.getSnapshot();
    expect(before.objects.some((o) => o.kind === "star" && o.x >= 0.25 && o.x <= 0.75)).toBe(true);

    const evts = game.handleAction("jump", 2650);
    expect(evts.some((e) => e.type === "catch" && e.value === 10)).toBe(true);
    const after = game.getSnapshot();
    expect(after.reps).toBe(1);
    expect(after.starsCaught).toBe(1);
    expect(after.score).toBe(10);
  });

  it("catches a cloud with armsUp and does not punish jumping at a cloud", () => {
    // rng returning 0.9 always spawns clouds (>= 0.55).
    const game = createCatchTheStarsEngine({ durationSec: 20, rng: () => 0.9 });
    game.step(0);
    for (let t = 100; t <= 2600; t += 100) game.step(t);

    // Wrong action: jump at cloud -> no penalty, cloud still there.
    const wrongEvts = game.handleAction("jump", 2620);
    expect(wrongEvts.some((e) => e.type === "miss")).toBe(false);
    expect(game.getSnapshot().score).toBe(0);

    // Correct action: armsUp catches cloud.
    const goodEvts = game.handleAction("armsUp", 2650);
    expect(goodEvts.some((e) => e.type === "catch")).toBe(true);
    expect(game.getSnapshot().cloudsCaught).toBe(1);
  });

  it("builds combos on consecutive catches and resets combo when an object is missed", () => {
    const game = createCatchTheStarsEngine({ durationSec: 30, rng: () => 0.1 });
    let sawCombo = false;
    let t = 0;
    game.step(t);

    // Catch 3 stars in a row.
    while (game.getSnapshot().reps < 3 && t < 15_000) {
      t += 100;
      game.step(t);
      const snap = game.getSnapshot();
      if (snap.objects.some((o) => o.x >= 0.35 && o.x <= 0.65)) {
        const evts = game.handleAction("jump", t);
        if (evts.some((e) => e.type === "combo" && e.value >= 3)) sawCombo = true;
      }
    }
    expect(sawCombo).toBe(true);
    expect(game.getSnapshot().maxCombo).toBeGreaterThanOrEqual(3);

    // Stop acting until an object exits and triggers miss -> combo resets to 0.
    let sawMiss = false;
    for (let i = 0; i < 80; i += 1) {
      t += 100;
      const evts = game.step(t);
      if (evts.some((e) => e.type === "miss")) {
        sawMiss = true;
        break;
      }
    }
    expect(sawMiss).toBe(true);
    expect(game.getSnapshot().combo).toBe(0);
  });

  it("pauses game time while the tab is hidden and ends naturally at durationSec", () => {
    const game = createCatchTheStarsEngine({ durationSec: 10, rng: () => 0.1 });
    game.step(0);
    for (let t = 100; t <= 4000; t += 100) game.step(t);
    expect(game.getSnapshot().elapsedMs).toBe(4000);

    // Hidden for 4 full seconds.
    game.pause();
    for (let t = 4100; t <= 8000; t += 100) game.step(t);
    expect(game.getSnapshot().elapsedMs).toBe(4000);

    // Resume for remaining 6 seconds -> finishes at wall clock t = 14000.
    game.resume(8000);
    let finishedAt = -1;
    for (let t = 8100; t <= 15_000; t += 100) {
      const evts = game.step(t);
      if (evts.some((e) => e.type === "finish")) {
        finishedAt = t;
        break;
      }
    }
    expect(finishedAt).toBe(14_000);
    expect(game.getSnapshot().finished).toBe(true);
  });
});
