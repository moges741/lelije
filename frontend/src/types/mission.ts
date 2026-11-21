/** Contract B shapes — keep in sync with ai/missions/README.md */

export type { CatchStarsResult } from '../lib/pose/types'

export type AppLanguage = 'en' | 'am' | 'om'

export type MissionType = 'physical' | 'game' | 'creative' | 'helper'
export type Verification = 'pose' | 'self'
export type PoseDetector = 'jump' | 'armsUp'
export type MissionSource = 'ai' | 'fallback' | 'mixed'

export interface MissionGoal {
  detector: PoseDetector
  count: number
}

export interface Mission {
  id: string
  title: string
  description: string
  type: MissionType
  durationMin: number
  points: number
  verification: Verification
  goal?: MissionGoal
  language: AppLanguage
  ageMin: number
  ageMax: number
  tags: string[]
}

export interface GenerateMissionsInput {
  age: number
  language: AppLanguage
  count?: number
  cameraAvailable?: boolean
  space?: 'small-indoor' | 'large-indoor' | 'outdoor-yard'
  weather?: string
  interests?: string[]
  excludeIds?: string[]
}

export interface GenerateMissionsResult {
  missions: Mission[]
  source: MissionSource
  warnings: string[]
}

export interface Progress {
  totalPoints: number
  /** Points the server (or the demo) has confirmed for today. */
  pointsToday: number
  todayCompleted: string[]
  /** Demo-only ids waiting for a grown-up. The live API awards points immediately. */
  pendingIds: string[]
  streak: number | null
  dailyCap: number | null
  origin: 'server' | 'demo' | 'unknown'
}
