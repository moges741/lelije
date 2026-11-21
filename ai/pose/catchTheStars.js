// @ts-check
// Catch the Stars game logic and canvas drawing (P4, P5, F2, F3).
// Star = jump to catch; Cloud = raise both arms to catch.
// Wrong action is not punished; only an object leaving the catch zone uncaught resets the combo.

import { createDifficultyController } from "./difficulty.js";

/** @typedef {"star" | "cloud"} SkyObjectKind */

/**
 * @typedef {object} SkyObject
 * @property {number} id
 * @property {SkyObjectKind} kind
 * @property {number} x  Normalised 0..1 horizontal position (moves across the top catch zone).
 * @property {number} y  Normalised 0..1 vertical position.
 * @property {number} vx  Normalised units per second.
 * @property {number} radius  Normalised radius relative to canvas height.
 * @property {boolean} caught
 */

/**
 * @typedef {object} CatchTheStarsConfig
 * @property {number} durationSec
 * @property {number} target
 * @property {number} startDifficulty
 * @property {number} zoneLeft  Normalised left edge of catch zone.
 * @property {number} zoneRight  Normalised right edge of catch zone.
 * @property {number} basePoints  Points per catch before combo bonus.
 * @property {() => number} rng
 */

export const CATCH_THE_STARS_DEFAULTS = Object.freeze({
  durationSec: 60,
  target: 12,
  startDifficulty: 2,
  zoneLeft: 0.25,
  zoneRight: 0.75,
  basePoints: 10,
});

/**
 * Pure, deterministic game rules for Catch the Stars. No DOM, no timers, no camera.
 * @param {Partial<CatchTheStarsConfig>} [options]
 */
