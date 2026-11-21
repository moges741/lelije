// @ts-check
import { describe, expect, it } from "vitest";
import { CATCH_THE_STARS_CONFIG, CATCH_THE_STARS_LABELS, createCatchTheStarsGame } from "../catchTheStars.js";

/** @typedef {import("../catchTheStars.js").GameEvent} GameEvent */

const NO_AUTO_SPAWN = { firstSpawnMs: Number.POSITIVE_INFINITY };
/** With the default speed an object is inside the catch zone from about 1.43 s to 3.07 s after it appears. */
const IN_ZONE_MS = 2000;
const PAST_ZONE_MS = 3200;

/**
 * Moves the game forward in small steps, like animation frames.
 * @param {ReturnType<typeof createCatchTheStarsGame>} game
 * @param {number} ms
 * @param {number} [stepMs]
 */
function advance(game, ms, stepMs = 50) {
  for (let done = 0; done < ms; done += stepMs) game.update(Math.min(stepMs, ms - done));
}

/** Small repeatable random generator so tests never depend on Math.random. */
function seededRandom(seed = 1) {
  let value = seed;
  return () => {
    value = (value * 48271) % 2147483647;
    return value / 2147483647;
  };
}

/** A game without automatic spawns, plus a list of every event it emits. */
function manualGame(durationSec = 60) {
  /** @type {GameEvent[]} */
  const events = [];
  const game = createCatchTheStarsGame({
    durationSec,
    random: () => 0.5,
    config: NO_AUTO_SPAWN,
    onEvent: (event) => events.push(event),
  });
  return { game, events };
}

describe("catch the stars: spawning", () => {
  it("starts empty and spawns the first object after a short moment", () => {
    const game = createCatchTheStarsGame({ random: () => 0.5 });
    advance(game, 750);
    expect(game.state.spawned).toBe(0);
    advance(game, 100);
    expect(game.state.spawned).toBe(1);
  });

  it("spawns a new object every 1.5 to 2.5 seconds", () => {
    const game = createCatchTheStarsGame({ durationSec: 60, random: seededRandom(7) });
    /** @type {number[]} */
    const spawnTimes = [];
    let seen = 0;
    for (let t = 0; t < 50000; t += 10) {
      game.update(10);
      if (game.state.spawned > seen) {
        seen = game.state.spawned;
        spawnTimes.push(game.state.elapsedMs);
      }
    }
    expect(spawnTimes.length).toBeGreaterThan(15);
    for (let i = 1; i < spawnTimes.length; i += 1) {
      const gap = spawnTimes[i] - spawnTimes[i - 1];
      expect(gap).toBeGreaterThanOrEqual(1500);
      expect(gap).toBeLessThanOrEqual(2510);
    }
  });

  it("spawns both stars and clouds", () => {
    const game = createCatchTheStarsGame({ random: seededRandom(3) });
    const kinds = new Set();
    for (let t = 0; t < 40000; t += 50) {
      game.update(50);
      for (const object of game.state.objects) if (object.active) kinds.add(object.kind);
    }
    expect([...kinds].sort()).toEqual(["cloud", "star"]);
  });

  it("does not spawn in the last 3 seconds", () => {
    const game = createCatchTheStarsGame({ durationSec: 10, random: () => 0.5 });
    advance(game, 10000);
    // Spawn times with a fixed 2 s gap: 0.8, 2.8, 4.8, 6.8 s. The one at 8.8 s is skipped.
    expect(game.state.spawned).toBe(4);
  });

  it("uses a fixed pool of objects and never grows it", () => {
    const { game } = manualGame();
    const pool = game.state.objects;
    for (let i = 0; i < CATCH_THE_STARS_CONFIG.maxObjects; i += 1) expect(game.spawn("star", 1)).not.toBeNull();
    expect(game.spawn("star", 1)).toBeNull();
    advance(game, 6000);
    expect(game.state.objects).toBe(pool);
    expect(game.state.objects).toHaveLength(CATCH_THE_STARS_CONFIG.maxObjects);
    expect(game.state.objects.every((object) => !object.active)).toBe(true);
    expect(game.spawn("cloud", -1)).not.toBeNull();
  });
});

