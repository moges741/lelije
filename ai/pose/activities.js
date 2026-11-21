// @ts-check
// Activity registry & session runner (F1, F2, F3, F4, F5, F6, P4, P5, P6).
// Pure game engines are exported for fast deterministic unit testing;
// startActivity() wires camera/keyboard, calibration, detectors, adaptive difficulty,
// visual/audio juice, optional dress-up, optional 2-player coop, tab pause, and onFinish.

import { bodyInFrame, CALIBRATION_HINTS, createCalibrator } from "./calibration.js";
import { clampActivityTarget, getActivityById, getActivityCatalog } from "./catalog.js";
import { createCatchTheStarsEngine, drawCatchTheStarsOverlay } from "./catchTheStars.js";
import {
  createArmsUpDetector,
  createJumpDetector,
  createJumpingJackDetector,
  createMotionEnergyDetector,
  createOneLegBalanceDetector,
  createSquatDetector,
} from "./detectors.js";
import { createDifficultyController } from "./difficulty.js";
import { drawDressUpOverlay } from "./dressUp.js";
import { createJuiceEngine } from "./juice.js";
import { createKeyboardController } from "./keyboardMode.js";
import { createPoseEngine } from "./poseEngine.js";
import { buildActivityResult, generateSessionId, POSE_ERROR_CODES } from "./result.js";

/** @typedef {import("./catalog.js").ActivityId} ActivityId */
/** @typedef {import("./poseEngine.js").Landmark} Landmark */
/** @typedef {import("./poseEngine.js").PoseError} PoseError */
/** @typedef {import("./calibration.js").Calibration} Calibration */
/** @typedef {import("./juice.js").ActivityEvent} ActivityEvent */
/** @typedef {import("./dressUp.js").DressUpItem} DressUpItem */
/** @typedef {import("./result.js").ActivityResult} ActivityResult */
/** @typedef {import("./result.js").InputMode} InputMode */

/**
 * Pure engine for rep-target activities: squats, jumping_jacks, eskista.
 * Ends naturally when target reps are reached OR when durationSec elapses.
 * @param {{ target: number, durationSec: number, startDifficulty?: number }} options
 */
