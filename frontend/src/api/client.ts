/**
 * Every call the app makes to the Nest API. The routes and their rules are in
 * backend/README.md; the response shapes are in ../types/api.ts.
 */
import { addisDay } from '../lib/time'
import type { ChildRecord, FamilyRecord, FamilyWithChildren } from '../types/account'
import type {
  ActivityCatalogItem,
  ActivityId,
  ActivityResult,
} from '../lib/pose/types'
import type {
  ActivityItem,
  Audience,
  ChildReport,
  CompletionSaved,
  GameSaved,
  NotificationItem,
  PlayAnswer,
  PlayRequest,
  PoseResult,
  Progress,
  Review,
  ReviewSaved,
  StoryChapter,
  StoryCompleted,
  StoryRegion,
  Verified,
  WeeklySummary,
} from '../types/api'
import type { AppLanguage, CatchStarsResult, Mission } from '../types/mission'
import { demoStore } from './demoStore'
import { get, getAuthToken, mapResult, post, setAuthToken, type Result } from './http'

const API_OFF = import.meta.env.VITE_API === 'off'
const path = encodeURIComponent

function toChild({ id, familyId, age, language, nickname }: ChildRecord): ChildRecord {
  return { id, familyId, age, language, nickname }
}

function toFamily(body: FamilyRecord & { children?: ChildRecord[] }): FamilyWithChildren {
  const { id, name, code, hasPin, children = [] } = body
  return { family: { id, name, code, hasPin }, children: children.map(toChild) }
}

/* ---------- authentication, family and PIN ---------- */

export async function createFamily(name: string, pin: string): Promise<Result<FamilyWithChildren>> {
  if (API_OFF) return demoStore.createFamily(name, pin)
  const res = await post<FamilyRecord & { token?: string }>('/api/families', { name, pin })
  if (res.ok && res.data.token) setAuthToken(res.data.token)
  return mapResult(res, toFamily)
}

export async function parentLogin(
  familyCode: string,
  pin: string,
): Promise<Result<FamilyWithChildren>> {
  if (API_OFF) {
    const check = await demoStore.checkFamilyPin(familyCode, pin)
    if (!check.ok) return check
    return demoStore.findFamily(familyCode)
  }
  const res = await post<{
    token: string
    role: 'parent'
    family: FamilyRecord
    children: ChildRecord[]
  }>('/api/auth/parent-login', { familyCode, pin })
  if (!res.ok) return res
  setAuthToken(res.data.token)
  return {
    ok: true,
    data: {
      family: {
        id: res.data.family.id,
        name: res.data.family.name,
        code: res.data.family.code,
        hasPin: res.data.family.hasPin,
      },
      children: res.data.children.map(toChild),
    },
  }
}

export async function childLogin(
  familyCode: string,
  childId: string,
): Promise<Result<{ family: FamilyRecord; child: ChildRecord }>> {
  if (API_OFF) {
    const found = await demoStore.findFamily(familyCode)
    if (!found.ok) return found
    const child = found.data.children.find((item) => item.id === childId)
    if (!child) return { ok: false, error: 'not_found' }
    return { ok: true, data: { family: found.data.family, child } }
  }
  const res = await post<{
    token: string
    role: 'child'
    family: FamilyRecord
    child: ChildRecord
  }>('/api/auth/child-login', { familyCode, childId })
  if (!res.ok) return res
  setAuthToken(res.data.token)
  return {
    ok: true,
    data: {
      family: {
        id: res.data.family.id,
        name: res.data.family.name,
        code: res.data.family.code,
        hasPin: res.data.family.hasPin,
      },
      child: toChild(res.data.child),
    },
  }
}

export async function fetchMe() {
  if (API_OFF || !getAuthToken()) return null
  return get<{
    role: 'parent' | 'child'
    family: FamilyRecord
    child: ChildRecord | null
  }>('/api/auth/me')
}

export async function logout(): Promise<void> {
  const token = getAuthToken()
  if (!API_OFF && token) {
    await post<{ ok: true }>('/api/auth/logout', {}).catch(() => undefined)
  }
  setAuthToken(null)
}

