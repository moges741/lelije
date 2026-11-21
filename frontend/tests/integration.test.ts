import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_FAMILY_CODE, DEMO_FAMILY_PIN, demoStore } from '../src/api/demoStore'
import { todaysMissions } from '../src/api/client'
import { get, getAuthToken, post, setAuthToken } from '../src/api/http'
import { am } from '../src/i18n/am'
import { en } from '../src/i18n/en'
import { om } from '../src/i18n/om'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  setAuthToken(null)
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  })
})

describe('Frontend HTTP Error Classification & Contract B Guard', () => {
  it('maps every backend HTTP error code and network outage to explicit Failure values', async () => {
    const cases: Array<[number, string]> = [
      [400, 'invalid'],
      [401, 'unauthorized'],
      [403, 'forbidden'],
      [404, 'not_found'],
      [409, 'conflict'],
      [429, 'too_many'],
      [500, 'server'],
    ]
    for (const [status, expected] of cases) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json: async () => ({ message: 'err' }),
        }),
      )
      const res = await get('/api/test')
      expect(res).toEqual({ ok: false, error: expected })
    }

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await post('/api/test', { a: 1 })).toEqual({ ok: false, error: 'network' })

    // In-memory Bearer token attaches Authorization header without touching localStorage
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchMock)
    setAuthToken('sample.token')
    expect(getAuthToken()).toBe('sample.token')
    await get('/api/auth/me')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sample.token' }),
      }),
    )
    expect(localStorage.length).toBe(0)
  })

  it('drops malformed missions and falls back to today’s cached missions when offline', async () => {
    const validMission = {
      id: 'm-1',
      title: 'Star Jumps',
      description: 'Jump 6 times.',
      type: 'physical',
      durationMin: 3,
      points: 20,
      verification: 'pose',
      goal: { detector: 'jump', count: 6 },
      language: 'en',
      ageMin: 5,
      ageMax: 12,
      tags: ['indoor'],
    }
    const malformedPose = {
      id: 'm-bad',
      title: 'Broken Pose',
      description: 'Missing goal',
      type: 'physical',
      durationMin: 3,
      points: 20,
      verification: 'pose',
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ missions: [validMission, malformedPose], source: 'ai' }),
      }),
    )

    const live = await todaysMissions('child-cache-1', true)
    expect(live.ok).toBe(true)
    if (live.ok) {
      expect(live.data.offline).toBe(false)
      expect(live.data.missions).toHaveLength(1)
      expect(live.data.missions[0].id).toBe('m-1')
    }

    // Now simulate server outage; today's saved missions should load offline
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')))
    const cached = await todaysMissions('child-cache-1', true)
    expect(cached.ok).toBe(true)
    if (cached.ok) {
      expect(cached.data.offline).toBe(true)
      expect(cached.data.missions[0].id).toBe('m-1')
    }
  })
})