export function createRepTargetEngine(options) {
  const target = Math.max(1, Math.round(options.target));
  const durationMs = Math.max(1000, Math.round(options.durationSec * 1000));
  const difficulty = createDifficultyController({ startDifficulty: options.startDifficulty ?? 2 });

  let startedAtMs = /** @type {number | null} */ (null);
  let lastTickMs = /** @type {number | null} */ (null);
  let paused = false;
  let elapsedMs = 0;
  let reps = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let finished = false;

  /** @param {number} nowMs */
  function step(nowMs) {
    /** @type {ActivityEvent[]} */
    const events = [];
    if (finished) return events;
    if (startedAtMs === null) {
      startedAtMs = nowMs;
      lastTickMs = nowMs;
      return events;
    }
    if (paused) {
      lastTickMs = nowMs;
      return events;
    }
    const dtMs = Math.min(250, Math.max(0, nowMs - (lastTickMs ?? nowMs)));
    lastTickMs = nowMs;
    elapsedMs += dtMs;
    if (elapsedMs >= durationMs) {
      elapsedMs = durationMs;
      finished = true;
      events.push({ type: "finish", value: score, timeMs: nowMs });
    }
    return events;
  }

  /** @param {number} nowMs @param {number} [count] */
  function addRep(nowMs, count = 1) {
    /** @type {ActivityEvent[]} */
    const events = [];
    if (finished || paused || count <= 0) return events;
    reps += count;
    combo += count;
    if (combo > maxCombo) maxCombo = combo;
    score += count * 10;
    events.push({ type: "rep", value: count * 10, timeMs: nowMs });
    if (combo >= 3 && combo % 3 === 0) {
      events.push({ type: "combo", value: combo, timeMs: nowMs });
    }
    const diffUpdate = difficulty.recordAttempt(true, nowMs);
    if (diffUpdate.changed && diffUpdate.direction > 0) {
      events.push({ type: "levelUp", value: diffUpdate.level, timeMs: nowMs });
    }
    if (reps >= target) {
      finished = true;
      events.push({ type: "finish", value: score, timeMs: nowMs });
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
    const diff = difficulty.getSummary();
    return {
      elapsedMs,
      remainingMs: Math.max(0, durationMs - elapsedMs),
      durationMs,
      reps,
      target,
      completed: reps >= target,
      score,
      combo,
      maxCombo,
      finished,
      paused,
      difficultyLevel: diff.difficulty_level,
      performance: {
        accuracy: diff.accuracy,
        avg_rep_sec: reps > 0 ? Math.round(((elapsedMs / 1000) / reps) * 100) / 100 : 0,
        max_combo: maxCombo,
        difficulty_level: diff.difficulty_level,
      },
    };
  }

  return { step, addRep, pause, resume, getSnapshot };
}

/**
 * Pure engine for Freeze Dance (F1):
 * Plays `target` rounds (default 5, range 3..8). Each round has a DANCE phase followed by a FREEZE phase.
 * Moving during FREEZE costs a point (floored at 0) and marks the round as wiggled;
 * staying still through FREEZE awards a clean round rep + points.
 *
 * @param {{ rounds?: number, danceMs?: number, freezeMs?: number, freezeGraceMs?: number, durationSec?: number, startDifficulty?: number }} [options]
 */
export function createFreezeDanceEngine(options = {}) {
  const rounds = Math.max(3, Math.min(8, Math.round(options.rounds ?? 5)));
  const danceMs = Math.max(1500, options.danceMs ?? 5500);
  const freezeMs = Math.max(1500, options.freezeMs ?? 3500);
  const freezeGraceMs = Math.max(0, options.freezeGraceMs ?? 450);
  const maxDurationMs = Math.max(
    rounds * (danceMs + freezeMs) + 2000,
    Math.round((options.durationSec ?? 60) * 1000)
  );
  const difficulty = createDifficultyController({ startDifficulty: options.startDifficulty ?? 2 });

  let startedAtMs = /** @type {number | null} */ (null);
  let lastTickMs = /** @type {number | null} */ (null);
  let paused = false;
  let elapsedMs = 0;
  let phaseElapsedMs = 0;
  /** @type {"dance" | "freeze"} */
  let phase = "dance";
  let currentRound = 1;
  let reps = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let movedDuringFreeze = false;
  let lastPenaltyAt = Number.NEGATIVE_INFINITY;
  let finished = false;
  let lastMessage = "Dance to the beat!";

  /**
   * @param {number} nowMs
   * @param {boolean} isMoving
   * @returns {ActivityEvent[]}
   */
  function step(nowMs, isMoving) {
    /** @type {ActivityEvent[]} */
    const events = [];
    if (finished) return events;

    if (startedAtMs === null) {
      startedAtMs = nowMs;
      lastTickMs = nowMs;
      events.push({ type: "go", value: currentRound, timeMs: nowMs });
      return events;
    }

    if (paused) {
      lastTickMs = nowMs;
      return events;
    }

    const dtMs = Math.min(250, Math.max(0, nowMs - (lastTickMs ?? nowMs)));
    lastTickMs = nowMs;
    elapsedMs += dtMs;
    phaseElapsedMs += dtMs;

    if (phase === "dance") {
      if (isMoving) {
        lastMessage = "Awesome dancing!";
      }
      if (phaseElapsedMs >= danceMs) {
        phase = "freeze";
        phaseElapsedMs = 0;
        movedDuringFreeze = false;
        lastMessage = "FREEZE like a statue!";
        events.push({ type: "freeze", value: currentRound, timeMs: nowMs });
      }
    } else {
      // Freeze phase: ignore the brief reaction grace right after "FREEZE!" is called.
      if (phaseElapsedMs >= freezeGraceMs && isMoving && nowMs - lastPenaltyAt >= 700) {
        movedDuringFreeze = true;
        lastPenaltyAt = nowMs;
        score = Math.max(0, score - 1);
        combo = 0;
        lastMessage = "Wiggled! Hold still like a statue!";
        events.push({ type: "miss", value: 1, timeMs: nowMs });
      }

      if (phaseElapsedMs >= freezeMs) {
        const cleanFreeze = !movedDuringFreeze;
        if (cleanFreeze) {
          reps += 1;
          combo += 1;
          if (combo > maxCombo) maxCombo = combo;
          score += 10;
          lastMessage = "Statue star! Great freeze!";
          events.push({ type: "rep", value: 10, timeMs: nowMs });
          if (combo >= 3) events.push({ type: "combo", value: combo, timeMs: nowMs });
        } else {
          lastMessage = "Nice try! Ready to dance again!";
        }
        const diffUpdate = difficulty.recordAttempt(cleanFreeze, nowMs);
        if (diffUpdate.changed && diffUpdate.direction > 0) {
          events.push({ type: "levelUp", value: diffUpdate.level, timeMs: nowMs });
        }

        if (currentRound >= rounds || elapsedMs >= maxDurationMs) {
          finished = true;
          events.push({ type: "finish", value: score, timeMs: nowMs });
        } else {
          currentRound += 1;
          phase = "dance";
          phaseElapsedMs = 0;
          lastMessage = "Dance to the beat!";
          events.push({ type: "go", value: currentRound, timeMs: nowMs });
        }
      }
    }

    if (!finished && elapsedMs >= maxDurationMs) {
      finished = true;
      events.push({ type: "finish", value: score, timeMs: nowMs });
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
    const diff = difficulty.getSummary();
    const totalRoundMs = phase === "dance" ? danceMs : freezeMs;
    return {
      phase,
      phaseProgress: Math.min(1, phaseElapsedMs / totalRoundMs),
      currentRound,
      rounds,
      elapsedMs,
      remainingMs: Math.max(0, maxDurationMs - elapsedMs),
      durationMs: maxDurationMs,
      reps,
      target: rounds,
      completed: reps >= Math.ceil(rounds * 0.6),
      score,
      combo,
      maxCombo,
      movedDuringFreeze,
      lastMessage,
      finished,
      paused,
      difficultyLevel: diff.difficulty_level,
      performance: {
        accuracy: diff.accuracy,
        avg_rep_sec: reps > 0 ? Math.round(((elapsedMs / 1000) / reps) * 100) / 100 : 0,
        max_combo: maxCombo,
        difficulty_level: diff.difficulty_level,
      },
    };
  }

  return { step, pause, resume, getSnapshot };
}

/**
 * @typedef {"lava_wave" | "overhead_beam"} LavaObstacleKind
 */

/**
 * @typedef {object} LavaObstacle
 * @property {number} id
 * @property {LavaObstacleKind} kind  lava_wave = jump over; overhead_beam = squat/duck under.
 * @property {number} x  Normalised 0..1 position moving from right (1.08) to left (-0.08).
 * @property {number} speed  Normalised units per second.
 * @property {boolean} resolved  True once dodged or bumped.
 */

/**
 * Pure engine for Floor is Lava (F4):
 * - 60 s natural end, 3 hearts, gentle encouraging messages (never harsh).
 * - Ground lava wave -> jump to dodge.
 * - Overhead beam -> squat/duck to pass safely underneath.
 * - Integrated adaptive difficulty controller (F3).
 *
 * @param {{ durationSec?: number, target?: number, hearts?: number, startDifficulty?: number, rng?: () => number }} [options]
 */
export function createFloorIsLavaEngine(options = {}) {
  const durationMs = Math.max(1000, Math.round((options.durationSec ?? 60) * 1000));
  const target = Math.max(1, Math.round(options.target ?? 12));
  const maxHearts = Math.max(1, Math.round(options.hearts ?? 3));
  const rng = options.rng ?? Math.random;
  const difficulty = createDifficultyController({ startDifficulty: options.startDifficulty ?? 2 });

  const playerX = 0.28;
  const hitHalfWidth = 0.08;

  /** @type {LavaObstacle[]} */
  const obstacles = [];
  let nextId = 1;
  let startedAtMs = /** @type {number | null} */ (null);
  let lastTickMs = /** @type {number | null} */ (null);
  let paused = false;
  let elapsedMs = 0;
  let sinceSpawnMs = 9999;
  let hearts = maxHearts;
  let reps = 0; // obstacles dodged
  let score = 0;
  let jumps = 0;
  let squats = 0;
  let combo = 0;
  let maxCombo = 0;
  let finished = false;
  let jumpAirUntilMs = Number.NEGATIVE_INFINITY;
  let ducking = false;
  let lastMessage = "Jump over lava, squat under beams!";

  function spawnObstacle() {
    const params = difficulty.getParams();
    /** @type {LavaObstacleKind} */
    const kind = rng() < 0.55 ? "lava_wave" : "overhead_beam";
    obstacles.push({
      id: nextId++,
      kind,
      x: 1.08,
      speed: 0.3 * params.speedMultiplier,
      resolved: false,
    });
  }

  /** @param {number} nowMs */
  function triggerJump(nowMs) {
    if (finished || paused) return [];
    jumps += 1;
    // Generous child-friendly airborne window so take-off timing feels responsive.
    jumpAirUntilMs = Math.max(jumpAirUntilMs, nowMs + 650);
    return [{ type: /** @type {const} */ ("jump"), value: jumps, timeMs: nowMs }];
  }

  /** @param {boolean} isDucking */
  function setDucking(isDucking) {
    if (isDucking && !ducking) squats += 1;
    ducking = Boolean(isDucking);
  }

  /**
   * @param {number} nowMs
   * @returns {ActivityEvent[]}
   */
  function step(nowMs) {
    /** @type {ActivityEvent[]} */
    const events = [];
    if (finished) return events;

    if (startedAtMs === null) {
      startedAtMs = nowMs;
      lastTickMs = nowMs;
      spawnObstacle();
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
    const spawnGap = Math.max(1500, params.spawnIntervalMs * 1.05);
    if (sinceSpawnMs >= spawnGap && obstacles.length < 3) {
      spawnObstacle();
      sinceSpawnMs = 0;
    }

    const airborne = nowMs <= jumpAirUntilMs;
    const dtSec = dtMs / 1000;

    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
      const obs = obstacles[i];
      obs.x -= obs.speed * dtSec;

      if (!obs.resolved && Math.abs(obs.x - playerX) <= hitHalfWidth) {
        const dodged = obs.kind === "lava_wave" ? airborne : ducking;
        if (dodged) {
          obs.resolved = true;
          reps += 1;
          combo += 1;
          if (combo > maxCombo) maxCombo = combo;
          const gained = 10 + (combo >= 3 ? Math.min(10, (combo - 2) * 2) : 0);
          score += gained;
          lastMessage = obs.kind === "lava_wave" ? "Super jump!" : "Smooth duck!";
          events.push({ type: "catch", value: gained, timeMs: nowMs });
          if (combo >= 3) events.push({ type: "combo", value: combo, timeMs: nowMs });
          const diffUpdate = difficulty.recordAttempt(true, nowMs);
          if (diffUpdate.changed && diffUpdate.direction > 0) {
            events.push({ type: "levelUp", value: diffUpdate.level, timeMs: nowMs });
          }
        } else if (obs.x <= playerX) {
          // Passed centre without dodging: gentle bump, lose 1 heart.
          obs.resolved = true;
          hearts = Math.max(0, hearts - 1);
          combo = 0;
          lastMessage =
            obs.kind === "lava_wave"
              ? "Oops, warm toes! Jump next time!"
              : "Bonk! Duck down low next time!";
          events.push({ type: "miss", value: 1, timeMs: nowMs });
          difficulty.recordAttempt(false, nowMs);
          if (hearts <= 0) {
            finished = true;
            lastMessage = "Great effort! Ready for a water break!";
            events.push({ type: "finish", value: score, timeMs: nowMs });
            break;
          }
        }
      }

      if (obs.x < -0.1) obstacles.splice(i, 1);
    }

    if (!finished && elapsedMs >= durationMs) {
      elapsedMs = durationMs;
      finished = true;
      lastMessage = "You beat the lava!";
      events.push({ type: "finish", value: score, timeMs: nowMs });
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
    const diff = difficulty.getSummary();
    return {
      obstacles: obstacles.map((o) => ({ ...o })),
      playerX,
      hearts,
      maxHearts,
      ducking,
      airborne: (lastTickMs ?? 0) <= jumpAirUntilMs,
      elapsedMs,
      remainingMs: Math.max(0, durationMs - elapsedMs),
      durationMs,
      reps,
      target,
      completed: reps >= target || (elapsedMs >= durationMs && hearts > 0),
      score,
      jumps,
      squats,
      combo,
      maxCombo,
      lastMessage,
      finished,
      paused,
      difficultyLevel: diff.difficulty_level,
      performance: {
        accuracy: diff.accuracy,
        avg_rep_sec: reps > 0 ? Math.round(((elapsedMs / 1000) / reps) * 100) / 100 : 0,
        max_combo: maxCombo,
        difficulty_level: diff.difficulty_level,
      },
    };
  }

  return { triggerJump, setDucking, step, pause, resume, getSnapshot };
}

// ---------- Canvas drawing helpers ----------

const JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const BONES = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Landmark[]} landmarks
 * @param {number} width
 * @param {number} height
 * @param {string} strokeColor
 */
function drawSkeleton(ctx, landmarks, width, height, strokeColor = "#fca311") {
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = strokeColor;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const p = landmarks[a];
    const q = landmarks[b];
    if (!p || !q || p.visibility < 0.5 || q.visibility < 0.5) continue;
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);
  }
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  for (const idx of JOINTS) {
    const p = landmarks[idx];
    if (!p || p.visibility < 0.5) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draws the shared top HUD strip (timer, reps/score, combo badge, optional coop scores).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {{ remainingSec: number, reps: number, target: number, score: number, combo: number, difficultyLevel: number, coop?: { p1: number, p2: number, players: number } | null }} hud
 */
function drawHud(ctx, width, hud) {
  ctx.save();
  ctx.fillStyle = "rgba(15, 29, 58, 0.72)";
  ctx.fillRect(0, 0, width, 44);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textBaseline = "middle";

  ctx.textAlign = "left";
  ctx.fillText(`⏱ ${Math.ceil(hud.remainingSec)}s`, 14, 22);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd166";
  ctx.fillText(`★ ${hud.reps}/${hud.target}   •   ${hud.score} pts`, width / 2, 22);

  ctx.textAlign = "right";
  if (hud.combo >= 2) {
    ctx.fillStyle = "#06d6a0";
    ctx.fillText(`x${hud.combo} COMBO`, width - 14, 22);
  } else {
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(`Lv ${hud.difficultyLevel}`, width - 14, 22);
  }

  if (hud.coop && hud.coop.players >= 2) {
    ctx.fillStyle = "rgba(15, 29, 58, 0.78)";
    ctx.fillRect(10, 50, 210, 26);
    ctx.fillStyle = "#4cc9f0";
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`P1: ${hud.coop.p1}  |  P2: ${hud.coop.p2}  |  Team: ${hud.coop.p1 + hud.coop.p2}`, 18, 63);
  }

  ctx.restore();
}

/**
 * Draws a keyboard-mode friendly stage background when camera video is not active.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {string} title
 */
function drawStageBackdrop(ctx, width, height, title) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, "#102542");
  grad.addColorStop(1, "#1b3a6b");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, width / 2, height * 0.5);
  ctx.restore();
}

