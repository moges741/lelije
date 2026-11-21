// @ts-check
// LLM adapters (anthropic | gemini | openai, fetch only) and generateMissions() (M4).
//
// Provider API documentation URLs checked:
// - Anthropic Messages API: https://docs.anthropic.com/en/api/messages
// - Google Gemini API (generateContent): https://ai.google.dev/api/generate-content
// - OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat/create
//
// Guarantees:
// - Never throws on AI failure.
// - Always returns EXACTLY `count` validated, child-safe missions.
// - 8 s total budget (5 s per LLM request, retry once ONLY if >= 2 s remain).
// - Strips `english_summary` before returning.
// - Strips personal data from interests before contacting any LLM.

import { readFileSync } from "node:fs";
import { buildExerciseMission } from "./exercise.js";
import { logEvent } from "./logger.js";
import { buildMissionPrompt } from "./prompt.js";
import { isSafe } from "./safety.js";
import { validateMissionList } from "./validate.js";

/** @typedef {import("./validate.js").Mission} Mission */
/** @typedef {"en" | "am" | "om"} LanguageCode */
/** @typedef {"anthropic" | "gemini" | "openai"} LlmProvider */

export const GENERATION_BUDGET = Object.freeze({
  totalBudgetMs: 8000,
  llmTimeoutMs: 5000,
  minRetryBudgetMs: 2000,
});

const DEFAULT_MODELS = Object.freeze({
  anthropic: "claude-3-5-haiku-latest",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
});

/** @type {Record<LanguageCode, Mission[]> | null} */
let cachedFallback = null;

/**
 * Loads fallback.json once and caches it in memory.
 * @returns {Record<LanguageCode, Mission[]>}
 */
export function loadFallbackMissions() {
  if (!cachedFallback) {
    const raw = readFileSync(new URL("./fallback.json", import.meta.url), "utf8");
    cachedFallback = JSON.parse(raw);
  }
  return /** @type {Record<LanguageCode, Mission[]>} */ (cachedFallback);
}

/**
 * Resolves active provider and credentials from environment variables.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ provider: LlmProvider, apiKey: string, model: string } | null}
 */
export function resolveLlmConfig(env = typeof process !== "undefined" ? process.env : {}) {
  const explicit = (env.AI_PROVIDER || "").toLowerCase();
  /** @type {LlmProvider[]} */
  const order =
    explicit === "anthropic" || explicit === "gemini" || explicit === "openai"
      ? [explicit]
      : ["gemini", "anthropic", "openai"];

  for (const provider of order) {
    const apiKey =
      provider === "anthropic"
        ? env.ANTHROPIC_API_KEY
        : provider === "gemini"
          ? env.GEMINI_API_KEY
          : env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim() !== "") {
      return {
        provider,
        apiKey: apiKey.trim(),
        model: (env.AI_MODEL || "").trim() || DEFAULT_MODELS[provider],
      };
    }
  }
  return null;
}

/**
 * Calls the configured provider via standard `fetch` with an AbortController timeout.
 *
 * @param {object} params
 * @param {LlmProvider} params.provider
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} params.system
 * @param {string} params.user
 * @param {number} params.timeoutMs
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<string>}
 */