describe('Offline demoStore Full Phases 4–9 Parity & Startup Demo Seed', () => {
  it('auto-seeds the fixed LELIJE family (PIN 1234) with multilingual children and realistic activity', async () => {
    const found = await demoStore.findFamily(DEMO_FAMILY_CODE)
    expect(found.ok).toBe(true)
    if (!found.ok) return

    expect(found.data.family.code).toBe('LELIJE')
    expect(found.data.family.hasPin).toBe(true)
    expect(found.data.children.map((c) => c.language).sort()).toEqual(['am', 'en', 'om'])

    const pinCheck = await demoStore.checkFamilyPin(DEMO_FAMILY_CODE, DEMO_FAMILY_PIN)
    expect(pinCheck).toEqual({ ok: true, data: { ok: true } })

    const reviews = await demoStore.pendingReviews(DEMO_FAMILY_CODE)
    expect(reviews.ok && reviews.data.length).toBeGreaterThanOrEqual(1)

    const play = await demoStore.playRequests(DEMO_FAMILY_CODE)
    expect(play.ok && play.data.some((p) => p.status === 'sent')).toBe(true)

    const report = await demoStore.report(DEMO_FAMILY_CODE, 7)
    expect(report.ok).toBe(true)
    if (report.ok) {
      const beka = report.data.find((c) => c.nickname === 'Beka')
      expect(beka?.streak).toBeGreaterThanOrEqual(3)
    }
  })

  it('implements Phases 4–8 workflows, audience isolation, daily caps, and PIN lockout', async () => {
    const created = await demoStore.createFamily('Offline Test Family', '5678')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const code = created.data.family.code

    const childA = await demoStore.addChild({
      familyCode: code,
      age: 7,
      language: 'en',
      nickname: 'Mimi',
    })
    const childB = await demoStore.addChild({
      familyCode: code,
      age: 9,
      language: 'om',
      nickname: 'Bona',
    })
    expect(childA.ok && childB.ok).toBe(true)
    if (!childA.ok || !childB.ok) return

    const mA = await demoStore.todaysMissions(childA.data.id, true)
    expect(mA.ok && mA.data.missions.length === 3).toBe(true)
    if (!mA.ok) return

    const pose = mA.data.missions.find((m) => m.verification === 'pose')
    const self = mA.data.missions.find((m) => m.verification === 'self')
    expect(pose && self).toBeTruthy()
    if (!pose || !self) return

    // Pose auto-approves; self goes pending -> reject -> redo -> approve
    const compPose = await demoStore.completeMission({
      childId: childA.data.id,
      missionId: pose.id,
      verifiedBy: 'pose',
      result: { count: pose.goal?.count ?? 6, durationMs: 15_000 },
    })
    expect(compPose.ok && compPose.data.status === 'approved').toBe(true)

    const compSelf = await demoStore.completeMission({
      childId: childA.data.id,
      missionId: self.id,
      verifiedBy: 'self',
    })
    expect(compSelf.ok && compSelf.data.status === 'pending').toBe(true)

    const rev1 = await demoStore.pendingReviews(code)
    expect(rev1.ok && rev1.data.length === 1).toBe(true)
    if (!rev1.ok) return

    const rej = await demoStore.reviewMission(rev1.data[0].id, {
      familyCode: code,
      pin: '5678',
      decision: 'reject',
    })
    expect(rej.ok && rej.data.status === 'rejected').toBe(true)

    const redo = await demoStore.completeMission({
      childId: childA.data.id,
      missionId: self.id,
      verifiedBy: 'self',
    })
    expect(redo.ok && redo.data.status === 'pending').toBe(true)

    const rev2 = await demoStore.pendingReviews(code)
    expect(rev2.ok && rev2.data.length === 1).toBe(true)
    if (!rev2.ok) return

    const appr = await demoStore.reviewMission(rev2.data[0].id, {
      familyCode: code,
      pin: '5678',
      decision: 'approve',
    })
    expect(appr.ok && appr.data.pointsAwarded === self.points).toBe(true)

    // Play Time idempotency & answer
    const p1 = await demoStore.askForPlay(childA.data.id)
    const p2 = await demoStore.askForPlay(childA.data.id)
    expect(p1.ok && !p1.data.alreadyAsked).toBe(true)
    expect(p2.ok && p2.data.alreadyAsked).toBe(true)
    if (!p1.ok) return

    const ans = await demoStore.answerPlay(p1.data.id, {
      familyCode: code,
      pin: '5678',
      answer: 'allowed',
    })
    expect(ans.ok && ans.data.status === 'allowed').toBe(true)

    // Notifications isolation & independent read
    const nParent = await demoStore.notifications(code, { audience: 'parent' })
    const nChildA = await demoStore.notifications(code, {
      audience: 'child',
      childId: childA.data.id,
    })
    const nChildB = await demoStore.notifications(code, {
      audience: 'child',
      childId: childB.data.id,
    })
    expect(nParent.ok && nParent.data.unread >= 1).toBe(true)
    expect(nChildA.ok && nChildA.data.unread >= 1).toBe(true)
    expect(nChildB.ok && nChildB.data.unread === 0).toBe(true)

    await demoStore.markNotificationsRead(code, { audience: 'parent' })
    const nParentAfter = await demoStore.notifications(code, { audience: 'parent' })
    const nChildAAfter = await demoStore.notifications(code, {
      audience: 'child',
      childId: childA.data.id,
    })
    expect(nParentAfter.ok && nParentAfter.data.unread === 0).toBe(true)
    expect(nChildAAfter.ok && nChildAAfter.data.unread >= 1).toBe(true)

    // Catch the Stars first-game reward + repeat alreadyRecorded
    const g1 = await demoStore.saveGame(childA.data.id, {
      score: 40,
      starsCaught: 15,
      goldenCaught: 5,
      jumps: 10,
      armsUp: 6,
      durationMs: 45_000,
    })
    expect(g1.ok && g1.data.pointsAwarded === 20 && !g1.data.alreadyRecorded).toBe(true)

    const g2 = await demoStore.saveGame(childA.data.id, {
      score: 90,
      starsCaught: 40,
      goldenCaught: 10,
      jumps: 20,
      armsUp: 12,
      durationMs: 45_000,
    })
    expect(g2.ok && g2.data.pointsAwarded === 0 && g2.data.alreadyRecorded).toBe(true)

    // PIN lockout after 5 wrong tries
    for (let i = 1; i <= 4; i += 1) {
      const bad = await demoStore.checkFamilyPin(code, '0000')
      expect(bad).toEqual({ ok: false, error: 'forbidden' })
    }
    expect(await demoStore.checkFamilyPin(code, '0000')).toEqual({
      ok: false,
      error: 'too_many',
    })
    expect(await demoStore.checkFamilyPin(code, '5678')).toEqual({
      ok: false,
      error: 'too_many',
    })
  })
})

describe('Multilingual i18n Dictionary Completeness (EN, AM, OM)', () => {
  it('defines every English key with non-empty copy in Amharic and Afaan Oromo', () => {
    const keys = Object.keys(en) as Array<keyof typeof en>
    const requiredFailureKeys: Array<keyof typeof en> = [
      'networkError',
      'invalidCode',
      'pinWrong',
      'pinLocked',
      'capReached',
      'offlineBanner',
      'statusRedo',
    ]

    for (const key of requiredFailureKeys) {
      expect(en[key].trim().length).toBeGreaterThan(0)
      expect(am[key].trim().length).toBeGreaterThan(0)
      expect(om[key].trim().length).toBeGreaterThan(0)
    }

    for (const key of keys) {
      expect(typeof am[key], `Missing Amharic translation for ${key}`).toBe('string')
      expect(am[key].trim().length, `Empty Amharic translation for ${key}`).toBeGreaterThan(0)
      expect(typeof om[key], `Missing Oromo translation for ${key}`).toBe('string')
      expect(om[key].trim().length, `Empty Oromo translation for ${key}`).toBeGreaterThan(0)
    }
  })
})