/**
 * Draws Floor is Lava obstacles, player avatar indicator, and hearts.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {ReturnType<ReturnType<typeof createFloorIsLavaEngine>["getSnapshot"]>} snap
 */
function drawFloorIsLavaOverlay(ctx, width, height, snap) {
  ctx.save();
  const bottomBarH = 34;
  const floorY = height - bottomBarH - 36;

  // Glowing lava floor band sitting cleanly above the bottom encouragement strip.
  const lavaGrad = ctx.createLinearGradient(0, floorY, 0, height - bottomBarH);
  lavaGrad.addColorStop(0, "rgba(255, 107, 53, 0.92)");
  lavaGrad.addColorStop(1, "rgba(214, 40, 40, 0.98)");
  ctx.fillStyle = lavaGrad;
  ctx.fillRect(0, floorY, width, height - bottomBarH - floorY);

  // Player marker (shows jumping or ducking clearly in both camera and keyboard mode).
  const px = snap.playerX * width;
  const py = snap.airborne ? floorY - height * 0.28 : snap.ducking ? floorY - height * 0.06 : floorY - height * 0.13;
  const pr = snap.ducking ? 18 : 24;
  ctx.fillStyle = snap.airborne ? "#ffd166" : snap.ducking ? "#06d6a0" : "#4cc9f0";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Friendly little smile on avatar so kids immediately spot their character.
  ctx.fillStyle = "#10203a";
  ctx.beginPath();
  ctx.arc(px - pr * 0.3, py - pr * 0.18, 2.5, 0, Math.PI * 2);
  ctx.arc(px + pr * 0.3, py - pr * 0.18, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#10203a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, py + pr * 0.05, pr * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Draw obstacles.
  for (const obs of snap.obstacles) {
    const ox = obs.x * width;
    if (obs.kind === "lava_wave") {
      ctx.fillStyle = "#ff5400";
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ox - 28, floorY);
      ctx.quadraticCurveTo(ox, floorY - height * 0.2, ox + 28, floorY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("JUMP!", ox, floorY - height * 0.12);
    } else {
      const beamTop = height * 0.42;
      const beamH = height * 0.16;
      ctx.fillStyle = "#7209b7";
      ctx.strokeStyle = "#f72585";
      ctx.lineWidth = 3;
      ctx.fillRect(ox - 34, beamTop, 68, beamH);
      ctx.strokeRect(ox - 34, beamTop, 68, beamH);

      ctx.fillStyle = "#ffffff";
      ctx.font = "700 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DUCK!", ox, beamTop + beamH / 2);
    }
  }

  // Hearts top-left under HUD.
  let heartsText = "";
  for (let i = 0; i < snap.maxHearts; i += 1) {
    heartsText += i < snap.hearts ? "♥ " : "♡ ";
  }
  ctx.fillStyle = "#ff6b6b";
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(heartsText.trim(), 16, 68);

  // Gentle encouragement bar at bottom.
  ctx.fillStyle = "rgba(15, 29, 58, 0.72)";
  ctx.fillRect(0, height - 34, width, 34);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(snap.lastMessage, width / 2, height - 17);

  ctx.restore();
}

