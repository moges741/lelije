// @ts-check
// Catch the Stars: a 60 second movement game.
//   Star  -> JUMP while it is inside the catch zone      (+10 points)
//   Cloud -> raise BOTH ARMS while it is inside the zone  (+15 points)
//
// This file has three parts:
//   1. createCatchTheStarsGame      pure game rules (no DOM, unit-tested)
//   2. createCatchTheStarsRenderer  canvas drawing
//   3. startCatchTheStars           runner: camera + calibration + detectors + game
//
// If the camera or the pose model is not available, the game carries on with
// the keyboard and taps (see keyboardMode.js), so it can always be played.
//
// PRIVACY: the camera picture is only drawn to the local canvas. Nothing is
// uploaded, stored or logged, and the camera is switched off when the game ends.

import { bodyInFrame, CALIBRATION_HINTS, createCalibrator } from "./calibration.js";
import { createArmsUpDetector, createJumpDetector } from "./detectors.js";
import { createKeyboardInput } from "./keyboardMode.js";
import { createPoseEngine } from "./poseEngine.js";
import { buildActivityResult, createSessionId, resolveTarget } from "./result.js";

/** @typedef {import("./poseEngine.js").Landmark} Landmark */
/** @typedef {import("./poseEngine.js").PoseError} PoseError */
/** @typedef {import("./result.js").ActivityResult} ActivityResult */
/** @typedef {import("./result.js").InputMode} InputMode */

/** @typedef {"loading" | "no_body" | "calibrating" | "playing" | "finished" | "error"} GameState */
/** @typedef {"star" | "cloud"} ObjectKind */

/**
 * @typedef {object} GameEvent
 * @property {"jump" | "armsUp" | "catch" | "miss" | "combo"} type
 * @property {number} value  jump / armsUp: total so far. catch: points gained. miss: total misses. combo: catches in a row.
 * @property {number} timeMs  Play time when it happened.
 * @property {ObjectKind | null} kind  Which object it was about, if any.
 * @property {number} x  Position on the canvas, 0..1 (for effects).
 * @property {number} y
 */

/**
 * What the game rules know at the end. startCatchTheStars turns this into the
 * full onFinish payload (see result.js).
 * @typedef {object} CatchTheStarsResult
 * @property {"catch_the_stars"} game
 * @property {number} duration_sec
 * @property {number} reps  Objects caught.
 * @property {number} jumps  Every detected jump, not only successful catches.
 * @property {number} arm_raises  Every detected arms-up, not only successful catches.
 * @property {number} points
 */

/** Game rules and timing, all in one place. Positions are fractions of the canvas (0..1). */
export const CATCH_THE_STARS_CONFIG = {
  durationSec: 60,
  /** Catches needed to complete a mission when the host gives no target. */
  defaultTarget: 10,
  /** A new object appears every 1.5 to 2.5 seconds. */
  spawnMinMs: 1500,
  spawnMaxMs: 2500,
  firstSpawnMs: 800,
  /** No new objects this close to the end: they could not be caught in time. */
  noSpawnBeforeEndMs: 3000,
  starPoints: 10,
  cloudPoints: 15,
  /** +comboBonus for every comboEvery catches in a row. */
  comboEvery: 3,
  comboBonus: 5,
  starChance: 0.6,
  /** Time for an object to float across the whole screen. */
  crossingMs: 4500,
  /** Objects start and end this far outside the picture. */
  edge: 0.1,
  /** The catch zone, in the middle above the child's head. */
  zoneLeft: 0.28,
  zoneRight: 0.72,
  starLaneY: 0.15,
  cloudLaneY: 0.2,
  /** Show "Move your body!" after this long without any jump or arms-up. */
  idleHintMs: 8000,
  /** How long a caught object stays on screen for its pop animation. */
  caughtLingerMs: 450,
  maxObjects: 8,
};

/**
 * Every text the game can show. Pass `labels` to startCatchTheStars to translate them.
 */
export const CATCH_THE_STARS_LABELS = {
  loading: "Getting the camera ready...",
  no_body: CALIBRATION_HINTS.no_body,
  too_far: CALIBRATION_HINTS.too_far,
  calibrating: CALIBRATION_HINTS.calibrating,
  playing: "Let's play!",
  move_your_body: "Move your body!",
  finished: "Great job!",
  error: "The camera is not available",
  jumpCue: "JUMP!",
  armsUpCue: "ARMS UP!",
  combo: "Combo!",
  points: "points",
  jumps: "Jumps",
  armRaises: "Arms up",
  finishedHint: "Well done! Have some water and a rest.",
  errorHint: "Ask a grown-up to help",
  /** Status text while playing without the camera. */
  keyboard: "Playing with the keys: Space = jump, Up arrow = arms up",
  keyJump: "Space",
  keyArmsUp: "Up arrow",
  tapHere: "or tap here",
};

/** @typedef {keyof typeof CATCH_THE_STARS_LABELS} LabelKey */

// ---------------------------------------------------------------------------
// 1. Game rules (pure)
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FlyingObject
 * @property {boolean} active
 * @property {ObjectKind} kind
 * @property {number} x
 * @property {number} y
 * @property {1 | -1} direction  1 = left to right.
 * @property {"flying" | "caught" | "missed"} status
 * @property {boolean} inZone
 * @property {number} lingerMs  Time since it was caught.
 */

