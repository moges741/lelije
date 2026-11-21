import { createContext, useContext } from 'react'
import type { Failure, Result } from '../api/http'
import type { Translate } from '../i18n'
import type { Session } from '../types/account'
import type { CompletionSaved, GameSaved, PoseResult, Progress, Verified } from '../types/api'
import type { AppLanguage, CatchStarsResult, Mission } from '../types/mission'

export interface AppContextValue {
  t: Translate
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  session: Session | null
  setSession: (session: Session | null) => void
  signOut: () => void
  /** Today's missions for the signed-in child. */
  missions: Mission[]
  missionsStatus: 'loading' | 'ready' | 'error'
  missionsError: Failure | null
  /** The list is this device's copy from earlier today because the server could not be reached. */
  missionsOffline: boolean
  reloadMissions: () => void
  /** The signed-in child's progress; null until it loads. */
  progress: Progress | null
  refreshProgress: () => Promise<void>
  completeMission: (
    mission: Mission,
    verifiedBy: Verified,
    result?: PoseResult,
  ) => Promise<Result<CompletionSaved>>
  submitGame: (result: CatchStarsResult) => Promise<Result<GameSaved>>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
