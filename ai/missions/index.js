// @ts-check
// Public barrel for ai/missions.

export {
  collectMissionTexts,
  involvesHazard,
  LIMITS,
  MISSION_CATEGORIES,
  MISSION_INTERACTIONS,
  MISSION_TYPES,
  validateMission,
  validateMissionList,
} from "./validate.js";

export {
  checkTextsSafe,
  containsPersonalInfo,
  isSafe,
  stripPersonalInfo,
} from "./safety.js";

export { buildMissionPrompt, sanitiseInterests } from "./prompt.js";
export {
  callLlmText,
  generateMissions,
  GENERATION_BUDGET,
  loadFallbackMissions,
  parseMissionJson,
  resolveLlmConfig,
} from "./llm.js";
export { buildExerciseMission, targetForAgeBand } from "./exercise.js";
export { toClientView, toDbRow } from "./mappers.js";
export { validateParentMission } from "./parentMission.js";
export { generateWeeklySummary } from "./summary.js";
export {
  companionLine,
  countWords,
  generateStoryChapter,
  STORY_LIMITS,
  STORY_REGIONS,
  validateStoryChapter,
} from "./storyteller.js";
export { logEvent, sanitiseLogFields } from "./logger.js";
export {
  handleActivities,
  handleGenerate,
  handleHealth,
  handleStory,
  handleSummary,
  handleValidate,
  MAX_BODY_BYTES,
  mountAiRoutes,
  parseCheckedBody,
} from "./http.js";
