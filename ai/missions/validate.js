// @ts-check
// Mission schema (single source of truth), validation and normalisation.
// Pure logic: no network, no file access, no environment variables.

/**
 * @typedef {"solo" | "family" | "outdoor"} MissionType
 * @typedef {"real_world" | "exercise"} MissionCategory
 * @typedef {"checklist" | "camera" | "timer" | "quiz" | "story" | "scavenger" | "family_challenge"} MissionInteraction
 */

/**
 * @typedef {object} MissionActivity
 * @property {string} game  Pose game id from the pose catalog.
 * @property {number} target  How many repetitions / points the child should reach.
 */

/**
 * @typedef {object} QuizQuestion
 * @property {string} q  Max 120 characters.
 * @property {[string, string, string]} options  Exactly 3 strings, each max 60 characters.
 * @property {0 | 1 | 2} answerIndex  0, 1 or 2.
 */

/**
 * @typedef {object} StoryData
 * @property {string} opening  Max 400 characters.
 * @property {Array<[string, string]>} choices  1 to 2 pairs of strings, each max 80 characters.
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
 * @property {QuizQuestion[]} [quiz]  Required when interaction === "quiz" (3 questions).
 * @property {StoryData} [story]  Required when interaction === "story".
 * @property {number} [duration_sec]  Required when interaction === "timer" (60..1800).
 * @property {string[]} [items]  Required when interaction === "scavenger" (3..5 short strings).
 * @property {string} [english_summary]  Only on raw LLM output; removed before missions are returned.
 * @property {boolean} [needs_translation]  Flag on untranslated templates/fallbacks.
 */

/**
 * @typedef {{ ok: true, mission: Mission } | { ok: false, errors: string[] }} MissionValidation
 */

export const MISSION_TYPES = /** @type {const} */ (["solo", "family", "outdoor"]);
export const MISSION_CATEGORIES = /** @type {const} */ (["real_world", "exercise"]);
export const MISSION_INTERACTIONS = /** @type {const} */ ([
  "checklist",
  "camera",
  "timer",
  "quiz",
  "story",
  "scavenger",
  "family_challenge",
]);

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
  quizCount: 3,
  quizQuestionMax: 120,
  quizOptionCount: 3,
  quizOptionMax: 60,
  storyOpeningMax: 400,
  storyChoicesMin: 1,
  storyChoicesMax: 2,
  storyChoiceMax: 80,
  timerMinSec: 60,
  timerMaxSec: 1800,
  scavengerItemsMin: 3,
  scavengerItemsMax: 5,
  scavengerItemMax: 60,
});

/**
 * Words that mean an adult must be involved: cooking, heat, knives, cleaning chemicals.
 * English only. Missions in other languages are covered by their english_summary
 * (LLM output) or by hand-set needs_parent (fallback list).
 */
const HAZARD_PATTERN =
  /\b(cook(s|ed|ing)?|stove|oven|bak(e|es|ed|ing)|fr(y|ies|ied|ying)|boil(s|ed|ing)?|roast(s|ed|ing)?|heat(s|ed|ing)?|hot|flames?|fire|charcoal|kni(fe|ves)|chop(s|ped|ping)?|slic(e|es|ed|ing)|cut(s|ting)?|peel(s|ed|ing)?|bleach|detergent|disinfectant|chemicals?)\b/i;

/**
 * Collects every user-visible text string inside a mission object (including quiz, story, items).
 * @param {Record<string, any>} mission
 * @returns {string[]}
 */
export function collectMissionTexts(mission) {
  /** @type {string[]} */
  const parts = [];
  const push = (/** @type {unknown} */ v) => {
    if (typeof v === "string" && v.trim() !== "") parts.push(v);
  };

  push(mission.title);
  push(mission.description);
  push(mission.supervision_note);
  push(mission.english_summary);
  if (mission.roles && typeof mission.roles === "object") {
    push(mission.roles.child);
    push(mission.roles.parent);
  }
  if (Array.isArray(mission.steps)) {
    for (const s of mission.steps) push(s);
  }
  if (Array.isArray(mission.items)) {
    for (const item of mission.items) push(item);
  }
  if (Array.isArray(mission.quiz)) {
    for (const q of mission.quiz) {
      if (q && typeof q === "object") {
        push(q.q);
        if (Array.isArray(q.options)) {
          for (const opt of q.options) push(opt);
        }
      }
    }
  }
  if (mission.story && typeof mission.story === "object") {
    push(mission.story.opening);
    if (Array.isArray(mission.story.choices)) {
      for (const pair of mission.story.choices) {
        if (Array.isArray(pair)) {
          for (const choice of pair) push(choice);
        }
      }
    }
  }
  return parts;
}

/**
 * True when any text of the mission mentions cooking, heat, knives or cleaning chemicals.
 * @param {Record<string, any>} mission
 * @returns {boolean}
 */