/**
 * @typedef {object} CatchTheStarsState
 * @property {number} elapsedMs
 * @property {number} durationMs
 * @property {number} remainingSec  Whole seconds left, rounded up.
 * @property {number} points
 * @property {number} combo  Catches in a row right now.
 * @property {number} bestCombo
 * @property {number} jumps
 * @property {number} armRaises
 * @property {number} spawned  Objects that have appeared so far.
 * @property {number} catches
 * @property {number} misses
 * @property {boolean} finished
 * @property {boolean} idleHint
 * @property {ObjectKind | null} zoneKind  What can be caught right now (which cue to show).
 * @property {FlyingObject[]} objects  Fixed-size pool; check `active`.
 */

/**
 * Pure game rules. Time only moves when update(dtMs) is called, so pausing
 * (hidden tab) is simply "stop calling update".
 *
 * @param {object} [options]
 * @param {number} [options.durationSec]
 * @param {() => number} [options.random]  Returns 0..1. Inject a fixed sequence in tests.
 * @param {(event: GameEvent) => void} [options.onEvent]
 * @param {Partial<typeof CATCH_THE_STARS_CONFIG>} [options.config]
 */
export function createCatchTheStarsGame(options = {}) {
  const config = { ...CATCH_THE_STARS_CONFIG, ...options.config };
  const random = options.random ?? Math.random;
  const onEvent = options.onEvent ?? null;

  const requested = Number(options.durationSec ?? config.durationSec);
  const durationSec = Number.isFinite(requested) && requested > 0 ? requested : config.durationSec;
  const speedPerMs = (1 + 2 * config.edge) / config.crossingMs;

  /** @type {CatchTheStarsState} */
  const state = {
    elapsedMs: 0,
    durationMs: durationSec * 1000,
    remainingSec: Math.ceil(durationSec),
    points: 0,
    combo: 0,
    bestCombo: 0,
    jumps: 0,
    armRaises: 0,
    spawned: 0,
    catches: 0,
    misses: 0,
    finished: false,
    idleHint: false,
    zoneKind: null,
    objects: Array.from({ length: config.maxObjects }, () => ({
      active: false,
      kind: /** @type {ObjectKind} */ ("star"),
      x: 0,
      y: 0,
      direction: /** @type {1 | -1} */ (1),
      status: /** @type {"flying" | "caught" | "missed"} */ ("flying"),
      inZone: false,
      lingerMs: 0,
    })),
  };

  let nextSpawnAt = config.firstSpawnMs;
  let idleMs = 0;

  /**
   * @param {GameEvent["type"]} type
   * @param {number} value
   * @param {FlyingObject | null} object
   */
  function emit(type, value, object) {
    if (!onEvent) return;
    onEvent({
      type,
      value,
      timeMs: state.elapsedMs,
      kind: object ? object.kind : null,
      x: object ? object.x : 0.5,
      y: object ? object.y : config.starLaneY,
    });
  }

  /**
   * Adds an object at the edge of the screen. Returns null when the pool is full.
   * @param {ObjectKind} [kind]
   * @param {1 | -1} [direction]
   * @returns {FlyingObject | null}
   */
  function spawn(kind, direction) {
    const object = state.objects.find((candidate) => !candidate.active);
    if (!object) return null;
    object.active = true;
    object.kind = kind ?? (random() < config.starChance ? "star" : "cloud");
    object.direction = direction ?? (random() < 0.5 ? 1 : -1);
    object.x = object.direction === 1 ? -config.edge : 1 + config.edge;
    object.y = (object.kind === "star" ? config.starLaneY : config.cloudLaneY) + (random() - 0.5) * 0.04;
    object.status = "flying";
    object.inZone = false;
    object.lingerMs = 0;
    state.spawned += 1;
    return object;
  }

  /**
   * The catchable object of this kind that is closest to leaving the zone.
   * @param {ObjectKind | null} kind  null = any kind.
   * @returns {FlyingObject | null}
   */
  function nextInZone(kind) {
    /** @type {FlyingObject | null} */
    let best = null;
    let bestRemaining = Number.POSITIVE_INFINITY;
    for (const object of state.objects) {
      if (!object.active || object.status !== "flying" || !object.inZone) continue;
      if (kind !== null && object.kind !== kind) continue;
      const remaining = object.direction === 1 ? config.zoneRight - object.x : object.x - config.zoneLeft;
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        best = object;
      }
    }
    return best;
  }

  /**
   * @param {ObjectKind} kind
   * @returns {boolean} True when something was caught.
   */
  function tryCatch(kind) {
    const object = nextInZone(kind);
    if (!object) return false;

    object.status = "caught";
    object.lingerMs = 0;
    state.catches += 1;
    state.combo += 1;
    if (state.combo > state.bestCombo) state.bestCombo = state.combo;

    const gained = kind === "star" ? config.starPoints : config.cloudPoints;
    state.points += gained;
    emit("catch", gained, object);

    if (state.combo % config.comboEvery === 0) {
      state.points += config.comboBonus;
      emit("combo", state.combo, object);
    }
    state.zoneKind = nextInZone(null)?.kind ?? null;
    return true;
  }

  /** A jump was detected. Catches a star if one is in the zone. */
  function onJump() {
    if (state.finished) return false;
    state.jumps += 1;
    idleMs = 0;
    state.idleHint = false;
    emit("jump", state.jumps, null);
    return tryCatch("star");
  }

  /** Both arms went up. Catches a cloud if one is in the zone. */
  function onArmsUp() {
    if (state.finished) return false;
    state.armRaises += 1;
    idleMs = 0;
    state.idleHint = false;
    emit("armsUp", state.armRaises, null);
    return tryCatch("cloud");
  }

  /**
   * Moves the game forward by dtMs of play time.
   * @param {number} dtMs
   */
  function update(dtMs) {
    if (state.finished || !(dtMs > 0)) return;

    state.elapsedMs = Math.min(state.elapsedMs + dtMs, state.durationMs);
    state.remainingSec = Math.ceil((state.durationMs - state.elapsedMs) / 1000);

    if (state.elapsedMs >= nextSpawnAt) {
      if (state.durationMs - state.elapsedMs > config.noSpawnBeforeEndMs) spawn();
      nextSpawnAt = state.elapsedMs + config.spawnMinMs + random() * (config.spawnMaxMs - config.spawnMinMs);
    }

    for (const object of state.objects) {
      if (!object.active) continue;

      if (object.status === "caught") {
        object.lingerMs += dtMs;
        if (object.lingerMs >= config.caughtLingerMs) object.active = false;
        continue;
      }

      object.x += object.direction * speedPerMs * dtMs;
      object.inZone = object.x >= config.zoneLeft && object.x <= config.zoneRight;

      const passedZone = object.direction === 1 ? object.x > config.zoneRight : object.x < config.zoneLeft;
      if (object.status === "flying" && passedZone) {
        object.status = "missed";
        state.misses += 1;
        state.combo = 0;
        emit("miss", state.misses, object);
      }
      if (object.x < -config.edge || object.x > 1 + config.edge) object.active = false;
    }

    state.zoneKind = nextInZone(null)?.kind ?? null;

    idleMs += dtMs;
    state.idleHint = idleMs >= config.idleHintMs;

    if (state.elapsedMs >= state.durationMs) {
      state.finished = true;
      state.idleHint = false;
      state.zoneKind = null;
    }
  }

  /** @returns {CatchTheStarsResult} */
  function result() {
    return {
      game: "catch_the_stars",
      duration_sec: Math.round(state.elapsedMs / 1000),
      reps: state.catches,
      jumps: state.jumps,
      arm_raises: state.armRaises,
      points: state.points,
    };
  }

  return { state, config, update, onJump, onArmsUp, spawn, result };
}

