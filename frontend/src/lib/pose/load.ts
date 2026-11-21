import type { PoseModule } from './types'

/**
 * `mock: true` until CP2 (Build Contract 8.3.1).
 * Set VITE_POSE_MOCK=false to use the real camera engine.
 */
export const POSE_MOCK = import.meta.env.VITE_POSE_MOCK !== 'false'

/** Asset paths from Contract A 5.1, served from public/. */
export const POSE_ASSETS = {
  modelUrl: '/models/pose_landmarker_lite.task',
  wasmUrl: '/wasm',
} as const

let cached: Promise<PoseModule> | undefined

/**
 * Lazy-loads the pose module, only ever called from camera screens.
 * `lelije-pose` is a Vite alias for ../ai/pose/index.js, or for the local
 * stand-in (./mock.ts) while that file does not exist yet.
 */
export function loadPoseModule(): Promise<PoseModule> {
  cached ??= import('lelije-pose').then(
    (mod): PoseModule => mod,
    (err: unknown) => {
      cached = undefined
      throw err
    },
  )
  return cached
}

export function hasCamera(): boolean {
  return POSE_MOCK || Boolean(navigator.mediaDevices?.getUserMedia)
}
