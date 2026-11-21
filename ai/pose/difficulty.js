// @ts-check
// Adaptive difficulty controller (F3). Pure logic: no DOM, no camera, no network.
//
// Rules:
// - Rolling window of 10 attempts:
//     accuracy > 85% -> raise difficulty by 1 (up to level 5)
//     accuracy < 50% -> lower difficulty by 1 (down to level 1)
// - At most one difficulty change every 15 seconds.
// - Level 1..5 maps to speed, spawn interval and target size within safe child-friendly bounds.

/**
 * @typedef {object} DifficultyParams
 * @property {number} level  Integer 1..5.
 * @property {number} speedMultiplier  Movement speed multiplier (clamped 0.75..1.45).
 * @property {number} spawnIntervalMs  Milliseconds between spawned items (clamped 1350..2700).
 * @property {number} targetSizeMultiplier  Hit-zone / item radius scale (clamped 0.85..1.25).
 */

/**
 * @typedef {object} DifficultyConfig
 * @property {number} minLevel
 * @property {number} maxLevel
 * @property {number} windowSize
 * @property {number} raiseAbove
 * @property {number} lowerBelow
 * @property {number} minChangeIntervalMs
 */

/** @type {Readonly<DifficultyConfig>} */
export const DIFFICULTY_CONFIG = Object.freeze({
  minLevel: 1,
  maxLevel: 5,
  windowSize: 10,
  raiseAbove: 0.85,
  lowerBelow: 0.5,
  minChangeIntervalMs: 15_000,
});

/** @type {readonly DifficultyParams[]} */
const LEVEL_TABLE = Object.freeze([
  Object.freeze({ level: 1, speedMultiplier: 0.75, spawnIntervalMs: 2600, targetSizeMultiplier: 1.25 }),
  Object.freeze({ level: 2, speedMultiplier: 0.9, spawnIntervalMs: 2250, targetSizeMultiplier: 1.12 }),
  Object.freeze({ level: 3, speedMultiplier: 1.05, spawnIntervalMs: 1900, targetSizeMultiplier: 1.0 }),
  Object.freeze({ level: 4, speedMultiplier: 1.22, spawnIntervalMs: 1620, targetSizeMultiplier: 0.92 }),
  Object.freeze({ level: 5, speedMultiplier: 1.4, spawnIntervalMs: 1400, targetSizeMultiplier: 0.85 }),
]);

/**
 * Clamps a level to 1..5 and returns its mapped parameters.
 * @param {number} level
 * @returns {DifficultyParams}
 */
export function paramsForLevel(level) {
  const clamped = Math.min(
    DIFFICULTY_CONFIG.maxLevel,
    Math.max(DIFFICULTY_CONFIG.minLevel, Math.round(Number.isFinite(level) ? level : 2))
  );
  return { ...LEVEL_TABLE[clamped - 1] };
}

/**
 * @typedef {object} DifficultyUpdate
 * @property {boolean} changed
 * @property {-1 | 0 | 1} direction
 * @property {number} level
 * @property {DifficultyParams} params
 * @property {number} windowAccuracy  0..1 accuracy over the recent window (0 when empty).
 */

/**
 * @typedef {object} DifficultyController
 * @property {(hit: boolean, nowMs: number) => DifficultyUpdate} recordAttempt
 * @property {() => DifficultyParams} getParams
 * @property {() => number} getLevel
 * @property {() => { accuracy: number, difficulty_level: number, attempts: number, hits: number }} getSummary
 * @property {() => void} reset
 */

/**
 * Creates a pure adaptive difficulty controller.
 * @param {{ startDifficulty?: number } & Partial<DifficultyConfig>} [options]
 * @returns {DifficultyController}
 */
export function createDifficultyController(options = {}) {
  const config = { ...DIFFICULTY_CONFIG, ...options };
  const initialLevel = Math.min(
    config.maxLevel,
    Math.max(config.minLevel, Math.round(options.startDifficulty ?? 2))
  );

  let level = initialLevel;
  let lastChangeAt = Number.NEGATIVE_INFINITY;
  /** @type {boolean[]} */
  const recent = [];
  let totalAttempts = 0;
  let totalHits = 0;

  function windowAccuracy() {
    if (recent.length === 0) return 0;
    let hits = 0;
    for (let i = 0; i < recent.length; i += 1) {
      if (recent[i]) hits += 1;
    }
    return hits / recent.length;
  }

  /**
   * Records one attempt (catch/dodge/rep success or miss) and adjusts level if warranted.
   * @param {boolean} hit
   * @param {number} nowMs
   * @returns {DifficultyUpdate}
   */
  function recordAttempt(hit, nowMs) {
    totalAttempts += 1;
    if (hit) totalHits += 1;

    recent.push(Boolean(hit));
    if (recent.length > config.windowSize) recent.shift();

    const acc = windowAccuracy();
    /** @type {-1 | 0 | 1} */
    let direction = 0;

    if (recent.length >= config.windowSize && nowMs - lastChangeAt >= config.minChangeIntervalMs) {
      if (acc > config.raiseAbove && level < config.maxLevel) {
        level += 1;
        direction = 1;
        lastChangeAt = nowMs;
      } else if (acc < config.lowerBelow && level > config.minLevel) {
        level -= 1;
        direction = -1;
        lastChangeAt = nowMs;
      }
    }

    return {
      changed: direction !== 0,
      direction,
      level,
      params: paramsForLevel(level),
      windowAccuracy: acc,
    };
  }

  function reset() {
    level = initialLevel;
    lastChangeAt = Number.NEGATIVE_INFINITY;
    recent.length = 0;
    totalAttempts = 0;
    totalHits = 0;
  }

  return {
    recordAttempt,
    getParams: () => paramsForLevel(level),
    getLevel: () => level,
    getSummary: () => ({
      accuracy: totalAttempts > 0 ? Math.round((totalHits / totalAttempts) * 1000) / 1000 : 1,
      difficulty_level: level,
      attempts: totalAttempts,
      hits: totalHits,
    }),
    reset,
  };
}
