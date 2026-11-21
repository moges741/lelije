// @ts-check
// Weekly family wellbeing summary generator with warm, guilt-free template fallbacks (M6).
// Never throws; never mentions streaks, guilt, or shaming.

import { callLlmText, resolveLlmConfig } from "./llm.js";
import { logEvent } from "./logger.js";
import { checkTextsSafe } from "./safety.js";

/** @typedef {"en" | "am" | "om"} LanguageCode */

/**
 * @typedef {object} WeeklySummaryResult
 * @property {"ai" | "fallback"} source
 * @property {LanguageCode} language
 * @property {string} headline
 * @property {string} summary
 * @property {string} suggestion
 * @property {boolean} [needs_translation]
 */

/**
 * Builds a warm deterministic template summary in en, am, or om.
 * @param {{ language: LanguageCode, missionCount: number, exerciseCount: number, totalPoints: number }} stats
 * @returns {WeeklySummaryResult}
 */
function buildTemplateSummary({ language, missionCount, exerciseCount, totalPoints }) {
  if (language === "am") {
    return {
      source: "fallback",
      language: "am",
      headline: "የሳምንቱ ደስ የሚል ጉዞ!",
      summary: `በዚህ ሳምንት ${missionCount} የእውነተኛ ዓለም ተልዕኮዎች እና ${exerciseCount} የእንቅስቃሴ ጨዋታዎች ተጠናቀዋል (${totalPoints} ነጥቦች)።`,
      suggestion: "ለሚቀጥለው ሳምንት አብራችሁ አንድ አጭር የቤተሰብ ታሪክ ወይም የማብሰል ረዳት ተልዕኮ ይሞክሩ።",
      needs_translation: true,
    };
  }
  if (language === "om") {
    return {
      source: "fallback",
      language: "om",
      headline: "Torban Gaarii Fi Gammachuu!",
      summary: `Torban kana keessa hojiiwwan ${missionCount} fi taphoota sochii qaamaa ${exerciseCount} xumuramaniiru (qabxii ${totalPoints}).`,
      suggestion: "Torban dhufu maatii waliin seenaa gabaabaa yookaan tapha alaa eeyyamame yaalaa.",
      needs_translation: true,
    };
  }

  const totalDone = missionCount + exerciseCount;
  const summary =
    totalDone === 0
      ? "A fresh week is ready whenever your family wants to try one short movement game or helper mission together."
      : `This week included ${missionCount} real-world mission${missionCount === 1 ? "" : "s"} and ${exerciseCount} movement game${exerciseCount === 1 ? "" : "s"}, earning ${totalPoints} points together.`;

  return {
    source: "fallback",
    language: "en",
    headline: totalDone > 0 ? "A Joyful Active Week!" : "Ready for a New Week!",
    summary,
    suggestion:
      exerciseCount < missionCount
        ? "Try a 60-second Eskista or Catch the Stars session together after school."
        : "Try a family kitchen helper or reading mission together this weekend.",
  };
}

/**
 * Generates a gentle, encouraging weekly summary for parents (optional LLM with 5 s timeout + template fallback).
 *
 * @param {object} input
 * @param {number} [input.age]
 * @param {LanguageCode} [input.language]
 * @param {number} [input.completedMissions]
 * @param {number} [input.exerciseSessions]
 * @param {number} [input.totalPoints]
 * @param {string[]} [input.highlights]
 * @param {string} [input.requestId]
 * @param {Record<string, string | undefined>} [input._env]
 * @param {typeof fetch} [input._fetch]
 * @returns {Promise<WeeklySummaryResult>}
 */
export async function generateWeeklySummary(input = {}) {
  /** @type {LanguageCode} */
  const language = input.language === "am" || input.language === "om" ? input.language : "en";
  const missionCount = Math.max(0, Math.round(input.completedMissions ?? 0));
  const exerciseCount = Math.max(0, Math.round(input.exerciseSessions ?? 0));
  const totalPoints = Math.max(0, Math.round(input.totalPoints ?? 0));

  const fallback = buildTemplateSummary({ language, missionCount, exerciseCount, totalPoints });
  const env = input._env ?? (typeof process !== "undefined" ? process.env : {});

  if (env.MOCK_AI === "true") return fallback;
  const llm = resolveLlmConfig(env);
  if (!llm) return fallback;

  const system =
    'Write a warm, positive, non-guilt weekly summary for a parent on LeLije (Ethiopia, ages 6-12). Never mention streaks or failure. Return JSON only: {"headline":"<=60 chars","summary":"<=240 chars","suggestion":"<=180 chars"}.';
  const user = `Language: ${language}. Age: ${input.age ?? 8}. Real-world missions completed: ${missionCount}. Movement games played: ${exerciseCount}. Total points: ${totalPoints}.`;

  try {
    const rawText = await callLlmText({
      provider: llm.provider,
      apiKey: llm.apiKey,
      model: llm.model,
      system,
      user,
      timeoutMs: 4500,
      fetchImpl: input._fetch,
    });
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed.headline === "string" &&
      typeof parsed.summary === "string" &&
      typeof parsed.suggestion === "string"
    ) {
      const safe = checkTextsSafe([parsed.headline, parsed.summary, parsed.suggestion]);
      if (safe.safe && parsed.headline.length <= 80 && parsed.summary.length <= 300 && parsed.suggestion.length <= 220) {
        return {
          source: "ai",
          language,
          headline: parsed.headline.trim(),
          summary: parsed.summary.trim(),
          suggestion: parsed.suggestion.trim(),
        };
      }
    }
  } catch (err) {
    logEvent("warn", "summary.llm_fallback", {
      requestId: input.requestId,
      error: err instanceof Error ? err.message : "unknown_error",
    });
  }

  return fallback;
}
