// @ts-check
// Express-compatible HTTP route handlers for ai/missions & ai/pose catalog (M6).
// Enforces a strict 5 KB (5120 byte) request body limit and never leaks secrets or stack traces.

import { getActivityCatalog } from "../pose/catalog.js";
import { generateMissions, resolveLlmConfig } from "./llm.js";
import { logEvent } from "./logger.js";
import { toClientView } from "./mappers.js";
import { validateParentMission } from "./parentMission.js";
import { isSafe } from "./safety.js";
import { generateStoryChapter } from "./storyteller.js";
import { generateWeeklySummary } from "./summary.js";
import { validateMission } from "./validate.js";

export const MAX_BODY_BYTES = 5 * 1024; // 5 KB

/**
 * Checks whether an incoming request body exceeds 5 KB.
 * Supports both pre-parsed `req.body` (Express `express.json()`) and raw `content-length` header.
 *
 * @param {{ body?: unknown, headers?: Record<string, string | string[] | undefined>, rawBody?: string | Buffer }} req
 * @returns {{ ok: true, body: Record<string, any> } | { ok: false, status: number, error: string }}
 */
export function parseCheckedBody(req) {
  const contentLengthHeader = req.headers?.["content-length"];
  const declared = Array.isArray(contentLengthHeader)
    ? Number(contentLengthHeader[0])
    : Number(contentLengthHeader);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: `Request body exceeds ${MAX_BODY_BYTES} bytes limit` };
  }

  if (typeof req.rawBody === "string" || Buffer.isBuffer(req.rawBody)) {
    const byteLen = Buffer.byteLength(req.rawBody);
    if (byteLen > MAX_BODY_BYTES) {
      return { ok: false, status: 413, error: `Request body exceeds ${MAX_BODY_BYTES} bytes limit` };
    }
  }

  const body = req.body;
  if (body === undefined || body === null) {
    return { ok: true, body: {} };
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object" };
  }

  const serialisedBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (serialisedBytes > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: `Request body exceeds ${MAX_BODY_BYTES} bytes limit` };
  }

  return { ok: true, body: /** @type {Record<string, any>} */ (body) };
}

/**
 * Helper to write JSON on Express-compatible or mock responses.
 * @param {any} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  if (typeof res.status === "function") {
    const target = res.status(status);
    if (target && typeof target.json === "function") {
      target.json(payload);
      return;
    }
  }
  if (typeof res.json === "function") {
    res.statusCode = status;
    res.json(payload);
    return;
  }
  res.statusCode = status;
  if (typeof res.setHeader === "function") res.setHeader("content-type", "application/json");
  if (typeof res.end === "function") res.end(JSON.stringify(payload));
}

/**
 * POST /generate — generates validated, child-safe missions.
 * @param {any} req
 * @param {any} res
 * @param {{ generate?: typeof generateMissions }} [deps]
 */
export async function handleGenerate(req, res, deps = {}) {
  const parsed = parseCheckedBody(req);
  if (!parsed.ok) {
    sendJson(res, parsed.status, { error: parsed.error });
    return;
  }

  const body = parsed.body;
  const age = typeof body.age === "number" ? body.age : 8;
  if (!Number.isFinite(age) || age < 6 || age > 12) {
    sendJson(res, 400, { error: "age must be a number between 6 and 12" });
    return;
  }

  const count = typeof body.count === "number" ? body.count : 3;
  if (!Number.isInteger(count) || count < 1 || count > 6) {
    sendJson(res, 400, { error: "count must be an integer between 1 and 6" });
    return;
  }

  const role = body.role === "parent" ? "parent" : "child";
  const fn = deps.generate ?? generateMissions;

  try {
    const result = await fn({
      age,
      interests: Array.isArray(body.interests) ? body.interests : undefined,
      language: body.language,
      recentActivity: Array.isArray(body.recentActivity) ? body.recentActivity : undefined,
      count,
      types: Array.isArray(body.types) ? body.types : undefined,
      excludeTitles: Array.isArray(body.excludeTitles) ? body.excludeTitles : undefined,
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      includeExercise: Boolean(body.includeExercise),
    });

    sendJson(res, 200, {
      ...result,
      missions: result.missions.map((m) => toClientView(m, { role })),
    });
  } catch (err) {
    logEvent("error", "http.generate_error", {
      error: err instanceof Error ? err.message : "unknown_error",
    });
    sendJson(res, 500, { error: "Unable to generate missions right now" });
  }
}

