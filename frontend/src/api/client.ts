/**
 * Talks to the Nest API on origin/feat/backend.
 * A demo stand-in is used only when that API cannot be reached, or for
 * screens the API does not implement. Demo results are always marked
 * origin: 'demo' and must not be described as saved on the server.
 *
 * Live endpoints used:
 *   POST /api/families            { name }
 *   GET  /api/families/:code
 *   GET  /api/families/:code/progress
 *   POST /api/children            { familyCode, age, language, nickname? }
 *   POST /api/missions            { childId, count?, cameraAvailable?, space? }
 *   POST /api/missions/complete   { childId, missionId, verifiedBy, result?, completedAt? }
 *   POST /api/games/result        { childId, game: 'catch-the-stars', result }
 *   GET  /api/progress?childId=   totals and streak
 *
 * The grown-up PIN is never sent: see ./pin.ts.
 */
import { normalizeFamilyCode } from '../lib/familyCode'
import { pickMissions, scoreToPoints } from '../mocks/fallbackMissions'
import type { AccountFailure, AccountResult, ChildRecord, FamilyRecord } from '../types/account'
import type {
  AppLanguage,
  CatchStarsResult,
  GenerateMissionsResult,
  Mission,
  MissionSource,
  Progress,
} from '../types/mission'
import {
  addisDay,
  demoPointsToday,
  findDemoFamily,
  isLanguage,
  newDemoCode,
  readDemo,
  updateDemo,
  type DemoNote,
} from './demoStore'
import { request } from './http'
import { isValidPin, savePin } from './pin'

export type { DemoCompletion, DemoNote, DemoPlay } from './demoStore'

const SERVER_KEY = 'lelije.serverCache.v1'

export interface CompletionOutcome {
  awarded: number
  status: 'server_awarded' | 'already' | 'demo_pending' | 'save_failed'
  origin: 'server' | 'demo'
  pointsToday: number
}

export interface GameOutcome {
  awarded: number
  status: 'server_awarded' | 'already' | 'not_saved' | 'demo_only' | 'save_failed'
  origin: 'server' | 'demo'
  pointsToday: number
}

export interface FamilyChildProgress extends Progress {
  childId: string
  nickname: string | null
}

interface ServerCache {
  [childId: string]: { day: string; pointsToday: number; completed: string[]; dailyCap: number | null }
}

function readCache(): ServerCache {
  try {
    return JSON.parse(localStorage.getItem(SERVER_KEY) ?? '{}') as ServerCache
  } catch {
    return {}
  }
}

function writeCache(cache: ServerCache) {
  try {
    localStorage.setItem(SERVER_KEY, JSON.stringify(cache))
  } catch {
    // Ignore blocked storage.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMission(value: unknown): value is Mission {
  if (!isRecord(value)) return false
  const { id, title, description, points, durationMin, verification, goal } = value
  if (typeof id !== 'string' || typeof title !== 'string') return false
  if (typeof description !== 'string' || typeof points !== 'number') return false
  if (typeof durationMin !== 'number') return false
  if (verification === 'self') return true
  if (verification !== 'pose' || !isRecord(goal)) return false
  return (
    (goal.detector === 'jump' || goal.detector === 'armsUp') &&
    typeof goal.count === 'number' &&
    goal.count > 0
  )
}

function asFamily(body: unknown): { family: FamilyRecord; children: ChildRecord[] } | null {
  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.code !== 'string') return null
  if (typeof body.name !== 'string') return null
  const children = Array.isArray(body.children) ? body.children.flatMap(asChild) : []
  return { family: { id: body.id, name: body.name, code: body.code }, children }
}

function asChild(value: unknown): ChildRecord[] {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.familyId !== 'string') {
    return []
  }
  if (typeof value.age !== 'number') return []
  return [
    {
      id: value.id,
      familyId: value.familyId,
      age: value.age,
      language: isLanguage(value.language) ? value.language : 'en',
      nickname: typeof value.nickname === 'string' ? value.nickname : null,
    },
  ]
}

