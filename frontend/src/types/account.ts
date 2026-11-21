import type { AppLanguage } from './mission'

/** Ages the product asks for. The server currently accepts 4–14. */
export const CHILD_AGES = [5, 6, 7, 8, 9, 10, 11, 12, 13] as const

export type DataOrigin = 'server' | 'demo'

export interface FamilyRecord {
  id: string
  name: string
  code: string
}

export interface ChildRecord {
  id: string
  familyId: string
  age: number
  language: AppLanguage
  nickname: string | null
}

export interface Session {
  role: 'parent' | 'child'
  origin: DataOrigin
  family: FamilyRecord
  child: ChildRecord | null
}

export type AccountError =
  | 'network'
  | 'not_found'
  | 'invalid'
  | 'expired_demo'
  | 'used_demo'
  | 'unavailable'

export interface AccountResult<T> {
  ok: true
  data: T
  origin: DataOrigin
}

export interface AccountFailure {
  ok: false
  error: AccountError
}
