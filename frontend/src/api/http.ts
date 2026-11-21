const API_BASE: string = import.meta.env.VITE_API_BASE ?? ''

export type HttpResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: 'network' | 'http'; status: number; body: unknown }

/** Distinguishes "server said no" from "server never answered". */
export async function request(
  path: string,
  init?: RequestInit,
  timeoutMs = 8000,
): Promise<HttpResult> {
  if (import.meta.env.VITE_API === 'off') {
    return { ok: false, kind: 'network', status: 0, body: null }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(API_BASE + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    })
    const isJson = res.headers.get('content-type')?.includes('application/json')
    const body = isJson ? ((await res.json()) as unknown) : null
    if (!res.ok) return { ok: false, kind: 'http', status: res.status, body }
    return { ok: true, status: res.status, body }
  } catch {
    return { ok: false, kind: 'network', status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}
