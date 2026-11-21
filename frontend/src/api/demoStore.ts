/**
 * On-device storage used ONLY when VITE_API=off.
 * Allows opening and testing all screens without running Postgres or the Nest API.
 * In normal mode (VITE_API on), this file is never invoked.
 */
import { addisDay } from '../lib/time'
import type { ChildRecord, FamilyRecord, FamilyWithChildren } from '../types/account'
import type {
  ActivityItem,
  Audience,
  ChildReport,
  CompletionSaved,
  CompletionStatus,
  GameSaved,
  NotificationItem,
  NotificationKind,
  PlayAnswer,
  PlayRequest,
  PlayStatus,
  Progress,
  Review,
  ReviewSaved,
  Verified,
} from '../types/api'
import type { AppLanguage, CatchStarsResult, Mission } from '../types/mission'
import type { Result } from './http'

export const IS_API_OFF = import.meta.env.VITE_API === 'off'

const KEY = 'lelije.demo.v2'
const DAILY_CAP = 100
const MAX_PIN_FAILURES = 5
const PIN_LOCK_MS = 15 * 60 * 1000

interface StoredChild extends ChildRecord {
  familyCode: string
}

interface StoredFamily extends FamilyRecord {
  pin: string
  pinFailures: number
  pinLockedUntil: number | null
  children: StoredChild[]
}

interface StoredCompletion {
  id: string
  familyCode: string
  childId: string
  missionId: string
  title: string
  points: number
  status: CompletionStatus
  verifiedBy: Verified
  day: string
  at: string
}

interface StoredGame {
  id: string
  familyCode: string
  childId: string
  score: number
  points: number
  day: string
  at: string
}

interface StoredPlay {
  id: string
  familyCode: string
  childId: string
  nickname: string | null
  status: PlayStatus
  requestedAt: string
  answeredAt: string | null
}

interface StoredNote {
  id: string
  familyCode: string
  audience: 'parent' | 'child'
  childId: string
  nickname: string | null
  kind: NotificationKind
  read: boolean
  at: string
}

interface DemoState {
  families: StoredFamily[]
  completions: StoredCompletion[]
  games: StoredGame[]
  play: StoredPlay[]
  notes: StoredNote[]
}

function initial(): DemoState {
  return {
    families: [],
    completions: [],
    games: [],
    play: [],
    notes: [],
  }
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial()
    return { ...initial(), ...(JSON.parse(raw) as Partial<DemoState>) }
  } catch {
    return initial()
  }
}

function save(state: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage quota or blocked
  }
}