/**
 * Draws a clean radial progress ring + big prompt for squats, jumping_jacks, freeze_dance, tree_balance, eskista.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {{ headline: string, subline: string, progress: number, accent: string, footer: string }} view
 */
function drawMeterOverlay(ctx, width, height, view) {
  ctx.save();
  const cx = width / 2;
  const cy = height * 0.28;
  const r = Math.min(width, height) * 0.14;

  ctx.fillStyle = "rgba(15, 29, 58, 0.56)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = view.accent;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, view.progress)));
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(height * 0.065)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(view.headline, cx, cy - 8);

  ctx.fillStyle = "#ffd166";
  ctx.font = `600 ${Math.round(height * 0.035)}px system-ui, sans-serif`;
  ctx.fillText(view.subline, cx, cy + 20);

  ctx.fillStyle = "rgba(15, 29, 58, 0.72)";
  ctx.fillRect(0, height - 34, width, 34);
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.fillText(view.footer, width / 2, height - 17);
  ctx.restore();
}

/**
 * @typedef {object} StartActivityOptions
 * @property {ActivityId} activity
 * @property {HTMLCanvasElement} canvas
 * @property {HTMLVideoElement} [video]
 * @property {string | null} [missionId]
 * @property {number} [target]
 * @property {number} [durationSec]
 * @property {InputMode} [mode]  "camera" (default) or "keyboard".
 * @property {number} [startDifficulty]  1..5 (default 2).
 * @property {boolean} [coop]  Optional F6 2-player cooperative mode (gracefully falls back to 1 player).
 * @property {DressUpItem} [dressUp]  Optional F5 dress-up overlay ("none" | "crown" | "cat_ears" | "cape").
 * @property {boolean} [muted]  Start with WebAudio muted.
 * @property {boolean} [debug]  Draw skeleton & emit debug text.
 * @property {string} [modelPath]  Default "/models/pose_landmarker_lite.task".
 * @property {string} [wasmPath]  Default "/wasm".
 * @property {Record<string, string>} [labels]  Optional translated strings.
 * @property {(status: { state: "loading" | "calibrating" | "playing" | "paused" | "finished" | "error", hint?: string, hintKey?: string, progress?: number, code?: PoseError["code"], message?: string }) => void} [onStatus]
 * @property {(event: ActivityEvent) => void} [onEvent]
 * @property {(result: ActivityResult) => void} [onFinish]
 * @property {(debugText: string) => void} [onDebug]
 * @property {(event: ActivityEvent) => void} [onVoiceCheer]
 */

