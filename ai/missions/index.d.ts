// TypeScript declarations for ai/missions & ai/api/missions (for the TypeScript backend).

import type { ActivityCatalogItem, ActivityId } from "../pose/index.js";

export type LanguageCode = "en" | "am" | "om";
export type MissionType = "solo" | "family" | "outdoor";
export type MissionCategory = "real_world" | "exercise";
export type MissionInteraction =
  | "checklist"
  | "camera"
  | "timer"
  | "quiz"
  | "story"
  | "scavenger"
  | "family_challenge";

export interface MissionActivity {
  game: ActivityId | string;
  target: number;
}

export interface QuizQuestion {
  q: string;
  options: [string, string, string];
  answerIndex: 0 | 1 | 2;
}

export interface StoryData {
  opening: string;
  choices: Array<[string, string]>;
}

export interface Mission {
  title: string;
  description: string;
  category: MissionCategory;
  type: MissionType;
  interaction: MissionInteraction;
  roles: { child: string; parent: string };
  steps: string[];
  activity: MissionActivity | null;
  supervision_note: string;
  needs_parent: boolean;
  points: number;
  quiz?: QuizQuestion[];
  story?: StoryData;
  duration_sec?: number;
  items?: string[];
  english_summary?: string;
  needs_translation?: boolean;
}

export type MissionValidation = { ok: true; mission: Mission } | { ok: false; errors: string[] };

export interface GenerateMissionsInput {
  age: number;
  interests?: string[];
  language?: LanguageCode;
  recentActivity?: string[];
  count?: number;
  types?: MissionType[];
  excludeTitles?: string[];
  requestId?: string;
  includeExercise?: boolean;
  mock?: boolean;
}

export interface GenerateMissionsResult {
  source: "ai" | "fallback" | "mixed" | "mock";
  languageFallback: boolean;
  generatedAt: string;
  missions: Mission[];
}

export type StoryRegion = "highlands" | "rift_valley" | "simien";
export type CompanionEvent =
  | "welcome"
  | "start"
  | "catch"
  | "combo"
  | "miss"
  | "halfway"
  | "finish"
  | "freeze"
  | "encourage";
export type CompanionMood = "happy" | "cheer" | "calm";

export interface StoryChapterResult {
  source: "ai" | "fallback";
  text: string;
  choices: string[];
  endsWith: "choice" | "rest";
  needs_translation?: boolean;
}

export interface WeeklySummaryResult {
  source: "ai" | "fallback";
  language: LanguageCode;
  headline: string;
  summary: string;
  suggestion: string;
  needs_translation?: boolean;
}

export const MISSION_TYPES: readonly MissionType[];
export const MISSION_CATEGORIES: readonly MissionCategory[];
export const MISSION_INTERACTIONS: readonly MissionInteraction[];
export const LIMITS: Readonly<Record<string, number>>;
export const GENERATION_BUDGET: Readonly<{ totalBudgetMs: number; llmTimeoutMs: number; minRetryBudgetMs: number }>;
export const STORY_REGIONS: readonly StoryRegion[];
export const STORY_LIMITS: Readonly<{ minWords: number; maxWords: number; timeoutMs: number }>;
export const MAX_BODY_BYTES: number;

export function validateMission(raw: unknown): MissionValidation;
export function validateMissionList(rawList: unknown): {
  missions: Mission[];
  rejected: Array<{ index: number; errors: string[] }>;
};
export function validateParentMission(raw: unknown): MissionValidation;
export function involvesHazard(mission: Record<string, unknown>): boolean;
export function collectMissionTexts(mission: Record<string, unknown>): string[];

export function isSafe(mission: Record<string, unknown>): { safe: boolean; reasons: string[] };
export function checkTextsSafe(texts: string[]): { safe: boolean; reasons: string[] };
export function containsPersonalInfo(text: string): { hasPii: boolean; types: string[] };
export function stripPersonalInfo(text: string): string;

export function buildMissionPrompt(input: {
  age: number;
  interests?: string[];
  language?: LanguageCode;
  recentActivity?: string[];
  count?: number;
  types?: MissionType[];
  excludeTitles?: string[];
}): { system: string; user: string; sanitisedInterests: string[] };

export function generateMissions(input: GenerateMissionsInput): Promise<GenerateMissionsResult>;
export function buildExerciseMission(options?: {
  age?: number;
  game?: ActivityId;
  language?: LanguageCode;
  target?: number;
}): Mission;
export function targetForAgeBand(age: number, entry: ActivityCatalogItem): number;

export function toDbRow(
  mission: Mission,
  meta?: {
    id?: string;
    familyId?: string | null;
    childId?: string | null;
    language?: string;
    source?: string;
    createdAt?: string;
  }
): Record<string, unknown>;

export function toClientView(
  mission: Mission,
  options?: { role?: "child" | "parent" }
): Record<string, unknown>;

export function generateWeeklySummary(input?: {
  age?: number;
  language?: LanguageCode;
  completedMissions?: number;
  exerciseSessions?: number;
  totalPoints?: number;
  highlights?: string[];
  requestId?: string;
}): Promise<WeeklySummaryResult>;

export function generateStoryChapter(input?: {
  age?: number;
  language?: LanguageCode;
  interests?: string[];
  companionName?: string;
  region?: StoryRegion;
  chapter?: number;
  previousChoice?: string | null;
  requestId?: string;
}): Promise<StoryChapterResult>;

export function companionLine(input?: {
  event?: CompanionEvent;
  language?: LanguageCode;
  mood?: CompanionMood;
}): {
  text: string;
  event: CompanionEvent;
  language: LanguageCode;
  mood: CompanionMood;
  needs_translation?: boolean;
};

export function handleGenerate(req: unknown, res: unknown, deps?: { generate?: typeof generateMissions }): Promise<void>;
export function handleValidate(req: unknown, res: unknown): Promise<void>;
export function handleHealth(req: unknown, res: unknown): void;
export function handleActivities(req: unknown, res: unknown): void;
export function handleStory(req: unknown, res: unknown): Promise<void>;
export function handleSummary(req: unknown, res: unknown): Promise<void>;
export function mountAiRoutes<T extends { get: Function; post: Function }>(
  router: T,
  options?: { prefix?: string; generate?: typeof generateMissions }
): T;