export async function findFamily(code: string): Promise<Result<FamilyWithChildren>> {
  if (API_OFF) return demoStore.findFamily(code)
  return mapResult(await get<FamilyRecord>(`/api/families/${path(code)}`), toFamily)
}

/** Sets the first PIN, or changes it when the current PIN is sent too. */
export function setFamilyPin(code: string, pin: string, currentPin?: string) {
  if (API_OFF) return demoStore.setFamilyPin(code, pin, currentPin)
  return post<{ hasPin: true }>(`/api/families/${path(code)}/pin`, { pin, currentPin })
}

export function checkFamilyPin(code: string, pin: string) {
  if (API_OFF) return demoStore.checkFamilyPin(code, pin)
  return post<{ ok: true }>(`/api/families/${path(code)}/pin/check`, { pin })
}

export async function addChild(input: {
  familyCode: string
  age: number
  language: AppLanguage
  nickname: string
}): Promise<Result<ChildRecord>> {
  if (API_OFF) return demoStore.addChild(input)
  const nickname = input.nickname.trim() || null
  return mapResult(await post<ChildRecord>('/api/children', { ...input, nickname }), toChild)
}

/* ---------- missions, points and the game ---------- */

const MISSIONS_KEY = 'lelije.missions.v1'

type MissionCache = Record<string, { day: string; missions: Mission[] }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The AI mission module does not guarantee Contract B; drop anything the screens cannot show. */
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

function readMissionCache(): MissionCache {
  try {
    return JSON.parse(localStorage.getItem(MISSIONS_KEY) ?? '{}') as MissionCache
  } catch {
    return {}
  }
}

function rememberMissions(childId: string, missions: Mission[]) {
  const day = addisDay()
  const cache = Object.fromEntries(
    Object.entries(readMissionCache()).filter(([, entry]) => entry.day === day),
  )
  cache[childId] = { day, missions }
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify(cache))
  } catch {
    // Storage blocked: today's list just is not available offline.
  }
}

export interface TodaysMissions {
  missions: Mission[]
  /** The server could not be reached; this is the copy saved on this device earlier today. */
  offline: boolean
}

export async function todaysMissions(childId: string, cameraAvailable: boolean): Promise<Result<TodaysMissions>> {
  if (API_OFF) return demoStore.todaysMissions(childId, cameraAvailable)
  const res = await post<{ missions?: unknown[] }>('/api/missions', {
    childId,
    count: 3,
    cameraAvailable,
    space: 'small-indoor',
  })
  if (res.ok) {
    const missions = (res.data.missions ?? []).filter(isMission)
    if (missions.length === 0) return { ok: false, error: 'server' }
    rememberMissions(childId, missions)
    return { ok: true, data: { missions, offline: false } }
  }
  const saved = readMissionCache()[childId]
  if (res.error === 'network' && saved?.day === addisDay()) {
    return { ok: true, data: { missions: saved.missions, offline: true } }
  }
  return res
}

export function completeMission(input: {
  childId: string
  missionId: string
  verifiedBy: Verified
  result?: PoseResult
}) {
  if (API_OFF) return demoStore.completeMission(input)
  return post<CompletionSaved>('/api/missions/complete', {
    ...input,
    completedAt: new Date().toISOString(),
  })
}

export function childProgress(childId: string) {
  if (API_OFF) return demoStore.childProgress(childId)
  return get<Progress>(`/api/progress?childId=${path(childId)}`)
}

export async function familyProgress(code: string): Promise<Result<Progress[]>> {
  if (API_OFF) return demoStore.familyProgress(code)
  const res = await get<{ children: Progress[] }>(`/api/families/${path(code)}/progress`)
  return mapResult(res, (body) => body.children)
}

export function saveGame(childId: string, result: CatchStarsResult) {
  if (API_OFF) return demoStore.saveGame(childId, result)
  return post<GameSaved>('/api/games/result', { childId, game: 'catch-the-stars', result })
}

/* ---------- parent approval and play time ---------- */

export function pendingReviews(code: string) {
  if (API_OFF) return demoStore.pendingReviews(code)
  return get<Review[]>(`/api/families/${path(code)}/reviews`)
}