export async function callLlmText({
  provider,
  apiKey,
  model,
  system,
  user,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this runtime");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(200, timeoutMs));

  try {
    if (provider === "anthropic") {
      // Docs: https://docs.anthropic.com/en/api/messages
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1800,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic HTTP ${res.status}`);
      const data = await res.json();
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((/** @type {any} */ c) => c?.type === "text")
        : null;
      return typeof textBlock?.text === "string" ? textBlock.text : "";
    }

    if (provider === "gemini") {
      // Docs: https://ai.google.dev/api/generate-content
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      });
      if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return typeof text === "string" ? text : "";
    }

    // OpenAI Chat Completions API: https://platform.openai.com/docs/api-reference/chat/create
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai HTTP ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text : "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extracts a JSON array of raw missions from an LLM text response.
 * Tolerates markdown code fences around the JSON object or array.
 * @param {string} rawText
 * @returns {unknown[]}
 */
export function parseMissionJson(rawText) {
  if (typeof rawText !== "string" || rawText.trim() === "") return [];
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(/** @type {any} */ (parsed).missions)) {
    return /** @type {any} */ (parsed).missions;
  }
  return [];
}

/**
 * Strips internal `english_summary` before returning a mission to callers.
 * @param {Mission} mission
 * @returns {Mission}
 */
function stripInternalFields(mission) {
  const copy = { ...mission };
  delete copy.english_summary;
  return copy;
}

/**
 * Picks fallback missions respecting requested types and excludeTitles.
 * @param {object} options
 * @param {LanguageCode} options.language
 * @param {number} options.needed
 * @param {Array<"solo" | "family" | "outdoor">} options.types
 * @param {Set<string>} options.excludeSet
 * @returns {{ picked: Mission[], languageFallback: boolean }}
 */
function pickFallbacks({ language, needed, types, excludeSet }) {
  const all = loadFallbackMissions();
  const pool = all[language] ?? all.en;
  const languageFallback =
    language !== "en" && pool.some((m) => Boolean(/** @type {any} */ (m).needs_translation));

  /** @type {Mission[]} */
  const picked = [];
  const allowedTypes = new Set(types);

  const tryAdd = (/** @type {Mission} */ candidate, /** @type {boolean} */ ignoreType) => {
    if (picked.length >= needed) return;
    if (!ignoreType && !allowedTypes.has(candidate.type)) return;
    const key = candidate.title.toLowerCase();
    if (excludeSet.has(key)) return;
    const safeCheck = isSafe(candidate);
    if (!safeCheck.safe) return;
    excludeSet.add(key);
    picked.push(stripInternalFields(candidate));
  };

  // Pass 1: match requested types without duplicates.
  for (const m of pool) tryAdd(m, false);
  // Pass 2: relax type filter if still short.
  for (const m of pool) tryAdd(m, true);
  // Pass 3: if excludeTitles covered everything, allow cycling from pool so count is ALWAYS met.
  if (picked.length < needed) {
    for (const m of pool) {
      if (picked.length >= needed) break;
      if (!picked.some((p) => p.title === m.title)) {
        picked.push(stripInternalFields(m));
      }
    }
  }

  return { picked, languageFallback };
}

/**
 * Generates `count` validated, child-safe missions.
 * Never throws on AI failure; respects 8 s total budget (5 s LLM timeout, retry only if >= 2 s remain).
 *
 * @param {object} input
 * @param {number} input.age
 * @param {string[]} [input.interests]
 * @param {LanguageCode} [input.language]
 * @param {string[]} [input.recentActivity]
 * @param {number} [input.count]
 * @param {Array<"solo" | "family" | "outdoor">} [input.types]
 * @param {string[]} [input.excludeTitles]
 * @param {string} [input.requestId]
 * @param {boolean} [input.includeExercise]
 * @param {Record<string, string | undefined>} [input._env]
 * @param {typeof fetch} [input._fetch]
 * @param {() => number} [input._now]
 * @returns {Promise<{ source: "ai" | "fallback" | "mixed" | "mock", languageFallback: boolean, generatedAt: string, missions: Mission[] }>}
 */
export async function generateMissions(input) {
  const now = input._now ?? Date.now;
  const env = input._env ?? (typeof process !== "undefined" ? process.env : {});
  const startMs = now();

  const age = Math.max(6, Math.min(12, Math.round(Number.isFinite(input.age) ? input.age : 8)));
  /** @type {LanguageCode} */
  const language = input.language === "am" || input.language === "om" ? input.language : "en";
  const count = Math.max(1, Math.min(6, Math.round(input.count ?? 3)));
  const types =
    Array.isArray(input.types) && input.types.length > 0
      ? input.types
      : /** @type {Array<"solo" | "family" | "outdoor">} */ (["solo", "family", "outdoor"]);
  const excludeSet = new Set(
    (Array.isArray(input.excludeTitles) ? input.excludeTitles : [])
      .filter((t) => typeof t === "string")
      .map((t) => t.trim().toLowerCase())
  );
  const includeExercise = Boolean(input.includeExercise);

  /** @type {Mission[]} */
  const collected = [];
  let exerciseAdded = false;

  if (includeExercise && count >= 1) {
    const ex = buildExerciseMission({ age, language });
    collected.push(ex);
    excludeSet.add(ex.title.toLowerCase());
    exerciseAdded = true;
  }

  const realWorldNeeded = count - collected.length;
  const generatedAt = new Date().toISOString();

  // Fast deterministic MOCK_AI path (M5).
  if (env.MOCK_AI === "true") {
    const fb = pickFallbacks({ language, needed: realWorldNeeded, types, excludeSet });
    const missions = [...collected, ...fb.picked].slice(0, count);
    logEvent("info", "missions.generated", {
      requestId: input.requestId,
      source: "mock",
      language,
      count: missions.length,
      durationMs: now() - startMs,
    });
    return {
      source: "mock",
      languageFallback: fb.languageFallback,
      generatedAt,
      missions,
    };
  }

  const llmConfig = resolveLlmConfig(env);
  let aiCount = 0;

  if (llmConfig && realWorldNeeded > 0) {
    const prompt = buildMissionPrompt({
      age,
      interests: input.interests,
      language,
      recentActivity: input.recentActivity,
      count: realWorldNeeded,
      types,
      excludeTitles: Array.from(excludeSet),
    });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const elapsed = now() - startMs;
      const remaining = GENERATION_BUDGET.totalBudgetMs - elapsed;
      if (attempt === 2 && remaining < GENERATION_BUDGET.minRetryBudgetMs) {
        logEvent("warn", "missions.retry_skipped_budget", {
          requestId: input.requestId,
          remainingMs: remaining,
        });
        break;
      }
      if (remaining <= 0) break;

      const callTimeout = Math.min(GENERATION_BUDGET.llmTimeoutMs, remaining);
      try {
        const rawText = await callLlmText({
          provider: llmConfig.provider,
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          system: prompt.system,
          user: prompt.user,
          timeoutMs: callTimeout,
          fetchImpl: input._fetch,
        });
        const rawList = parseMissionJson(rawText);
        const { missions: validList } = validateMissionList(rawList);

        for (const m of validList) {
          if (collected.length >= count) break;
          if (m.category !== "real_world") continue;
          const key = m.title.toLowerCase();
          if (excludeSet.has(key)) continue;
          const safety = isSafe(m);
          if (!safety.safe) continue;
          excludeSet.add(key);
          collected.push(stripInternalFields(m));
          aiCount += 1;
        }

        if (collected.length >= count) break;
      } catch (err) {
        logEvent("warn", "missions.llm_attempt_failed", {
          requestId: input.requestId,
          provider: llmConfig.provider,
          attempt,
          error: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }
  }

  let languageFallback = false;
  if (collected.length < count) {
    const fb = pickFallbacks({
      language,
      needed: count - collected.length,
      types,
      excludeSet,
    });
    languageFallback = fb.languageFallback;
    collected.push(...fb.picked);
  } else if (exerciseAdded && language !== "en") {
    languageFallback = true;
  }

  /** @type {"ai" | "fallback" | "mixed"} */
  let source = "fallback";
  if (aiCount > 0 && aiCount >= realWorldNeeded) {
    source = "ai";
  } else if (aiCount > 0) {
    source = "mixed";
  }

  logEvent("info", "missions.generated", {
    requestId: input.requestId,
    source,
    language,
    count: collected.length,
    aiCount,
    durationMs: now() - startMs,
  });

  return {
    source,
    languageFallback,
    generatedAt,
    missions: collected.slice(0, count),
  };
}
