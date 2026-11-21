import type { TranslationKey } from '../i18n'
import type { PlayStatus, Progress } from '../types/api'

export type MissionState = 'todo' | 'done' | 'pending' | 'redo'

export function missionState(progress: Progress | null, missionId: string): MissionState {
  if (!progress) return 'todo'
  const listed = (rows: { missionId: string }[]) => rows.some((row) => row.missionId === missionId)
  if (listed(progress.today.missionsCompleted)) return 'done'
  if (listed(progress.today.missionsPending)) return 'pending'
  if (listed(progress.today.missionsToRedo)) return 'redo'
  return 'todo'
}

/** How a child sees their play-time request. */
export const PLAY_TEXT: Record<PlayStatus, TranslationKey> = {
  sent: 'playSent',
  allowed: 'playAllowed',
  later: 'playLater',
  declined: 'playDeclined',
}