describe("catch the stars: catching", () => {
  it("a jump catches a star in the zone for 10 points", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    expect(game.state.zoneKind).toBe("star");
    expect(game.onJump()).toBe(true);
    expect(game.state.points).toBe(10);
    expect(game.state.catches).toBe(1);
    expect(game.state.zoneKind).toBeNull();
  });

  it("raising both arms catches a cloud in the zone for 15 points", () => {
    const { game } = manualGame();
    game.spawn("cloud", 1);
    advance(game, IN_ZONE_MS);
    expect(game.state.zoneKind).toBe("cloud");
    expect(game.onArmsUp()).toBe(true);
    expect(game.state.points).toBe(15);
  });

  it("works for objects coming from the right as well", () => {
    const { game } = manualGame();
    game.spawn("star", -1);
    advance(game, IN_ZONE_MS);
    expect(game.onJump()).toBe(true);
  });

  it("the wrong action does not catch and is not punished", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    expect(game.onArmsUp()).toBe(false);
    expect(game.state.points).toBe(0);
    expect(game.state.misses).toBe(0);
    // The star is still there for a jump.
    expect(game.onJump()).toBe(true);
    expect(game.state.points).toBe(10);
  });

  it("does not catch before the object reaches the zone or after it left", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    advance(game, 1000);
    expect(game.onJump()).toBe(false);
    advance(game, PAST_ZONE_MS - 1000);
    expect(game.onJump()).toBe(false);
    expect(game.state.points).toBe(0);
  });

  it("one action catches only one object", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    expect(game.state.catches).toBe(1);
    expect(game.state.zoneKind).toBe("star");
    game.onJump();
    expect(game.state.catches).toBe(2);
  });

  it("catches the object that is about to leave the zone first", () => {
    const { game } = manualGame();
    const first = game.spawn("star", 1);
    advance(game, 1000);
    const second = game.spawn("star", 1);
    advance(game, 1700);
    expect(first?.inZone).toBe(true);
    expect(second?.inZone).toBe(true);
    game.onJump();
    expect(first?.status).toBe("caught");
    expect(second?.status).toBe("flying");
  });

  it("counts every jump and arm raise, also when nothing is caught", () => {
    const { game } = manualGame();
    game.onJump();
    game.onJump();
    game.onArmsUp();
    expect(game.state.jumps).toBe(2);
    expect(game.state.armRaises).toBe(1);
    expect(game.state.points).toBe(0);
  });

  it("a caught object disappears after its short pop animation", () => {
    const { game } = manualGame();
    const star = game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    expect(star?.active).toBe(true);
    advance(game, CATCH_THE_STARS_CONFIG.caughtLingerMs + 50);
    expect(star?.active).toBe(false);
  });
});

describe("catch the stars: misses and combos", () => {
  it("an object that leaves the zone uncaught is a miss, counted once", () => {
    const { game, events } = manualGame();
    game.spawn("star", 1);
    advance(game, 5000);
    expect(game.state.misses).toBe(1);
    expect(events.filter((event) => event.type === "miss")).toHaveLength(1);
  });

  it("gives +5 for every 3 catches in a row", () => {
    const { game } = manualGame();
    for (let i = 0; i < 6; i += 1) game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onJump();
    expect(game.state.points).toBe(20);
    game.onJump();
    expect(game.state.points).toBe(35);
    expect(game.state.combo).toBe(3);
    game.onJump();
    game.onJump();
    expect(game.state.points).toBe(55);
    game.onJump();
    expect(game.state.points).toBe(70);
    expect(game.state.bestCombo).toBe(6);
  });

  it("mixes stars and clouds in one combo", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    game.spawn("cloud", 1);
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onArmsUp();
    game.onJump();
    expect(game.state.points).toBe(10 + 15 + 10 + 5);
  });

  it("a miss resets the combo", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onJump();
    expect(game.state.combo).toBe(2);

    game.spawn("cloud", 1);
    advance(game, PAST_ZONE_MS);
    expect(game.state.combo).toBe(0);

    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    expect(game.state.combo).toBe(1);
    expect(game.state.points).toBe(30);
    expect(game.state.bestCombo).toBe(2);
  });

  it("a jump that catches nothing does not reset the combo", () => {
    const { game } = manualGame();
    game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onJump();
    expect(game.state.combo).toBe(1);
  });
});

