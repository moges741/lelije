import type { PoseResult, Verified } from './api'
import type { CatchStarsResult } from './mission'

export type MissionOutcome =
  | { status: 'approved'; awarded: number }
  | { status: 'pending' }
  | { status: 'already' }
  | { status: 'failed' }

export type GameOutcome =
  | { status: 'saved'; awarded: number }
  | { status: 'already' }
  | { status: 'failed' }

/** Router state handed to the success screen. */
export type SuccessState =
  | {
      kind: 'mission'
      missionId: string
      title: string
      points: number
      verifiedBy: Verified
      result?: PoseResult
      outcome: MissionOutcome
    }
  | { kind: 'game'; result: CatchStarsResult; outcome: GameOutcome }

export function isSuccessState(value: unknown): value is SuccessState {
  if (typeof value !== 'object' || value === null) return false
  if (!('kind' in value) || !('outcome' in value)) return false
  return value.kind === 'mission' || value.kind === 'game'
}
