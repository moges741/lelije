import type { CatchStarsResult } from './mission'

export type SaveStatus =
  | 'server_awarded'
  | 'already'
  | 'demo_pending'
  | 'save_failed'
  | 'not_saved'
  | 'demo_only'

/** Router state handed to the success screen. */
export type SuccessState =
  | {
      kind: 'mission'
      awarded: number
      title: string
      missionId: string
      status: SaveStatus
      origin: 'server' | 'demo'
      verifiedBy?: 'pose' | 'self'
    }
  | {
      kind: 'game'
      awarded: number
      result: CatchStarsResult
      status: SaveStatus
      origin: 'server' | 'demo'
    }

export function isSuccessState(value: unknown): value is SuccessState {
  if (typeof value !== 'object' || value === null) return false
  if (!('kind' in value) || !('awarded' in value) || !('status' in value)) return false
  if (typeof value.awarded !== 'number' || typeof value.status !== 'string') return false
  if (value.kind === 'mission') return 'title' in value && typeof value.title === 'string'
  return value.kind === 'game' && 'result' in value && typeof value.result === 'object'
}
