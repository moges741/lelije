import { createContext, useContext } from 'react'
import type { CompletionOutcome, GameOutcome } from '../api/client'
import type { Translate } from '../i18n'
import type { Session } from '../types/account'
import type {
  AppLanguage,
  CatchStarsResult,
  Mission,
  Progress,
} from '../types/mission'

export interface AppContextValue {
  t: Translate
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  session: Session | null
  setSession: (session: Session | null) => void
  signOut: () => void
  missions: Mission[]
  missionsReady: boolean
  /** 'demo' when the list did not come from POST /api/missions. */
  missionsOrigin: 'server' | 'demo' | null
  reloadMissions: () => void
  progress: Progress
  refreshProgress: () => void
  completeMission: (
    mission: Mission,
    verifiedBy: 'pose' | 'self',
    result?: { count: number; durationMs: number },
  ) => Promise<CompletionOutcome>
  submitGame: (result: CatchStarsResult) => Promise<GameOutcome>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}
