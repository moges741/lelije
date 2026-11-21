// TypeScript declarations for ai/pose public API.

export type ActivityId =
  | "catch_the_stars"
  | "squats"
  | "jumping_jacks"
  | "freeze_dance"
  | "tree_balance"
  | "eskista"
  | "floor_is_lava";

export type PoseErrorCode = "camera_denied" | "no_camera" | "model_load_failed" | "unsupported";
export type InputMode = "camera" | "keyboard";
export type DressUpItem = "none" | "crown" | "cat_ears" | "cape";
export type KeyboardAction = "jump" | "armsUp" | "squat" | "jumpingJack" | "balance" | "move";

export type JuiceEventType =
  | "jump"
  | "armsUp"
  | "rep"
  | "catch"
  | "miss"
  | "combo"
  | "levelUp"
  | "freeze"
  | "go"
  | "finish";

export interface ActivityEvent {
  type: JuiceEventType;
  value: number;
  timeMs: number;
}

export interface ActivityCatalogItem {
  id: ActivityId;
  labelKey: string;
  defaultTarget: number;
  minTarget: number;
  maxTarget: number;
  durationSec: number;
  supportsKeyboard: boolean;
  repsMeaning: string;
  minSecPerRep: number;
}

export interface ActivityPerformance {
  accuracy: number;
  avg_rep_sec: number;
  max_combo: number;
  difficulty_level: number;
}

export interface CoopSummary {
  enabled: boolean;
  players_detected: number;
  player1_score: number;
  player2_score: number;
  team_score: number;
}

export interface ActivityResult {
  client_session_id: string;
  mission_id: string | null;
  game: string;
  started_at: string;
  duration_sec: number;
  reps: number;
  target: number;
  completed: boolean;
  points: number;
  input_mode: InputMode;
  jumps?: number;
  arm_raises?: number;
  performance?: ActivityPerformance;
  coop?: CoopSummary;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface Calibration {
  baselineHipY: number;
  torsoLength: number;
}

export type CalibrationStatus = "no_body" | "calibrating" | "ready";
export type CalibrationHintKey = "no_body" | "too_far" | "calibrating" | "ready";

export interface CalibrationUpdate {
  status: CalibrationStatus;
  progress: number;
  hint: string;
  hintKey: CalibrationHintKey;
  calibration: Calibration | null;
}

export interface StartActivityOptions {
  activity: ActivityId;
  canvas: HTMLCanvasElement;
  video?: HTMLVideoElement;
  missionId?: string | null;
  target?: number;
  durationSec?: number;
  mode?: InputMode;
  startDifficulty?: number;
  coop?: boolean;
  dressUp?: DressUpItem;
  muted?: boolean;
  debug?: boolean;
  modelPath?: string;
  wasmPath?: string;
  labels?: Record<string, string>;
  onStatus?: (status: {
    state: "loading" | "calibrating" | "playing" | "paused" | "finished" | "error";
    hint?: string;
    hintKey?: string;
    progress?: number;
    code?: PoseErrorCode;
    message?: string;
  }) => void;
  onEvent?: (event: ActivityEvent) => void;
  onFinish?: (result: ActivityResult) => void;
  onDebug?: (debugText: string) => void;
  onVoiceCheer?: (event: ActivityEvent) => void;
}

export interface ActivityController {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setMuted: (muted: boolean) => void;
  setDressUp: (item: DressUpItem) => void;
  triggerAction: (action: KeyboardAction) => void;
  setActionHeld: (action: KeyboardAction, held: boolean) => void;
}

export const ACTIVITY_CATALOG: readonly ActivityCatalogItem[];
export const POSE_ERROR_CODES: Readonly<Record<string, PoseErrorCode>>;
export const DRESS_UP_ITEMS: readonly DressUpItem[];
export const CALIBRATION_HINTS: Record<CalibrationHintKey, string>;
export const LANDMARK: Readonly<Record<string, number>>;
export const DETECTOR_CONFIG: Record<string, unknown>;
export const ENGINE_CONFIG: Record<string, number>;
export const ACTIONS: Readonly<{ JUMP: "jump"; ARMS_UP: "armsUp" }>;
export const STATES: Readonly<Record<string, string>>;

export function getActivityCatalog(): ActivityCatalogItem[];
export function getActivityById(id: string): ActivityCatalogItem | null;
export function clampActivityTarget(entry: ActivityCatalogItem, requested?: number): number;

export function startActivity(options: StartActivityOptions): ActivityController;
export function startCatchTheStars(options: Omit<StartActivityOptions, "activity"> | Record<string, unknown>): ActivityController | Record<string, unknown>;

export function bodyInFrame(landmarks: Landmark[] | null | undefined, minVisibility?: number): boolean;
export function hipMidY(landmarks: Landmark[]): number;
export function torsoLength(landmarks: Landmark[]): number;
export function createCalibrator(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number) => CalibrationUpdate;
  reset: () => void;
  getCalibration: () => Calibration | null;
};

export function createJumpDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean;
  reset: () => void;
  state: { baselineHipY: number | null; offsetFraction: number; jumping: boolean };
};

export function createArmsUpDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean;
  reset: () => void;
  state: { raised: boolean; heldMs: number };
};

export function createSquatDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean;
  reset: () => void;
  state: { baselineHipY: number | null; dropFraction: number; squatting: boolean };
};

export function createJumpingJackDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => boolean;
  reset: () => void;
  state: { open: boolean; armsRaised: boolean; feetSpreadFraction: number };
};

export function createOneLegBalanceDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => number;
  reset: () => void;
  state: { balanced: boolean; balancedMs: number; currentStreakMs: number; liftFraction: number };
};

export function createMotionEnergyDetector(options?: Record<string, number>): {
  update: (landmarks: Landmark[] | null | undefined, nowMs: number, calibration: Calibration | null | undefined) => {
    energy: number;
    moving: boolean;
    shoulderBeat: boolean;
  };
  reset: () => void;
  state: { energy: number; moving: boolean; shoulderBeat: boolean };
};

export function createDifficultyController(options?: {
  startDifficulty?: number;
  minLevel?: number;
  maxLevel?: number;
  windowSize?: number;
  raiseAbove?: number;
  lowerBelow?: number;
  minChangeIntervalMs?: number;
}): {
  recordAttempt: (hit: boolean, nowMs: number) => {
    changed: boolean;
    direction: -1 | 0 | 1;
    level: number;
    params: { level: number; speedMultiplier: number; spawnIntervalMs: number; targetSizeMultiplier: number };
    windowAccuracy: number;
  };
  getParams: () => { level: number; speedMultiplier: number; spawnIntervalMs: number; targetSizeMultiplier: number };
  getLevel: () => number;
  getSummary: () => { accuracy: number; difficulty_level: number; attempts: number; hits: number };
  reset: () => void;
};

export function createPoseEngine(options: Record<string, unknown>): Record<string, unknown>;
export function createJuiceEngine(options?: Record<string, unknown>): Record<string, unknown>;
export function createKeyboardController(options: Record<string, unknown>): Record<string, unknown>;
export function buildActivityResult(input: Record<string, unknown>): ActivityResult;
