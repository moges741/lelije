// @ts-check
// Mission schema (single source of truth), validation and normalisation.
// Pure logic: no network, no file access, no environment variables.

/**
 * @typedef {"solo" | "family" | "outdoor"} MissionType
 * @typedef {"real_world" | "exercise"} MissionCategory
 * @typedef {"checklist" | "camera"} MissionInteraction
 */

/**
 * @typedef {object} MissionActivity
 * @property {string} game  Pose game id from the pose catalog.
 * @property {number} target  How many repetitions / points the child should reach.
 */

/**
 * @typedef {object} Mission
 * @property {string} title  Max 60 characters, in the requested language.
 * @property {string} description  Max 200 characters, child-friendly.
 * @property {MissionCategory} category  "real_world" (parent confirms) or "exercise" (camera confirms).
 * @property {MissionType} type
 * @property {MissionInteraction} interaction  How the child completes it in the app.
 * @property {{ child: string, parent: string }} roles  Parent role is "" when not applicable.
 * @property {string[]} steps  2 to 5 short steps.
 * @property {MissionActivity | null} activity  Only for exercise missions.
 * @property {string} supervision_note  For example "Parent must handle the stove".
 * @property {boolean} needs_parent
 * @property {number} points  Integer, 10..30.
 * @property {string} [english_summary]  Only on raw LLM output; removed before missions are returned.
 */

/**
 * @typedef {{ ok: true, mission: Mission } | { ok: false, errors: string[] }} MissionValidation
 */

export const MISSION_TYPES = /** @type {const} */ (["solo", "family", "outdoor"]);
export const MISSION_CATEGORIES = /** @type {const} */ (["real_world", "exercise"]);
export const MISSION_INTERACTIONS = /** @type {const} */ (["checklist", "camera"]);

/** Every size limit in one place. Text lengths are counted in characters, not bytes. */
export const LIMITS = Object.freeze({
  titleMax: 60,
  descriptionMax: 200,
  stepsMin: 2,
  stepsMax: 5,
  stepMax: 120,
  roleMax: 160,
  noteMax: 200,
  summaryMax: 300,
  pointsMin: 10,
  pointsMax: 30,
  gameMax: 40,
  targetMax: 500,
});

/**
 * Words that mean an adult must be involved: cooking, heat, knives, cleaning chemicals.
 * English only. Missions in other languages are covered by their english_summary
 * (LLM output) or by hand-set needs_parent (fallback list).
 */
const HAZARD_PATTERN =
  /\b(cook(s|ed|ing)?|stove|oven|bak(e|es|ed|ing)|fr(y|ies|ied|ying)|boil(s|ed|ing)?|roast(s|ed|ing)?|heat(s|ed|ing)?|hot|flames?|fire|charcoal|kni(fe|ves)|chop(s|ped|ping)?|slic(e|es|ed|ing)|cut(s|ting)?|peel(s|ed|ing)?|bleach|detergent|disinfectant|chemicals?)\b/i;

/**
 * True when any text of the mission mentions cooking, heat, knives or cleaning chemicals.
 * @param {{ title?: string, description?: string, steps?: string[], roles?: { child?: string, parent?: string }, english_summary?: string }} mission
 * @returns {boolean}
 */