function update<T>(fn: (state: DemoState) => T): T {
  const state = load()
  const result = fn(state)
  save(state)
  return result
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function randomCode(): string {
  let code = 'LJ-'
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return code
}

function verifyPin(family: StoredFamily, pin: string): Result<true> {
  const now = Date.now()
  if (family.pinLockedUntil && family.pinLockedUntil > now) {
    return { ok: false, error: 'too_many' }
  }
  if (family.pinLockedUntil && family.pinLockedUntil <= now) {
    family.pinFailures = 0
    family.pinLockedUntil = null
  }

  family.pinFailures += 1
  if (family.pinFailures > MAX_PIN_FAILURES) {
    family.pinLockedUntil = now + PIN_LOCK_MS
    return { ok: false, error: 'too_many' }
  }

  if (family.pin === pin) {
    family.pinFailures = 0
    family.pinLockedUntil = null
    return { ok: true, data: true }
  }

  if (family.pinFailures >= MAX_PIN_FAILURES) {
    family.pinLockedUntil = now + PIN_LOCK_MS
    return { ok: false, error: 'too_many' }
  }
  return { ok: false, error: 'forbidden' }
}

function toFamilyWithChildren(family: StoredFamily): FamilyWithChildren {
  return {
    family: { id: family.id, name: family.name, code: family.code, hasPin: Boolean(family.pin) },
    children: family.children.map(({ id, familyId, age, language, nickname }) => ({
      id,
      familyId,
      age,
      language,
      nickname,
    })),
  }
}

function findFamilyByCode(state: DemoState, code: string): StoredFamily | null {
  const norm = code.trim().toUpperCase()
  return state.families.find((f) => f.code.toUpperCase() === norm) ?? null
}

function findChild(state: DemoState, childId: string): { child: StoredChild; family: StoredFamily } | null {
  for (const family of state.families) {
    const child = family.children.find((c) => c.id === childId)
    if (child) return { child, family }
  }
  return null
}

function getPointsToday(state: DemoState, childId: string, day: string): number {
  const missionPts = state.completions
    .filter((c) => c.childId === childId && c.day === day && c.status === 'approved')
    .reduce((sum, c) => sum + c.points, 0)
  const gamePts = state.games
    .filter((g) => g.childId === childId && g.day === day)
    .reduce((sum, g) => sum + g.points, 0)
  return missionPts + gamePts
}

function calculateStreak(state: DemoState, childId: string): number {
  const activeDays = new Set<string>()
  for (const c of state.completions) {
    if (c.childId === childId && c.status === 'approved') activeDays.add(c.day)
  }
  for (const g of state.games) {
    if (g.childId === childId && g.points > 0) activeDays.add(g.day)
  }

  let count = 0
  const d = new Date()
  // Check today first
  let checkDay = addisDay(d)
  if (!activeDays.has(checkDay)) {
    // If not done today, check starting from yesterday
    d.setDate(d.getDate() - 1)
    checkDay = addisDay(d)
  }

  while (activeDays.has(checkDay)) {
    count += 1
    d.setDate(d.getDate() - 1)
    checkDay = addisDay(d)
  }
  return count
}

const FALLBACK_SEEDS: Omit<Mission, 'id' | 'language'>[] = [
  {
    title: 'Star Jumps',
    description: 'Jump 10 times like you are reaching for the stars. Stay in a clear space.',
    type: 'physical',
    durationMin: 3,
    points: 15,
    verification: 'pose',
    goal: { detector: 'jump', count: 10 },
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'energy'],
  },
  {
    title: 'Sky High Arms',
    description: 'Raise both arms up high 8 times. Keep your feet on the floor.',
    type: 'physical',
    durationMin: 2,
    points: 12,
    verification: 'pose',
    goal: { detector: 'armsUp', count: 8 },
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'calm'],
  },
  {
    title: 'Water Break Hero',
    description: 'Drink a glass of water, then stretch your arms gently for one minute.',
    type: 'helper',
    durationMin: 2,
    points: 8,
    verification: 'self',
    ageMin: 5,
    ageMax: 13,
    tags: ['indoor', 'rest'],
  },
]

/* ---------- export demo store handlers ---------- */

