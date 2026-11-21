// @ts-check
// Single source of truth for all LeLije pose activities.
// Pure data + helpers: no DOM, no camera, no network.

/**
 * @typedef {"catch_the_stars" | "squats" | "jumping_jacks" | "freeze_dance" | "tree_balance" | "eskista" | "floor_is_lava"} ActivityId
 */

/**
 * @typedef {object} ActivityCatalogItem
 * @property {ActivityId} id
 * @property {string} labelKey  Translation key for the activity display name.
 * @property {number} defaultTarget
 * @property {number} minTarget
 * @property {number} maxTarget
 * @property {number} durationSec  Natural session end in seconds (no infinite loops).
 * @property {boolean} supportsKeyboard
 * @property {string} repsMeaning  Human-readable meaning of `reps` in the result payload.
 * @property {number} minSecPerRep  Plausibility floor (seconds per rep) for anti-cheat/pacing.
 */

/** @type {readonly ActivityCatalogItem[]} */
export const ACTIVITY_CATALOG = Object.freeze([
  Object.freeze({
    id: "catch_the_stars",
    labelKey: "activity.catch_the_stars",
    defaultTarget: 12,
    minTarget: 5,
    maxTarget: 40,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "stars and clouds caught",
    minSecPerRep: 1.2,
  }),
  Object.freeze({
    id: "squats",
    labelKey: "activity.squats",
    defaultTarget: 10,
    minTarget: 5,
    maxTarget: 15,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "squats completed",
    minSecPerRep: 1.5,
  }),
  Object.freeze({
    id: "jumping_jacks",
    labelKey: "activity.jumping_jacks",
    defaultTarget: 15,
    minTarget: 10,
    maxTarget: 30,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "jumping jacks completed",
    minSecPerRep: 0.8,
  }),
  Object.freeze({
    id: "freeze_dance",
    labelKey: "activity.freeze_dance",
    defaultTarget: 5,
    minTarget: 3,
    maxTarget: 8,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "freeze rounds held still",
    minSecPerRep: 5.0,
  }),
  Object.freeze({
    id: "tree_balance",
    labelKey: "activity.tree_balance",
    defaultTarget: 15,
    minTarget: 5,
    maxTarget: 30,
    durationSec: 45,
    supportsKeyboard: true,
    repsMeaning: "seconds balanced on one leg",
    minSecPerRep: 1.0,
  }),
  Object.freeze({
    id: "eskista",
    labelKey: "activity.eskista",
    defaultTarget: 20,
    minTarget: 10,
    maxTarget: 60,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "eskista shoulder beats",
    minSecPerRep: 0.4,
  }),
  Object.freeze({
    id: "floor_is_lava",
    labelKey: "activity.floor_is_lava",
    defaultTarget: 12,
    minTarget: 5,
    maxTarget: 30,
    durationSec: 60,
    supportsKeyboard: true,
    repsMeaning: "lava obstacles dodged",
    minSecPerRep: 1.8,
  }),
]);

/** @type {ReadonlyMap<string, ActivityCatalogItem>} */
const BY_ID = new Map(ACTIVITY_CATALOG.map((item) => [item.id, item]));

/**
 * Returns a fresh copy of the pose game catalog.
 * @returns {ActivityCatalogItem[]}
 */
export function getActivityCatalog() {
  return ACTIVITY_CATALOG.map((item) => ({ ...item }));
}

/**
 * Looks up one activity entry by id, or null if unknown.
 * @param {string} id
 * @returns {ActivityCatalogItem | null}
 */
export function getActivityById(id) {
  const item = BY_ID.get(id);
  return item ? { ...item } : null;
}

/**
 * Clamps a requested target to the catalog's safe bounds (or returns defaultTarget).
 * @param {ActivityCatalogItem} entry
 * @param {number | undefined} requested
 * @returns {number}
 */
export function clampActivityTarget(entry, requested) {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return entry.defaultTarget;
  }
  return Math.min(entry.maxTarget, Math.max(entry.minTarget, Math.round(requested)));
}
