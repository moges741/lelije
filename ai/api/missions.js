// @ts-check
// Thin public API wrapper for the backend & scripts (M5), with MOCK_AI support.

import { buildExerciseMission } from "../missions/exercise.js";
import {
  handleActivities,
  handleGenerate,
  handleHealth,
  handleStory,
  handleSummary,
  handleValidate,
  mountAiRoutes,
} from "../missions/http.js";
import { generateMissions as coreGenerateMissions } from "../missions/llm.js";
import { toClientView, toDbRow } from "../missions/mappers.js";
import { validateParentMission } from "../missions/parentMission.js";
import { isSafe } from "../missions/safety.js";
import { companionLine, generateStoryChapter } from "../missions/storyteller.js";
import { generateWeeklySummary } from "../missions/summary.js";
import { validateMission, validateMissionList } from "../missions/validate.js";
import { getActivityCatalog } from "../pose/catalog.js";

/**
 * Thin wrapper around generateMissions that honours `MOCK_AI=true` (env or explicit option).
 * @param {Parameters<typeof coreGenerateMissions>[0] & { mock?: boolean }} options
 */
export async function generateMissions(options) {
  const env = options._env ?? (typeof process !== "undefined" ? process.env : {});
  const effectiveEnv = options.mock ? { ...env, MOCK_AI: "true" } : env;
  return coreGenerateMissions({
    ...options,
    _env: effectiveEnv,
  });
}

export {
  buildExerciseMission,
  companionLine,
  generateStoryChapter,
  generateWeeklySummary,
  getActivityCatalog,
  handleActivities,
  handleGenerate,
  handleHealth,
  handleStory,
  handleSummary,
  handleValidate,
  isSafe,
  mountAiRoutes,
  toClientView,
  toDbRow,
  validateMission,
  validateMissionList,
  validateParentMission,
};
