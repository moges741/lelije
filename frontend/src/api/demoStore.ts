/**
 * Offline localStorage backend activated when `VITE_API=off`.
 * Implements the same business rules and response shapes as the NestJS API
 * across Phases 4–9 so the full LeLije experience works without a server.
 */
import { addisDay } from '../lib/time'
import type { ChildRecord, FamilyWithChildren } from '../types/account'
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
  PoseResult,
  Progress,
  Review,
  ReviewSaved,
  Verified,
} from '../types/api'
import type { AppLanguage, CatchStarsResult, Mission } from '../types/mission'
import type { Result } from './http'

const STORAGE_KEY = 'lelije.demoStore.v1'
const DAILY_CAP = 100
const MAX_GAME_POINTS = 30
const MAX_PIN_FAILURES = 5
const PIN_LOCK_MS = 15 * 60_000
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

interface DemoFamily {
  id: string
  name: string
  code: string
  pin: string | null
  pinFailures: number
  pinLockedUntil: number | null
  createdAt: string
}

interface DemoDailyMissions {
  childId: string
  day: string
  missions: Mission[]
}

interface DemoCompletion {
  id: string
  childId: string
  missionId: string
  day: string
  status: CompletionStatus
  points: number
  verifiedBy: Verified
  result?: PoseResult
  completedAt: string
  reviewedAt: string | null
}

interface DemoGameResult {
  id: string
  childId: string
  day: string
  game: 'catch-the-stars'
  score: number
  points: number
  result: CatchStarsResult
  createdAt: string
}

interface DemoPlayRequest {
  id: string
  childId: string
  day: string
  status: PlayStatus
  requestedAt: string
  answeredAt: string | null
}

interface DemoNotification {
  id: string
  familyId: string
  childId: string
  audience: 'parent' | 'child'
  kind: NotificationKind
  read: boolean
  at: string
}

interface DemoState {
  families: DemoFamily[]
  children: ChildRecord[]
  dailyMissions: DemoDailyMissions[]
  completions: DemoCompletion[]
  gameResults: DemoGameResult[]
  playRequests: DemoPlayRequest[]
  notifications: DemoNotification[]
}

export const DEMO_FAMILY_CODE = 'LELIJE'
export const DEMO_FAMILY_PIN = '1234'