export function reviewMission(
  id: string,
  input: { familyCode: string; pin: string; decision: 'approve' | 'reject' },
) {
  if (API_OFF) return demoStore.reviewMission(id, input)
  return post<ReviewSaved>(`/api/completions/${path(id)}/review`, input)
}

export function askForPlay(childId: string) {
  if (API_OFF) return demoStore.askForPlay(childId)
  return post<PlayRequest & { alreadyAsked: boolean }>('/api/play-requests', { childId })
}

export function playRequests(code: string) {
  if (API_OFF) return demoStore.playRequests(code)
  return get<PlayRequest[]>(`/api/families/${path(code)}/play-requests`)
}

export function answerPlay(id: string, input: { familyCode: string; pin: string; answer: PlayAnswer }) {
  if (API_OFF) return demoStore.answerPlay(id, input)
  return post<PlayRequest & { alreadyAnswered: boolean }>(`/api/play-requests/${path(id)}/answer`, input)
}

/* ---------- notifications and reports ---------- */

export function notifications(code: string, who: Audience) {
  if (API_OFF) return demoStore.notifications(code, who)
  const query = new URLSearchParams(who).toString()
  return get<{ unread: number; notifications: NotificationItem[] }>(
    `/api/families/${path(code)}/notifications?${query}`,
  )
}

export function markNotificationsRead(code: string, who: Audience) {
  if (API_OFF) return demoStore.markNotificationsRead(code, who)
  return post<{ marked: number }>(`/api/families/${path(code)}/notifications/read`, who)
}

export async function activity(code: string, days = 7): Promise<Result<ActivityItem[]>> {
  if (API_OFF) return demoStore.activity(code, days)
  const res = await get<{ items: ActivityItem[] }>(`/api/families/${path(code)}/activity?days=${days}`)
  return mapResult(res, (body) => body.items)
}

export async function activityCatalog(): Promise<Result<ActivityCatalogItem[]>> {
  const res = await get<{ activities: ActivityCatalogItem[] }>('/api/games/catalog')
  return mapResult(res, (body) => body.activities)
}

export function saveActivityResult(childId: string, game: ActivityId, result: ActivityResult) {
  if (API_OFF) {
    return demoStore.saveGame(childId, {
      score: result.score,
      starsCaught: result.reps,
      goldenCaught: 0,
      jumps: result.reps,
      armsUp: 0,
      durationMs: Math.round(result.duration_sec * 1000),
    })
  }
  return post<GameSaved>('/api/games/result', { childId, game, result })
}

export type BrainGameId = 'brain_memory' | 'brain_math' | 'brain_explorer'

export function saveBrainGameResult(
  childId: string,
  game: BrainGameId,
  result: { score: number; reps: number; target: number; duration_sec: number; points: number },
) {
  if (API_OFF) {
    return demoStore.saveGame(childId, {
      score: result.score,
      starsCaught: result.reps,
      goldenCaught: 0,
      jumps: 0,
      armsUp: 0,
      durationMs: Math.round(result.duration_sec * 1000),
    })
  }
  return post<GameSaved>('/api/games/result', {
    childId,
    game,
    result: {
      ...result,
      completed: true,
      input_mode: 'keyboard',
    },
  })
}

export function generateStory(input: {
  childId?: string
  language: AppLanguage
  region: StoryRegion
  chapter: 1 | 2 | 3
  maxChapters?: 2 | 3
  choiceIndex?: 0 | 1
  previousChoice?: string | null
  previousText?: string | null
  companionName?: string
  theme?: string | null
}) {
  return post<StoryChapter>('/api/ai/story', input)
}

export function completeStory(input: {
  childId: string
  region: StoryRegion
  companionName?: string
}) {
  return post<StoryCompleted>('/api/ai/story/complete', input)
}

export function generateWeeklySummary(input: {
  familyCode: string
  childId: string
  language: AppLanguage
}) {
  return post<WeeklySummary>('/api/ai/summary', input)
}

export async function report(code: string, days = 7): Promise<Result<ChildReport[]>> {
  if (API_OFF) return demoStore.report(code, days)
  const res = await get<{ children: ChildReport[] }>(`/api/families/${path(code)}/report?days=${days}`)
  return mapResult(res, (body) => body.children)
}