/**
 * @typedef {object} ActivityController
 * @property {() => void} stop  Releases camera, listeners, timers, audio, and clears canvas.
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {(muted: boolean) => void} setMuted
 * @property {(item: DressUpItem) => void} setDressUp
 * @property {(action: import("./keyboardMode.js").KeyboardAction) => void} triggerAction  Programmatic tap/button input.
 * @property {(action: import("./keyboardMode.js").KeyboardAction, held: boolean) => void} setActionHeld
 */

/**
 * Starts any catalog pose activity with camera OR keyboard/tap fallback.
 * Guarantees natural end, tab-hidden pause, adaptive difficulty, juice, and exact P5 result payload.
 *
 * @param {StartActivityOptions} options
 * @returns {ActivityController}
 */
export function startActivity(options) {
  const catalogEntry = getActivityById(options.activity) ?? getActivityCatalog()[0];
  const activityId = catalogEntry.id;
  const target = clampActivityTarget(catalogEntry, options.target);
  const durationSec =
    typeof options.durationSec === "number" && options.durationSec > 0
      ? options.durationSec
      : catalogEntry.durationSec;
  /** @type {InputMode} */
  const requestedMode = options.mode === "keyboard" ? "keyboard" : "camera";
  const modelPath = options.modelPath ?? "/models/pose_landmarker_lite.task";
  const wasmPath = options.wasmPath ?? "/wasm";
  const debug = Boolean(options.debug);
  const coopEnabled = Boolean(options.coop);

  const canvas = options.canvas;
  const ctx = canvas.getContext("2d");
  let dressUp = /** @type {DressUpItem} */ (options.dressUp ?? "none");

  const sessionId = generateSessionId();
  const startedAtIso = new Date().toISOString();

  const juice = createJuiceEngine({
    muted: Boolean(options.muted),
    onVoiceCheer: options.onVoiceCheer,
  });

  // Activity-specific pure engine.
  const catchEngine =
    activityId === "catch_the_stars"
      ? createCatchTheStarsEngine({ durationSec, target, startDifficulty: options.startDifficulty })
      : null;
  const freezeEngine =
    activityId === "freeze_dance"
      ? createFreezeDanceEngine({ rounds: target, durationSec, startDifficulty: options.startDifficulty })
      : null;
  const lavaEngine =
    activityId === "floor_is_lava"
      ? createFloorIsLavaEngine({ durationSec, target, startDifficulty: options.startDifficulty })
      : null;
  const repEngine =
    !catchEngine && !freezeEngine && !lavaEngine
      ? createRepTargetEngine({ target, durationSec, startDifficulty: options.startDifficulty })
      : null;

  // Player 1 detectors & calibrator.
  const calibrator1 = createCalibrator();
  const jump1 = createJumpDetector();
  const arms1 = createArmsUpDetector();
  const squat1 = createSquatDetector();
  const jack1 = createJumpingJackDetector();
  const balance1 = createOneLegBalanceDetector();
  const energy1 = createMotionEnergyDetector();

  // Player 2 (optional coop F6) detectors & calibrator.
  const calibrator2 = createCalibrator();
  const jump2 = createJumpDetector();
  const arms2 = createArmsUpDetector();
  const squat2 = createSquatDetector();
  const jack2 = createJumpingJackDetector();
  const balance2 = createOneLegBalanceDetector();
  const energy2 = createMotionEnergyDetector();

  let player1Score = 0;
  let player2Score = 0;
  let maxPlayersDetected = 1;

  let stopped = false;
  let finished = false;
  let playing = false;
  let paused = false;
  let rafId = 0;
  let lastFrameNow = 0;
  let lastLandmarks = /** @type {Landmark[][]} */ ([]);
  let keyboardBalanceAccumMs = 0;
  let keyboardMovingUntilMs = 0;
  let totalJumps = 0;
  let totalArmRaises = 0;

  /** @param {Parameters<NonNullable<StartActivityOptions["onStatus"]>>[0]} status */
  function emitStatus(status) {
    if (options.onStatus) options.onStatus(status);
  }

  /** @param {ActivityEvent} evt @param {{ x?: number, y?: number }} [pos] */
  function dispatchEvent(evt, pos) {
    juice.emit(evt, pos);
    if (options.onEvent) options.onEvent({ type: evt.type, value: evt.value, timeMs: evt.timeMs });
  }

  /**
   * Handles a movement action from camera or keyboard for playerIndex (0 or 1).
   * @param {import("./keyboardMode.js").KeyboardAction} action
   * @param {number} nowMs
   * @param {number} playerIndex
   */
  function applyAction(action, nowMs, playerIndex) {
    if (!playing || paused || finished) return;

    if (action === "jump") totalJumps += 1;
    if (action === "armsUp") totalArmRaises += 1;

    /** @type {Array<ActivityEvent & { x?: number, y?: number }>} */
    let events = [];

    if (catchEngine && (action === "jump" || action === "armsUp")) {
      events = catchEngine.handleAction(action, nowMs);
    } else if (lavaEngine && action === "jump") {
      events = lavaEngine.triggerJump(nowMs);
    } else if (lavaEngine && action === "squat") {
      lavaEngine.setDucking(true);
    } else if (repEngine) {
      if (
        (activityId === "squats" && action === "squat") ||
        (activityId === "jumping_jacks" && (action === "jumpingJack" || action === "jump" || action === "armsUp")) ||
        (activityId === "eskista" && (action === "move" || action === "armsUp"))
      ) {
        events = repEngine.addRep(nowMs, 1);
      }
    } else if (freezeEngine && (action === "move" || action === "jump" || action === "armsUp")) {
      keyboardMovingUntilMs = Math.max(keyboardMovingUntilMs, nowMs + 450);
    }

    for (const evt of events) {
      if (evt.type === "catch" || evt.type === "rep") {
        if (playerIndex === 1) player2Score += evt.value;
        else player1Score += evt.value;
      }
      dispatchEvent(evt, { x: evt.x, y: evt.y });
      if (evt.type === "finish") {
        finishSession();
        return;
      }
    }
  }

  const keyboard = createKeyboardController({
    onAction(action, nowMs) {
      applyAction(action, nowMs, 0);
    },
    onHoldChange(action, held) {
      if (lavaEngine && action === "squat") {
        lavaEngine.setDucking(held);
      }
    },
  });

  // Always attach keyboard listener so if a user presses a key/tap during camera mode,
  // we handle it AND truthfully mark input_mode = "keyboard" (P5 requirement!).
  keyboard.attach();

  /** @type {ReturnType<typeof createPoseEngine> | null} */
  let poseEngine = null;

  /**
   * Builds and emits the canonical P5 result payload once.
   */
  function finishSession() {
    if (finished) return;
    finished = true;
    playing = false;

    const snap = getCurrentSnapshot();
    const result = buildActivityResult({
      clientSessionId: sessionId,
      missionId: options.missionId ?? null,
      game: activityId,
      startedAtIso,
      elapsedMs: snap.elapsedMs,
      reps: snap.reps,
      target: snap.target,
      completed: snap.completed,
      rawScore: snap.score,
      mode: requestedMode,
      usedKeyboardOrTap: keyboard.hasUsedInput(),
      jumps: activityId === "catch_the_stars" || activityId === "floor_is_lava" ? totalJumps : undefined,
      armRaises: activityId === "catch_the_stars" ? totalArmRaises : undefined,
      performance: snap.performance,
      coop: coopEnabled
        ? {
            enabled: true,
            players_detected: maxPlayersDetected,
            player1_score: player1Score,
            player2_score: player2Score,
            team_score: player1Score + player2Score,
          }
        : undefined,
    });

    // Release camera immediately when the session ends (P4 privacy guarantee).
    if (poseEngine) {
      poseEngine.stop();
      poseEngine = null;
    }
    keyboard.detach();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }

    // Draw celebratory end screen once.
    if (ctx) {
      const w = canvas.width || 640;
      const h = canvas.height || 480;
      juice.emit({ type: "finish", value: result.points, timeMs: performance.now() });
      juice.drawEndScreen(ctx, w, h, {
        title: options.labels?.endTitle || (result.completed ? "Great job!" : "Nice moving!"),
        subtitle: `${result.reps} / ${result.target} ${catalogEntry.repsMeaning}`,
        points: result.points,
        reps: result.reps,
        target: result.target,
        completed: result.completed,
      });
    }

    emitStatus({ state: "finished", hint: options.labels?.endTitle || "Great job!" });
    if (options.onFinish) options.onFinish(result);
  }

  function getCurrentSnapshot() {
    if (catchEngine) return catchEngine.getSnapshot();
    if (freezeEngine) return freezeEngine.getSnapshot();
    if (lavaEngine) return lavaEngine.getSnapshot();
    return /** @type {NonNullable<typeof repEngine>} */ (repEngine).getSnapshot();
  }

  /**
   * Runs one player's pose detectors for the current frame.
   * @param {Landmark[] | null} landmarks
   * @param {Calibration} calibration
   * @param {number} nowMs
   * @param {number} playerIndex
   */
  function runPlayerDetectors(landmarks, calibration, nowMs, playerIndex) {
    const jDet = playerIndex === 1 ? jump2 : jump1;
    const aDet = playerIndex === 1 ? arms2 : arms1;
    const sDet = playerIndex === 1 ? squat2 : squat1;
    const jjDet = playerIndex === 1 ? jack2 : jack1;
    const bDet = playerIndex === 1 ? balance2 : balance1;
    const eDet = playerIndex === 1 ? energy2 : energy1;

    if (activityId === "catch_the_stars") {
      if (jDet.update(landmarks, nowMs, calibration)) applyAction("jump", nowMs, playerIndex);
      if (aDet.update(landmarks, nowMs, calibration)) applyAction("armsUp", nowMs, playerIndex);
    } else if (activityId === "squats") {
      if (sDet.update(landmarks, nowMs, calibration)) applyAction("squat", nowMs, playerIndex);
    } else if (activityId === "jumping_jacks") {
      if (jjDet.update(landmarks, nowMs, calibration)) applyAction("jumpingJack", nowMs, playerIndex);
    } else if (activityId === "tree_balance") {
      const gainedSec = bDet.update(landmarks, nowMs, calibration);
      if (gainedSec > 0 && repEngine) {
        const events = repEngine.addRep(nowMs, gainedSec);
        for (const evt of events) {
          if (evt.type === "rep") {
            if (playerIndex === 1) player2Score += evt.value;
            else player1Score += evt.value;
          }
          dispatchEvent(evt);
          if (evt.type === "finish") finishSession();
        }
      }
    } else if (activityId === "eskista") {
      const eState = eDet.update(landmarks, nowMs, calibration);
      if (eState.shoulderBeat) applyAction("move", nowMs, playerIndex);
    } else if (activityId === "freeze_dance") {
      eDet.update(landmarks, nowMs, calibration);
    } else if (activityId === "floor_is_lava") {
      if (jDet.update(landmarks, nowMs, calibration)) applyAction("jump", nowMs, playerIndex);
      sDet.update(landmarks, nowMs, calibration);
      if (lavaEngine) {
        lavaEngine.setDucking(sDet.state.squatting || keyboard.isHeld("squat"));
      }
    }
  }

  /** @param {Landmark[][]} poses @param {number} nowMs */
  function handleCameraPoses(poses, nowMs) {
    if (stopped || finished) return;
    lastLandmarks = poses;

    // Sort left-to-right so Player 1 and Player 2 keep stable identities in coop mode.
    const ordered =
      poses.length >= 2
        ? poses.slice().sort((a, b) => (a[23]?.x ?? 0.5) - (b[23]?.x ?? 0.5))
        : poses;
    if (ordered.length > maxPlayersDetected) maxPlayersDetected = ordered.length;

    const p1Pose = ordered[0] ?? null;
    const p2Pose = coopEnabled && ordered.length >= 2 ? ordered[1] : null;

    const cal1 = calibrator1.update(p1Pose, nowMs);
    const cal2 = p2Pose ? calibrator2.update(p2Pose, nowMs) : null;

    if (!playing) {
      if (cal1.status === "ready" && cal1.calibration) {
        playing = true;
        emitStatus({ state: "playing", hint: options.labels?.ready || CALIBRATION_HINTS.ready, hintKey: "ready", progress: 1 });
      } else {
        emitStatus({
          state: "calibrating",
          hint: options.labels?.[cal1.hintKey] || cal1.hint,
          hintKey: cal1.hintKey,
          progress: cal1.progress,
        });
      }
    } else if (!paused) {
      if (cal1.calibration) runPlayerDetectors(p1Pose, cal1.calibration, nowMs, 0);
      if (p2Pose && cal2?.calibration) runPlayerDetectors(p2Pose, cal2.calibration, nowMs, 1);

      if (p1Pose && !bodyInFrame(p1Pose)) {
        emitStatus({ state: "playing", hint: options.labels?.no_body || CALIBRATION_HINTS.no_body, hintKey: "no_body" });
      }
    }
  }

  /** @param {number} nowMs */
  function renderFrame(nowMs) {
    if (stopped || finished) return;
    rafId = requestAnimationFrame(renderFrame);

    const dtMs = lastFrameNow === 0 ? 16 : Math.min(100, Math.max(0, nowMs - lastFrameNow));
    lastFrameNow = nowMs;

    if (poseEngine) {
      juice.setFps(poseEngine.getFps());
    }

    if (playing && !paused) {
      // Keyboard balance hold accumulates time cleanly in tree_balance mode.
      if (activityId === "tree_balance" && repEngine && keyboard.isHeld("balance")) {
        keyboardBalanceAccumMs += dtMs;
        if (keyboardBalanceAccumMs >= 1000) {
          const whole = Math.floor(keyboardBalanceAccumMs / 1000);
          keyboardBalanceAccumMs -= whole * 1000;
          const events = repEngine.addRep(nowMs, whole);
          for (const evt of events) {
            if (evt.type === "rep") player1Score += evt.value;
            dispatchEvent(evt);
            if (evt.type === "finish") {
              finishSession();
              return;
            }
          }
        }
      }

      /** @type {Array<ActivityEvent & { x?: number, y?: number }>} */
      let stepEvents = [];
      if (catchEngine) {
        stepEvents = catchEngine.step(nowMs);
      } else if (freezeEngine) {
        const isMoving =
          energy1.state.moving ||
          (coopEnabled && energy2.state.moving) ||
          nowMs <= keyboardMovingUntilMs ||
          keyboard.isHeld("move");
        stepEvents = freezeEngine.step(nowMs, isMoving);
      } else if (lavaEngine) {
        stepEvents = lavaEngine.step(nowMs);
      } else if (repEngine) {
        stepEvents = repEngine.step(nowMs);
      }

      for (const evt of stepEvents) {
        if (evt.type === "rep") player1Score += evt.value;
        dispatchEvent(evt, { x: evt.x, y: evt.y });
        if (evt.type === "finish") {
          finishSession();
          return;
        }
      }
    }

    juice.update(dtMs);

    if (!ctx) return;

    const videoEl = options.video;
    const hasVideo =
      requestedMode === "camera" && videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0;
    const width = hasVideo ? videoEl.videoWidth : canvas.width || 640;
    const height = hasVideo ? videoEl.videoHeight : canvas.height || 480;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const shake = juice.getShakeOffset();
    ctx.save();
    ctx.translate(shake.dx, shake.dy);

    if (hasVideo && videoEl) {
      // Mirror camera so the child sees themselves like a mirror.
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoEl, 0, 0, width, height);

      const cal = calibrator1.getCalibration();
      for (let i = 0; i < lastLandmarks.length; i += 1) {
        const lm = lastLandmarks[i];
        if (debug) drawSkeleton(ctx, lm, width, height, i === 1 ? "#4cc9f0" : "#fca311");
        if (dressUp !== "none" && cal) {
          drawDressUpOverlay(ctx, dressUp, lm, cal.torsoLength, width, height);
        }
      }
      ctx.restore();
    } else {
      drawStageBackdrop(ctx, width, height, catalogEntry.id.replace(/_/g, " ").toUpperCase());
    }

    if (playing) {
      const snap = getCurrentSnapshot();
      drawHud(ctx, width, {
        remainingSec: snap.remainingMs / 1000,
        reps: snap.reps,
        target: snap.target,
        score: snap.score,
        combo: snap.combo,
        difficultyLevel: snap.difficultyLevel,
        coop: coopEnabled ? { p1: player1Score, p2: player2Score, players: maxPlayersDetected } : null,
      });

      if (catchEngine) {
        drawCatchTheStarsOverlay(ctx, width, height, catchEngine.getSnapshot(), options.labels);
      } else if (lavaEngine) {
        drawFloorIsLavaOverlay(ctx, width, height, lavaEngine.getSnapshot());
      } else if (freezeEngine) {
        const fs = freezeEngine.getSnapshot();
        drawMeterOverlay(ctx, width, height, {
          headline: fs.phase === "freeze" ? "FREEZE!" : "DANCE!",
          subline: `Round ${fs.currentRound} / ${fs.rounds}`,
          progress: fs.phaseProgress,
          accent: fs.phase === "freeze" ? "#4cc9f0" : "#06d6a0",
          footer: fs.lastMessage,
        });
      } else if (repEngine) {
        const rs = repEngine.getSnapshot();
        const footerByGame = {
          squats: "Bend your knees low, then stand up tall! (S / ↓)",
          jumping_jacks: "Jump wide with arms up, then feet together! (X / Space)",
          tree_balance: "Lift one foot and balance like a tall tree! (Hold B)",
          eskista: "Bounce your shoulders to the Ethiopian beat! (Tap M)",
        };
        drawMeterOverlay(ctx, width, height, {
          headline: `${rs.reps} / ${rs.target}`,
          subline: catalogEntry.repsMeaning,
          progress: rs.reps / Math.max(1, rs.target),
          accent: "#fca311",
          footer: footerByGame[/** @type {keyof typeof footerByGame} */ (activityId)] || "Keep moving!",
        });
      }

      if (paused) {
        ctx.fillStyle = "rgba(15, 29, 58, 0.72)";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 32px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Paused", width / 2, height / 2);
      }
    }

    juice.draw(ctx, width, height);
    ctx.restore();

    if (debug && options.onDebug) {
      const snap = getCurrentSnapshot();
      const fps = poseEngine ? poseEngine.getFps() : 60;
      options.onDebug(
        `game     ${activityId}\n` +
          `mode     ${keyboard.hasUsedInput() || requestedMode === "keyboard" ? "keyboard" : "camera"}\n` +
          `fps      ${fps.toFixed(1)}${juice.isReducedEffects() ? " (reduced FX)" : ""}\n` +
          `reps     ${snap.reps}/${snap.target}  score ${snap.score}\n` +
          `combo    ${snap.combo} (max ${snap.maxCombo})  lv ${snap.difficultyLevel}`
      );
    }
  }

  function pause() {
    if (paused || finished || stopped) return;
    paused = true;
    catchEngine?.pause();
    freezeEngine?.pause();
    lavaEngine?.pause();
    repEngine?.pause();
    emitStatus({ state: "paused", hint: options.labels?.paused || "Paused" });
  }

  function resume() {
    if (!paused || finished || stopped) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    paused = false;
    lastFrameNow = now;
    catchEngine?.resume(now);
    freezeEngine?.resume(now);
    lavaEngine?.resume(now);
    repEngine?.resume(now);
    emitStatus({ state: "playing", hint: options.labels?.ready || "Back to play!" });
  }

  function onVisibilityChange() {
    if (typeof document === "undefined") return;
    if (document.hidden) pause();
    else resume();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (poseEngine) {
      poseEngine.stop();
      poseEngine = null;
    }
    keyboard.detach();
    juice.dispose();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (ctx && !finished) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Launch camera or keyboard mode.
  if (requestedMode === "keyboard") {
    playing = true;
    emitStatus({
      state: "playing",
      hint: options.labels?.keyboardHint || "Keyboard / Touch mode ready! Let's play!",
      hintKey: "ready",
      progress: 1,
    });
    rafId = requestAnimationFrame(renderFrame);
  } else {
    emitStatus({ state: "loading", hint: options.labels?.loading || "Loading camera and pose model..." });
    if (!options.video) {
      emitStatus({
        state: "error",
        code: POSE_ERROR_CODES.UNSUPPORTED,
        message: "A video element is required for camera mode.",
      });
    } else {
      poseEngine = createPoseEngine({
        videoEl: options.video,
        modelPath,
        wasmPath,
        numPoses: coopEnabled ? 2 : 1,
        onFrame(landmarks, ts) {
          if (!coopEnabled) handleCameraPoses(landmarks ? [landmarks] : [], ts);
        },
        onMultiFrame(poses, ts) {
          if (coopEnabled) handleCameraPoses(poses, ts);
        },
        onError(error) {
          if (stopped || finished) return;
          stop();
          emitStatus({
            state: "error",
            code: error.code,
            message: error.message,
          });
        },
      });

      poseEngine.start().then((ok) => {
        if (!ok || stopped || finished) return;
        emitStatus({
          state: "calibrating",
          hint: options.labels?.no_body || CALIBRATION_HINTS.no_body,
          hintKey: "no_body",
          progress: 0,
        });
        rafId = requestAnimationFrame(renderFrame);
      });
    }
  }

  return {
    stop,
    pause,
    resume,
    setMuted: (m) => juice.setMuted(m),
    setDressUp: (item) => {
      dressUp = item;
    },
    triggerAction: (action) => keyboard.trigger(action),
    setActionHeld: (action, held) => keyboard.setHeld(action, held),
  };
}

