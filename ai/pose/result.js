// @ts-check
// The result payload every activity gives to onFinish. One shape for all games,
// so the frontend can send it to the backend without knowing which game ran.
//
// PRIVACY: the payload holds only counts, times and a random session id.
// No picture, no landmarks, nothing about who the child is.

/** @typedef {"camera" | "keyboard"} InputMode */

/**
 * @typedef {object} ActivityResult
 * @property {string} client_session_id  Random id made for this one play session. Lets the backend ignore a result that is sent twice.
 * @property {string | number | null} mission_id  Exactly what the host passed as missionId, or null for free play.
 * @property {string} game  Activity id, for example "catch_the_stars".
 * @property {string} started_at  When play began (after loading and calibration), ISO 8601 in UTC.
 * @property {number} duration_sec  Seconds actually played. Paused time (hidden tab) is not counted.
 * @property {number} reps  What the activity counts. For catch_the_stars: objects caught.
 * @property {number} target  Reps needed to complete the mission.
 * @property {boolean} completed  True when reps reached the target.
 * @property {number} points
 * @property {InputMode} input_mode  "keyboard" if the keyboard or a tap was used at any moment, otherwise "camera".
 * @property {number} [jumps]  Every detected jump (games that use jumps).
 * @property {number} [arm_raises]  Every detected arms-up (games that use it).
 * @property {object} [performance]  Extra detail for adaptive difficulty (added by a later step).
 */

/**
 * @typedef {object} ActivityResultInput
 * @property {string} clientSessionId
 * @property {string | number | null | undefined} missionId
 * @property {string} game
 * @property {number | Date} startedAt  Wall-clock time when play began (ms since 1970 or a Date).
 * @property {number} durationSec
 * @property {number} reps
 * @property {number} target
 * @property {number} points
 * @property {InputMode} inputMode
 * @property {number} [jumps]
 * @property {number} [armRaises]
 * @property {object} [performance]
 */

const MAX_MISSION_ID_LENGTH = 200;

/**
 * A whole number that is never negative, whatever comes in.
 * @param {unknown} value
 */
function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

/**
 * Random id for one play session (UUID v4 format). It is not stored anywhere
 * and is not derived from the device or the child.
 * @returns {string}
 */
export function createSessionId() {
  const cryptoApi = globalThis.crypto;
  // randomUUID only exists on secure pages (https or localhost).
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The target to use: the host's value when it is a whole number of at least 1,
 * otherwise the activity's default.
 * @param {unknown} requested
 * @param {number} fallback
 */
export function resolveTarget(requested, fallback) {
  const number = Number(requested);
  if (requested === null || requested === undefined || !Number.isFinite(number) || number < 1) return fallback;
  return Math.round(number);
}

/**
 * Builds the payload for onFinish. Always returns the same keys in the same order.
 * @param {ActivityResultInput} input
 * @returns {ActivityResult}
 */
export function buildActivityResult(input) {
  const missionId = input.missionId;
  const validMissionId =
    (typeof missionId === "string" && missionId.length > 0 && missionId.length <= MAX_MISSION_ID_LENGTH) ||
    (typeof missionId === "number" && Number.isFinite(missionId));

  const startedAt = input.startedAt instanceof Date ? input.startedAt : new Date(input.startedAt);
  const reps = count(input.reps);
  const target = count(input.target);

  /** @type {ActivityResult} */
  const result = {
    client_session_id: input.clientSessionId,
    mission_id: validMissionId ? /** @type {string | number} */ (missionId) : null,
    game: input.game,
    started_at: Number.isNaN(startedAt.getTime()) ? new Date().toISOString() : startedAt.toISOString(),
    duration_sec: count(input.durationSec),
    reps,
    target,
    completed: target > 0 && reps >= target,
    points: count(input.points),
    // Anything that is not clearly "camera" is reported as "keyboard", never the other way round.
    input_mode: input.inputMode === "camera" ? "camera" : "keyboard",
  };
  if (input.jumps !== undefined) result.jumps = count(input.jumps);
  if (input.armRaises !== undefined) result.arm_raises = count(input.armRaises);
  if (input.performance !== undefined && input.performance !== null) result.performance = input.performance;
  return result;
}
