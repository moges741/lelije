import type { Result } from '../api/http'
import type { CompletionSaved, GameSaved, PoseResult, Verified } from '../types/api'
import type { CatchStarsResult, Mission } from '../types/mission'
import type { SuccessState } from '../types/navigation'

export function missionSuccess(
  mission: Mission,
  verifiedBy: Verified,
  result: PoseResult | undefined,
  saved: Result<CompletionSaved>,
): SuccessState {
  const outcome = !saved.ok
    ? ({ status: 'failed' } as const)
    : saved.data.status === 'pending'
      ? ({ status: 'pending' } as const)
      : saved.data.alreadyCompleted
        ? ({ status: 'already' } as const)
        : ({ status: 'approved', awarded: saved.data.pointsAwarded } as const)
  return {
    kind: 'mission',
    missionId: mission.id,
    title: mission.title,
    points: mission.points,
    verifiedBy,
    result,
    outcome,
  }
}

export function gameSuccess(result: CatchStarsResult, saved: Result<GameSaved>): SuccessState {
  const outcome = !saved.ok
    ? ({ status: 'failed' } as const)
    : saved.data.alreadyRecorded
      ? ({ status: 'already' } as const)
      : ({ status: 'saved', awarded: saved.data.pointsAwarded } as const)
  return { kind: 'game', result, outcome }
}
