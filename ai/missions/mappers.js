// @ts-check
// Persistence & client-view mappers for backend integration (M6).
// Pure logic: never mutates input objects.

/** @typedef {import("./validate.js").Mission} Mission */

/**
 * Maps a validated Mission into a PostgreSQL-friendly snake_case database row.
 * @param {Mission} mission
 * @param {{ id?: string, familyId?: string | null, childId?: string | null, language?: string, source?: string, createdAt?: string }} [meta]
 * @returns {Record<string, unknown>}
 */
export function toDbRow(mission, meta = {}) {
  const { english_summary: _stripped, ...clean } = mission;
  /** @type {Record<string, unknown>} */
  const row = {
    title: clean.title,
    description: clean.description,
    category: clean.category,
    type: clean.type,
    interaction: clean.interaction,
    child_role: clean.roles.child,
    parent_role: clean.roles.parent,
    steps: clean.steps.slice(),
    activity_game: clean.activity ? clean.activity.game : null,
    activity_target: clean.activity ? clean.activity.target : null,
    supervision_note: clean.supervision_note,
    needs_parent: Boolean(clean.needs_parent),
    points: clean.points,
    quiz_json: clean.quiz ? structuredClone(clean.quiz) : null,
    story_json: clean.story ? structuredClone(clean.story) : null,
    duration_sec: typeof clean.duration_sec === "number" ? clean.duration_sec : null,
    scavenger_items: Array.isArray(clean.items) ? clean.items.slice() : null,
    needs_translation: Boolean(clean.needs_translation),
    language: meta.language ?? "en",
    source: meta.source ?? "fallback",
    created_at: meta.createdAt ?? new Date().toISOString(),
  };

  if (meta.id !== undefined) row.id = meta.id;
  if (meta.familyId !== undefined) row.family_id = meta.familyId;
  if (meta.childId !== undefined) row.child_id = meta.childId;

  return row;
}

/**
 * Maps a Mission for API responses to the client.
 * - Strips internal `english_summary`.
 * - For role `"child"`, hides `quiz[*].answerIndex` so answers cannot be peeked in network traffic.
 * - For role `"parent"`, preserves `quiz[*].answerIndex`.
 *
 * @param {Mission} mission
 * @param {{ role?: "child" | "parent" }} [options]
 * @returns {Record<string, unknown>}
 */
export function toClientView(mission, options = {}) {
  const role = options.role === "parent" ? "parent" : "child";
  const { english_summary: _stripped, ...rest } = mission;

  /** @type {Record<string, unknown>} */
  const view = {
    ...rest,
    roles: { ...rest.roles },
    steps: rest.steps.slice(),
    activity: rest.activity ? { ...rest.activity } : null,
  };

  if (Array.isArray(rest.items)) {
    view.items = rest.items.slice();
  }

  if (rest.story) {
    view.story = {
      opening: rest.story.opening,
      choices: rest.story.choices.map((pair) => [pair[0], pair[1]]),
    };
  }

  if (Array.isArray(rest.quiz)) {
    view.quiz = rest.quiz.map((q) => {
      if (role === "child") {
        return { q: q.q, options: [...q.options] };
      }
      return { q: q.q, options: [...q.options], answerIndex: q.answerIndex };
    });
  }

  return view;
}
