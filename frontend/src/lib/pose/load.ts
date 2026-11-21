import type { PoseModule } from './types'

/**
 * Uses the real on-device MediaPipe PoseLandmarker camera engine by default
 * (/models/pose_landmarker_lite.task + /wasm from /public).
 * Set VITE_POSE_MOCK=true only when explicitly rehearsing without a webcam.
 */
export const POSE_MOCK = import.meta.env.VITE_POSE_MOCK === 'true'

/** Asset paths from Contract A 5.1, served from root /public by the NestJS server. */
export const POSE_ASSETS = {
  modelUrl: '/models/pose_landmarker_lite.task',
  wasmUrl: '/wasm',
} as const

let cached: Promise<PoseModule> | undefined

/**
 * Lazy-loads the real ai/pose/index.js module via the Vite `lelije-pose` alias.
 */
export function loadPoseModule(): Promise<PoseModule> {
  cached ??= import('lelije-pose').then(
    (mod): PoseModule => mod as unknown as PoseModule,
    (err: unknown) => {
      cached = undefined
      throw err
    },
  )
  return cached
}

export function hasCamera(): boolean {
  return POSE_MOCK || Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia)
}
