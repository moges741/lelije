const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

/** Why a request failed, in the terms the screens care about. */
export type Failure =
  /** No answer: offline, the API is down, or it took too long. */
  | 'network'
  | 'invalid'
  /** A parent action with a wrong PIN, or a family with no PIN yet. */
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  /** Five wrong PINs, or too many new mission lists in an hour. */
  | 'too_many'
  | 'server'

export type Result<T> = { ok: true; data: T } | { ok: false; error: Failure }

function failureFor(status: number): Failure {
  if (status === 400) return 'invalid'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'too_many'
  return 'server'
}

async function request<T>(path: string, body?: unknown, timeoutMs = 10_000): Promise<Result<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(API_BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, error: failureFor(res.status) }
    const data = (await res.json().catch(() => undefined)) as T | undefined
    return data === undefined ? { ok: false, error: 'server' } : { ok: true, data }
  } catch {
    return { ok: false, error: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export function get<T>(path: string): Promise<Result<T>> {
  return request<T>(path)
}

export function post<T>(path: string, body: unknown): Promise<Result<T>> {
  return request<T>(path, body)
}

export function mapResult<T, U>(result: Result<T>, map: (data: T) => U): Result<U> {
  return result.ok ? { ok: true, data: map(result.data) } : result
}