export function demoCreateFamily(name: string, pin: string): Result<FamilyWithChildren> {
  return update((state) => {
    let code = randomCode()
    while (state.families.some((f) => f.code === code)) code = randomCode()
    const family: StoredFamily = {
      id: `fam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.slice(0, 40),
      code,
      hasPin: true,
      pin,
      pinFailures: 0,
      pinLockedUntil: null,
      children: [],
    }
    state.families.push(family)
    return { ok: true, data: toFamilyWithChildren(family) }
  })
}

export function demoFindFamily(code: string): Result<FamilyWithChildren> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }
  return { ok: true, data: toFamilyWithChildren(family) }
}

export function demoSetFamilyPin(code: string, pin: string, currentPin?: string): Result<{ hasPin: true }> {
  return update((state) => {
    const family = findFamilyByCode(state, code)
    if (!family) return { ok: false, error: 'not_found' }
    if (family.pin && currentPin !== undefined) {
      const checked = verifyPin(family, currentPin)
      if (!checked.ok) return checked
    }
    family.pin = pin
    family.pinFailures = 0
    family.pinLockedUntil = null
    return { ok: true, data: { hasPin: true } }
  })
}

export function demoCheckFamilyPin(code: string, pin: string): Result<{ ok: true }> {
  return update((state) => {
    const family = findFamilyByCode(state, code)
    if (!family) return { ok: false, error: 'not_found' }
    const checked = verifyPin(family, pin)
    if (!checked.ok) return checked
    return { ok: true, data: { ok: true } }
  })
}

export function demoAddChild(input: {
  familyCode: string
  age: number
  language: AppLanguage
  nickname: string
}): Result<ChildRecord> {
  return update((state) => {
    const family = findFamilyByCode(state, input.familyCode)
    if (!family) return { ok: false, error: 'not_found' }
    const child: StoredChild = {
      id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyId: family.id,
      familyCode: family.code,
      age: input.age,
      language: input.language,
      nickname: input.nickname.trim() || null,
    }
    family.children.push(child)
    return {
      ok: true,
      data: {
        id: child.id,
        familyId: child.familyId,
        age: child.age,
        language: child.language,
        nickname: child.nickname,
      },
    }
  })
}

export function demoTodaysMissions(childId: string, cameraAvailable: boolean): Result<{ missions: Mission[]; offline: boolean }> {
  const state = load()
  const found = findChild(state, childId)
  const lang: AppLanguage = found?.child.language ?? 'en'
  const day = addisDay()

  const missions: Mission[] = FALLBACK_SEEDS.map((seed, idx) => ({
    ...seed,
    verification: cameraAvailable ? seed.verification : 'self',
    goal: cameraAvailable && seed.verification === 'pose' ? seed.goal : undefined,
    id: `m_${day.replaceAll('-', '')}_${idx}`,
    language: lang,
  }))
  return { ok: true, data: { missions, offline: false } }
}

export function demoCompleteMission(input: {
  childId: string
  missionId: string
  verifiedBy: Verified
}): Result<CompletionSaved> {
  return update((state) => {
    const found = findChild(state, input.childId)
    if (!found) return { ok: false, error: 'not_found' }
    const day = addisDay()
    const { child, family } = found

    const existing = state.completions.find(
      (c) => c.childId === child.id && c.missionId === input.missionId && c.day === day,
    )
    if (existing) {
      return {
        ok: true,
        data: {
          completionId: existing.id,
          status: existing.status,
          alreadyCompleted: true,
          pointsAwarded: 0,
          pointsToday: getPointsToday(state, child.id, day),
          dailyCap: DAILY_CAP,
        },
      }
    }

    const targetSeed = FALLBACK_SEEDS.find(
      (_, idx) => `m_${day.replaceAll('-', '')}_${idx}` === input.missionId,
    ) ?? FALLBACK_SEEDS[0]
    const pts = targetSeed.points
    const pointsBefore = getPointsToday(state, child.id, day)

    if (input.verifiedBy === 'pose') {
      const awarded = Math.min(pts, Math.max(0, DAILY_CAP - pointsBefore))
      const comp: StoredCompletion = {
        id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        familyCode: family.code,
        childId: child.id,
        missionId: input.missionId,
        title: targetSeed.title,
        points: awarded,
        status: 'approved',
        verifiedBy: input.verifiedBy,
        day,
        at: new Date().toISOString(),
      }
      state.completions.unshift(comp)
      state.notes.unshift({
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        familyCode: family.code,
        audience: 'child',
        childId: child.id,
        nickname: child.nickname,
        kind: 'mission_approved',
        read: false,
        at: new Date().toISOString(),
      })
      return {
        ok: true,
        data: {
          completionId: comp.id,
          status: 'approved',
          alreadyCompleted: false,
          pointsAwarded: awarded,
          pointsToday: pointsBefore + awarded,
          dailyCap: DAILY_CAP,
        },
      }
    }

    // self-verified waits for parent approval
    const comp: StoredCompletion = {
      id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      childId: child.id,
      missionId: input.missionId,
      title: targetSeed.title,
      points: pts,
      status: 'pending',
      verifiedBy: input.verifiedBy,
      day,
      at: new Date().toISOString(),
    }
    state.completions.unshift(comp)
    state.notes.unshift({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      audience: 'parent',
      childId: child.id,
      nickname: child.nickname,
      kind: 'mission_pending',
      read: false,
      at: new Date().toISOString(),
    })
    return {
      ok: true,
      data: {
        completionId: comp.id,
        status: 'pending',
        alreadyCompleted: false,
        pointsAwarded: 0,
        pointsToday: pointsBefore,
        dailyCap: DAILY_CAP,
      },
    }
  })
}

export function demoChildProgress(childId: string): Result<Progress> {
  const state = load()
  const found = findChild(state, childId)
  if (!found) return { ok: false, error: 'not_found' }
  const { child } = found
  const day = addisDay()

  const dayCompletions = state.completions.filter((c) => c.childId === child.id && c.day === day)
  const dayGame = state.games.find((g) => g.childId === child.id && g.day === day) ?? null
  const dayPlay = state.play.find((p) => p.childId === child.id) ?? null

  const totalPoints =
    state.completions
      .filter((c) => c.childId === child.id && c.status === 'approved')
      .reduce((s, c) => s + c.points, 0) +
    state.games.filter((g) => g.childId === child.id).reduce((s, g) => s + g.points, 0)

  return {
    ok: true,
    data: {
      childId: child.id,
      nickname: child.nickname,
      totalPoints,
      pointsToday: getPointsToday(state, child.id, day),
      dailyCap: DAILY_CAP,
      streak: calculateStreak(state, child.id),
      today: {
        day,
        missionsCompleted: dayCompletions
          .filter((c) => c.status === 'approved')
          .map((c) => ({ missionId: c.missionId, points: c.points })),
        missionsPending: dayCompletions
          .filter((c) => c.status === 'pending')
          .map((c) => ({ missionId: c.missionId, points: c.points })),
        missionsToRedo: dayCompletions
          .filter((c) => c.status === 'rejected')
          .map((c) => ({ missionId: c.missionId })),
        game: dayGame ? { score: dayGame.score, points: dayGame.points } : null,
        playRequest: dayPlay
          ? {
              id: dayPlay.id,
              status: dayPlay.status,
              requestedAt: dayPlay.requestedAt,
              answeredAt: dayPlay.answeredAt,
            }
          : null,
      },
    },
  }
}

export function demoFamilyProgress(code: string): Result<Progress[]> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }
  const list: Progress[] = []
  for (const child of family.children) {
    const res = demoChildProgress(child.id)
    if (res.ok) list.push(res.data)
  }
  return { ok: true, data: list }
}

export function demoSaveGame(childId: string, result: CatchStarsResult): Result<GameSaved> {
  return update((state) => {
    const found = findChild(state, childId)
    if (!found) return { ok: false, error: 'not_found' }
    const { child, family } = found
    const day = addisDay()

    const existing = state.games.find((g) => g.childId === child.id && g.day === day)
    const pointsBefore = getPointsToday(state, child.id, day)

    if (existing) {
      return {
        ok: true,
        data: {
          score: existing.score,
          alreadyRecorded: true,
          pointsAwarded: 0,
          pointsToday: pointsBefore,
          dailyCap: DAILY_CAP,
        },
      }
    }

    const calculated = Math.min(30, Math.floor(result.score / 2))
    const awarded = Math.min(calculated, Math.max(0, DAILY_CAP - pointsBefore))
    const gameRecord: StoredGame = {
      id: `game_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      childId: child.id,
      score: result.score,
      points: awarded,
      day,
      at: new Date().toISOString(),
    }
    state.games.unshift(gameRecord)
    return {
      ok: true,
      data: {
        score: result.score,
        alreadyRecorded: false,
        pointsAwarded: awarded,
        pointsToday: pointsBefore + awarded,
        dailyCap: DAILY_CAP,
      },
    }
  })
}