function seededDemoState(): DemoState {
  const today = addisDay()
  const yesterday = daysAgo(today, 1)
  const twoDaysAgo = daysAgo(today, 2)
  const now = Date.now()
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()

  const familyId = 'demo-family-lelije'
  const liaId = 'demo-child-lia'
  const bekaId = 'demo-child-beka'
  const chaltuId = 'demo-child-chaltu'

  const liaList = localizedMissions('en', 7, true, today)
  const bekaList = localizedMissions('am', 9, true, today)
  const liaPose = liaList.find((m) => m.verification === 'pose') ?? liaList[0]
  const liaSelf = liaList.find((m) => m.verification === 'self') ?? liaList[1]
  const bekaPose = bekaList.find((m) => m.verification === 'pose') ?? bekaList[0]
  const bekaSelf = bekaList.find((m) => m.verification === 'self') ?? bekaList[1]

  return {
    families: [
      {
        id: familyId,
        name: 'LeLije Demo Family',
        code: DEMO_FAMILY_CODE,
        pin: DEMO_FAMILY_PIN,
        pinFailures: 0,
        pinLockedUntil: null,
        createdAt: iso(-72 * 3600_000),
      },
    ],
    children: [
      { id: liaId, familyId, age: 7, language: 'en', nickname: 'Lia' },
      { id: bekaId, familyId, age: 9, language: 'am', nickname: 'Beka' },
      { id: chaltuId, familyId, age: 6, language: 'om', nickname: 'Chaltu' },
    ],
    dailyMissions: [
      { childId: liaId, day: today, missions: liaList },
      { childId: bekaId, day: today, missions: bekaList },
    ],
    completions: [
      {
        id: 'demo-comp-lia-yday',
        childId: liaId,
        missionId: liaPose.id,
        day: yesterday,
        status: 'approved',
        points: liaPose.points,
        verifiedBy: 'pose',
        result: { count: liaPose.goal?.count ?? 6, durationMs: 18_000 },
        completedAt: iso(-24 * 3600_000),
        reviewedAt: iso(-24 * 3600_000),
      },
      {
        id: 'demo-comp-lia-today-pose',
        childId: liaId,
        missionId: liaPose.id,
        day: today,
        status: 'approved',
        points: liaPose.points,
        verifiedBy: 'pose',
        result: { count: liaPose.goal?.count ?? 6, durationMs: 16_000 },
        completedAt: iso(-25 * 60_000),
        reviewedAt: iso(-25 * 60_000),
      },
      {
        id: 'demo-comp-lia-today-self',
        childId: liaId,
        missionId: liaSelf.id,
        day: today,
        status: 'pending',
        points: 0,
        verifiedBy: 'self',
        completedAt: iso(-10 * 60_000),
        reviewedAt: null,
      },
      {
        id: 'demo-comp-beka-2d',
        childId: bekaId,
        missionId: bekaPose.id,
        day: twoDaysAgo,
        status: 'approved',
        points: bekaPose.points,
        verifiedBy: 'pose',
        result: { count: bekaPose.goal?.count ?? 8, durationMs: 21_000 },
        completedAt: iso(-48 * 3600_000),
        reviewedAt: iso(-48 * 3600_000),
      },
      {
        id: 'demo-comp-beka-yday',
        childId: bekaId,
        missionId: bekaPose.id,
        day: yesterday,
        status: 'approved',
        points: bekaPose.points,
        verifiedBy: 'pose',
        result: { count: bekaPose.goal?.count ?? 8, durationMs: 20_000 },
        completedAt: iso(-24 * 3600_000),
        reviewedAt: iso(-24 * 3600_000),
      },
      {
        id: 'demo-comp-beka-today',
        childId: bekaId,
        missionId: bekaSelf.id,
        day: today,
        status: 'approved',
        points: bekaSelf.points,
        verifiedBy: 'self',
        completedAt: iso(-40 * 60_000),
        reviewedAt: iso(-35 * 60_000),
      },
    ],
    gameResults: [
      {
        id: 'demo-game-lia-yday',
        childId: liaId,
        day: yesterday,
        game: 'catch-the-stars',
        score: 26,
        points: 13,
        result: {
          score: 26,
          starsCaught: 10,
          goldenCaught: 2,
          jumps: 9,
          armsUp: 4,
          durationMs: 45_000,
        },
        createdAt: iso(-24 * 3600_000),
      },
    ],
    playRequests: [
      {
        id: 'demo-play-lia-today',
        childId: liaId,
        day: today,
        status: 'sent',
        requestedAt: iso(-5 * 60_000),
        answeredAt: null,
      },
    ],
    notifications: [
      {
        id: 'demo-notif-parent-pending',
        familyId,
        childId: liaId,
        audience: 'parent',
        kind: 'mission_pending',
        read: false,
        at: iso(-10 * 60_000),
      },
      {
        id: 'demo-notif-parent-play',
        familyId,
        childId: liaId,
        audience: 'parent',
        kind: 'play_sent',
        read: false,
        at: iso(-5 * 60_000),
      },
      {
        id: 'demo-notif-child-beka',
        familyId,
        childId: bekaId,
        audience: 'child',
        kind: 'mission_approved',
        read: false,
        at: iso(-35 * 60_000),
      },
    ],
  }
}

function readState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seeded = seededDemoState()
      writeState(seeded)
      return seeded
    }
    const parsed = JSON.parse(raw) as Partial<DemoState>
    return {
      families: parsed.families ?? [],
      children: parsed.children ?? [],
      dailyMissions: parsed.dailyMissions ?? [],
      completions: parsed.completions ?? [],
      gameResults: parsed.gameResults ?? [],
      playRequests: parsed.playRequests ?? [],
      notifications: parsed.notifications ?? [],
    }
  } catch {
    return seededDemoState()
  }
}

function writeState(state: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable; keep running cleanly in memory for this call.
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function validPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim())
}