function note(dbNotes: DemoNote[], item: Omit<DemoNote, 'id' | 'at' | 'read'>) {
  dbNotes.unshift({ ...item, id: `n_${Date.now()}`, at: new Date().toISOString(), read: false })
}

/* ---------- accounts ---------- */

export async function createFamily(
  name: string,
  pin: string,
): Promise<AccountResult<{ family: FamilyRecord; children: ChildRecord[] }> | AccountFailure> {
  const trimmed = name.trim()
  if (!trimmed || !isValidPin(pin)) return { ok: false, error: 'invalid' }
  // The PIN stays on this device; the server only receives the family name.
  const res = await request('/api/families', {
    method: 'POST',
    body: JSON.stringify({ name: trimmed.slice(0, 40) }),
  })
  if (res.ok) {
    const parsed = asFamily(res.body)
    if (!parsed) return { ok: false, error: 'unavailable' }
    await savePin(parsed.family.code, pin)
    return { ok: true, origin: 'server', data: parsed }
  }
  if (!res.ok && res.kind === 'http' && res.status < 500) {
    return { ok: false, error: res.status === 400 ? 'invalid' : 'unavailable' }
  }

  const family: FamilyRecord = {
    id: `demo_${Date.now()}`,
    name: trimmed.slice(0, 40),
    code: newDemoCode(),
  }
  updateDemo((db) => {
    db.families.push({ ...family, children: [] })
  })
  await savePin(family.code, pin)
  return { ok: true, origin: 'demo', data: { family, children: [] } }
}

export async function lookupFamily(
  code: string,
): Promise<AccountResult<{ family: FamilyRecord; children: ChildRecord[] }> | AccountFailure> {
  const normalized = normalizeFamilyCode(code)
  if (normalized === 'DEMO-EXPIRED') return { ok: false, error: 'expired_demo' }
  if (normalized === 'DEMO-USED') return { ok: false, error: 'used_demo' }
  if (!normalized) return { ok: false, error: 'invalid' }

  const res = await request(`/api/families/${encodeURIComponent(normalized)}`)
  if (res.ok) {
    const parsed = asFamily(res.body)
    if (!parsed) return { ok: false, error: 'unavailable' }
    return { ok: true, origin: 'server', data: parsed }
  }
  if (!res.ok && res.status === 404) {
    const saved = findDemoFamily(normalized)
    if (saved) {
      return {
        ok: true,
        origin: 'demo',
        data: {
          family: { id: saved.id, name: saved.name, code: saved.code },
          children: saved.children,
        },
      }
    }
    return { ok: false, error: 'not_found' }
  }
  if (!res.ok && res.kind === 'http' && res.status < 500) {
    return { ok: false, error: 'unavailable' }
  }

  const demo = findDemoFamily(normalized)
  if (!demo) return { ok: false, error: 'network' }
  return {
    ok: true,
    origin: 'demo',
    data: { family: { id: demo.id, name: demo.name, code: demo.code }, children: demo.children },
  }
}

/** On-device family for the pitch. Never calls the server. */
export function startDemoFamily(language: AppLanguage): {
  family: FamilyRecord
  child: ChildRecord
} {
  const family: FamilyRecord = {
    id: `demo_${Date.now()}`,
    name: 'Demo family',
    code: newDemoCode(),
  }
  const child: ChildRecord = {
    id: `demo_c_${Date.now()}`,
    familyId: family.id,
    age: 8,
    language,
    nickname: null,
  }
  updateDemo((db) => {
    db.families.push({ ...family, children: [{ ...child, familyCode: family.code }] })
  })
  return { family, child }
}