export function involvesHazard(mission) {
  return collectMissionTexts(mission).some((part) => HAZARD_PATTERN.test(part));
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
 * Reads one text field. Rejects over-limit text (never truncates).
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
 * Validates quiz payload: exactly 3 questions, each { q <= 120, options: 3 strings <= 60, answerIndex: 0..2 }.
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {QuizQuestion[] | undefined}
 */
function readQuiz(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("quiz must be an array of 3 questions");
    return undefined;
  }
  if (value.length !== LIMITS.quizCount) {
    errors.push(`quiz must have exactly ${LIMITS.quizCount} questions`);
    return undefined;
  }
  /** @type {QuizQuestion[]} */
  const out = [];
  value.forEach((entry, idx) => {
    if (!isPlainObject(entry)) {
      errors.push(`quiz[${idx}] must be an object`);
      return;
    }
    const q = readText(entry.q, `quiz[${idx}].q`, { max: LIMITS.quizQuestionMax }, errors);
    /** @type {string[]} */
    const opts = [];
    if (!Array.isArray(entry.options) || entry.options.length !== LIMITS.quizOptionCount) {
      errors.push(`quiz[${idx}].options must be an array of ${LIMITS.quizOptionCount} strings`);
    } else {
      entry.options.forEach((opt, optIdx) => {
        opts.push(readText(opt, `quiz[${idx}].options[${optIdx}]`, { max: LIMITS.quizOptionMax }, errors));
      });
    }
    const answerIndex = entry.answerIndex;
    if (
      typeof answerIndex !== "number" ||
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex > 2
    ) {
      errors.push(`quiz[${idx}].answerIndex must be 0, 1 or 2`);
      return;
    }
    if (opts.length === 3) {
      out.push({
        q,
        options: /** @type {[string, string, string]} */ ([opts[0], opts[1], opts[2]]),
        answerIndex: /** @type {0 | 1 | 2} */ (answerIndex),
      });
    }
  });
  return out;
}

/**
 * Validates story payload: { opening <= 400, choices: 1..2 pairs of strings <= 80 }.
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {StoryData | undefined}
 */
function readStory(value, errors) {
  if (!isPlainObject(value)) {
    errors.push("story must be an object with opening and choices");
    return undefined;
  }
  const opening = readText(value.opening, "story.opening", { max: LIMITS.storyOpeningMax }, errors);
  /** @type {Array<[string, string]>} */
  const choices = [];
  if (!Array.isArray(value.choices)) {
    errors.push("story.choices must be an array of 1 to 2 choice pairs");
  } else if (
    value.choices.length < LIMITS.storyChoicesMin ||
    value.choices.length > LIMITS.storyChoicesMax
  ) {
    errors.push(`story.choices must have ${LIMITS.storyChoicesMin} to ${LIMITS.storyChoicesMax} pairs`);
  } else {
    value.choices.forEach((pair, pIdx) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        errors.push(`story.choices[${pIdx}] must be a pair of 2 strings`);
        return;
      }
      const a = readText(pair[0], `story.choices[${pIdx}][0]`, { max: LIMITS.storyChoiceMax }, errors);
      const b = readText(pair[1], `story.choices[${pIdx}][1]`, { max: LIMITS.storyChoiceMax }, errors);
      choices.push([a, b]);
    });
  }
  return { opening, choices };
}

/**
 * Validates timer duration_sec (60..1800).
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {number | undefined}
 */
function readDurationSec(value, errors) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < LIMITS.timerMinSec ||
    value > LIMITS.timerMaxSec
  ) {
    errors.push(`duration_sec must be a whole number from ${LIMITS.timerMinSec} to ${LIMITS.timerMaxSec}`);
    return undefined;
  }
  return value;
}

/**
 * Validates scavenger items (3..5 short strings <= 60).
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {string[] | undefined}
 */
function readScavengerItems(value, errors) {
  if (!Array.isArray(value)) {
    errors.push("items must be an array of 3 to 5 strings");
    return undefined;
  }
  if (value.length < LIMITS.scavengerItemsMin || value.length > LIMITS.scavengerItemsMax) {
    errors.push(`items must have ${LIMITS.scavengerItemsMin} to ${LIMITS.scavengerItemsMax} items`);
    return undefined;
  }
  /** @type {string[]} */
  const items = [];
  value.forEach((item, idx) => {
    items.push(readText(item, `items[${idx}]`, { max: LIMITS.scavengerItemMax }, errors));
  });
  return items;
}

/**
 * Validates one mission and returns a clean, normalised copy.
 *
 * Normalisation: text is trimmed, points are rounded and clamped to 10..30,
 * category defaults to "real_world", interaction defaults to "checklist", and
 * needs_parent is forced to true for family missions, outdoor missions, and
 * anything that involves cooking, heat, knives or cleaning chemicals.
 * Unknown fields are dropped. Over-limit text is rejected, never truncated.
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

  // Interaction-specific required shapes (Decision 3).
  /** @type {QuizQuestion[] | undefined} */
  let quiz;
  /** @type {StoryData | undefined} */
  let story;
  /** @type {number | undefined} */
  let durationSec;
  /** @type {string[] | undefined} */
  let items;

  if (interaction === "quiz") {
    quiz = readQuiz(raw.quiz, errors);
  } else if (interaction === "story") {
    story = readStory(raw.story, errors);
  } else if (interaction === "timer") {
    durationSec = readDurationSec(raw.duration_sec, errors);
  } else if (interaction === "scavenger") {
    items = readScavengerItems(raw.items, errors);
  }

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
  if (quiz !== undefined) mission.quiz = quiz;
  if (story !== undefined) mission.story = story;
  if (durationSec !== undefined) mission.duration_sec = durationSec;
  if (items !== undefined) mission.items = items;
  if (englishSummary !== "") mission.english_summary = englishSummary;

  // Decision 1 & 2: family, outdoor, and hazardous missions always require a parent.
  if (type === "family" || type === "outdoor" || involvesHazard(mission)) {
    mission.needs_parent = true;
  }

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
