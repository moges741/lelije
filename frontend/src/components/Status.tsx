import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export type StatusTone = 'done' | 'waiting' | 'redo' | 'info' | 'problem'

const ICON: Record<StatusTone, IconName> = {
  done: 'check',
  waiting: 'clock',
  redo: 'close',
  info: 'shield',
  problem: 'alert',
}

/** A status is always an icon plus a word, never colour alone. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status status-${tone}`}>
      <Icon name={ICON[tone]} size={16} />
      {children}
    </span>
  )
}