export async function addChild(input: {
  familyCode: string
  age: number
  language: AppLanguage
  nickname: string
  origin: 'server' | 'demo'
}): Promise<AccountResult<ChildRecord> | AccountFailure> {
  const nickname = input.nickname.trim().slice(0, 20)
  const age = Math.round(input.age)
  if (age < 5 || age > 13) return { ok: false, error: 'invalid' }

  if (input.origin === 'server') {
    const res = await request('/api/children', {
      method: 'POST',
      body: JSON.stringify({
        familyCode: input.familyCode,
        age,
        language: input.language,
        nickname: nickname || null,
      }),
    })
    if (res.ok) {
      const child = asChild(res.body)[0]
      if (!child) return { ok: false, error: 'unavailable' }
      return { ok: true, origin: 'server', data: child }
    }
    if (res.kind === 'network') return { ok: false, error: 'network' }
    return { ok: false, error: res.status === 400 ? 'invalid' : 'not_found' }
  }

  const family = findDemoFamily(input.familyCode)
  if (!family) return { ok: false, error: 'not_found' }
  const child: ChildRecord = {
    id: `demo_c_${Date.now()}`,
    familyId: family.id,
    age,
    language: input.language,
    nickname: nickname || null,
  }
  updateDemo((db) => {
    const row = db.families.find((item) => item.code === input.familyCode)
    row?.children.push({ ...child, familyCode: input.familyCode })
  })
  return { ok: true, origin: 'demo', data: child }
}

/* ---------- missions and points ---------- */

export function progressFor(childId: string, origin: 'server' | 'demo'): Progress {
  const day = addisDay()
  if (origin === 'demo') {
    const done = readDemo().completions.filter(
      (item) => item.childId === childId && item.day === day && item.status === 'approved',
    )
    const pointsToday = done.reduce((sum, item) => sum + item.points, 0)
    return {
      totalPoints: pointsToday,
      pointsToday,
      todayCompleted: done.map((item) => item.missionId),
      pendingIds: readDemo()
        .completions.filter(
          (item) => item.childId === childId && item.day === day && item.status === 'pending',
        )
        .map((item) => item.missionId),
      streak: null,
      dailyCap: null,
      origin: 'demo',
    }
  }
  const cached = readCache()[childId]
  if (!cached || cached.day !== day) {
    return {
      totalPoints: 0,
      pointsToday: 0,
      todayCompleted: [],
      pendingIds: [],
      streak: null,
      dailyCap: null,
      origin: 'unknown',
    }
  }
  return {
    totalPoints: cached.pointsToday,
    pointsToday: cached.pointsToday,
    todayCompleted: cached.completed,
    pendingIds: [],
    streak: null,
    dailyCap: cached.dailyCap,
    origin: 'server',
  }
}

function parseServerProgress(body: unknown): Progress | null {
  if (!isRecord(body) || typeof body.pointsToday !== 'number') return null
  const today = isRecord(body.today) ? body.today : null
  const completed = Array.isArray(today?.missionsCompleted) ? today.missionsCompleted : []
  return {
    totalPoints: typeof body.totalPoints === 'number' ? body.totalPoints : body.pointsToday,
    pointsToday: body.pointsToday,
    todayCompleted: completed.flatMap((row) =>
      isRecord(row) && typeof row.missionId === 'string' ? [row.missionId] : [],
    ),
    pendingIds: [],
    streak: typeof body.streak === 'number' ? body.streak : null,
    dailyCap: typeof body.dailyCap === 'number' ? body.dailyCap : null,
    origin: 'server',
  }
}

/** GET /api/progress?childId= — server totals. Demo stays on this device. */
export async function loadProgress(childId: string, origin: 'server' | 'demo'): Promise<Progress> {
  if (origin === 'demo') return progressFor(childId, 'demo')
  const res = await request(`/api/progress?childId=${encodeURIComponent(childId)}`)
  if (res.ok) {
    const parsed = parseServerProgress(res.body)
    if (parsed) return parsed
  }
  return progressFor(childId, 'server')
}

