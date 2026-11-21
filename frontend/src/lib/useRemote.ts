import { useCallback, useEffect, useRef, useState } from 'react'
import type { Failure, Result } from '../api/http'

/** Calls refresh on an interval and when the page becomes visible again, never while it is hidden. */
export function useAutoRefresh(refresh: (() => void) | null, intervalMs: number) {
  useEffect(() => {
    if (!refresh) return
    const tick = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const timer = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [refresh, intervalMs])
}

export interface Remote<T> {
  data: T | null
  error: Failure | null
  reload: () => void
}

/**
 * Loads data for `key` (null waits). A failed refresh keeps the last data and
 * reports the error beside it, so a polled screen does not blank out.
 */
export function useRemote<T>(
  key: string | null,
  load: () => Promise<Result<T>>,
  refreshMs = 0,
): Remote<T> {
  const latestLoad = useRef(load)
  const [state, setState] = useState<{ key: string; data: T | null; error: Failure | null } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    latestLoad.current = load
  })

  useEffect(() => {
    if (key === null) return
    let ignore = false
    void latestLoad.current().then((result) => {
      if (ignore) return
      setState((previous) => {
        if (result.ok) return { key, data: result.data, error: null }
        return { key, data: previous?.key === key ? previous.data : null, error: result.error }
      })
    })
    return () => {
      ignore = true
    }
  }, [key, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  useAutoRefresh(key !== null && refreshMs > 0 ? reload : null, refreshMs)

  const current = state?.key === key ? state : null
  return { data: current?.data ?? null, error: current?.error ?? null, reload }
}