function generateCode(existing: DemoFamily[]): string {
  const taken = new Set(existing.map((f) => f.code))
  for (let tries = 0; tries < 20; tries += 1) {
    let code = 'LJ-'
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    if (!taken.has(code)) return code
  }
  return `LJ-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

function daysAgo(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - count))
  return dt.toISOString().slice(0, 10)
}

function countStreak(activeDays: Set<string>, today: string): number {
  let cursor = activeDays.has(today) ? today : daysAgo(today, 1)
  let streak = 0
  while (activeDays.has(cursor)) {
    streak += 1
    cursor = daysAgo(cursor, 1)
  }
  return streak
}

function awardedOnDay(state: DemoState, childId: string, day: string): number {
  const mPts = state.completions
    .filter((c) => c.childId === childId && c.day === day && c.status === 'approved')
    .reduce((sum, c) => sum + c.points, 0)
  const gPts = state.gameResults
    .filter((g) => g.childId === childId && g.day === day)
    .reduce((sum, g) => sum + g.points, 0)
  return mPts + gPts
}

function withinCap(wanted: number, awardedToday: number): number {
  return Math.max(0, Math.min(wanted, DAILY_CAP - awardedToday))
}

function verifyParentPin(
  state: DemoState,
  code: string,
  pin: string,
): Result<DemoFamily> {
  const family = state.families.find((f) => f.code === normalizeCode(code))
  if (!family) return { ok: false, error: 'not_found' }
  if (!validPin(pin)) return { ok: false, error: 'invalid' }
  if (!family.pin) return { ok: false, error: 'forbidden' }

  const now = Date.now()
  if (family.pinLockedUntil !== null) {
    if (family.pinLockedUntil > now) return { ok: false, error: 'too_many' }
    family.pinFailures = 0
    family.pinLockedUntil = null
  }

  if (family.pin === pin.trim()) {
    family.pinFailures = 0
    family.pinLockedUntil = null
    writeState(state)
    return { ok: true, data: family }
  }

  family.pinFailures += 1
  if (family.pinFailures >= MAX_PIN_FAILURES) {
    family.pinLockedUntil = now + PIN_LOCK_MS
    writeState(state)
    return { ok: false, error: 'too_many' }
  }
  writeState(state)
  return { ok: false, error: 'forbidden' }
}

function localizedMissions(
  language: AppLanguage,
  age: number,
  cameraAvailable: boolean,
  day: string,
): Mission[] {
  const datePart = day.replaceAll('-', '')
  const count = age <= 6 ? 6 : age <= 9 ? 8 : 10

  const byLang: Record<AppLanguage, Omit<Mission, 'id'>[]> = {
    en: [
      {
        title: 'Star Jumps',
        description: `Jump ${count} times like you are reaching for the stars in a clear space.`,
        type: 'physical',
        durationMin: 3,
        points: 15,
        verification: 'pose',
        goal: { detector: 'jump', count },
        language: 'en',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'energy'],
      },
      {
        title: 'Touch the Sky',
        description: `Lift both arms high above your head ${count} times.`,
        type: 'physical',
        durationMin: 2,
        points: 12,
        verification: 'pose',
        goal: { detector: 'armsUp', count },
        language: 'en',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'stretch'],
      },
      {
        title: 'Tidy Room Hero',
        description: 'Put five things back where they belong and show a grown-up.',
        type: 'helper',
        durationMin: 5,
        points: 15,
        verification: 'self',
        language: 'en',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'helper'],
      },
      {
        title: 'Animal Walk',
        description: 'Walk like a bear, then hop like a frog across the room.',
        type: 'game',
        durationMin: 4,
        points: 12,
        verification: 'self',
        language: 'en',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'fun'],
      },
    ],
    am: [
      {
        title: 'የኮከብ ዝላይ',
        description: `ነፃ ቦታ ላይ ቆመው ወደ ሰማይ ${count} ጊዜ ይዝለሉ።`,
        type: 'physical',
        durationMin: 3,
        points: 15,
        verification: 'pose',
        goal: { detector: 'jump', count },
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'energy'],
      },
      {
        title: 'ሰማይን ንካ',
        description: `ሁለቱንም እጆችዎን ከጭንቅላትዎ በላይ ${count} ጊዜ ከፍ ያድርጉ።`,
        type: 'physical',
        durationMin: 2,
        points: 12,
        verification: 'pose',
        goal: { detector: 'armsUp', count },
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'stretch'],
      },
      {
        title: 'የክፍል ረዳት',
        description: 'አምስት ዕቃዎችን ወደ ቦታቸው መልሰው ለአዋቂ ያሳዩ።',
        type: 'helper',
        durationMin: 5,
        points: 15,
        verification: 'self',
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'helper'],
      },
      {
        title: 'የእንስሳት እንቅስቃሴ',
        description: 'እንደ እንቁራሪት ይዝለሉ፤ እንደ ድመት ይዘርጉ።',
        type: 'game',
        durationMin: 4,
        points: 12,
        verification: 'self',
        language: 'am',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'fun'],
      },
    ],
    om: [
      {
        title: 'Utaalcha Urjii',
        description: `Bakka bal'aa keessatti gara samiitti si'a ${count} utaali.`,
        type: 'physical',
        durationMin: 3,
        points: 15,
        verification: 'pose',
        goal: { detector: 'jump', count },
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'energy'],
      },
      {
        title: 'Samii Tuqi',
        description: `Harka kee lamaan mataa kee ol si'a ${count} ol kaasi.`,
        type: 'physical',
        durationMin: 2,
        points: 12,
        verification: 'pose',
        goal: { detector: 'armsUp', count },
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'stretch'],
      },
      {
        title: 'Gargaaraa Manaa',
        description: 'Meeshaalee shan bakka isaaniitti deebisiitii nama guddaatti agarsiisi.',
        type: 'helper',
        durationMin: 5,
        points: 15,
        verification: 'self',
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'helper'],
      },
      {
        title: 'Sochii Bineensotaa',
        description: 'Akka raachaa utaali, akka adurrees diriiri.',
        type: 'game',
        durationMin: 4,
        points: 12,
        verification: 'self',
        language: 'om',
        ageMin: 5,
        ageMax: 13,
        tags: ['indoor', 'fun'],
      },
    ],
  }

  const pool = byLang[language] ?? byLang.en
  const pose = pool.filter((m) => m.verification === 'pose')
  const self = pool.filter((m) => m.verification === 'self')
  const ordered = cameraAvailable ? [...pose.slice(0, 2), ...self] : [...self, ...pose]

  return ordered.slice(0, 3).map((m, i) => ({ ...m, id: `m_${datePart}_${i}` }))
}