export function demoPendingReviews(code: string): Result<Review[]> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }
  const pending = state.completions.filter(
    (c) => c.familyCode.toUpperCase() === family.code.toUpperCase() && c.status === 'pending',
  )
  return {
    ok: true,
    data: pending.map((c) => {
      const child = family.children.find((ch) => ch.id === c.childId)
      return {
        id: c.id,
        childId: c.childId,
        nickname: child?.nickname ?? null,
        missionId: c.missionId,
        title: c.title,
        points: c.points,
        verifiedBy: c.verifiedBy,
        completedAt: c.at,
      }
    }),
  }
}

export function demoReviewMission(
  id: string,
  input: { familyCode: string; pin: string; decision: 'approve' | 'reject' },
): Result<ReviewSaved> {
  return update((state) => {
    const family = findFamilyByCode(state, input.familyCode)
    if (!family) return { ok: false, error: 'not_found' }
    const pinCheck = verifyPin(family, input.pin)
    if (!pinCheck.ok) return pinCheck

    const completion = state.completions.find((c) => c.id === id)
    if (!completion) return { ok: false, error: 'not_found' }

    if (completion.status === 'approved') {
      return {
        ok: true,
        data: {
          id: completion.id,
          status: 'approved',
          alreadyReviewed: true,
          pointsAwarded: 0,
        },
      }
    }

    if (input.decision === 'approve') {
      const pointsBefore = getPointsToday(state, completion.childId, completion.day)
      const awarded = Math.min(completion.points, Math.max(0, DAILY_CAP - pointsBefore))
      completion.status = 'approved'
      completion.points = awarded
      const child = family.children.find((c) => c.id === completion.childId)
      state.notes.unshift({
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        familyCode: family.code,
        audience: 'child',
        childId: completion.childId,
        nickname: child?.nickname ?? null,
        kind: 'mission_approved',
        read: false,
        at: new Date().toISOString(),
      })
      return {
        ok: true,
        data: {
          id: completion.id,
          status: 'approved',
          alreadyReviewed: false,
          pointsAwarded: awarded,
        },
      }
    }

    completion.status = 'rejected'
    completion.points = 0
    const child = family.children.find((c) => c.id === completion.childId)
    state.notes.unshift({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      audience: 'child',
      childId: completion.childId,
      nickname: child?.nickname ?? null,
      kind: 'mission_rejected',
      read: false,
      at: new Date().toISOString(),
    })
    return {
      ok: true,
      data: {
        id: completion.id,
        status: 'rejected',
        alreadyReviewed: false,
        pointsAwarded: 0,
      },
    }
  })
}

