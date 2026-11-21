// @ts-check
// Parent-authored custom mission validator (M6).
// Enforces length limits, points 10..30, NO camera interaction, rejects phone numbers /
// emails / addresses, and runs the same child-safety filter as LLM missions.

import { containsPersonalInfo, isSafe } from "./safety.js";
import { collectMissionTexts, LIMITS, validateMission } from "./validate.js";

/** @typedef {import("./validate.js").Mission} Mission */
/** @typedef {{ ok: true, mission: Mission } | { ok: false, errors: string[] }} ParentMissionValidation */

/**
 * Validates a mission created by a parent for their child.
 * Unlike LLM normalisation, out-of-range points are rejected (must be 10..30) and
 * camera interactions / personal info are strictly forbidden.
 *
 * @param {unknown} raw
 * @returns {ParentMissionValidation}
 */
export function validateParentMission(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["mission must be an object"] };
  }

  const input = /** @type {Record<string, any>} */ (raw);
  /** @type {string[]} */
  const errors = [];

  if (input.interaction === "camera" || input.category === "exercise") {
    errors.push('parent missions cannot use interaction "camera" or category "exercise"');
  }

  if (
    typeof input.points !== "number" ||
    !Number.isInteger(input.points) ||
    input.points < LIMITS.pointsMin ||
    input.points > LIMITS.pointsMax
  ) {
    errors.push(`points must be a whole number between ${LIMITS.pointsMin} and ${LIMITS.pointsMax}`);
  }

  const base = validateMission({
    ...input,
    category: "real_world",
    activity: null,
  });

  if (!base.ok) {
    errors.push(...base.errors);
    return { ok: false, errors: Array.from(new Set(errors)) };
  }

  const texts = collectMissionTexts(base.mission);
  for (const t of texts) {
    const pii = containsPersonalInfo(t);
    if (pii.hasPii) {
      errors.push(`personal info is not allowed (${pii.types.join(", ")})`);
    }
  }

  const safety = isSafe(base.mission);
  if (!safety.safe) {
    errors.push(...safety.reasons);
  }

  if (errors.length > 0) {
    return { ok: false, errors: Array.from(new Set(errors)) };
  }

  return { ok: true, mission: base.mission };
}
