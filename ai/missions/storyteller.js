// @ts-check
// Child-friendly Ethiopian Storyteller & scripted companionLine() (S1).
// - generateStoryChapter(): 80-120 words, positive, never frightening, same safety filter,
//   5 s timeout then fallback_story.json (3 regions x 2 chapters).
// - companionLine(): purely scripted phrase table (ZERO LLM calls).

import { readFileSync } from "node:fs";
import { callLlmText, resolveLlmConfig } from "./llm.js";
import { logEvent } from "./logger.js";
import { sanitiseInterests } from "./prompt.js";
import { checkTextsSafe, stripPersonalInfo } from "./safety.js";

/** @typedef {"en" | "am" | "om"} LanguageCode */
/** @typedef {"highlands" | "rift_valley" | "simien"} StoryRegion */
/** @typedef {"welcome" | "start" | "catch" | "combo" | "miss" | "halfway" | "finish" | "freeze" | "encourage"} CompanionEvent */
/** @typedef {"happy" | "cheer" | "calm"} CompanionMood */

export const STORY_REGIONS = /** @type {const} */ (["highlands", "rift_valley", "simien"]);
export const STORY_LIMITS = Object.freeze({
  minWords: 80,
  maxWords: 120,
  timeoutMs: 5000,
});

/** Additional frightening words banned specifically in bedtime/child stories. */
const FRIGHTENING_PATTERN =
  /\b(monster(s)?|ghost(s)?|demon(s)?|nightmare(s)?|terrifying|scary|horror|scream(ed|ing)?|haunted|witch(es)?|zombie(s)?|vampire(s)?|trapped alone|lost forever)\b/i;

/** @type {Record<LanguageCode, Record<StoryRegion, Array<{ chapter: number, text: string, choices: string[], endsWith: "choice" | "rest", needs_translation?: boolean }>>> | null} */
let cachedStories = null;

/** @type {Record<LanguageCode, Record<StoryRegion, { chapter1: { title: string, text: string, choices: string[] }, chapter2: Array<{ title: string, text: string, choices: string[] }>, chapter3: Array<{ title: string, text: string, choices: string[] }> }>> | null} */
let cachedBranchStories = null;

function loadFallbackStories() {
  if (!cachedStories) {
    const raw = readFileSync(new URL("./fallback_story.json", import.meta.url), "utf8");
    cachedStories = JSON.parse(raw);
  }
  return /** @type {NonNullable<typeof cachedStories>} */ (cachedStories);
}

function loadBranchStories() {
  if (!cachedBranchStories) {
    const raw = readFileSync(new URL("./story_branches.json", import.meta.url), "utf8");
    cachedBranchStories = JSON.parse(raw);
  }
  return /** @type {NonNullable<typeof cachedBranchStories>} */ (cachedBranchStories);
}

