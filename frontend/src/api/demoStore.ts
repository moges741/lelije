/**
 * On-device stand-in for endpoints the server does not have yet,
 * and for family/child/mission calls when the server cannot be reached.
 * Nothing here is a production invitation or a saved backend record.
 */
import type { AppLanguage, Mission } from '../types/mission'
import type { ChildRecord, FamilyRecord } from '../types/account'

const KEY = 'lelije.demo.v1'

export interface DemoChild extends ChildRecord {
  familyCode: string
}

export interface DemoCompletion {
  id: string
  childId: string
  familyCode: string
  missionId: string
  title: string
  points: number
  day: string
  status: 'pending' | 'approved' | 'rejected'
  verifiedBy: 'pose' | 'self'
}

export interface DemoPlay {
  id: string
  familyCode: string
  childId: string
  childName: string
  status: 'sent' | 'allowed' | 'later' | 'declined'
  at: string
}

export interface DemoNote {
  id: string
  familyCode: string
  audience: 'parent' | 'child'
  kind: 'mission_pending' | 'mission_approved' | 'mission_rejected' | 'play_sent' | 'play_answered'
  at: string
  read: boolean
}

interface DemoDb {
  families: (FamilyRecord & { children: DemoChild[] })[]
  missions: Record<string, { day: string; missions: Mission[] }>
  completions: DemoCompletion[]
  play: DemoPlay[]
  notes: DemoNote[]
}

function empty(): DemoDb {
  return { families: [], missions: {}, completions: [], play: [], notes: [] }
}

export function readDemo(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<DemoDb>
    return { ...empty(), ...parsed }
  } catch {
    return empty()
  }
}

function writeDemo(db: DemoDb) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // Storage blocked: the demo lasts for this call only.
  }
}

export function updateDemo(change: (db: DemoDb) => void): DemoDb {
  const db = readDemo()
  change(db)
  writeDemo(db)
  return db
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newDemoCode(): string {
  let code = 'LJ-'
  for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return code
}

export function findDemoFamily(code: string) {
  return readDemo().families.find((family) => family.code === code) ?? null
}

export function addisDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function demoPointsToday(childId: string, day = addisDay()): number {
  return readDemo()
    .completions.filter(
      (item) => item.childId === childId && item.day === day && item.status === 'approved',
    )
    .reduce((sum, item) => sum + item.points, 0)
}

export function isLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'am' || value === 'om'
}
