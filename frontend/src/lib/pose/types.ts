/** Contract A + Full ai/pose activity shapes — synced with ai/pose/index.js */

export const ACTIONS = {
  JUMP: 'jump',
  ARMS_UP: 'armsUp',
} as const

export const STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  NEEDS_PERMISSION: 'needs-permission',
  RUNNING: 'running',
  NO_PERSON: 'no-person',
  ERROR: 'error',
} as const

export type ActionType = (typeof ACTIONS)[keyof typeof ACTIONS]
export type EngineState = (typeof STATES)[keyof typeof STATES]

export type ActivityId =
  | 'catch_the_stars'
  | 'squats'
  | 'jumping_jacks'
  | 'freeze_dance'
  | 'tree_balance'
  | 'eskista'
  | 'floor_is_lava'

export type DressUpItem = 'none' | 'crown' | 'cat_ears' | 'cape'

export type KeyboardAction = 'jump' | 'armsUp' | 'squat' | 'jumpingJack' | 'balance' | 'move'

export interface ActivityCatalogItem {
  id: ActivityId
  labelKey: string
  defaultTarget: number
  minTarget: number
  maxTarget: number
  durationSec: number
  supportsKeyboard: boolean
  repsMeaning: string
  minSecPerRep: number
}

export interface ActivityStatus {
  state: 'loading' | 'calibrating' | 'playing' | 'paused' | 'finished' | 'error'
  hint?: string
  hintKey?: string
  progress?: number
  code?: string
  message?: string
}

export interface ActivityEvent {
  type: string
  value: number
  timeMs: number
}

export interface ActivityResult {
  client_session_id: string
  mission_id: string | null
  game: ActivityId
  started_at: string
  duration_sec: number
  reps: number
  target: number
  completed: boolean
  score: number
  points: number
  input_mode: 'camera' | 'keyboard'
  performance?: {
    accuracy: number
    avg_rep_sec: number
    max_combo: number
    difficulty_level: number
  }
}

export interface StartActivityOptions {
  activity: ActivityId
  canvas: HTMLCanvasElement
  video?: HTMLVideoElement
  missionId?: string | null
  target?: number
  durationSec?: number
  mode?: 'camera' | 'keyboard'
  startDifficulty?: number
  coop?: boolean
  dressUp?: DressUpItem
  muted?: boolean
  debug?: boolean
  modelPath?: string
  wasmPath?: string
  labels?: Record<string, string>
  onStatus?: (status: ActivityStatus) => void
  onEvent?: (event: ActivityEvent) => void
  onFinish?: (result: ActivityResult) => void
  onDebug?: (debugText: string) => void
}

export interface ActivityController {
  stop: () => void
  pause: () => void
  resume: () => void
  setMuted: (muted: boolean) => void
  setDressUp: (item: DressUpItem) => void
  triggerAction: (action: KeyboardAction) => void
  setActionHeld: (action: KeyboardAction, held: boolean) => void
}

export interface ActionEvent {
  type: ActionType
  t: number
  confidence: number
  meta?: Record<string, unknown>
}

export interface StatusEvent {
  state: EngineState
  /** Developer string. Never shown to children. */
  message?: string
}

export interface CalibratedEvent {
  torso: number
  baselineHipY: number
}

export interface Landmark {
  x: number
  y: number
  z: number
  visibility: number
}

export interface LandmarksEvent {
  t: number
  landmarks: Landmark[]
}

export interface EngineSnapshot {
  state: EngineState
  armsUp: boolean
  personVisible: boolean
  fps: number
}

export type EngineEventMap = {
  action: ActionEvent
  status: StatusEvent
  calibrated: CalibratedEvent
  landmarks: LandmarksEvent
}

export interface PoseEngine {
  init: () => Promise<void>
  start: () => Promise<void>
  on: <K extends keyof EngineEventMap>(
    event: K,
    handler: (payload: EngineEventMap[K]) => void,
  ) => () => void
  calibrate: () => void
  getState: () => EngineSnapshot
  stop: () => void
  destroy: () => void
}

export interface CreatePoseEngineOptions {
  video: HTMLVideoElement
  modelUrl?: string
  wasmUrl?: string
  targetFps?: number
  mock?: boolean
}

export interface CatchStarsResult {
  score: number
  starsCaught: number
  goldenCaught: number
  jumps: number
  armsUp: number
  durationMs: number
}

export type GameEventMap = {
  score: { score: number }
  end: CatchStarsResult
}

export interface CatchTheStarsGame {
  on: <K extends keyof GameEventMap>(
    event: K,
    handler: (payload: GameEventMap[K]) => void,
  ) => () => void
  pause: () => void
  resume: () => void
  stop: () => void
}

export interface StartCatchTheStarsOptions {
  canvas: HTMLCanvasElement
  engine: PoseEngine
  durationMs?: number
}

/** The exports of ai/pose/index.js that this app calls. */
export interface PoseModule {
  createPoseEngine: (options: CreatePoseEngineOptions) => PoseEngine
  startCatchTheStars: (options: StartCatchTheStarsOptions) => CatchTheStarsGame
  startActivity?: (options: StartActivityOptions) => ActivityController
  getActivityCatalog?: () => ActivityCatalogItem[]
}