/**
 * POST /validate — validates a mission (or parent-authored mission when `mode === "parent"`).
 * @param {any} req
 * @param {any} res
 */
export async function handleValidate(req, res) {
  const parsed = parseCheckedBody(req);
  if (!parsed.ok) {
    sendJson(res, parsed.status, { error: parsed.error });
    return;
  }

  const body = parsed.body;
  const rawMission = body.mission ?? body;
  const isParentMode = body.mode === "parent" || body.parentAuthored === true;

  if (isParentMode) {
    const result = validateParentMission(rawMission);
    sendJson(res, result.ok ? 200 : 422, result);
    return;
  }

  const validated = validateMission(rawMission);
  if (!validated.ok) {
    sendJson(res, 422, { ok: false, errors: validated.errors });
    return;
  }

  const safety = isSafe(validated.mission);
  if (!safety.safe) {
    sendJson(res, 422, { ok: false, errors: safety.reasons });
    return;
  }

  sendJson(res, 200, { ok: true, mission: validated.mission });
}

/**
 * GET /health — reports module readiness without leaking secrets.
 * @param {any} _req
 * @param {any} res
 */
export function handleHealth(_req, res) {
  const env = typeof process !== "undefined" ? process.env : {};
  const llm = resolveLlmConfig(env);
  sendJson(res, 200, {
    ok: true,
    service: "lelije-ai",
    mockMode: env.MOCK_AI === "true",
    providerConfigured: Boolean(llm),
    provider: llm ? llm.provider : "fallback",
    activitiesCount: getActivityCatalog().length,
  });
}

/**
 * GET /activities — returns the single-source-of-truth pose activity catalog.
 * @param {any} _req
 * @param {any} res
 */
export function handleActivities(_req, res) {
  sendJson(res, 200, { activities: getActivityCatalog() });
}

/**
 * POST /story — generates a calm Ethiopian story chapter (S1).
 * @param {any} req
 * @param {any} res
 */
export async function handleStory(req, res) {
  const parsed = parseCheckedBody(req);
  if (!parsed.ok) {
    sendJson(res, parsed.status, { error: parsed.error });
    return;
  }
  const result = await generateStoryChapter(parsed.body);
  sendJson(res, 200, result);
}

/**
 * POST /summary — generates a gentle weekly family summary (M6).
 * @param {any} req
 * @param {any} res
 */
export async function handleSummary(req, res) {
  const parsed = parseCheckedBody(req);
  if (!parsed.ok) {
    sendJson(res, parsed.status, { error: parsed.error });
    return;
  }
  const result = await generateWeeklySummary(parsed.body);
  sendJson(res, 200, result);
}

/**
 * Mounts all AI routes onto an Express-compatible router (`router.get`, `router.post`).
 * @param {{ get: (path: string, handler: Function) => unknown, post: (path: string, handler: Function) => unknown }} router
 * @param {{ prefix?: string, generate?: typeof generateMissions }} [options]
 */
export function mountAiRoutes(router, options = {}) {
  const prefix = (options.prefix || "").replace(/\/$/, "");
  router.post(`${prefix}/generate`, (/** @type {any} */ req, /** @type {any} */ res) =>
    handleGenerate(req, res, { generate: options.generate })
  );
  router.post(`${prefix}/validate`, handleValidate);
  router.get(`${prefix}/health`, handleHealth);
  router.get(`${prefix}/activities`, handleActivities);
  router.post(`${prefix}/story`, handleStory);
  router.post(`${prefix}/summary`, handleSummary);
  return router;
}