/** GET /api/families/:code/progress */
export async function loadFamilyProgress(code: string): Promise<FamilyChildProgress[] | null> {
  const res = await request(`/api/families/${encodeURIComponent(code)}/progress`)
  if (!res.ok || !isRecord(res.body) || !Array.isArray(res.body.children)) return null
  return res.body.children.flatMap((row) => {
    const parsed = parseServerProgress(row)
    if (!parsed || !isRecord(row) || typeof row.childId !== 'string') return []
    return [
      {
        ...parsed,
        childId: row.childId,
        nickname: typeof row.nickname === 'string' ? row.nickname : null,
      },
    ]
  })
}

export async function fetchTodaysMissions(input: {
  childId: string
  age: number
  language: AppLanguage
  cameraAvailable: boolean
  origin: 'server' | 'demo'
  force?: boolean
}): Promise<GenerateMissionsResult & { origin: 'server' | 'demo' }> {
  const day = addisDay()
  if (input.origin === 'demo' && !input.force) {
    const saved = readDemo().missions[input.childId]
    if (saved && saved.day === day && saved.missions.length) {
      return { missions: saved.missions, source: 'fallback', warnings: ['demo'], origin: 'demo' }
    }
  }

  if (input.origin === 'server') {
    const res = await request(
      '/api/missions',
      {
        method: 'POST',
        body: JSON.stringify({
          childId: input.childId,
          count: 3,
          cameraAvailable: input.cameraAvailable,
          space: 'small-indoor',
        }),
      },
      10_000,
    )
    if (res.ok && isRecord(res.body) && Array.isArray(res.body.missions)) {
      const missions = res.body.missions.filter(isMission)
      if (missions.length) {
        const source: MissionSource =
          res.body.source === 'ai' || res.body.source === 'mixed' ? res.body.source : 'fallback'
        return { missions, source, warnings: [], origin: 'server' }
      }
    }
  }

  const missions = pickMissions(input.language, input.age, 3, input.cameraAvailable, day)
  if (input.origin === 'demo') {
    updateDemo((db) => {
      db.missions[input.childId] = { day, missions }
    })
  }
  return {
    missions,
    source: 'fallback',
    warnings: [input.origin === 'server' ? 'api_unavailable' : 'demo'],
    origin: 'demo',
  }
}

export async function completeMission(input: {
  childId: string
  familyCode: string
  mission: Mission
  verifiedBy: 'pose' | 'self'
  result?: { count: number; durationMs: number }
  origin: 'server' | 'demo'
}): Promise<CompletionOutcome> {
  const day = addisDay()
  if (input.origin === 'demo') {
    let awarded = 0
    let status: CompletionOutcome['status'] = 'demo_pending'
    updateDemo((db) => {
      const existing = db.completions.find(
        (item) =>
          item.childId === input.childId && item.missionId === input.mission.id && item.day === day,
      )
      if (existing) {
        status = existing.status === 'approved' ? 'already' : 'demo_pending'
        return
      }
      db.completions.unshift({
        id: `cmp_${Date.now()}`,
        childId: input.childId,
        familyCode: input.familyCode,
        missionId: input.mission.id,
        title: input.mission.title,
        points: input.mission.points,
        day,
        status: 'pending',
        verifiedBy: input.verifiedBy,
      })
      note(db.notes, {
        familyCode: input.familyCode,
        audience: 'parent',
        kind: 'mission_pending',
      })
    })
    return {
      awarded,
      status,
      origin: 'demo',
      pointsToday: demoPointsToday(input.childId, day),
    }
  }

  const res = await request('/api/missions/complete', {
    method: 'POST',
    body: JSON.stringify({
      childId: input.childId,
      missionId: input.mission.id,
      verifiedBy: input.verifiedBy,
      result: input.result,
      completedAt: new Date().toISOString(),
    }),
  })
  if (!res.ok || !isRecord(res.body) || typeof res.body.pointsAwarded !== 'number') {
    return { awarded: 0, status: 'save_failed', origin: 'server', pointsToday: 0 }
  }
  const awarded = res.body.pointsAwarded
  const pointsToday = typeof res.body.pointsToday === 'number' ? res.body.pointsToday : awarded
  const already = res.body.alreadyCompleted === true
  const cache = readCache()
  const previous = cache[input.childId]
  const completed = new Set(previous?.day === day ? previous.completed : [])
  completed.add(input.mission.id)
  cache[input.childId] = {
    day,
    pointsToday,
    completed: [...completed],
    dailyCap: typeof res.body.dailyCap === 'number' ? res.body.dailyCap : null,
  }
  writeCache(cache)
  return {
    awarded: already ? 0 : awarded,
    status: already ? 'already' : 'server_awarded',
    origin: 'server',
    pointsToday,
  }
}

