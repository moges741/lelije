import type { AppLanguage } from './mission'

/** Ages the product asks for. The server accepts 4–14. */
export const CHILD_AGES = [5, 6, 7, 8, 9, 10, 11, 12, 13] as const

export interface FamilyRecord {
  id: string
  name: string
  code: string
  hasPin: boolean
}

export interface ChildRecord {
  id: string
  familyId: string
  age: number
  language: AppLanguage
  nickname: string | null
}

export interface FamilyWithChildren {
  family: FamilyRecord
  children: ChildRecord[]
}

export interface Session {
  role: 'parent' | 'child'
  family: FamilyRecord
  child: ChildRecord | null
}
