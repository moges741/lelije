// @ts-check
// Canonical result payload and error codes for every pose activity (P5, F3).
// Pure logic: no DOM, no camera, no network.

/** @typedef {"camera_denied" | "no_camera" | "model_load_failed" | "unsupported"} PoseErrorCode */

/** @typedef {"camera" | "keyboard"} InputMode */

/**
 * Standard error codes emitted via onStatus({ state: "error", code, message }).
 */
export const POSE_ERROR_CODES = Object.freeze({
  CAMERA_DENIED: /** @type {PoseErrorCode} */ ("camera_denied"),
  NO_CAMERA: /** @type {PoseErrorCode} */ ("no_camera"),
  MODEL_LOAD_FAILED: /** @type {PoseErrorCode} */ ("model_load_failed"),
  UNSUPPORTED: /** @type {PoseErrorCode} */ ("unsupported"),
});

/**
 * @typedef {object} ActivityPerformance
 * @property {number} accuracy  0..1 ratio of successful attempts.
 * @property {number} avg_rep_sec  Average seconds per repetition (0 if no reps).
 * @property {number} max_combo  Highest consecutive combo achieved.
 * @property {number} difficulty_level  Final adaptive difficulty level (1..5).
 */

/**
 * @typedef {object} CoopSummary
 * @property {boolean} enabled
 * @property {number} players_detected
 * @property {number} player1_score
 * @property {number} player2_score
 * @property {number} team_score
 */

/**
 * Result payload delivered to onFinish for every activity (P5 + F3).
 * @typedef {object} ActivityResult
 * @property {string} client_session_id
 * @property {string | null} mission_id
 * @property {string} game
 * @property {string} started_at  ISO 8601 UTC timestamp.
 * @property {number} duration_sec  Elapsed active play time in seconds (rounded to 1 decimal).
 * @property {number} reps
 * @property {number} target
 * @property {boolean} completed
 * @property {number} points  Reward points (integer, 0..30).
 * @property {InputMode} input_mode  MUST be "keyboard" if any keyboard/tap event occurred.
 * @property {number} [jumps]
 * @property {number} [arm_raises]
 * @property {ActivityPerformance} [performance]
 * @property {CoopSummary} [coop]
 */

let fallbackCounter = 0;

/**
 * Generates a unique client_session_id without external libraries.
 * @returns {string}
 */
export function generateSessionId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackCounter += 1;
  return `sess_${Date.now().toString(36)}_${fallbackCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Computes fair child-friendly points (10..30 on completion, partial encouragement points otherwise, max 30).
 * @param {{ reps: number, target: number, rawScore?: number, completed: boolean }} input
 * @returns {number}
 */
export function computeActivityPoints({ reps, target, rawScore, completed }) {
  if (reps <= 0 && (!rawScore || rawScore <= 0)) return 0;
  const safeTarget = Math.max(1, target);
  const progress = Math.min(1, reps / safeTarget);
  if (completed) {
    const bonus = rawScore && rawScore > 0 ? Math.min(10, Math.floor(rawScore / 40)) : 0;
    return Math.min(30, 20 + bonus);
  }
  return Math.max(5, Math.min(19, Math.round(progress * 18)));
}

/**
 * Builds the canonical result payload for onFinish.
 * Guarantees `input_mode === "keyboard"` whenever any keyboard or tap event occurred.
 *
 * @param {object} input
 * @param {string} [input.clientSessionId]
 * @param {string | null} [input.missionId]
 * @param {string} input.game
 * @param {string} input.startedAtIso
 * @param {number} input.elapsedMs
 * @param {number} input.reps
 * @param {number} input.target
 * @param {boolean} [input.completed]
 * @param {number} [input.rawScore]
 * @param {number} [input.points]
 * @param {InputMode} input.mode
 * @param {boolean} input.usedKeyboardOrTap
 * @param {number} [input.jumps]
 * @param {number} [input.armRaises]
 * @param {ActivityPerformance} [input.performance]
 * @param {CoopSummary} [input.coop]
 * @returns {ActivityResult}
 */
export function buildActivityResult(input) {
  const durationSec = Math.max(0, Math.round((input.elapsedMs / 1000) * 10) / 10);
  const reps = Math.max(0, Math.round(input.reps));
  const target = Math.max(1, Math.round(input.target));
  const completed = input.completed !== undefined ? Boolean(input.completed) : reps >= target;
  /** @type {InputMode} */
  const inputMode = input.mode === "keyboard" || input.usedKeyboardOrTap ? "keyboard" : "camera";
  const points =
    typeof input.points === "number" && Number.isFinite(input.points)
      ? Math.max(0, Math.min(30, Math.round(input.points)))
      : computeActivityPoints({ reps, target, rawScore: input.rawScore, completed });

  /** @type {ActivityResult} */
  const result = {
    client_session_id: input.clientSessionId || generateSessionId(),
    mission_id: input.missionId ?? null,
    game: input.game,
    started_at: input.startedAtIso,
    duration_sec: durationSec,
    reps,
    target,
    completed,
    points,
    input_mode: inputMode,
  };

  if (typeof input.jumps === "number") result.jumps = Math.max(0, Math.round(input.jumps));
  if (typeof input.armRaises === "number") result.arm_raises = Math.max(0, Math.round(input.armRaises));

  if (input.performance) {
    result.performance = {
      accuracy: Math.max(0, Math.min(1, Math.round(input.performance.accuracy * 1000) / 1000)),
      avg_rep_sec:
        reps > 0 && Number.isFinite(input.performance.avg_rep_sec)
          ? Math.round(input.performance.avg_rep_sec * 100) / 100
          : reps > 0
            ? Math.round((durationSec / reps) * 100) / 100
            : 0,
      max_combo: Math.max(0, Math.round(input.performance.max_combo)),
      difficulty_level: Math.max(1, Math.min(5, Math.round(input.performance.difficulty_level))),
    };
  }

  if (input.coop) {
    result.coop = { ...input.coop };
  }

  return result;
}
