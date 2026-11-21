/** Contract A shapes — keep in sync with ai/pose/README.md */

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
}