export async function postGameResult(input: {
  childId: string
  result: CatchStarsResult
  origin: 'server' | 'demo'
}): Promise<GameOutcome> {
  if (input.origin === 'demo') {
    const awarded = scoreToPoints(input.result.score)
    return {
      awarded,
      status: 'demo_only',
      origin: 'demo',
      pointsToday: demoPointsToday(input.childId),
    }
  }
  const res = await request('/api/games/result', {
    method: 'POST',
    body: JSON.stringify({
      childId: input.childId,
      game: 'catch-the-stars',
      result: input.result,
    }),
  })
  if (res.ok && isRecord(res.body) && typeof res.body.pointsAwarded === 'number') {
    const already = res.body.alreadyRecorded === true
    return {
      awarded: already ? 0 : res.body.pointsAwarded,
      status: already ? 'already' : 'server_awarded',
      origin: 'server',
      pointsToday: typeof res.body.pointsToday === 'number' ? res.body.pointsToday : res.body.pointsAwarded,
    }
  }
  if (!res.ok && res.kind === 'network') {
    return { awarded: 0, status: 'save_failed', origin: 'server', pointsToday: 0 }
  }
  return { awarded: 0, status: 'not_saved', origin: 'server', pointsToday: 0 }
}

export function listPending(familyCode: string) {
  return readDemo().completions.filter(
    (item) => item.familyCode === familyCode && item.status === 'pending',
  )
}

export function reviewDemoMission(id: string, decision: 'approved' | 'rejected') {
  updateDemo((db) => {
    const item = db.completions.find((row) => row.id === id && row.status === 'pending')
    if (!item) return
    item.status = decision
    note(db.notes, {
      familyCode: item.familyCode,
      audience: 'child',
      kind: decision === 'approved' ? 'mission_approved' : 'mission_rejected',
    })
  })
}

export function listActivity(familyCode: string) {
  return readDemo().completions.filter((item) => item.familyCode === familyCode)
}

export function playRequests(familyCode: string) {
  return readDemo().play.filter((item) => item.familyCode === familyCode)
}

export function sendPlayRequest(input: { familyCode: string; childId: string; childName: string }) {
  updateDemo((db) => {
    db.play = db.play.filter((item) => item.childId !== input.childId || item.status !== 'sent')
    db.play.unshift({
      id: `play_${Date.now()}`,
      familyCode: input.familyCode,
      childId: input.childId,
      childName: input.childName,
      status: 'sent',
      at: new Date().toISOString(),
    })
    note(db.notes, { familyCode: input.familyCode, audience: 'child', kind: 'play_sent' })
  })
}

export function answerPlay(id: string, status: 'allowed' | 'later' | 'declined') {
  updateDemo((db) => {
    const item = db.play.find((row) => row.id === id)
    if (!item) return
    item.status = status
    note(db.notes, { familyCode: item.familyCode, audience: 'child', kind: 'play_answered' })
  })
}

export function notesFor(familyCode: string, audience: 'parent' | 'child') {
  return readDemo().notes.filter((item) => item.familyCode === familyCode && item.audience === audience)
}

export function markNotesRead(familyCode: string, audience: 'parent' | 'child') {
  updateDemo((db) => {
    for (const item of db.notes) {
      if (item.familyCode === familyCode && item.audience === audience) item.read = true
    }
  })
}