function buildProgress(state: DemoState, child: ChildRecord): Progress {
  const today = addisDay()
  const completions = state.completions.filter((c) => c.childId === child.id)
  const games = state.gameResults.filter((g) => g.childId === child.id)
  const approved = completions.filter((c) => c.status === 'approved')
  const gameToday = games.find((g) => g.day === today) ?? null
  const activeDays = new Set([...approved, ...games].map((r) => r.day))
  const savedDaily = state.dailyMissions.find((d) => d.childId === child.id && d.day === today)
  const missionMap = new Map((savedDaily?.missions ?? []).map((m) => [m.id, m]))
  const play =
    state.playRequests
      .filter((r) => r.childId === child.id && (r.status === 'sent' || r.day === today))
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))[0] ?? null

  const todayWith = (status: CompletionStatus) =>
    completions.filter((c) => c.day === today && c.status === status)

  const sum = (rows: { points: number }[]) => rows.reduce((t, r) => t + r.points, 0)

  return {
    childId: child.id,
    nickname: child.nickname,
    totalPoints: sum(approved) + sum(games),
    pointsToday: sum(todayWith('approved')) + (gameToday?.points ?? 0),
    dailyCap: DAILY_CAP,
    streak: countStreak(activeDays, today),
    today: {
      day: today,
      missionsCompleted: todayWith('approved').map((r) => ({
        missionId: r.missionId,
        points: r.points,
      })),
      missionsPending: todayWith('pending').map((r) => ({
        missionId: r.missionId,
        points: missionMap.get(r.missionId)?.points ?? 0,
      })),
      missionsToRedo: todayWith('rejected').map((r) => ({ missionId: r.missionId })),
      game: gameToday ? { score: gameToday.score, points: gameToday.points } : null,
      playRequest: play
        ? {
            id: play.id,
            status: play.status,
            requestedAt: play.requestedAt,
            answeredAt: play.answeredAt,
          }
        : null,
    },
  }
}