export function demoAskForPlay(childId: string): Result<PlayRequest & { alreadyAsked: boolean }> {
  return update((state) => {
    const found = findChild(state, childId)
    if (!found) return { ok: false, error: 'not_found' }
    const { child, family } = found

    const existing = state.play.find((p) => p.childId === child.id && p.status === 'sent')
    if (existing) {
      return {
        ok: true,
        data: {
          id: existing.id,
          childId: existing.childId,
          nickname: existing.nickname,
          status: existing.status,
          requestedAt: existing.requestedAt,
          answeredAt: existing.answeredAt,
          alreadyAsked: true,
        },
      }
    }

    const play: StoredPlay = {
      id: `play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      childId: child.id,
      nickname: child.nickname,
      status: 'sent',
      requestedAt: new Date().toISOString(),
      answeredAt: null,
    }
    state.play.unshift(play)
    state.notes.unshift({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      audience: 'parent',
      childId: child.id,
      nickname: child.nickname,
      kind: 'play_sent',
      read: false,
      at: new Date().toISOString(),
    })
    return {
      ok: true,
      data: {
        id: play.id,
        childId: play.childId,
        nickname: play.nickname,
        status: play.status,
        requestedAt: play.requestedAt,
        answeredAt: play.answeredAt,
        alreadyAsked: false,
      },
    }
  })
}

export function demoPlayRequests(code: string): Result<PlayRequest[]> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }
  const requests = state.play.filter(
    (p) => p.familyCode.toUpperCase() === family.code.toUpperCase(),
  )
  return {
    ok: true,
    data: requests.map((p) => ({
      id: p.id,
      childId: p.childId,
      nickname: p.nickname,
      status: p.status,
      requestedAt: p.requestedAt,
      answeredAt: p.answeredAt,
    })),
  }
}

export function demoAnswerPlay(
  id: string,
  input: { familyCode: string; pin: string; answer: PlayAnswer },
): Result<PlayRequest & { alreadyAnswered: boolean }> {
  return update((state) => {
    const family = findFamilyByCode(state, input.familyCode)
    if (!family) return { ok: false, error: 'not_found' }
    const pinCheck = verifyPin(family, input.pin)
    if (!pinCheck.ok) return pinCheck

    const play = state.play.find((p) => p.id === id)
    if (!play) return { ok: false, error: 'not_found' }

    if (play.status !== 'sent') {
      return {
        ok: true,
        data: {
          id: play.id,
          childId: play.childId,
          nickname: play.nickname,
          status: play.status,
          requestedAt: play.requestedAt,
          answeredAt: play.answeredAt,
          alreadyAnswered: true,
        },
      }
    }

    play.status = input.answer
    play.answeredAt = new Date().toISOString()
    state.notes.unshift({
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      familyCode: family.code,
      audience: 'child',
      childId: play.childId,
      nickname: play.nickname,
      kind: 'play_answered',
      read: false,
      at: new Date().toISOString(),
    })

    return {
      ok: true,
      data: {
        id: play.id,
        childId: play.childId,
        nickname: play.nickname,
        status: play.status,
        requestedAt: play.requestedAt,
        answeredAt: play.answeredAt,
        alreadyAnswered: false,
      },
    }
  })
}

export function demoNotifications(
  code: string,
  who: Audience,
): Result<{ unread: number; notifications: NotificationItem[] }> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }

  const matched = state.notes.filter((n) => {
    if (n.familyCode.toUpperCase() !== family.code.toUpperCase()) return false
    if (who.audience === 'parent') return n.audience === 'parent'
    return n.audience === 'child' && n.childId === who.childId
  })
  const unread = matched.filter((n) => !n.read).length
  return {
    ok: true,
    data: {
      unread,
      notifications: matched.map((n) => ({
        id: n.id,
        kind: n.kind,
        childId: n.childId,
        nickname: n.nickname,
        read: n.read,
        at: n.at,
      })),
    },
  }
}

export function demoMarkNotificationsRead(code: string, who: Audience): Result<{ marked: number }> {
  return update((state) => {
    const family = findFamilyByCode(state, code)
    if (!family) return { ok: false, error: 'not_found' }

    let marked = 0
    for (const n of state.notes) {
      if (n.familyCode.toUpperCase() === family.code.toUpperCase() && !n.read) {
        if (who.audience === 'parent' && n.audience === 'parent') {
          n.read = true
          marked += 1
        } else if (who.audience === 'child' && n.audience === 'child' && n.childId === who.childId) {
          n.read = true
          marked += 1
        }
      }
    }
    return { ok: true, data: { marked } }
  })
}

export function demoActivity(code: string, days = 7): Result<ActivityItem[]> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString()

  const missionItems: ActivityItem[] = state.completions
    .filter((c) => c.familyCode.toUpperCase() === family.code.toUpperCase() && c.at >= cutoffStr)
    .map((c) => {
      const child = family.children.find((ch) => ch.id === c.childId)
      return {
        kind: 'mission',
        id: c.id,
        childId: c.childId,
        nickname: child?.nickname ?? null,
        title: c.title,
        status: c.status,
        points: c.points,
        verifiedBy: c.verifiedBy,
        at: c.at,
      }
    })

  const gameItems: ActivityItem[] = state.games
    .filter((g) => g.familyCode.toUpperCase() === family.code.toUpperCase() && g.at >= cutoffStr)
    .map((g) => {
      const child = family.children.find((ch) => ch.id === g.childId)
      return {
        kind: 'game',
        id: g.id,
        childId: g.childId,
        nickname: child?.nickname ?? null,
        score: g.score,
        points: g.points,
        at: g.at,
      }
    })

  const combined = [...missionItems, ...gameItems].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
  return { ok: true, data: combined }
}

export function demoReport(code: string, days = 7): Result<ChildReport[]> {
  const state = load()
  const family = findFamilyByCode(state, code)
  if (!family) return { ok: false, error: 'not_found' }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString()

  const reports: ChildReport[] = family.children.map((child) => {
    const totalPoints =
      state.completions
        .filter((c) => c.childId === child.id && c.status === 'approved')
        .reduce((s, c) => s + c.points, 0) +
      state.games.filter((g) => g.childId === child.id).reduce((s, g) => s + g.points, 0)

    const periodCompletions = state.completions.filter(
      (c) => c.childId === child.id && c.at >= cutoffStr,
    )
    const periodGames = state.games.filter((g) => g.childId === child.id && g.at >= cutoffStr)

    const pointsInPeriod =
      periodCompletions.filter((c) => c.status === 'approved').reduce((s, c) => s + c.points, 0) +
      periodGames.reduce((s, g) => s + g.points, 0)

    return {
      childId: child.id,
      nickname: child.nickname,
      totalPoints,
      pointsInPeriod,
      streak: calculateStreak(state, child.id),
      period: {
        missionsApproved: periodCompletions.filter((c) => c.status === 'approved').length,
        missionsPending: periodCompletions.filter((c) => c.status === 'pending').length,
        missionsRejected: periodCompletions.filter((c) => c.status === 'rejected').length,
        gamesPlayed: periodGames.length,
      },
    }
  })

  return { ok: true, data: reports }
}
