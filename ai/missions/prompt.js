// @ts-check
// LLM prompt builder for Ethiopian child-friendly real-world missions (M3).
// Never includes child names or PII. Requests ONLY real_world missions (never camera/exercise).

import { stripPersonalInfo } from "./safety.js";

/** @typedef {"en" | "am" | "om"} LanguageCode */

const LANGUAGE_LABELS = Object.freeze({
  en: "English",
  am: "Amharic (አማርኛ, Ge'ez script)",
  om: "Afaan Oromoo (Qubee Latin script)",
});

/**
 * Returns age-appropriate guidance for 6-8 vs 9-12 year olds.
 * @param {number} age
 */
function ageGuidance(age) {
  const clamped = Math.max(6, Math.min(12, Math.round(Number.isFinite(age) ? age : 8)));
  if (clamped <= 8) {
    return `Age ${clamped} (early primary): keep steps very short and concrete. For cooking/cleaning, child only washes vegetables, sets plates, sorts or folds clothes — parent handles all heat, knives and cleaning products.`;
  }
  return `Age ${clamped} (upper primary): child can lead creative, reading, organising, or helper tasks with clear responsibility. Parent still supervises all stoves, knives, hot liquids and outdoor time.`;
}

/**
 * Sanitises free-text interest tags so no personal info ever reaches an LLM.
 * @param {unknown} interests
 * @returns {string[]}
 */
export function sanitiseInterests(interests) {
  if (!Array.isArray(interests)) return [];
  /** @type {string[]} */
  const out = [];
  for (const raw of interests) {
    if (typeof raw !== "string") continue;
    const cleaned = stripPersonalInfo(raw).slice(0, 40).trim();
    if (cleaned.length >= 2) out.push(cleaned);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Builds system and user prompts for generating real-world Ethiopian missions.
 *
 * @param {object} input
 * @param {number} input.age  Child age (6..12).
 * @param {string[]} [input.interests]  Non-identifying hobby words (e.g. ["drawing", "football"]).
 * @param {LanguageCode} [input.language]  "en" | "am" | "om".
 * @param {string[]} [input.recentActivity]  Optional recent category/title hints to vary missions.
 * @param {number} [input.count]  How many missions to request (1..6).
 * @param {Array<"solo" | "family" | "outdoor">} [input.types]
 * @param {string[]} [input.excludeTitles]
 * @returns {{ system: string, user: string, sanitisedInterests: string[] }}
 */
export function buildMissionPrompt(input) {
  const age = Math.max(6, Math.min(12, Math.round(Number.isFinite(input.age) ? input.age : 8)));
  /** @type {LanguageCode} */
  const language = input.language === "am" || input.language === "om" ? input.language : "en";
  const count = Math.max(1, Math.min(6, Math.round(input.count ?? 3)));
  const types =
    Array.isArray(input.types) && input.types.length > 0 ? input.types : ["solo", "family", "outdoor"];
  const cleanInterests = sanitiseInterests(input.interests);
  const excludeTitles = Array.isArray(input.excludeTitles)
    ? input.excludeTitles.filter((t) => typeof t === "string" && t.trim() !== "").slice(0, 20)
    : [];
  const recent = Array.isArray(input.recentActivity)
    ? input.recentActivity.filter((t) => typeof t === "string" && t.trim() !== "").slice(0, 10)
    : [];

  const system = [
    "You design short, joyful, screen-free real-world missions for LeLije, a child wellbeing platform in Ethiopia (ages 6-12).",
    "NON-NEGOTIABLE RULES:",
    "1. Generate ONLY real_world missions (category MUST be \"real_world\", activity MUST be null). NEVER use interaction \"camera\".",
    "2. Allowed interactions: \"checklist\", \"timer\" (with integer duration_sec 60..1800), \"quiz\" (exactly 3 questions: {q<=120, options:[3 strings<=60], answerIndex:0..2}), \"story\" ({opening<=400, choices:1..2 pairs<=80}), \"scavenger\" (items:3..5 strings<=60), \"family_challenge\".",
    "3. Themes: cooking with family (injera, shiro, misir, buna ceremony helper), tidying/cleaning, outdoor play with parent-approved friends (football, Segno Maksegno, abarosh, jump rope), reading, Ethiopian stories, drawing/crafts.",
    "4. Every mission MUST have a clear natural end. NO streak guilt, NO purchases, NO gambling, NO strangers, NO unsupervised stoves/knives/chemicals.",
    "5. Family missions MUST have needs_parent: true, a non-empty roles.parent, and a non-empty supervision_note.",
    "6. Outdoor missions MUST have needs_parent: true, a parent-approval step (asking parent for approved friends, place and time limit), a non-empty roles.parent, and a supervision_note.",
    "7. Text length limits (strict): title <= 60 chars, description <= 200 chars, 2..5 steps (each <= 120 chars), roles.child/parent <= 160 chars, supervision_note <= 200 chars, points integer 10..30.",
    "8. ALWAYS include an \"english_summary\" field (<= 300 chars in English) describing what the child and parent do so our automated safety filter can verify missions written in any language.",
    "9. Return STRICT JSON ONLY: { \"missions\": [ ... ] } with no markdown fences and no extra commentary.",
  ].join("\n");

  const userLines = [
    `Create exactly ${count} culturally relevant Ethiopian real-world missions in ${LANGUAGE_LABELS[language]} (language code: "${language}").`,
    ageGuidance(age),
    `Requested mission types to mix from: ${types.join(", ")}.`,
  ];

  if (cleanInterests.length > 0) {
    userLines.push(`Child hobbies/interests to weave in gently: ${cleanInterests.join(", ")}.`);
  }
  if (recent.length > 0) {
    userLines.push(`Recent activities (vary away from these): ${recent.join(", ")}.`);
  }
  if (excludeTitles.length > 0) {
    userLines.push(`Do NOT repeat these titles: ${excludeTitles.join(" | ")}.`);
  }
  userLines.push("Output valid JSON matching { \"missions\": [...] } with exactly " + count + " missions.");

  return {
    system,
    user: userLines.join("\n"),
    sanitisedInterests: cleanInterests,
  };
}