/**
 * Counts words in a story paragraph.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  if (typeof text !== "string") return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Validates generated story text for safety, calmness, and 80-120 word length.
 * @param {string} text
 * @param {string[]} choices
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function validateStoryChapter(text, choices) {
  /** @type {string[]} */
  const reasons = [];
  const words = countWords(text);
  if (words < STORY_LIMITS.minWords || words > STORY_LIMITS.maxWords) {
    reasons.push(`word count must be ${STORY_LIMITS.minWords}..${STORY_LIMITS.maxWords} (got ${words})`);
  }
  const safeCheck = checkTextsSafe([text, ...choices]);
  if (!safeCheck.safe) reasons.push(...safeCheck.reasons);
  if (FRIGHTENING_PATTERN.test(text) || choices.some((c) => FRIGHTENING_PATTERN.test(c))) {
    reasons.push("story must never contain frightening content");
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Validates live AI-generated story chapters with child safety strictly enforced and
 * flexible word bounds (45..180 words) so natural Amharic/Oromo/English prose is preserved.
 * @param {string} text
 * @param {string[]} choices
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function validateAiStoryChapter(text, choices) {
  /** @type {string[]} */
  const reasons = [];
  const words = countWords(text);
  if (words < 45 || words > 180) {
    reasons.push(`AI word count must be 45..180 (got ${words})`);
  }
  const safeCheck = checkTextsSafe([text, ...choices]);
  if (!safeCheck.safe) reasons.push(...safeCheck.reasons);
  if (FRIGHTENING_PATTERN.test(text) || choices.some((c) => FRIGHTENING_PATTERN.test(c))) {
    reasons.push("story must never contain frightening content");
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Resolves which branch index (0 or 1) matches the child's selected choice.
 * @param {number | undefined} explicitIndex
 * @param {string} previousChoice
 * @param {string[]} chapter1Choices
 * @param {Array<{ choices: string[] }>} chapter2List
 * @returns {0 | 1}
 */
function resolveBranchIndex(explicitIndex, previousChoice, chapter1Choices, chapter2List) {
  if (explicitIndex === 0 || explicitIndex === 1) return explicitIndex;
  const needle = previousChoice.trim().toLowerCase();
  if (!needle) return 0;

  if (chapter1Choices[1] && needle === chapter1Choices[1].trim().toLowerCase()) return 1;
  if (chapter1Choices[0] && needle === chapter1Choices[0].trim().toLowerCase()) return 0;

  for (let i = 0; i < chapter2List.length; i += 1) {
    const chChoices = chapter2List[i].choices ?? [];
    if (chChoices.some((c) => c.trim().toLowerCase() === needle)) {
      return i === 1 ? 1 : 0;
    }
  }

  // Soft keyword fallback when the user picked a custom or AI-generated choice label.
  const secondKeywords = ["herb", "courtyard", "weaver", "nest", "bird", "binocular", "dance", "tea", "flute", "ቅጠላ", "ወፎች", "መነጽር", "baala", "man'ee", "daawwitii"];
  if (secondKeywords.some((kw) => needle.includes(kw))) return 1;
  return 0;
}

/**
 * Generates one calm, joyful Ethiopian story chapter (supports 2-chapter or 3-chapter branching arcs).
 * Uses live Gemini when configured, with authentic trilingual branching fallback on timeout or error.
 *
 * @param {object} input
 * @param {number} [input.age]
 * @param {LanguageCode} [input.language]
 * @param {string[]} [input.interests]
 * @param {string} [input.companionName]
 * @param {StoryRegion} [input.region]
 * @param {number} [input.chapter]  1, 2, or 3
 * @param {number} [input.maxChapters]  2 (default for compatibility) or 3 (full adventure arc)
 * @param {number} [input.choiceIndex]  0 or 1 for deterministic branch continuation
 * @param {string | null} [input.previousChoice]
 * @param {string | null} [input.previousText]
 * @param {string | null} [input.theme]
 * @param {string} [input.requestId]
 * @param {Record<string, string | undefined>} [input._env]
 * @param {typeof fetch} [input._fetch]
 * @returns {Promise<{ source: "ai" | "fallback", title: string, text: string, choices: string[], endsWith: "choice" | "rest", needs_translation?: boolean }>}
 */
export async function generateStoryChapter(input = {}) {
  const age = Math.max(5, Math.min(13, Math.round(Number.isFinite(input.age) ? Number(input.age) : 8)));
  /** @type {LanguageCode} */
  const language = input.language === "am" || input.language === "om" ? input.language : "en";
  /** @type {StoryRegion} */
  const region = STORY_REGIONS.includes(/** @type {any} */ (input.region))
    ? /** @type {StoryRegion} */ (input.region)
    : "highlands";
  const maxChapters = input.maxChapters === 3 ? 3 : 2;
  const rawChapter = Number.isFinite(input.chapter) ? Math.round(Number(input.chapter)) : 1;
  const chapter = Math.max(1, Math.min(maxChapters, rawChapter));
  const companionName =
    stripPersonalInfo(typeof input.companionName === "string" ? input.companionName : "").slice(0, 24) ||
    "Lomi";
  const cleanPrev =
    typeof input.previousChoice === "string"
      ? stripPersonalInfo(input.previousChoice).slice(0, 120)
      : "";
  const cleanTheme =
    typeof input.theme === "string" ? stripPersonalInfo(input.theme).slice(0, 60) : "";
  const cleanPrevText =
    typeof input.previousText === "string" ? stripPersonalInfo(input.previousText).slice(0, 320) : "";

  const isFinal = chapter >= maxChapters;

  // Build authentic trilingual branching fallback entry.
  const branches = loadBranchStories();
  const regionBank = branches[language]?.[region] ?? branches.en[region];
  const branchIdx = resolveBranchIndex(
    input.choiceIndex,
    cleanPrev,
    regionBank.chapter1.choices,
    regionBank.chapter2
  );

  let selectedEntry;
  if (chapter === 1) {
    selectedEntry = regionBank.chapter1;
  } else if (isFinal) {
    selectedEntry = regionBank.chapter3[branchIdx] ?? regionBank.chapter3[0];
  } else {
    selectedEntry = regionBank.chapter2[branchIdx] ?? regionBank.chapter2[0];
  }

  // Keep loadFallbackStories warm for unit/contract consumers.
  loadFallbackStories();

  const fallbackText = selectedEntry.text
    .replace(/\{companion\}/g, companionName)
    .replace(/\bLomi\b/g, companionName);
  const fallbackChoices = isFinal ? [] : selectedEntry.choices.slice(0, 2);

  /** @type {{ source: "fallback", title: string, text: string, choices: string[], endsWith: "choice" | "rest" }} */
  const fallbackResult = {
    source: "fallback",
    title: selectedEntry.title,
    text: fallbackText,
    choices: fallbackChoices,
    endsWith: isFinal ? "rest" : "choice",
  };

  const env = input._env ?? (typeof process !== "undefined" ? process.env : {});
  if (env.MOCK_AI === "true") return fallbackResult;

  const llm = resolveLlmConfig(env);
  if (!llm) return fallbackResult;

  const cleanInterests = sanitiseInterests(input.interests);
  const langLabel =
    language === "am"
      ? "Amharic (write naturally in Amharic Ethiopic script / አማርኛ)"
      : language === "om"
        ? "Afaan Oromo (write naturally in Afaan Oromo)"
        : "English";

  const system = [
    "You are a warm, joyful children's storyteller for LeLije in Ethiopia (ages 5-13).",
    "Write strictly 85 to 115 words for the story text.",
    "Include a short cheerful chapter title (3-7 words).",
    "Tone: bright, curious, positive, culturally Ethiopian, NEVER frightening, no monsters, no danger, no sadness.",
    isFinal
      ? 'This is the final chapter: bring the story to a cosy, happy ending encouraging rest or sharing with family. Set choices to [] and endsWith to "rest".'
      : 'Offer exactly 2 short cheerful, distinct choices (each <= 80 chars) that truly branch the adventure and set endsWith to "choice".',
    'Return JSON ONLY: { "title": "...", "text": "...", "choices": ["...", "..."], "endsWith": "choice" | "rest" }',
  ].join("\n");

  const user = [
    `Language: ${langLabel}.`,
    `Child age: ${age}. Ethiopian region: ${region}. Companion animal/bird name: ${companionName}. Chapter: ${chapter} of ${maxChapters}.`,
    cleanTheme ? `Special story spark/theme to weave in joyfully: ${cleanTheme}.` : "",
    cleanInterests.length > 0 ? `Hobbies to weave in lightly: ${cleanInterests.join(", ")}.` : "",
    cleanPrevText ? `Summary of previous chapter: "${cleanPrevText}"` : "",
    cleanPrev ? `The child just chose: "${cleanPrev}". Make this chapter directly follow that exact choice!` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await callLlmText({
      provider: llm.provider,
      apiKey: llm.apiKey,
      model: llm.model,
      system,
      user,
      timeoutMs: input._fetch ? STORY_LIMITS.timeoutMs : 10000,
      fetchImpl: input._fetch,
    });
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const title =
      typeof parsed?.title === "string" && parsed.title.trim()
        ? parsed.title.trim().slice(0, 80)
        : selectedEntry.title;
    const text = typeof parsed?.text === "string" ? parsed.text.replace(/\s+/g, " ").trim() : "";
    const choices = Array.isArray(parsed?.choices)
      ? parsed.choices
          .filter((/** @type {unknown} */ c) => typeof c === "string" && c.trim() !== "")
          .map((/** @type {string} */ c) => c.trim())
          .slice(0, 2)
      : [];
    /** @type {"choice" | "rest"} */
    const endsWith = isFinal || choices.length === 0 ? "rest" : "choice";
    const finalChoices = endsWith === "rest" ? [] : choices;

    const valid = validateAiStoryChapter(text, finalChoices);
    if (valid.ok && (endsWith === "rest" || finalChoices.length === 2)) {
      return {
        source: "ai",
        title,
        text,
        choices: finalChoices,
        endsWith,
      };
    }
    logEvent("warn", "story.validation_fallback", {
      requestId: input.requestId,
      reasons: valid.reasons,
    });
  } catch (err) {
    logEvent("warn", "story.llm_fallback", {
      requestId: input.requestId,
      error: err instanceof Error ? err.message : "unknown_error",
    });
  }

  return fallbackResult;
}

/**
 * Scripted companion phrase table (NO LLM). Positive, warm, guilt-free.
 * @type {Record<LanguageCode, Record<CompanionEvent, Record<CompanionMood, string>>>}
 */
const COMPANION_LINES = {
  en: {
    welcome: {
      happy: "Hello friend! Ready for a fun little adventure today?",
      cheer: "Yay, you are here! Let's move and shine together!",
      calm: "Welcome back! Take a slow breath and pick something fun.",
    },
    start: {
      happy: "Here we go! Show me your best moves!",
      cheer: "You have got this! Let's play!",
      calm: "Step into view and take your time.",
    },
    catch: {
      happy: "Nice catch! You are shining bright!",
      cheer: "Woohoo! Super star move!",
      calm: "Smooth and steady, well done!",
    },
    combo: {
      happy: "What a rhythm! Keep that joyful bounce!",
      cheer: "Amazing combo! You are flying like a highland bird!",
      calm: "Wonderful focus, one move right after another!",
    },
    miss: {
      happy: "That one slipped past — get the next one!",
      cheer: "Good try! Shake it off and jump right back in!",
      calm: "No worries at all, another chance is on its way.",
    },
    halfway: {
      happy: "Halfway there! Look how strong you are!",
      cheer: "Halfway done! You are doing brilliantly!",
      calm: "Halfway through — steady breathing, great job.",
    },
    finish: {
      happy: "Great job! Time for a water break and a big smile!",
      cheer: "Hooray! You finished with awesome energy!",
      calm: "All done for now. Stretch tall and share your joy with family!",
    },
    freeze: {
      happy: "Freeze like a funny statue!",
      cheer: "Stop! Hold still — you are a statue star!",
      calm: "Pause gently and hold still like a quiet tree.",
    },
    encourage: {
      happy: "Every little move helps you grow strong!",
      cheer: "Keep smiling, you are doing great!",
      calm: "Move at your own comfortable pace.",
    },
  },
  am: {
    welcome: {
      happy: "ሰላም ጓደኛዬ! ዛሬ አስደሳች ጨዋታ እንጫወት?",
      cheer: "እንኳን ደህና መጣህ! አብረን እንንቀሳቀስ!",
      calm: "እንኳን በደህና መጣህ! በረጋ መንፈስ እንጀምር።",
    },
    start: {
      happy: "እንጀምር! ምርጥ እንቅስቃሴህን አሳየኝ!",
      cheer: "ትችላለህ! እንጫወት!",
      calm: "በቀስታ ተዘጋጅና እንጀምር።",
    },
    catch: {
      happy: "ጎበዝ! በጣም ጥሩ ያዝክ!",
      cheer: "ዋው! አስደናቂ ዝላይ!",
      calm: "በሚዛን እና በጥንቃቄ፣ በጣም ጥሩ!",
    },
    combo: {
      happy: "ድንቅ ምት! ቀጥልበት!",
      cheer: "ተከታታይ ድል! በጣም ጎበዝ ነህ!",
      calm: "ጥሩ ትኩረት! አንድ በአንድ ቀጥል።",
    },
    miss: {
      happy: "ምንም አይደል፣ ቀጣዩን ትይዘዋለህ!",
      cheer: "ጥሩ ሙከራ! እንደገና እንሞክር!",
      calm: "አትጨነቅ፣ ሌላ ዕድል ይመጣል።",
    },
    halfway: {
      happy: "ግማሹን ጨርሰሃል! በርታ!",
      cheer: "ግማሽ ደርሰሃል! ድንቅ ነው!",
      calm: "ግማሽ ላይ ነህ፤ በቀስታ ተንፍስ።",
    },
    finish: {
      happy: "በጣም ጎበዝ! አሁን ውሃ ጠጣና ፈገግ በል!",
      cheer: "እልል! በደስታ ጨርሰሃል!",
      calm: "ጨርሰሃል። ከቤተሰብህ ጋር ደስታህን ተካፈል።",
    },
    freeze: {
      happy: "እንደ ሐውልት ቀጥ በል!",
      cheer: "ቁም! አትንቀሳቀስ — ጎበዝ!",
      calm: "በረጋ መንፈስ ሳትንቀሳቀስ ቁም።",
    },
    encourage: {
      happy: "እያንዳንዱ እንቅስቃሴ ጠንካራ ያደርግሃል!",
      cheer: "ፈገግ በል፣ በጣም ጥሩ እየሠራህ ነው!",
      calm: "በራስህ ፍጥነት በደስታ ተንቀሳቀስ።",
    },
  },
  om: {
    welcome: {
      happy: "Akkam hiriyaa koo! Har'a tapha gammachiisaa ni taphannaa?",
      cheer: "Baga nagaan dhufte! Waliin haa sochoonu!",
      calm: "Baga nagaan deebite! Tasgabbiin haa jalqabnu.",
    },
    start: {
      happy: "Haa jalqabnu! Sochii kee bareedaa agarsiisi!",
      cheer: "Ni dandeessa! Haa taphannu!",
      calm: "Suuta jedhii qophaa'i.",
    },
    catch: {
      happy: "Baay'ee gaarii! Sirriitti qabde!",
      cheer: "Waawwuu! Sochii ajaa'ibaa!",
      calm: "Tasgabbiin hojjette, galatoomi!",
    },
    combo: {
      happy: "Rukuttaa gaarii! Itti fufi!",
      cheer: "Walitti aansitee qabde! Baay'ee cimaadha!",
      calm: "Xiyyeeffannoo gaarii qabda!",
    },
    miss: {
      happy: "Rakkoon hin jiru, kan itti aanu ni qabda!",
      cheer: "Yaalii gaarii! Ammas yaali!",
      calm: "Hin yaadda'in, carraan biraa dhufaa jira.",
    },
    halfway: {
      happy: "Walakkaa geesseetta! Jabaadhu!",
      cheer: "Walakkaa xumurte! Baay'ee bareeda!",
      calm: "Walakkaa irra jirta, hafuura gabaabaa fudhadhu.",
    },
    finish: {
      happy: "Baay'ee gaarii! Amma bishaan dhugiitii seeqi!",
      cheer: "Hurree! Gammachuun xumurte!",
      calm: "Xumurameera. Gammachuu kee maatii keetti himi!",
    },
    freeze: {
      happy: "Akka siidaatti dhaabbadhu!",
      cheer: "Dhaabbadhu! Hin socho'in!",
      calm: "Tasgabbiin akka mukaa dhaabbadhu.",
    },
    encourage: {
      happy: "Sochiin xiqqoon hunduu si cimsa!",
      cheer: "Seeqi, baay'ee gaarii hojjechaa jirta!",
      calm: "Saffisa siif mijatuun socho'i.",
    },
  },
};

/**
 * Returns a scripted companion line from the static phrase table (NO LLM).
 *
 * @param {object} [input]
 * @param {CompanionEvent} [input.event]
 * @param {LanguageCode} [input.language]
 * @param {CompanionMood} [input.mood]
 * @returns {{ text: string, event: CompanionEvent, language: LanguageCode, mood: CompanionMood, needs_translation?: boolean }}
 */
export function companionLine(input = {}) {
  /** @type {LanguageCode} */
  const language = input.language === "am" || input.language === "om" ? input.language : "en";
  const table = COMPANION_LINES[language];
  /** @type {CompanionEvent} */
  const event = input.event && input.event in table ? input.event : "encourage";
  /** @type {CompanionMood} */
  const mood = input.mood === "cheer" || input.mood === "calm" ? input.mood : "happy";

  /** @type {{ text: string, event: CompanionEvent, language: LanguageCode, mood: CompanionMood, needs_translation?: boolean }} */
  const out = {
    text: table[event][mood],
    event,
    language,
    mood,
  };
  if (language !== "en") out.needs_translation = true;
  return out;
}
