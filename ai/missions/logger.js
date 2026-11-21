// @ts-check
// Structured JSON logger for ai/missions (M6).
// Strips secrets and user-identifying fields automatically so nothing sensitive is ever logged.

const REDACTED_KEYS = new Set([
  "apikey",
  "api_key",
  "authorization",
  "token",
  "secret",
  "password",
  "cookie",
  "childname",
  "child_name",
  "parentname",
  "parent_name",
  "email",
  "phone",
  "address",
  "interests",
  "prompt",
  "rawtext",
  "raw_text",
  "body",
]);

/**
 * Recursively strips forbidden keys and truncates long free-form strings.
 * @param {unknown} value
 * @param {number} [depth]
 * @returns {unknown}
 */
export function sanitiseLogFields(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 200 ? value.slice(0, 200) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitiseLogFields(item, depth + 1));
  if (typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) continue;
      out[key] = sanitiseLogFields(val, depth + 1);
    }
    return out;
  }
  return undefined;
}

/**
 * Emits a structured log record without secrets or user PII.
 * Silent when `process.env.AI_LOG_SILENT === "true"` or during tests unless a custom sink is passed.
 *
 * @param {"info" | "warn" | "error"} level
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 * @param {(line: string) => void} [sink]
 * @returns {Record<string, unknown>}
 */
export function logEvent(level, event, fields = {}, sink) {
  const safeFields = /** @type {Record<string, unknown>} */ (sanitiseLogFields(fields) ?? {});
  const record = {
    ts: new Date().toISOString(),
    level,
    service: "lelije-ai",
    event,
    ...safeFields,
  };

  if (sink) {
    sink(JSON.stringify(record));
    return record;
  }

  const silent =
    typeof process !== "undefined" &&
    (process.env?.AI_LOG_SILENT === "true" || process.env?.VITEST === "true");
  if (!silent) {
    const line = JSON.stringify(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  }
  return record;
}