export const demoStore = {
  async createFamily(name: string, pin: string): Promise<Result<FamilyWithChildren>> {
    const cleanName = name.trim().slice(0, 40)
    if (!cleanName || !validPin(pin)) return { ok: false, error: 'invalid' }
    const state = readState()
    const family: DemoFamily = {
      id: uid(),
      name: cleanName,
      code: generateCode(state.families),
      pin: pin.trim(),
      pinFailures: 0,
      pinLockedUntil: null,
      createdAt: new Date().toISOString(),
    }
    state.families.push(family)
    writeState(state)
    return {
      ok: true,
      data: {
        family: { id: family.id, name: family.name, code: family.code, hasPin: true },
        children: [],
      },
    }
  },

  async findFamily(code: string): Promise<Result<FamilyWithChildren>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const children = state.children.filter((c) => c.familyId === family.id)
    return {
      ok: true,
      data: {
        family: { id: family.id, name: family.name, code: family.code, hasPin: family.pin !== null },
        children,
      },
    }
  },

  async setFamilyPin(
    code: string,
    pin: string,
    currentPin?: string,
  ): Promise<Result<{ hasPin: true }>> {
    if (!validPin(pin)) return { ok: false, error: 'invalid' }
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    if (family.pin) {
      const check = verifyParentPin(state, code, currentPin ?? '')
      if (!check.ok) return check
    }
    family.pin = pin.trim()
    family.pinFailures = 0
    family.pinLockedUntil = null
    writeState(state)
    return { ok: true, data: { hasPin: true } }
  },

  async checkFamilyPin(code: string, pin: string): Promise<Result<{ ok: true }>> {
    const state = readState()
    const check = verifyParentPin(state, code, pin)
    if (!check.ok) return check
    return { ok: true, data: { ok: true } }
  },

  async addChild(input: {
    familyCode: string
    age: number
    language: AppLanguage
    nickname: string
  }): Promise<Result<ChildRecord>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(input.familyCode))
    if (!family) return { ok: false, error: 'not_found' }
    const child: ChildRecord = {
      id: uid(),
      familyId: family.id,
      age: Math.min(14, Math.max(4, Math.round(input.age))),
      language: input.language,
      nickname: input.nickname.trim().slice(0, 20) || null,
    }
    state.children.push(child)
    writeState(state)
    return { ok: true, data: child }
  },

  async todaysMissions(
    childId: string,
    cameraAvailable: boolean,
  ): Promise<Result<{ missions: Mission[]; offline: boolean }>> {
    const state = readState()
    const child = state.children.find((c) => c.id === childId)
    if (!child) return { ok: false, error: 'not_found' }
    const day = addisDay()
    let saved = state.dailyMissions.find((d) => d.childId === childId && d.day === day)
    if (!saved) {
      saved = {
        childId,
        day,
        missions: localizedMissions(child.language, child.age, cameraAvailable, day),
      }
      state.dailyMissions.push(saved)
      writeState(state)
    }
    return { ok: true, data: { missions: saved.missions, offline: false } }
  },

  async completeMission(input: {
    childId: string
    missionId: string
    verifiedBy: Verified
    result?: PoseResult
  }): Promise<Result<CompletionSaved>> {
    const state = readState()
    const child = state.children.find((c) => c.id === input.childId)
    if (!child) return { ok: false, error: 'not_found' }
    const day = addisDay()
    const daily = state.dailyMissions.find((d) => d.childId === child.id && d.day === day)
    const mission = daily?.missions.find((m) => m.id === input.missionId)
    if (!mission) return { ok: false, error: 'not_found' }

    const awardedBefore = awardedOnDay(state, child.id, day)
    const existing = state.completions.find(
      (c) => c.childId === child.id && c.missionId === mission.id && c.day === day,
    )
    if (existing && existing.status !== 'rejected') {
      return {
        ok: true,
        data: {
          completionId: existing.id,
          status: existing.status,
          alreadyCompleted: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: DAILY_CAP,
        },
      }
    }

    const status: CompletionStatus = input.verifiedBy === 'pose' ? 'approved' : 'pending'
    const pointsAwarded = status === 'approved' ? withinCap(mission.points, awardedBefore) : 0
    const nowIso = new Date().toISOString()

    let savedId: string
    if (existing) {
      existing.status = status
      existing.points = pointsAwarded
      existing.verifiedBy = input.verifiedBy
      existing.result = input.result
      existing.completedAt = nowIso
      existing.reviewedAt = null
      savedId = existing.id
    } else {
      savedId = uid()
      state.completions.push({
        id: savedId,
        childId: child.id,
        missionId: mission.id,
        day,
        status,
        points: pointsAwarded,
        verifiedBy: input.verifiedBy,
        result: input.result,
        completedAt: nowIso,
        reviewedAt: null,
      })
    }

    if (status === 'pending') {
      state.notifications.push({
        id: uid(),
        familyId: child.familyId,
        childId: child.id,
        audience: 'parent',
        kind: 'mission_pending',
        read: false,
        at: nowIso,
      })
    }
    writeState(state)
    return {
      ok: true,
      data: {
        completionId: savedId,
        status,
        alreadyCompleted: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: DAILY_CAP,
      },
    }
  },

  async childProgress(childId: string): Promise<Result<Progress>> {
    const state = readState()
    const child = state.children.find((c) => c.id === childId)
    if (!child) return { ok: false, error: 'not_found' }
    return { ok: true, data: buildProgress(state, child) }
  },

  async familyProgress(code: string): Promise<Result<Progress[]>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const kids = state.children.filter((c) => c.familyId === family.id)
    return { ok: true, data: kids.map((c) => buildProgress(state, c)) }
  },

  async saveGame(childId: string, result: CatchStarsResult): Promise<Result<GameSaved>> {
    const state = readState()
    const child = state.children.find((c) => c.id === childId)
    if (!child) return { ok: false, error: 'not_found' }
    const day = addisDay()
    const awardedBefore = awardedOnDay(state, child.id, day)
    const existing = state.gameResults.find(
      (g) => g.childId === child.id && g.day === day && g.game === 'catch-the-stars',
    )
    if (existing) {
      return {
        ok: true,
        data: {
          score: existing.score,
          alreadyRecorded: true,
          pointsAwarded: 0,
          pointsToday: awardedBefore,
          dailyCap: DAILY_CAP,
        },
      }
    }
    const rawPts = Math.min(MAX_GAME_POINTS, Math.floor(Math.max(0, result.score) / 2))
    const pointsAwarded = withinCap(rawPts, awardedBefore)
    state.gameResults.push({
      id: uid(),
      childId: child.id,
      day,
      game: 'catch-the-stars',
      score: Math.round(result.score),
      points: pointsAwarded,
      result,
      createdAt: new Date().toISOString(),
    })
    writeState(state)
    return {
      ok: true,
      data: {
        score: Math.round(result.score),
        alreadyRecorded: false,
        pointsAwarded,
        pointsToday: awardedBefore + pointsAwarded,
        dailyCap: DAILY_CAP,
      },
    }
  },

  async pendingReviews(code: string): Promise<Result<Review[]>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const kids = state.children.filter((c) => c.familyId === family.id)
    const kidMap = new Map(kids.map((k) => [k.id, k]))

    const pending = state.completions
      .filter((c) => c.status === 'pending' && kidMap.has(c.childId))
      .sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))
      .map((row) => {
        const daily = state.dailyMissions.find((d) => d.childId === row.childId && d.day === row.day)
        const mission = daily?.missions.find((m) => m.id === row.missionId)
        return {
          id: row.id,
          childId: row.childId,
          nickname: kidMap.get(row.childId)?.nickname ?? null,
          missionId: row.missionId,
          title: mission?.title ?? null,
          points: mission?.points ?? 0,
          verifiedBy: row.verifiedBy,
          completedAt: row.completedAt,
        }
      })
    return { ok: true, data: pending }
  },

  async reviewMission(
    id: string,
    input: { familyCode: string; pin: string; decision: 'approve' | 'reject' },
  ): Promise<Result<ReviewSaved>> {
    const state = readState()
    const check = verifyParentPin(state, input.familyCode, input.pin)
    if (!check.ok) return check
    const family = check.data
    const famChildIds = new Set(
      state.children.filter((c) => c.familyId === family.id).map((c) => c.id),
    )
    const row = state.completions.find((c) => c.id === id && famChildIds.has(c.childId))
    if (!row) return { ok: false, error: 'not_found' }
    if (row.status !== 'pending') {
      return {
        ok: true,
        data: { id: row.id, status: row.status, alreadyReviewed: true, pointsAwarded: 0 },
      }
    }

    const daily = state.dailyMissions.find((d) => d.childId === row.childId && d.day === row.day)
    const mission = daily?.missions.find((m) => m.id === row.missionId)
    const awardedBefore = awardedOnDay(state, row.childId, row.day)
    const status: CompletionStatus = input.decision === 'approve' ? 'approved' : 'rejected'
    const pointsAwarded =
      status === 'approved' ? withinCap(mission?.points ?? 0, awardedBefore) : 0
    const nowIso = new Date().toISOString()

    row.status = status
    row.points = pointsAwarded
    row.reviewedAt = nowIso

    state.notifications.push({
      id: uid(),
      familyId: family.id,
      childId: row.childId,
      audience: 'child',
      kind: status === 'approved' ? 'mission_approved' : 'mission_rejected',
      read: false,
      at: nowIso,
    })
    writeState(state)
    return {
      ok: true,
      data: { id: row.id, status, alreadyReviewed: false, pointsAwarded },
    }
  },

  async askForPlay(childId: string): Promise<Result<PlayRequest & { alreadyAsked: boolean }>> {
    const state = readState()
    const child = state.children.find((c) => c.id === childId)
    if (!child) return { ok: false, error: 'not_found' }
    const day = addisDay()
    const nowIso = new Date().toISOString()
    const open = state.playRequests.find((r) => r.childId === child.id && r.status === 'sent')
    if (open) {
      open.day = day
      open.requestedAt = nowIso
      writeState(state)
      return {
        ok: true,
        data: { ...open, nickname: child.nickname, alreadyAsked: true },
      }
    }
    const created: DemoPlayRequest = {
      id: uid(),
      childId: child.id,
      day,
      status: 'sent',
      requestedAt: nowIso,
      answeredAt: null,
    }
    state.playRequests.push(created)
    state.notifications.push({
      id: uid(),
      familyId: child.familyId,
      childId: child.id,
      audience: 'parent',
      kind: 'play_sent',
      read: false,
      at: nowIso,
    })
    writeState(state)
    return {
      ok: true,
      data: { ...created, nickname: child.nickname, alreadyAsked: false },
    }
  },

  async playRequests(code: string): Promise<Result<PlayRequest[]>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const kidMap = new Map(
      state.children.filter((c) => c.familyId === family.id).map((c) => [c.id, c.nickname]),
    )
    const items = state.playRequests
      .filter((r) => kidMap.has(r.childId))
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
      .slice(0, 50)
      .map((r) => ({ ...r, nickname: kidMap.get(r.childId) ?? null }))
    return { ok: true, data: items }
  },

  async answerPlay(
    id: string,
    input: { familyCode: string; pin: string; answer: PlayAnswer },
  ): Promise<Result<PlayRequest & { alreadyAnswered: boolean }>> {
    const state = readState()
    const check = verifyParentPin(state, input.familyCode, input.pin)
    if (!check.ok) return check
    const family = check.data
    const kidMap = new Map(
      state.children.filter((c) => c.familyId === family.id).map((c) => [c.id, c.nickname]),
    )
    const row = state.playRequests.find((r) => r.id === id && kidMap.has(r.childId))
    if (!row) return { ok: false, error: 'not_found' }
    if (row.status !== 'sent') {
      return {
        ok: true,
        data: { ...row, nickname: kidMap.get(row.childId) ?? null, alreadyAnswered: true },
      }
    }
    const nowIso = new Date().toISOString()
    row.status = input.answer
    row.answeredAt = nowIso
    state.notifications.push({
      id: uid(),
      familyId: family.id,
      childId: row.childId,
      audience: 'child',
      kind: 'play_answered',
      read: false,
      at: nowIso,
    })
    writeState(state)
    return {
      ok: true,
      data: { ...row, nickname: kidMap.get(row.childId) ?? null, alreadyAnswered: false },
    }
  },

  async notifications(
    code: string,
    who: Audience,
  ): Promise<Result<{ unread: number; notifications: NotificationItem[] }>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const kidMap = new Map(
      state.children.filter((c) => c.familyId === family.id).map((c) => [c.id, c.nickname]),
    )
    if (who.audience === 'child' && !kidMap.has(who.childId)) {
      return { ok: false, error: 'not_found' }
    }
    const matched = state.notifications
      .filter((n) => {
        if (n.familyId !== family.id || n.audience !== who.audience) return false
        if (who.audience === 'child') return n.childId === who.childId
        return true
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

    const unread = matched.filter((n) => !n.read).length
    return {
      ok: true,
      data: {
        unread,
        notifications: matched.slice(0, 50).map((n) => ({
          id: n.id,
          kind: n.kind,
          childId: n.childId,
          nickname: kidMap.get(n.childId) ?? null,
          read: n.read,
          at: n.at,
        })),
      },
    }
  },

  async markNotificationsRead(code: string, who: Audience): Promise<Result<{ marked: number }>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    let marked = 0
    for (const n of state.notifications) {
      if (n.familyId !== family.id || n.audience !== who.audience || n.read) continue
      if (who.audience === 'child' && n.childId !== who.childId) continue
      n.read = true
      marked += 1
    }
    writeState(state)
    return { ok: true, data: { marked } }
  },

  async activity(code: string, days = 7): Promise<Result<ActivityItem[]>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const to = addisDay()
    const from = daysAgo(to, Math.max(1, Math.min(30, Math.round(days))) - 1)
    const kidMap = new Map(
      state.children.filter((c) => c.familyId === family.id).map((c) => [c.id, c.nickname]),
    )
    const titles = new Map<string, string>()
    for (const dm of state.dailyMissions) {
      for (const m of dm.missions) {
        titles.set(`${dm.childId}:${dm.day}:${m.id}`, m.title)
      }
    }

    const items: ActivityItem[] = [
      ...state.completions
        .filter((c) => kidMap.has(c.childId) && c.day >= from && c.day <= to)
        .map((c) => ({
          kind: 'mission' as const,
          id: c.id,
          childId: c.childId,
          nickname: kidMap.get(c.childId) ?? null,
          title: titles.get(`${c.childId}:${c.day}:${c.missionId}`) ?? null,
          status: c.status,
          points: c.points,
          verifiedBy: c.verifiedBy,
          at: c.completedAt,
        })),
      ...state.gameResults
        .filter((g) => kidMap.has(g.childId) && g.day >= from && g.day <= to)
        .map((g) => ({
          kind: 'game' as const,
          id: g.id,
          childId: g.childId,
          nickname: kidMap.get(g.childId) ?? null,
          score: g.score,
          points: g.points,
          at: g.createdAt,
        })),
    ]
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 100)

    return { ok: true, data: items }
  },

  async report(code: string, days = 7): Promise<Result<ChildReport[]>> {
    const state = readState()
    const family = state.families.find((f) => f.code === normalizeCode(code))
    if (!family) return { ok: false, error: 'not_found' }
    const to = addisDay()
    const from = daysAgo(to, Math.max(1, Math.min(30, Math.round(days))) - 1)
    const kids = state.children.filter((c) => c.familyId === family.id)
    const sum = (rows: { points: number }[]) => rows.reduce((t, r) => t + r.points, 0)

    const reports: ChildReport[] = kids.map((child) => {
      const completions = state.completions.filter((c) => c.childId === child.id)
      const games = state.gameResults.filter((g) => g.childId === child.id)
      const approved = completions.filter((c) => c.status === 'approved')
      const inWindow = completions.filter((c) => c.day >= from && c.day <= to)
      const gamesInWindow = games.filter((g) => g.day >= from && g.day <= to)
      const activeDays = new Set([...approved, ...games].map((r) => r.day))

      return {
        childId: child.id,
        nickname: child.nickname,
        totalPoints: sum(approved) + sum(games),
        pointsInPeriod:
          sum(inWindow.filter((c) => c.status === 'approved')) + sum(gamesInWindow),
        streak: countStreak(activeDays, to),
        period: {
          missionsApproved: inWindow.filter((c) => c.status === 'approved').length,
          missionsPending: inWindow.filter((c) => c.status === 'pending').length,
          missionsRejected: inWindow.filter((c) => c.status === 'rejected').length,
          gamesPlayed: gamesInWindow.length,
        },
      }
    })
    return { ok: true, data: reports }
  },
}