/**
 * Backwards-compatible wrapper for Catch the Stars (P4 + F1).
 * Also supports Contract A frontend signature `{ canvas, engine, durationMs }` seamlessly
 * if the frontend passes an external Contract A pose engine.
 *
 * @param {any} options
 */
export function startCatchTheStars(options) {
  // Contract A compatibility bridge (when frontend passes `{ canvas, engine, durationMs }`):
  if (options && options.engine && typeof options.engine.on === "function") {
    return startContractACatchTheStars(options);
  }
  return startActivity({
    ...options,
    activity: "catch_the_stars",
  });
}

/**
 * Contract A bridge so `frontend/src/pages/CatchStars.tsx` works cleanly with `ai/pose/index.js`.
 * @param {{ canvas: HTMLCanvasElement, engine: any, durationMs?: number }} options
 */
function startContractACatchTheStars({ canvas, engine, durationMs = 60_000 }) {
  const listeners = new Map();
  const game = createCatchTheStarsEngine({ durationSec: Math.max(1, durationMs / 1000) });
  const juice = createJuiceEngine();
  const ctx = canvas.getContext("2d");
  let stopped = false;
  let raf = 0;

  /** @param {string} evt @param {any} payload */
  function emit(evt, payload) {
    listeners.get(evt)?.forEach((fn) => fn(payload));
  }

  const offAction = engine.on("action", (e) => {
    if (stopped) return;
    const now = performance.now();
    if (e.type === "jump" || e.type === "armsUp") {
      const evts = game.handleAction(e.type, now);
      for (const evt of evts) {
        juice.emit(evt, { x: evt.x, y: evt.y });
        if (evt.type === "catch") {
          emit("score", { score: game.getSnapshot().score });
        }
      }
    }
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    offAction();
    juice.dispose();
    const snap = game.getSnapshot();
    emit("end", {
      score: snap.score,
      starsCaught: snap.starsCaught,
      goldenCaught: snap.cloudsCaught,
      jumps: snap.jumps,
      armsUp: snap.armRaises,
      durationMs: Math.round(snap.elapsedMs),
    });
  }

  let last = performance.now();
  function loop(now) {
    if (stopped) return;
    const dt = Math.min(100, now - last);
    last = now;
    const evts = game.step(now);
    for (const evt of evts) {
      juice.emit(evt, { x: evt.x, y: evt.y });
      if (evt.type === "finish") {
        stop();
        return;
      }
    }
    juice.update(dt);
    if (ctx) {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || canvas.width || 640;
      const h = parent?.clientHeight || canvas.height || 480;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      drawCatchTheStarsOverlay(ctx, w, h, game.getSnapshot());
      juice.draw(ctx, w, h);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return () => listeners.get(event)?.delete(handler);
    },
    pause: () => game.pause(),
    resume: () => game.resume(performance.now()),
    stop,
  };
}
