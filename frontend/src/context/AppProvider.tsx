import { useCallback, useEffect, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { Result } from '../api/http'
import { isLanguage, tFactory } from '../i18n'
import { hasCamera } from '../lib/pose/load'
import type { Session } from '../types/account'
import type { PoseResult, Progress, Verified } from '../types/api'
import type { AppLanguage, CatchStarsResult, Mission } from '../types/mission'
import { AppContext, type AppContextValue } from './app-context'

const SESSION_KEY = 'lelije.session.v3'
const LANGUAGE_KEY = 'lelije.language'

function readSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null
    if (!value || (value.role !== 'parent' && value.role !== 'child')) return null
    if (typeof value.family?.code !== 'string') return null
    if (value.role === 'child' && typeof value.child?.id !== 'string') return null
    return value as Session
  } catch {
    return null
  }
}

function readLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // Blocked storage: fall through to the browser language.
  }
  const fromBrowser = navigator.language.slice(0, 2).toLowerCase()
  return isLanguage(fromBrowser) ? fromBrowser : 'en'
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the setting lasts until the page is closed.
  }
}

interface LoadedMissions {
  childId: string
  attempt: number
  result: Result<api.TodaysMissions>
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(readLanguage)
  const [session, setSessionState] = useState(readSession)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<LoadedMissions | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)

  const childId = session?.role === 'child' ? (session.child?.id ?? null) : null

  const setSession = useCallback((next: Session | null) => {
    setSessionState(next)
    store(SESSION_KEY, next && JSON.stringify(next))
  }, [])

  const signOut = useCallback(() => setSession(null), [setSession])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (!childId) return
    let ignore = false
    void Promise.all([api.todaysMissions(childId, hasCamera()), api.childProgress(childId)]).then(
      ([missions, latest]) => {
        if (ignore) return
        // The profile was removed on the server; this device cannot use it any more.
        if (!missions.ok && missions.error === 'not_found') {
          signOut()
          return
        }
        setLoaded({ childId, attempt, result: missions })
        if (latest.ok) setProgress(latest.data)
      },
    )
    return () => {
      ignore = true
    }
  }, [childId, attempt, signOut])

  const refreshProgress = useCallback(async () => {
    if (!childId) return
    const latest = await api.childProgress(childId)
    if (latest.ok) setProgress(latest.data)
  }, [childId])

  const completeMission = useCallback(
    async (mission: Mission, verifiedBy: Verified, result?: PoseResult) => {
      if (!childId) return { ok: false, error: 'not_found' } as const
      const saved = await api.completeMission({ childId, missionId: mission.id, verifiedBy, result })
      if (saved.ok) await refreshProgress()
      return saved
    },
    [childId, refreshProgress],
  )

  const submitGame = useCallback(
    async (result: CatchStarsResult) => {
      if (!childId) return { ok: false, error: 'not_found' } as const
      const saved = await api.saveGame(childId, result)
      if (saved.ok) await refreshProgress()
      return saved
    },
    [childId, refreshProgress],
  )

  const reloadMissions = useCallback(() => setAttempt((n) => n + 1), [])

  const current = loaded?.childId === childId && loaded.attempt === attempt ? loaded.result : null

  const value: AppContextValue = {
    t: tFactory(language),
    language,
    setLanguage(next) {
      setLanguageState(next)
      store(LANGUAGE_KEY, next)
      if (session?.child) setSession({ ...session, child: { ...session.child, language: next } })
    },
    session,
    setSession,
    signOut,
    missions: current?.ok ? current.data.missions : [],
    missionsStatus: current === null ? 'loading' : current.ok ? 'ready' : 'error',
    missionsError: current && !current.ok ? current.error : null,
    missionsOffline: current?.ok === true && current.data.offline,
    reloadMissions,
    progress: progress?.childId === childId ? progress : null,
    refreshProgress,
    completeMission,
    submitGame,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
