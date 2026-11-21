import { Link } from 'react-router-dom'
import * as api from '../api/client'
import { LoadState } from '../components/LoadState'
import { ParentShell } from '../components/ParentShell'
import { StatusPill } from '../components/Status'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import type { TranslationKey } from '../i18n'
import { groupByDay, whenText } from '../lib/time'
import { useRemote } from '../lib/useRemote'
import type { Audience, NotificationKind } from '../types/api'

const NOTE_TEXT: Record<NotificationKind, TranslationKey> = {
  mission_pending: 'noteMissionPending',
  mission_approved: 'noteMissionApproved',
  mission_rejected: 'noteMissionRejected',
  play_sent: 'notePlaySent',
  play_answered: 'notePlayAnswered',
}

const NOTE_LINK: Record<NotificationKind, string> = {
  mission_pending: '/parent',
  play_sent: '/parent/play',
  mission_approved: '/missions',
  mission_rejected: '/missions',
  play_answered: '/child/play',
}

/** A grown-up's or one child's notifications. Opening the list marks them read. */
export function Notifications({ audience }: { audience: Audience['audience'] }) {
  const { t, language, session } = useApp()
  const code = session?.family.code ?? ''
  const childId = session?.child?.id ?? ''
  const notes = useRemote(session ? `notes:${audience}:${code}:${childId}` : null, async () => {
    const who: Audience = audience === 'parent' ? { audience } : { audience, childId }
    const result = await api.notifications(code, who)
    if (result.ok && result.data.unread > 0) void api.markNotificationsRead(code, who)
    return result
  })

  const body = !notes.data ? (
    <LoadState error={notes.error} onRetry={notes.reload} />
  ) : notes.data.notifications.length === 0 ? (
    <div className="panel">
      <p className="lead">{t('noNotifications')}</p>
    </div>
  ) : (
    groupByDay(notes.data.notifications, (note) => note.at).map((group) => (
      <section key={group.key} className="stack">
        <h2 className="feed-day">{t(group.key)}</h2>
        <ul className="feed">
          {group.items.map((note) => (
            <li key={note.id}>
              <Link className={`feed-item ${!note.read ? 'is-unread' : ''}`} to={NOTE_LINK[note.kind]}>
                <span className="feed-text">
                  {audience === 'parent' && <strong>{note.nickname || t('childProfile')}</strong>}
                  <span>{t(NOTE_TEXT[note.kind])}</span>
                </span>
                <span className="feed-meta">
                  {!note.read && <StatusPill tone="info">{t('newLabel')}</StatusPill>}
                  <span>{whenText(note.at, language)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ))
  )

  if (audience === 'parent') {
    return <ParentShell title={t('notifications')}>{body}</ParentShell>
  }

  return (
    <div className="theme-child">
      <main className="screen screen-narrow">
        <TopBar backTo="/missions" />
        <h1 className="title">{t('notifications')}</h1>
        {body}
      </main>
    </div>
  )
}
