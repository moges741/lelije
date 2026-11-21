import { useEffect, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import { isLanguage, tFactory } from '../i18n'
import { hasCamera } from '../lib/pose/load'
import type { Session } from '../types/account'
import type { AppLanguage, Mission, Progress } from '../types/mission'
import { AppContext, type AppContextValue } from './app-context'

const SESSION_KEY = 'lelije.session.v2'
const LANGUAGE_KEY = 'lelije.language'

const NO_PROGRESS: Progress = {
  pointsToday: 0,
  todayCompleted: [],
  pendingIds: [],
  streak: null,
  dailyCap: null,
  origin: 'unknown',
}

function readSession(): Session | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    if (!('role' in value) || !('family' in value) || !('origin' in value)) return null
    if (value.role !== 'parent' && value.role !== 'child') return null
    if (value.origin !== 'server' && value.origin !== 'demo') return null
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

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Blocked storage: settings last for this session only.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(readLanguage)
  const [session, setSessionState] = useState(readSession)
  const [reload, setReload] = useState(0)
  const [tick, setTick] = useState(0)
  const [loaded, setLoaded] = useState<{ key: string; missions: Mission[]; origin: 'server' | 'demo' } | null>(
    null,
  )
  const [progress, setProgress] = useState(NO_PROGRESS)

  const child = session?.role === 'child' ? session.child : null
  const missionsKey = child ? `${child.id}|${child.age}|${language}|${session?.origin}|${reload}` : ''
  const missionsReady = missionsKey !== '' && loaded?.key === missionsKey

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    if (!child || !session) return
    let ignore = false
    api
      .fetchTodaysMissions({
        childId: child.id,
        age: child.age,
        language,
        cameraAvailable: hasCamera(),
        origin: session.origin,
        force: reload > 0,
      })
      .then(
        (result) => {
          if (ignore) return
          setLoaded({ key: missionsKey, missions: result.missions, origin: result.origin })
          setProgress(api.progressFor(child.id, session.origin))
        },
        () => {
          if (!ignore) setLoaded({ key: missionsKey, missions: [], origin: 'demo' })
        },
      )
    return () => {
      ignore = true
    }
  }, [child, language, missionsKey, reload, session, tick])

  const value: AppContextValue = {
    t: tFactory(language),
    language,
    setLanguage(next) {
      setLanguageState(next)
      store(LANGUAGE_KEY, next)
      if (session?.child) {
        const nextSession = { ...session, child: { ...session.child, language: next } }
        setSessionState(nextSession)
        store(SESSION_KEY, JSON.stringify(nextSession))
      }
    },
    session,
    setSession(next) {
      setSessionState(next)
      if (next) store(SESSION_KEY, JSON.stringify(next))
      else localStorage.removeItem(SESSION_KEY)
    },
    signOut() {
      setSessionState(null)
      setLoaded(null)
      setProgress(NO_PROGRESS)
      try {
        localStorage.removeItem(SESSION_KEY)
      } catch {
        // Already signed out in memory.
      }
    },
    missions: missionsReady && loaded ? loaded.missions : [],
    missionsReady,
    missionsOrigin: missionsReady && loaded ? loaded.origin : null,
    reloadMissions() {
      setReload((n) => n + 1)
    },
    progress,
    refreshProgress() {
      setTick((n) => n + 1)
      if (child && session) setProgress(api.progressFor(child.id, session.origin))
    },
    async completeMission(mission, verifiedBy, result) {
      if (!child || !session) {
        return { awarded: 0, status: 'save_failed', origin: 'demo', pointsToday: 0 }
      }
      const outcome = await api.completeMission({
        childId: child.id,
        familyCode: session.family.code,
        mission,
        verifiedBy,
        result,
        origin: session.origin,
      })
      setProgress(api.progressFor(child.id, session.origin))
      return outcome
    },
    async submitGame(result) {
      if (!child || !session) {
        return { awarded: 0, status: 'save_failed', origin: 'demo', pointsToday: 0 }
      }
      return api.postGameResult({
        childId: child.id,
        result,
        origin: session.origin,
      })
    },
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