// ---------------------------------------------------------------------------
// 2. Canvas renderer
// ---------------------------------------------------------------------------

const COLORS = {
  navy: "#14213d",
  navySoft: "rgba(20, 33, 61, 0.72)",
  orange: "#fca311",
  yellow: "#ffd60a",
  sky: "#7bdff2",
  white: "#ffffff",
  pink: "#ff8fab",
};
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Ethiopic", sans-serif';
const PARTICLE_COLORS = [COLORS.yellow, COLORS.orange, COLORS.white, COLORS.sky, COLORS.pink];
const FLOATER_MS = 900;
const PARTICLE_MS = 700;
const PANEL_FLASH_MS = 200;

// Body joints for the debug skeleton (no face or fingers).
const DEBUG_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const DEBUG_BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];

/**
 * What the runner tells the renderer each frame. One object, reused.
 * @typedef {object} RenderView
 * @property {GameState} state
 * @property {LabelKey} hintKey
 * @property {InputMode} inputMode  "keyboard" draws a night sky and the key / tap panels instead of the camera.
 * @property {number} calibrationProgress
 * @property {CatchTheStarsState} game
 * @property {Landmark[] | null} landmarks  Only drawn in debug mode.
 * @property {number | null} baselineHipY  Only drawn in debug mode.
 */

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvasEl
 * @param {HTMLVideoElement} options.videoEl
 * @param {typeof CATCH_THE_STARS_LABELS} options.labels
 * @param {typeof CATCH_THE_STARS_CONFIG} options.config
 * @param {boolean} [options.debug]
 */