export function createCatchTheStarsEngine(options = {}) {
  const durationMs = Math.max(1000, Math.round((options.durationSec ?? CATCH_THE_STARS_DEFAULTS.durationSec) * 1000));
  const target = Math.max(1, Math.round(options.target ?? CATCH_THE_STARS_DEFAULTS.target));
  const zoneLeft = options.zoneLeft ?? CATCH_THE_STARS_DEFAULTS.zoneLeft;
  const zoneRight = options.zoneRight ?? CATCH_THE_STARS_DEFAULTS.zoneRight;
  const basePoints = options.basePoints ?? CATCH_THE_STARS_DEFAULTS.basePoints;
  const rng = options.rng ?? Math.random;

  const difficulty = createDifficultyController({
    startDifficulty: options.startDifficulty ?? CATCH_THE_STARS_DEFAULTS.startDifficulty,
  });

  /** @type {SkyObject[]} */
  const objects = [];
  let nextId = 1;
  let startedAtMs = /** @type {number | null} */ (null);
  let lastTickMs = /** @type {number | null} */ (null);
  let paused = false;
  let elapsedMs = 0;
  let sinceSpawnMs = 9999; // spawn first object quickly
  let score = 0;
  let reps = 0;
  let starsCaught = 0;
  let cloudsCaught = 0;
  let jumps = 0;
  let armRaises = 0;
  let misses = 0;
  let combo = 0;
  let maxCombo = 0;
  let finished = false;
  let spawnCounter = 0;

  /**
   * @param {SkyObject} obj
   */
  function inCatchZone(obj) {
    return obj.x >= zoneLeft && obj.x <= zoneRight;
  }

  /**
   * Spawns either a star (jump) or cloud (arms up) from alternating sides so children stay engaged.
   */
  function spawnObject() {
    const params = difficulty.getParams();
    spawnCounter += 1;
    // Balanced mix of stars and clouds, avoiding long runs of only one kind.
    /** @type {SkyObjectKind} */
    const kind = rng() < 0.55 ? "star" : "cloud";
    const fromLeft = spawnCounter % 2 === 1;
    const baseSpeed = 0.24 * params.speedMultiplier;
    objects.push({
      id: nextId++,
      kind,
      x: fromLeft ? -0.06 : 1.06,
      y: kind === "star" ? 0.19 + rng() * 0.08 : 0.16 + rng() * 0.08,
      vx: fromLeft ? baseSpeed : -baseSpeed,
      radius: 0.062 * params.targetSizeMultiplier,
      caught: false,
    });
  }

  /**
   * Advances the simulation to `nowMs`. Returns events emitted on this step.
   * @param {number} nowMs
   * @returns {Array<{ type: "miss" | "levelUp" | "finish", value: number, timeMs: number, x?: number, y?: number }>}
   */
  function step(nowMs) {
    /** @type {Array<{ type: "miss" | "levelUp" | "finish", value: number, timeMs: number, x?: number, y?: number }>} */
    const events = [];
    if (finished) return events;

    if (startedAtMs === null) {
      startedAtMs = nowMs;
      lastTickMs = nowMs;
      spawnObject();
      sinceSpawnMs = 0;
      return events;
    }

    if (paused) {
      lastTickMs = nowMs;
      return events;
    }

    const dtMs = Math.min(250, Math.max(0, nowMs - (lastTickMs ?? nowMs)));
    lastTickMs = nowMs;
    elapsedMs += dtMs;
    sinceSpawnMs += dtMs;

    const params = difficulty.getParams();
    if (sinceSpawnMs >= params.spawnIntervalMs && objects.length < 3) {
      spawnObject();
      sinceSpawnMs = 0;
    }

    const dtSec = dtMs / 1000;
    for (let i = objects.length - 1; i >= 0; i -= 1) {
      const obj = objects[i];
      obj.x += obj.vx * dtSec;
      const exited = (obj.vx > 0 && obj.x > 1.08) || (obj.vx < 0 && obj.x < -0.08);
      if (exited) {
        objects.splice(i, 1);
        misses += 1;
        combo = 0;
        const diffUpdate = difficulty.recordAttempt(false, nowMs);
        events.push({ type: "miss", value: 1, timeMs: nowMs, x: obj.vx > 0 ? 0.85 : 0.15, y: obj.y });
        if (diffUpdate.changed && diffUpdate.direction > 0) {
          events.push({ type: "levelUp", value: diffUpdate.level, timeMs: nowMs });
        }
      }
    }

    if (elapsedMs >= durationMs) {
      elapsedMs = durationMs;
      finished = true;
      events.push({ type: "finish", value: score, timeMs: nowMs });
    }

    return events;
  }

  /**
   * Handles a detected movement action ("jump" catches a star; "armsUp" catches a cloud).
   * Wrong actions are never punished.
   * @param {"jump" | "armsUp"} action
   * @param {number} nowMs
   * @returns {Array<{ type: "jump" | "armsUp" | "catch" | "combo" | "levelUp", value: number, timeMs: number, x?: number, y?: number }>}
   */
  function handleAction(action, nowMs) {
    /** @type {Array<{ type: "jump" | "armsUp" | "catch" | "combo" | "levelUp", value: number, timeMs: number, x?: number, y?: number }>} */
    const events = [];
    if (finished || paused) return events;

    if (action === "jump") {
      jumps += 1;
      events.push({ type: "jump", value: jumps, timeMs: nowMs });
    } else if (action === "armsUp") {
      armRaises += 1;
      events.push({ type: "armsUp", value: armRaises, timeMs: nowMs });
    } else {
      return events;
    }

    const wantedKind = action === "jump" ? "star" : "cloud";
    // Pick the matching object closest to the centre of the catch zone.
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    const zoneMid = (zoneLeft + zoneRight) / 2;
    for (let i = 0; i < objects.length; i += 1) {
      const obj = objects[i];
      if (obj.kind === wantedKind && inCatchZone(obj)) {
        const dist = Math.abs(obj.x - zoneMid);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
    }

    if (bestIdx === -1) return events;

    const [caught] = objects.splice(bestIdx, 1);
    reps += 1;
    if (caught.kind === "star") starsCaught += 1;
    else cloudsCaught += 1;

    combo += 1;
    if (combo > maxCombo) maxCombo = combo;

    const comboBonus = combo >= 3 ? Math.min(10, (combo - 2) * 2) : 0;
    const gained = basePoints + comboBonus;
    score += gained;

    events.push({ type: "catch", value: gained, timeMs: nowMs, x: caught.x, y: caught.y });
    if (combo >= 3) {
      events.push({ type: "combo", value: combo, timeMs: nowMs, x: caught.x, y: caught.y });
    }

    const diffUpdate = difficulty.recordAttempt(true, nowMs);
    if (diffUpdate.changed && diffUpdate.direction > 0) {
      events.push({ type: "levelUp", value: diffUpdate.level, timeMs: nowMs });
    }

    return events;
  }

  function pause() {
    paused = true;
  }

  /** @param {number} nowMs */
  function resume(nowMs) {
    paused = false;
    lastTickMs = nowMs;
  }

  function getSnapshot() {
    const diffSummary = difficulty.getSummary();
    return {
      objects: objects.map((o) => ({ ...o })),
      zoneLeft,
      zoneRight,
      elapsedMs,
      remainingMs: Math.max(0, durationMs - elapsedMs),
      durationMs,
      score,
      reps,
      target,
      completed: reps >= target,
      starsCaught,
      cloudsCaught,
      jumps,
      armRaises,
      misses,
      combo,
      maxCombo,
      finished,
      paused,
      difficultyLevel: diffSummary.difficulty_level,
      performance: {
        accuracy: diffSummary.accuracy,
        avg_rep_sec: reps > 0 ? Math.round(((elapsedMs / 1000) / reps) * 100) / 100 : 0,
        max_combo: maxCombo,
        difficulty_level: diffSummary.difficulty_level,
      },
    };
  }

  return {
    step,
    handleAction,
    pause,
    resume,
    getSnapshot,
  };
}

/**
 * Draws a 5-point star shape.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawStar(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.48;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "#fca311";
  ctx.lineWidth = 3;
  ctx.fill();
  ctx.stroke();

  // Friendly little label cue
  ctx.fillStyle = "#14213d";
  ctx.font = `700 ${Math.max(10, Math.round(r * 0.42))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("JUMP", cx, cy + 1);
  ctx.restore();
}

/**
 * Draws a fluffy friendly cloud.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawCloud(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = "#e0f7ff";
  ctx.strokeStyle = "#4cc9f0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - r * 0.48, cy + r * 0.1, r * 0.46, 0, Math.PI * 2);
  ctx.arc(cx, cy - r * 0.15, r * 0.58, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.48, cy + r * 0.1, r * 0.46, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#14213d";
  ctx.font = `700 ${Math.max(10, Math.round(r * 0.36))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ARMS", cx, cy + 2);
  ctx.restore();
}

/**
 * Draws Catch the Stars gameplay elements (catch zone + moving stars & clouds + HUD) on canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ReturnType<ReturnType<typeof createCatchTheStarsEngine>["getSnapshot"]>} snap
 * @param {{ jumpHint?: string, armsHint?: string }} [labels]
 */
export function drawCatchTheStarsOverlay(ctx, width, height, snap, labels = {}) {
  ctx.save();

  // Dashed top-centre catch zone.
  const zx = snap.zoneLeft * width;
  const zw = (snap.zoneRight - snap.zoneLeft) * width;
  const zy = height * 0.08;
  const zh = height * 0.25;
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 209, 102, 0.85)";
  ctx.fillStyle = "rgba(20, 33, 61, 0.22)";
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(zx, zy, zw, zh, 14);
  } else {
    ctx.rect(zx, zy, zw, zh);
  }
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw flying stars & clouds.
  for (let i = 0; i < snap.objects.length; i += 1) {
    const obj = snap.objects[i];
    const px = obj.x * width;
    const py = obj.y * height;
    const r = Math.max(18, obj.radius * height);
    if (obj.kind === "star") drawStar(ctx, px, py, r);
    else drawCloud(ctx, px, py, r);
  }

  // Bottom cue strip.
  ctx.fillStyle = "rgba(15, 29, 58, 0.65)";
  ctx.fillRect(0, height - 34, width, 34);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cue = `${labels.jumpHint || "★ Star = Jump"}   •   ${labels.armsHint || "☁ Cloud = Arms Up"}`;
  ctx.fillText(cue, width / 2, height - 17);

  ctx.restore();
}
