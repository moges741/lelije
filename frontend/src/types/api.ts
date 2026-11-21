/** Response shapes of the Nest API (backend/README.md). */

export type Verified = 'pose' | 'self'
export type CompletionStatus = 'approved' | 'pending' | 'rejected'
export type PlayStatus = 'sent' | 'allowed' | 'later' | 'declined'
export type PlayAnswer = Exclude<PlayStatus, 'sent'>

/** What a camera mission sends with its completion. */
export interface PoseResult {
  count: number
  durationMs: number
}

export interface PlayRequest {
  id: string
  childId: string
  nickname: string | null
  status: PlayStatus
  requestedAt: string
  answeredAt: string | null
}

/** GET /progress?childId= and each child of GET /families/:code/progress */
export interface Progress {
  childId: string
  nickname: string | null
  totalPoints: number
  pointsToday: number
  dailyCap: number
  streak: number
  today: {
    day: string
    missionsCompleted: { missionId: string; points: number }[]
    missionsPending: { missionId: string; points: number }[]
    missionsToRedo: { missionId: string }[]
    game: { score: number; points: number } | null
    playRequest: Pick<PlayRequest, 'id' | 'status' | 'requestedAt' | 'answeredAt'> | null
  }
}

/** POST /missions/complete */
export interface CompletionSaved {
  completionId: string
  status: CompletionStatus
  alreadyCompleted: boolean
  pointsAwarded: number
  pointsToday: number
  dailyCap: number
}

/** POST /games/result */
export interface GameSaved {
  score: number
  alreadyRecorded: boolean
  pointsAwarded: number
  pointsToday: number
  dailyCap: number
}

/** GET /families/:code/reviews */
export interface Review {
  id: string
  childId: string
  nickname: string | null
  missionId: string
  title: string | null
  points: number
  verifiedBy: Verified
  completedAt: string
}

/** POST /completions/:id/review */
export interface ReviewSaved {
  id: string
  status: CompletionStatus
  alreadyReviewed: boolean
  pointsAwarded: number
}

export type NotificationKind =
  | 'mission_pending'
  | 'mission_approved'
  | 'mission_rejected'
  | 'play_sent'
  | 'play_answered'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  childId: string
  nickname: string | null
  read: boolean
  at: string
}

export type Audience = { audience: 'parent' } | { audience: 'child'; childId: string }

/** GET /families/:code/activity */
export type ActivityItem =
  | {
      kind: 'mission'
      id: string
      childId: string
      nickname: string | null
      title: string | null
      status: CompletionStatus
      points: number
      verifiedBy: Verified
      at: string
    }
  | {
      kind: 'game'
      id: string
      childId: string
      nickname: string | null
      score: number
      points: number
      at: string
    }

/** Each child of GET /families/:code/report */
export interface ChildReport {
  childId: string
  nickname: string | null
  totalPoints: number
  pointsInPeriod: number
  streak: number
  period: {
    missionsApproved: number
    missionsPending: number
    missionsRejected: number
    gamesPlayed: number
  }
}