export function createCatchTheStarsRenderer({ canvasEl, videoEl, labels, config, debug = false }) {
  const context = canvasEl.getContext("2d");
  if (!context) throw new Error("The canvas 2D context is not available.");
  const ctx = context;

  let W = canvasEl.width;
  let H = canvasEl.height;

  // Effect pools, created once and reused (no garbage while playing).
  const floaters = Array.from({ length: 6 }, () => ({ active: false, text: "", x: 0, y: 0, age: 0, color: COLORS.white }));
  const particles = Array.from({ length: 48 }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, color: COLORS.white }));

  // Text is rebuilt only when its number changes.
  /** @type {Map<number, string>} */
  const fonts = new Map();
  let pointsShown = -1;
  let pointsText = "0";
  let secondsShown = -1;
  let secondsText = "";
  let comboShown = -1;
  let comboText = "";
  let finishedStatsText = "";

  // Keyboard mode: when each key / tap panel was last used, for a short flash.
  let jumpFlashAt = Number.NEGATIVE_INFINITY;
  let armsUpFlashAt = Number.NEGATIVE_INFINITY;

  /** @param {number} size */
  function font(size) {
    const px = Math.max(8, Math.round(size));
    let value = fonts.get(px);
    if (!value) {
      value = `800 ${px}px ${FONT_FAMILY}`;
      fonts.set(px, value);
    }
    return value;
  }

  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {string} color
   * @param {CanvasTextAlign} [align]
   * @param {number} [maxWidth]  Longer text is squeezed to fit (translations can be long).
   */
  function drawText(text, x, y, size, color, align = "center", maxWidth = W * 0.94) {
    ctx.font = font(size);
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = COLORS.navy;
    ctx.strokeText(text, x, y, maxWidth);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y, maxWidth);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} radius
   */
  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} rotation
   */
  function starPath(cx, cy, radius, rotation) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? radius : radius * 0.46;
      const angle = rotation - Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {number} rotation
   */
  function drawStar(cx, cy, radius, rotation) {
    starPath(cx, cy, radius, rotation);
    ctx.fillStyle = COLORS.yellow;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, radius * 0.14);
    ctx.strokeStyle = COLORS.orange;
    ctx.stroke();
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} width
   * @param {string} color
   */
  function cloudShape(cx, cy, width, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx - width * 0.27, cy + width * 0.06, width * 0.2, 0, Math.PI * 2);
    ctx.arc(cx, cy - width * 0.06, width * 0.27, 0, Math.PI * 2);
    ctx.arc(cx + width * 0.28, cy + width * 0.06, width * 0.21, 0, Math.PI * 2);
    ctx.fill();
    roundedRect(cx - width * 0.4, cy + width * 0.02, width * 0.8, width * 0.25, width * 0.12);
    ctx.fill();
  }

  /**
   * @param {number} cx
   * @param {number} cy
   * @param {number} width
   */
  function drawCloud(cx, cy, width) {
    cloudShape(cx, cy, width * 1.1, COLORS.sky);
    cloudShape(cx, cy, width, COLORS.white);
  }

  function syncSize() {
    const videoWidth = videoEl.videoWidth;
    const videoHeight = videoEl.videoHeight;
    if (videoWidth > 0 && videoHeight > 0 && (canvasEl.width !== videoWidth || canvasEl.height !== videoHeight)) {
      canvasEl.width = videoWidth;
      canvasEl.height = videoHeight;
    }
    W = canvasEl.width;
    H = canvasEl.height;
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#1b2f5e");
    gradient.addColorStop(1, COLORS.navy);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  }

  /** Draws the camera picture mirrored, so the child sees themselves like in a mirror. */
  function drawVideo() {
    if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
      drawBackground();
      return false;
    }
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, W, H);
    ctx.restore();
    return true;
  }

  /**
   * @param {Landmark[] | null} landmarks
   * @param {number | null} baselineHipY
   */
  function drawSkeleton(landmarks, baselineHipY) {
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    if (landmarks) {
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.strokeStyle = COLORS.orange;
      ctx.beginPath();
      for (const [a, b] of DEBUG_BONES) {
        const p = landmarks[a];
        const q = landmarks[b];
        if (!p || !q || p.visibility < 0.5 || q.visibility < 0.5) continue;
        ctx.moveTo(p.x * W, p.y * H);
        ctx.lineTo(q.x * W, q.y * H);
      }
      ctx.stroke();
      ctx.fillStyle = COLORS.white;
      for (const index of DEBUG_JOINTS) {
        const p = landmarks[index];
        if (!p || p.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (baselineHipY !== null) {
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.sky;
      ctx.beginPath();
      ctx.moveTo(0, baselineHipY * H);
      ctx.lineTo(W, baselineHipY * H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** @param {RenderView} view */
  function drawCalibration(view) {
    ctx.fillStyle = "rgba(20, 33, 61, 0.35)";
    ctx.fillRect(0, 0, W, H);
    drawText(labels[view.hintKey], W / 2, H * 0.8, H * 0.065, COLORS.white);

    if (view.state === "calibrating") {
      const barWidth = W * 0.5;
      const barHeight = H * 0.035;
      const x = (W - barWidth) / 2;
      const y = H * 0.89;
      roundedRect(x, y, barWidth, barHeight, barHeight / 2);
      ctx.fillStyle = COLORS.navySoft;
      ctx.fill();
      const filled = Math.max(barHeight, barWidth * view.calibrationProgress);
      roundedRect(x, y, filled, barHeight, barHeight / 2);
      ctx.fillStyle = COLORS.orange;
      ctx.fill();
    }
  }

  /**
   * @param {CatchTheStarsState} game
   * @param {number} nowMs
   */
  function drawPlayfield(game, nowMs) {
    // Soft "sky" at the top so the objects stand out against any room.
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    sky.addColorStop(0, "rgba(20, 33, 61, 0.7)");
    sky.addColorStop(1, "rgba(20, 33, 61, 0)");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.45);

    // Catch zone. It glows when something inside it can be caught.
    const zoneX = config.zoneLeft * W;
    const zoneWidth = (config.zoneRight - config.zoneLeft) * W;
    const zoneY = H * 0.03;
    const zoneHeight = H * 0.3;
    const pulse = game.zoneKind ? 0.2 + 0.1 * Math.sin(nowMs / 110) : 0.08;
    roundedRect(zoneX, zoneY, zoneWidth, zoneHeight, H * 0.05);
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse.toFixed(2)})`;
    ctx.fill();
    ctx.setLineDash([H * 0.03, H * 0.02]);
    ctx.lineWidth = Math.max(2, H * 0.008);
    ctx.strokeStyle = game.zoneKind ? COLORS.yellow : "rgba(255, 255, 255, 0.7)";
    ctx.stroke();
    ctx.setLineDash([]);

    for (const object of game.objects) {
      if (!object.active) continue;
      const cx = object.x * W;
      const cy = object.y * H + Math.sin(nowMs / 300 + object.x * 9) * H * 0.008;

      let scale = 1;
      let alpha = 1;
      if (object.status === "caught") {
        const t = Math.min(object.lingerMs / config.caughtLingerMs, 1);
        scale = 1 + t * 0.9;
        alpha = 1 - t;
      } else if (object.status === "missed") {
        alpha = 0.35;
      } else if (object.inZone) {
        scale = 1.15 + 0.06 * Math.sin(nowMs / 90);
      }

      ctx.globalAlpha = alpha;
      if (object.kind === "star") drawStar(cx, cy, H * 0.07 * scale, nowMs / 900);
      else drawCloud(cx, cy, H * 0.2 * scale);
      ctx.globalAlpha = 1;
    }

    // Tell the child what to do right now.
    if (game.zoneKind === "star") drawText(labels.jumpCue, W / 2, H * 0.42, H * 0.1, COLORS.yellow);
    else if (game.zoneKind === "cloud") drawText(labels.armsUpCue, W / 2, H * 0.42, H * 0.1, COLORS.white);
  }

  /** @param {number} dtMs */
  function drawEffects(dtMs) {
    for (const particle of particles) {
      if (!particle.active) continue;
      particle.age += dtMs;
      if (particle.age >= PARTICLE_MS) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dtMs;
      particle.y += particle.vy * dtMs;
      particle.vy += 0.0000006 * dtMs; // a little gravity
      ctx.globalAlpha = 1 - particle.age / PARTICLE_MS;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x * W, particle.y * H, H * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const floater of floaters) {
      if (!floater.active) continue;
      floater.age += dtMs;
      if (floater.age >= FLOATER_MS) {
        floater.active = false;
        continue;
      }
      const t = floater.age / FLOATER_MS;
      ctx.globalAlpha = 1 - t * t;
      drawText(floater.text, floater.x * W, (floater.y - t * 0.1) * H, H * 0.085, floater.color);
    }
    ctx.globalAlpha = 1;
  }

  /** @param {CatchTheStarsState} game */
  function drawHud(game) {
    if (game.points !== pointsShown) {
      pointsShown = game.points;
      pointsText = String(game.points);
    }
    if (game.remainingSec !== secondsShown) {
      secondsShown = game.remainingSec;
      secondsText = String(game.remainingSec);
    }
    if (game.combo !== comboShown) {
      comboShown = game.combo;
      comboText = `${labels.combo} x${game.combo}`;
    }

    const pillHeight = H * 0.13;
    const pillY = H - pillHeight - H * 0.03;
    const margin = W * 0.03;

    // Score, bottom left.
    const scoreWidth = W * 0.3;
    roundedRect(margin, pillY, scoreWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = COLORS.navySoft;
    ctx.fill();
    drawStar(margin + pillHeight * 0.55, pillY + pillHeight / 2, pillHeight * 0.32, 0);
    drawText(pointsText, margin + pillHeight * 1.05, pillY + pillHeight / 2, pillHeight * 0.62, COLORS.white, "left");

    // Seconds left, bottom right.
    const timerWidth = W * 0.2;
    roundedRect(W - margin - timerWidth, pillY, timerWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = COLORS.navySoft;
    ctx.fill();
    const lastSeconds = game.remainingSec <= 5;
    drawText(secondsText, W - margin - timerWidth / 2, pillY + pillHeight / 2, pillHeight * 0.62, lastSeconds ? COLORS.yellow : COLORS.white);

    if (game.combo >= 2) {
      drawText(comboText, margin + scoreWidth / 2, pillY - H * 0.05, H * 0.055, COLORS.yellow);
    }
  }

  /**
   * @param {CatchTheStarsState} game
   * @param {number} nowMs
   */
  function drawFinished(game, nowMs) {
    drawBackground();
    // Twinkling stars in fixed places down both sides, clear of the text in the middle.
    for (let i = 0; i < 18; i += 1) {
      const fx = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
      const fy = Math.abs((Math.sin(i * 78.233) * 12345.678) % 1);
      const x = i % 2 === 0 ? 0.03 + fx * 0.15 : 0.82 + fx * 0.15;
      const twinkle = 0.5 + 0.5 * Math.sin(nowMs / 400 + i * 1.7);
      ctx.globalAlpha = 0.35 + 0.65 * twinkle;
      drawStar(x * W, (0.06 + fy * 0.86) * H, H * (0.018 + 0.012 * twinkle), i);
    }
    ctx.globalAlpha = 1;

    if (finishedStatsText === "") {
      finishedStatsText = `${labels.jumps} ${game.jumps}   ${labels.armRaises} ${game.armRaises}`;
      pointsText = String(game.points);
      pointsShown = game.points;
    }
    drawText(labels.finished, W / 2, H * 0.2, H * 0.13, COLORS.yellow);
    drawStar(W / 2, H * 0.42, H * 0.09, Math.sin(nowMs / 600) * 0.25);
    drawText(`${pointsText} ${labels.points}`, W / 2, H * 0.6, H * 0.11, COLORS.white);
    drawText(finishedStatsText, W / 2, H * 0.74, H * 0.055, COLORS.sky);
    drawText(labels.finishedHint, W / 2, H * 0.88, H * 0.05, COLORS.white);
  }

  /**
   * One big key / tap panel for keyboard mode.
   * @param {number} x  Left edge, 0..1.
   * @param {ObjectKind} kind
   * @param {string} keyLabel
   * @param {boolean} flash
   */
  function drawControlPanel(x, kind, keyLabel, flash) {
    const left = x * W;
    const top = H * 0.5;
    const width = W * 0.4;
    const height = H * 0.24;
    roundedRect(left, top, width, height, H * 0.04);
    ctx.fillStyle = flash ? "rgba(252, 163, 17, 0.6)" : "rgba(255, 255, 255, 0.12)";
    ctx.fill();
    ctx.lineWidth = Math.max(2, H * 0.006);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.stroke();

    const iconX = left + width * 0.2;
    const middleY = top + height * 0.4;
    if (kind === "star") drawStar(iconX, middleY, H * 0.05, 0);
    else drawCloud(iconX, middleY, H * 0.13);
    drawText(keyLabel, left + width * 0.63, middleY, H * 0.06, COLORS.white, "center", width * 0.6);
    drawText(labels.tapHere, left + width / 2, top + height * 0.8, H * 0.04, COLORS.sky, "center", width * 0.9);
  }

  /**
   * Keyboard mode: shows which key (or which side to tap) does what.
   * @param {number} nowMs
   */
  function drawKeyboardControls(nowMs) {
    drawControlPanel(0.06, "star", labels.keyJump, nowMs - jumpFlashAt < PANEL_FLASH_MS);
    drawControlPanel(0.54, "cloud", labels.keyArmsUp, nowMs - armsUpFlashAt < PANEL_FLASH_MS);
  }

  /**
   * @param {string} title
   * @param {string} hint
   */
  function drawMessage(title, hint) {
    drawBackground();
    drawText(title, W / 2, H * 0.44, H * 0.075, COLORS.white);
    if (hint) drawText(hint, W / 2, H * 0.58, H * 0.055, COLORS.sky);
  }

  /**
   * Draws one frame.
   * @param {RenderView} view
   * @param {number} nowMs
   * @param {number} dtMs
   */
  function draw(view, nowMs, dtMs) {
    syncSize();

    if (view.state === "finished") {
      drawFinished(view.game, nowMs);
      return;
    }
    if (view.state === "error") {
      drawMessage(labels.error, labels.errorHint);
      return;
    }
    if (view.state === "loading") {
      drawMessage(labels.loading, "");
      return;
    }

    if (view.inputMode === "keyboard") {
      // No camera picture: a night sky with the key / tap panels.
      drawBackground();
      drawPlayfield(view.game, nowMs);
      drawKeyboardControls(nowMs);
      drawEffects(dtMs);
      drawHud(view.game);
      return;
    }

    drawVideo();
    if (debug) drawSkeleton(view.landmarks, view.baselineHipY);

    if (view.state === "no_body" || view.state === "calibrating") {
      drawCalibration(view);
      return;
    }

    drawPlayfield(view.game, nowMs);
    drawEffects(dtMs);
    drawHud(view.game);
    if (view.hintKey === "move_your_body" || view.hintKey === "no_body") {
      drawText(labels[view.hintKey], W / 2, H * 0.62, H * 0.07, COLORS.white);
    }
  }

  /**
   * Starts the visual effect for a game event.
   * @param {GameEvent} event
   */
  function handleEvent(event) {
    if (event.type === "jump") {
      jumpFlashAt = performance.now();
    } else if (event.type === "armsUp") {
      armsUpFlashAt = performance.now();
    } else if (event.type === "catch") {
      const floater = floaters.find((candidate) => !candidate.active);
      if (floater) {
        floater.active = true;
        floater.text = `+${event.value}`;
        floater.x = event.x;
        floater.y = event.y + 0.1;
        floater.age = 0;
        floater.color = event.kind === "star" ? COLORS.yellow : COLORS.white;
      }
      let started = 0;
      for (const particle of particles) {
        if (particle.active) continue;
        const angle = (started / 12) * Math.PI * 2;
        const speed = 0.00022 + Math.random() * 0.00022;
        particle.active = true;
        particle.x = event.x;
        particle.y = event.y;
        particle.vx = Math.cos(angle) * speed;
        particle.vy = Math.sin(angle) * speed;
        particle.age = 0;
        particle.color = PARTICLE_COLORS[started % PARTICLE_COLORS.length];
        started += 1;
        if (started >= 12) break;
      }
    } else if (event.type === "combo") {
      const floater = floaters.find((candidate) => !candidate.active);
      if (floater) {
        floater.active = true;
        floater.text = `${labels.combo} +${config.comboBonus}`;
        floater.x = 0.5;
        floater.y = 0.56;
        floater.age = 0;
        floater.color = COLORS.orange;
      }
    }
  }

  function clear() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  }

  return { draw, handleEvent, clear };
}

// ---------------------------------------------------------------------------
// 3. Runner
// ---------------------------------------------------------------------------

/**
 * @typedef {object} GameStatus
 * @property {GameState} state
 * @property {LabelKey} hintKey  Stable key for the message; translate by this.
 * @property {string} hint  The message as text (from `labels`, English by default).
 * @property {InputMode} inputMode  How the game is being played right now.
 * @property {string} [errorCode]  Why the camera is not used: camera_denied | no_camera | model_load_failed | unsupported.
 *   Sent once, with the status that switches to the keyboard (or with state "error" when keyboardFallback is false).
 */

/**
 * Live values for a debug overlay. One object, reused every frame.
 * @typedef {object} GameDebugInfo
 * @property {number} fps
 * @property {GameState} state
 * @property {number | null} baselineHipY
 * @property {number} torsoLength
 * @property {number} hipOffset  Hips above (+) the standing height, in torso lengths.
 * @property {boolean} jumping
 * @property {boolean} armsRaised
 * @property {number} armsHeldMs
 */

/**
 * @typedef {object} StartCatchTheStarsOptions
 * @property {HTMLVideoElement} videoEl  Receives the camera stream (keep it in the page, it may be visually hidden).
 * @property {HTMLCanvasElement} canvasEl  The game is drawn here.
 * @property {number} [durationSec]  Default 60.
 * @property {"camera" | "keyboard"} [mode]  Default "camera". "keyboard" never asks for the camera and loads no model.
 * @property {boolean} [keyboardFallback]  Default true: if the camera or model fails, carry on with keyboard / tap.
 *   false: stop with state "error" instead.
 * @property {string | number | null} [missionId]  Copied into the result as mission_id.
 * @property {number} [target]  Catches needed for `completed`. Default 10.
 * @property {string} [modelPath]  Default "/models/pose_landmarker_lite.task".
 * @property {string} [wasmPath]  Default "/wasm".
 * @property {Partial<typeof CATCH_THE_STARS_LABELS>} [labels]  Translated texts.
 * @property {boolean} [debug]  Draw the skeleton and the standing-height line.
 * @property {(status: GameStatus) => void} [onStatus]  Called when the state or the hint changes.
 * @property {(event: GameEvent) => void} [onEvent]  Called for every jump, arms-up, catch, miss and combo.
 * @property {(result: ActivityResult) => void} [onFinish]  Called once when the time is up.
 * @property {(info: GameDebugInfo) => void} [onDebug]  Called for every pose frame (camera mode only).
 */

/** How long the end screen keeps animating before it becomes a still picture. */
const END_SCREEN_MS = 4000;
/** Longest step of play time for one drawn frame. A slow frame must not make objects teleport. */
const MAX_STEP_MS = 100;
/** Show the "step back" hint when the body has been out of view this long while playing. */
const BODY_LOST_MS = 1500;

/**
 * Starts the game and resolves straight away with a handle, so the host can
 * stop it even while the camera and model are still loading. Loading,
 * calibration and errors are reported through onStatus; the result arrives
 * through onFinish.
 *
 * If the camera or the model fails (before or during play), the game switches
 * to keyboard / tap input and keeps going; onStatus then carries the errorCode
 * and inputMode "keyboard", and the result says input_mode "keyboard".
 *
 * stop() ends everything at any time, switches the camera off and does NOT
 * call onFinish.
 *
 * @param {StartCatchTheStarsOptions} options
 * @returns {Promise<{ stop: () => void }>}
 */
export async function startCatchTheStars(options) {
  const { videoEl, canvasEl, onStatus, onFinish, onDebug } = options;
  if (!videoEl || !canvasEl) throw new TypeError("startCatchTheStars needs videoEl and canvasEl.");

  const labels = { ...CATCH_THE_STARS_LABELS, ...options.labels };
  const allowKeyboardFallback = options.keyboardFallback !== false;
  const clientSessionId = createSessionId();
  const target = resolveTarget(options.target, CATCH_THE_STARS_CONFIG.defaultTarget);

  const game = createCatchTheStarsGame({
    durationSec: options.durationSec,
    onEvent(event) {
      renderer.handleEvent(event);
      if (options.onEvent) options.onEvent(event);
    },
  });
  const renderer = createCatchTheStarsRenderer({
    canvasEl,
    videoEl,
    labels,
    config: game.config,
    debug: options.debug === true,
  });
  const calibrator = createCalibrator();
  const jumpDetector = createJumpDetector();
  const armsUpDetector = createArmsUpDetector();
  // Only listens after attach(), which happens in keyboard mode or after a camera failure.
  const keyboard = createKeyboardInput({
    tapTarget: canvasEl,
    onAction(action) {
      if (stopped || view.state !== "playing") return;
      if (action === "jump") game.onJump();
      else game.onArmsUp();
    },
  });

  /** Wall-clock time when play began (0 until then). Only used for started_at in the result. */
  let startedAtMs = 0;
  /** @type {import("./calibration.js").Calibration | null} */
  let calibration = null;
  /** @type {number | null} */
  let bodyLostSince = null;
  let bodyLost = false;
  let stopped = false;
  let rafId = 0;
  let lastTick = 0;
  let finishedAt = 0;

  /** @type {RenderView} */
  const view = {
    state: "loading",
    hintKey: "loading",
    inputMode: "camera",
    calibrationProgress: 0,
    game: game.state,
    landmarks: null,
    baselineHipY: null,
  };

  /** @type {GameDebugInfo} */
  const debugInfo = {
    fps: 0,
    state: "loading",
    baselineHipY: null,
    torsoLength: 0,
    hipOffset: 0,
    jumping: false,
    armsRaised: false,
    armsHeldMs: 0,
  };

  /**
   * @param {GameState} state
   * @param {LabelKey} hintKey
   * @param {string} [errorCode]
   */
  function setStatus(state, hintKey, errorCode) {
    if (state === view.state && hintKey === view.hintKey) return;
    view.state = state;
    view.hintKey = hintKey;
    if (!onStatus) return;
    /** @type {GameStatus} */
    const status = { state, hintKey, hint: labels[hintKey], inputMode: view.inputMode };
    if (errorCode) status.errorCode = errorCode;
    onStatus(status);
  }

  const engine = createPoseEngine({
    videoEl,
    modelPath: options.modelPath ?? "/models/pose_landmarker_lite.task",
    wasmPath: options.wasmPath ?? "/wasm",
    onFrame,
    onError,
  });

  /**
   * @param {Landmark[] | null} landmarks
   * @param {number} timestampMs
   */
  function onFrame(landmarks, timestampMs) {
    if (stopped || view.state === "finished" || view.state === "error" || view.inputMode === "keyboard") return;
    view.landmarks = landmarks;

    if (!calibration) {
      const update = calibrator.update(landmarks, timestampMs);
      view.calibrationProgress = update.progress;
      if (update.calibration) {
        calibration = update.calibration;
        startedAtMs = Date.now();
        setStatus("playing", "playing");
      } else if (update.status === "calibrating") {
        setStatus("calibrating", "calibrating");
      } else {
        setStatus("no_body", update.hintKey === "too_far" ? "too_far" : "no_body");
      }
    } else {
      if (jumpDetector.update(landmarks, timestampMs, calibration)) game.onJump();
      if (armsUpDetector.update(landmarks, timestampMs, calibration)) game.onArmsUp();
      view.baselineHipY = jumpDetector.state.baselineHipY;

      if (bodyInFrame(landmarks)) bodyLostSince = null;
      else if (bodyLostSince === null) bodyLostSince = timestampMs;
      bodyLost = bodyLostSince !== null && timestampMs - bodyLostSince > BODY_LOST_MS;
    }

    if (onDebug) {
      debugInfo.fps = engine.getFps();
      debugInfo.state = view.state;
      debugInfo.baselineHipY = jumpDetector.state.baselineHipY;
      debugInfo.torsoLength = calibration ? calibration.torsoLength : 0;
      debugInfo.hipOffset = jumpDetector.state.offsetFraction;
      debugInfo.jumping = jumpDetector.state.jumping;
      debugInfo.armsRaised = armsUpDetector.state.raised;
      debugInfo.armsHeldMs = armsUpDetector.state.heldMs;
      onDebug(debugInfo);
    }
  }

  /** @param {PoseError} error */
  function onError(error) {
    if (stopped || view.state === "finished") return;
    if (allowKeyboardFallback) {
      useKeyboard(error.code);
      return;
    }
    setStatus("error", "error", error.code);
    // Leave a gentle message on the canvas and release everything.
    renderer.draw(view, performance.now(), 0);
    shutDown();
  }

  /**
   * Plays with keyboard / tap from now on. If the game was still loading or
   * calibrating, play starts right away; if it was already running, it simply
   * carries on with the same score and clock.
   * @param {string} [errorCode]  Why the camera is not used, when it failed.
   */
  function useKeyboard(errorCode) {
    view.inputMode = "keyboard";
    view.landmarks = null;
    view.baselineHipY = null;
    // Make sure the camera is off; the keyboard game never needs it.
    engine.stop();
    keyboard.attach();
    if (startedAtMs === 0) startedAtMs = Date.now();
    setStatus("playing", "keyboard", errorCode);
  }

  /** Stops the loops, the input and the camera. The last picture stays on the canvas. */
  function shutDown() {
    stopped = true;
    cancelAnimationFrame(rafId);
    rafId = 0;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    keyboard.detach();
    engine.stop();
  }

  /** @param {number} now */
  function finish(now) {
    finishedAt = now;
    // The game is over: switch the camera off straight away.
    engine.stop();
    keyboard.detach();
    view.landmarks = null;
    setStatus("finished", "finished");
    if (!onFinish) return;

    const played = game.result();
    onFinish(
      buildActivityResult({
        clientSessionId,
        missionId: options.missionId,
        game: played.game,
        startedAt: startedAtMs,
        durationSec: played.duration_sec,
        reps: played.reps,
        target,
        points: played.points,
        // Honest reporting: one key press or tap anywhere in the session makes it "keyboard".
        inputMode: view.inputMode === "keyboard" || keyboard.state.used ? "keyboard" : "camera",
        jumps: played.jumps,
        armRaises: played.arm_raises,
      })
    );
  }

  /** @param {number} now */
  function tick(now) {
    if (stopped) return;
    rafId = requestAnimationFrame(tick);

    const step = Math.min(Math.max(now - lastTick, 0), MAX_STEP_MS);
    lastTick = now;

    if (view.state === "playing") {
      game.update(step);
      if (game.state.finished) finish(now);
      else if (view.inputMode === "keyboard") setStatus("playing", "keyboard");
      else setStatus("playing", bodyLost ? "no_body" : game.state.idleHint ? "move_your_body" : "playing");
    }

    renderer.draw(view, now, step);

    // Nothing moves any more: leave the end screen on the canvas and stop drawing.
    if (view.state === "finished" && now - finishedAt > END_SCREEN_MS) shutDown();
  }

  function onVisibilityChange() {
    if (stopped) return;
    if (document.hidden) {
      // Pause: play time only moves inside tick(), so the clock stops here.
      cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (rafId === 0) {
      lastTick = performance.now();
      rafId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    if (!stopped) shutDown();
    // Do not leave a frozen picture of the child on the screen.
    renderer.clear();
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  lastTick = performance.now();
  if (!document.hidden) rafId = requestAnimationFrame(tick);

  if (options.mode === "keyboard") {
    // No camera prompt, no model download: play starts at once.
    useKeyboard();
  } else {
    if (onStatus) onStatus({ state: "loading", hintKey: "loading", hint: labels.loading, inputMode: "camera" });
    // Failures are reported through onError; the returned boolean is not needed here.
    void engine.start();
  }

  return { stop };
}