describe("catch the stars: events", () => {
  it("reports jump, catch and combo in order with useful values", () => {
    const { game, events } = manualGame();
    for (let i = 0; i < 3; i += 1) game.spawn("star", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onJump();
    game.onJump();
    expect(events.map((event) => event.type)).toEqual(["jump", "catch", "jump", "catch", "jump", "catch", "combo"]);
    expect(events[0]).toMatchObject({ type: "jump", value: 1, timeMs: IN_ZONE_MS, kind: null });
    expect(events[1]).toMatchObject({ type: "catch", value: 10, kind: "star" });
    expect(events[1].x).toBeGreaterThan(CATCH_THE_STARS_CONFIG.zoneLeft);
    expect(events[1].x).toBeLessThan(CATCH_THE_STARS_CONFIG.zoneRight);
    expect(events[6]).toMatchObject({ type: "combo", value: 3 });
  });

  it("reports arms-up events", () => {
    const { game, events } = manualGame();
    game.onArmsUp();
    expect(events).toEqual([expect.objectContaining({ type: "armsUp", value: 1, kind: null })]);
  });

  it("works without an onEvent callback", () => {
    const game = createCatchTheStarsGame({ random: () => 0.5 });
    advance(game, 3000);
    expect(() => game.onJump()).not.toThrow();
  });
});

describe("catch the stars: time and result", () => {
  it("counts down and finishes exactly at the duration", () => {
    const { game } = manualGame(5);
    expect(game.state.remainingSec).toBe(5);
    advance(game, 1000);
    expect(game.state.remainingSec).toBe(4);
    advance(game, 3950);
    expect(game.state.finished).toBe(false);
    expect(game.state.remainingSec).toBe(1);
    advance(game, 50);
    expect(game.state.finished).toBe(true);
    expect(game.state.remainingSec).toBe(0);
  });

  it("ignores everything after the end", () => {
    const { game, events } = manualGame(2);
    advance(game, 2000);
    const before = events.length;
    advance(game, 5000);
    expect(game.onJump()).toBe(false);
    expect(game.onArmsUp()).toBe(false);
    expect(game.state.elapsedMs).toBe(2000);
    expect(game.state.jumps).toBe(0);
    expect(events).toHaveLength(before);
  });

  it("does not move time for zero, negative or broken steps (paused tab)", () => {
    const { game } = manualGame();
    game.update(0);
    game.update(-500);
    game.update(Number.NaN);
    expect(game.state.elapsedMs).toBe(0);
  });

  it("returns exactly the agreed game result (reps = objects caught)", () => {
    const { game } = manualGame(20);
    game.spawn("star", 1);
    game.spawn("cloud", 1);
    advance(game, IN_ZONE_MS);
    game.onJump();
    game.onArmsUp();
    game.onJump();
    advance(game, 20000);
    expect(game.result()).toEqual({
      game: "catch_the_stars",
      duration_sec: 20,
      reps: 2,
      jumps: 2,
      arm_raises: 1,
      points: 25,
    });
  });

  it("reports the time really played when it is asked before the end", () => {
    const { game } = manualGame(60);
    advance(game, 12400);
    expect(game.result().duration_sec).toBe(12);
  });

  it("falls back to 60 seconds for a broken duration", () => {
    for (const bad of [0, -5, Number.NaN, /** @type {any} */ ("abc")]) {
      const game = createCatchTheStarsGame({ durationSec: bad });
      expect(game.state.durationMs).toBe(60000);
    }
  });
});

describe("catch the stars: idle hint", () => {
  it("shows the hint after 8 seconds without movement and hides it on the next move", () => {
    const { game } = manualGame();
    advance(game, 7900);
    expect(game.state.idleHint).toBe(false);
    advance(game, 200);
    expect(game.state.idleHint).toBe(true);
    game.onArmsUp();
    expect(game.state.idleHint).toBe(false);
    advance(game, 7900);
    expect(game.state.idleHint).toBe(false);
  });

  it("does not show the hint on the end screen", () => {
    const { game } = manualGame(9);
    advance(game, 9000);
    expect(game.state.idleHint).toBe(false);
  });
});

describe("catch the stars: labels", () => {
  it("has a text for every hint key the game can report", () => {
    for (const key of ["loading", "no_body", "too_far", "calibrating", "playing", "move_your_body", "finished", "error"]) {
      expect(CATCH_THE_STARS_LABELS[/** @type {keyof typeof CATCH_THE_STARS_LABELS} */ (key)]).toBeTruthy();
    }
  });
});