export function involvesHazard(mission) {
  const parts = [
    mission.title,
    mission.description,
    mission.english_summary,
    mission.roles?.child,
    mission.roles?.parent,
    ...(Array.isArray(mission.steps) ? mission.steps : []),
  ];
  return parts.some((part) => typeof part === "string" && HAZARD_PATTERN.test(part));
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {string} value */
function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

/** Counts characters (code points), so Amharic text is measured fairly. @param {string} value */
function charCount(value) {
  return Array.from(value).length;
}

/**
 * Reads one text field. Pushes a message to `errors` and returns "" when it is not acceptable.
 * @param {unknown} value
 * @param {string} field
 * @param {{ max: number, allowEmpty?: boolean, optional?: boolean }} rule
 * @param {string[]} errors
 * @returns {string}
 */
function readText(value, field, rule, errors) {
  if (value === undefined || value === null) {
    if (!rule.optional) errors.push(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return "";
  }
  const text = clean(value);
  if (text === "" && !rule.allowEmpty) {
    errors.push(`${field} must not be empty`);
    return "";
  }
  if (charCount(text) > rule.max) {
    errors.push(`${field} must be at most ${rule.max} characters`);
    return "";
  }
  return text;
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {string} field
 * @param {readonly T[]} allowed
 * @param {T | null} fallback  Used when the field is missing; null means "required".
 * @param {string[]} errors
 * @returns {T | null}
 */
function readEnum(value, field, allowed, fallback, errors) {
  if (value === undefined || value === null) {
    if (fallback === null) errors.push(`${field} is required`);
    return fallback;
  }
  if (typeof value !== "string" || !allowed.includes(/** @type {T} */ (value))) {
    errors.push(`${field} must be one of: ${allowed.join(", ")}`);
    return null;
  }
  return /** @type {T} */ (value);
}

/**
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {MissionActivity | null}
 */
function readActivity(value, errors) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) {
    errors.push("activity must be an object or null");
    return null;
  }
  const game = readText(value.game, "activity.game", { max: LIMITS.gameMax }, errors);
  const target = value.target;
  if (typeof target !== "number" || !Number.isInteger(target) || target < 1 || target > LIMITS.targetMax) {
    errors.push(`activity.target must be a whole number from 1 to ${LIMITS.targetMax}`);
    return null;
  }
  return game === "" ? null : { game, target };
}

/**
 * Validates one mission and returns a clean, normalised copy.
 *
 * Normalisation: text is trimmed, points are rounded and clamped to 10..30,
 * category defaults to "real_world", interaction defaults to "checklist", and
 * needs_parent is forced to true for family missions and for anything that
 * involves cooking, heat, knives or cleaning chemicals. Unknown fields are dropped.
 *
 * The input is never changed.
 *
 * @param {unknown} raw
 * @returns {MissionValidation}
 */
export function validateMission(raw) {
  if (!isPlainObject(raw)) return { ok: false, errors: ["mission must be an object"] };

  /** @type {string[]} */
  const errors = [];

  const title = readText(raw.title, "title", { max: LIMITS.titleMax }, errors);
  const description = readText(raw.description, "description", { max: LIMITS.descriptionMax }, errors);
  const type = readEnum(raw.type, "type", MISSION_TYPES, null, errors);
  const category = readEnum(raw.category, "category", MISSION_CATEGORIES, "real_world", errors);
  const interaction = readEnum(raw.interaction, "interaction", MISSION_INTERACTIONS, "checklist", errors);

  let childRole = "";
  let parentRole = "";
  if (!isPlainObject(raw.roles)) {
    errors.push("roles must be an object with child and parent");
  } else {
    childRole = readText(raw.roles.child, "roles.child", { max: LIMITS.roleMax }, errors);
    parentRole = readText(
      raw.roles.parent,
      "roles.parent",
      { max: LIMITS.roleMax, allowEmpty: true, optional: true },
      errors
    );
  }

  /** @type {string[]} */
  const steps = [];
  if (!Array.isArray(raw.steps)) {
    errors.push("steps must be an array");
  } else if (raw.steps.length < LIMITS.stepsMin || raw.steps.length > LIMITS.stepsMax) {
    errors.push(`steps must have ${LIMITS.stepsMin} to ${LIMITS.stepsMax} items`);
  } else {
    raw.steps.forEach((step, index) => {
      steps.push(readText(step, `steps[${index}]`, { max: LIMITS.stepMax }, errors));
    });
  }

  const supervisionNote = readText(
    raw.supervision_note,
    "supervision_note",
    { max: LIMITS.noteMax, allowEmpty: true, optional: true },
    errors
  );

  let needsParent = false;
  if (raw.needs_parent !== undefined && raw.needs_parent !== null) {
    if (typeof raw.needs_parent !== "boolean") errors.push("needs_parent must be true or false");
    else needsParent = raw.needs_parent;
  }

  let points = LIMITS.pointsMin;
  if (typeof raw.points !== "number" || !Number.isFinite(raw.points)) {
    errors.push("points must be a number");
  } else {
    points = Math.min(LIMITS.pointsMax, Math.max(LIMITS.pointsMin, Math.round(raw.points)));
  }

  const activity = readActivity(raw.activity, errors);

  const englishSummary = readText(
    raw.english_summary,
    "english_summary",
    { max: LIMITS.summaryMax, allowEmpty: true, optional: true },
    errors
  );

  // Rules that depend on more than one field.
  if (type === "family") {
    if (isPlainObject(raw.roles) && parentRole === "") {
      errors.push("roles.parent is required for family missions");
    }
    if (supervisionNote === "") errors.push("supervision_note is required for family missions");
  }
  if (category === "exercise") {
    if (interaction !== "camera") errors.push('exercise missions must use interaction "camera"');
    if (activity === null) errors.push("exercise missions need an activity with game and target");
  } else if (category === "real_world") {
    if (interaction === "camera") errors.push('real_world missions cannot use interaction "camera"');
    if (activity !== null) errors.push("activity is only allowed on exercise missions");
  }

  if (errors.length > 0 || type === null || category === null || interaction === null) {
    return { ok: false, errors };
  }

  /** @type {Mission} */
  const mission = {
    title,
    description,
    category,
    type,
    interaction,
    roles: { child: childRole, parent: parentRole },
    steps,
    activity,
    supervision_note: supervisionNote,
    needs_parent: needsParent,
    points,
  };
  if (englishSummary !== "") mission.english_summary = englishSummary;

  if (type === "family" || involvesHazard(mission)) mission.needs_parent = true;

  return { ok: true, mission };
}

/**
 * Validates a list of raw missions. Never throws: anything that is not a
 * valid mission ends up in `rejected` with the reasons.
 * @param {unknown} rawList
 * @returns {{ missions: Mission[], rejected: { index: number, errors: string[] }[] }}
 */
export function validateMissionList(rawList) {
  /** @type {Mission[]} */
  const missions = [];
  /** @type {{ index: number, errors: string[] }[]} */
  const rejected = [];

  if (!Array.isArray(rawList)) {
    rejected.push({ index: -1, errors: ["missions must be an array"] });
    return { missions, rejected };
  }

  rawList.forEach((raw, index) => {
    const result = validateMission(raw);
    if (result.ok) missions.push(result.mission);
    else rejected.push({ index, errors: result.errors });
  });
  return { missions, rejected };
}
