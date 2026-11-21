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

/** Clean unboxed semantic status indicator: icon + text label, never color-only or pill clutter. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`status status-${tone}`}>
      <Icon name={ICON[tone]} size={15} />
      <span>{children}</span>
    </span>
  )
}
