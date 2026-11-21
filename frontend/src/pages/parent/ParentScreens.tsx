import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { DemoCompletion, DemoNote, DemoPlay, FamilyChildProgress } from '../../api/client'
import { Icon } from '../../components/Icon'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { PinPrompt } from '../../components/PinPrompt'
import { Panel } from '../../components/TextField'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import type { ChildRecord } from '../../types/account'
import type { TranslationKey } from '../../i18n'

function useParent() {
  const app = useApp()
  const ready = app.session?.role === 'parent' ? app.session : null
  return { ...app, parent: ready }
}

export function ParentHome() {
  const { t, parent, signOut, setSession } = useParent()
  const navigate = useNavigate()
  const [children, setChildren] = useState<ChildRecord[]>([])
  const [report, setReport] = useState<FamilyChildProgress[] | null>(null)
  const [pending, setPending] = useState<DemoCompletion[]>([])
  const [notes, setNotes] = useState<DemoNote[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'offline'>('loading')

  useEffect(() => {
    if (!parent) return
    let ignore = false
    void (async () => {
      const [family, progress] = await Promise.all([
        api.lookupFamily(parent.family.code),
        parent.origin === 'server' ? api.loadFamilyProgress(parent.family.code) : Promise.resolve(null),
      ])
      if (ignore) return
      if (family.ok) {
        setChildren(family.data.children)
        setStatus('ready')
      } else setStatus(family.error === 'network' ? 'offline' : 'ready')
      setReport(progress)
      setPending(parent.origin === 'demo' ? api.listPending(parent.family.code) : [])
      setNotes(api.notesFor(parent.family.code, 'parent'))
    })()
    return () => {
      ignore = true
    }
  }, [parent])

  if (!parent) return <Navigate to="/login" replace />
  const unread = notes.filter((item) => !item.read).length

  return (
    <main className="screen screen-wide">
      <TopBar>
        <LanguageSwitcher />
        <Link className="icon-btn" to="/parent/notifications" aria-label={t('notifications')}>
          <Icon name="bell" />
          {unread > 0 && <span className="dot">{unread}</span>}
        </Link>
        <Link className="icon-btn" to="/parent/settings" aria-label={t('settings')}>
          <Icon name="settings" />
        </Link>
      </TopBar>
      {parent.origin === 'demo' && <p className="banner banner-demo">{t('demoBanner')}</p>}
      <div>
        <h1 className="title">{parent.family.name}</h1>
        <p className="lead">{t('parentLead')}</p>
      </div>
      <p className="code-chip">{parent.family.code}</p>
      {status === 'loading' && <p className="lead">{t('loading')}</p>}
      {status === 'offline' && <p className="banner banner-demo">{t('networkError')}</p>}

      <div className="parent-grid">
        <Panel>
          <h2 className="panel-title">{t('children')}</h2>
          {report && report.length > 0 ? (
            <ul className="facts">
              {report.map((child) => (
                <li key={child.childId}>
                  <strong>{child.nickname || t('childProfile')}</strong>
                  {` · ${child.totalPoints} ${t('points')}`}
                </li>
              ))}
            </ul>
          ) : children.length === 0 ? (
            <p className="lead">{t('noChildrenYet')}</p>
          ) : (
            <ul className="facts">
              {children.map((child) => (
                <li key={child.id}>
                  <strong>{child.nickname || t('childProfile')}</strong> · {t('age')} {child.age}
                </li>
              ))}
            </ul>
          )}
          <Link className="btn btn-plain" to="/family">
            {t('addChildTitle')}
          </Link>
        </Panel>

        <Panel>
          <h2 className="panel-title">{t('pendingReviews')}</h2>
          <p className="hint">{t('approvalMissing')}</p>
          {pending.length === 0 ? (
            <p className="lead">{t('noPending')}</p>
          ) : (
            <ul className="mission-list">
              {pending.map((item) => (
                <li key={item.id}>
                  <Link className="mission-card" to={`/parent/review/${item.id}`}>
                    <span className="mission-body">
                      <strong>{item.title}</strong>
                      <span>
                        +{item.points} · {t('demoReviewNote')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <h2 className="panel-title">{t('playTime')}</h2>
          <p className="hint">{t('demoBanner')}</p>
          {children[0] ? (
            <button
              type="button"
              className="btn btn-sun"
              onClick={() =>
                api.sendPlayRequest({
                  familyCode: parent.family.code,
                  childId: children[0].id,
                  childName: children[0].nickname || t('childProfile'),
                })
              }
            >
              {t('sendPlayNudge')}
            </button>
          ) : (
            <p className="lead">{t('noChildrenYet')}</p>
          )}
          {children[0] && (
            <button
              type="button"
              className="btn btn-plain"
              onClick={() => {
                setSession({
                  role: 'child',
                  origin: parent.origin,
                  family: parent.family,
                  child: children[0],
                })
                navigate('/missions')
              }}
            >
              {t('openChild')}
            </button>
          )}
          <Link className="btn btn-plain" to="/parent/play">
            {t('reviewPlay')}
          </Link>
        </Panel>

        <Panel>
          <h2 className="panel-title">
            {t('notifications')} {unread > 0 ? `(${unread})` : ''}
          </h2>
          <Link className="btn btn-plain" to="/parent/notifications">
            {t('notifications')}
          </Link>
          <Link className="btn btn-plain" to="/parent/activity">
            {t('activity')}
          </Link>
          <Link className="btn btn-plain" to="/parent/routines">
            {t('routinesTitle')}
          </Link>
        </Panel>
      </div>
      <button type="button" className="btn btn-plain" onClick={signOut}>
        {t('signOut')}
      </button>
    </main>
  )
}

export function MissionReview() {
  const { t, parent } = useParent()
  const { id } = useParams()
  const [item, setItem] = useState<DemoCompletion | null>(null)
  const [asking, setAsking] = useState<'approved' | 'rejected' | null>(null)

  useEffect(() => {
    if (!parent || !id) return
    setItem(api.listPending(parent.family.code).find((row) => row.id === id) ?? null)
  }, [parent, id])

  if (!parent) return <Navigate to="/login" replace />

  const decide = (decision: 'approved' | 'rejected') => {
    if (!item) return
    api.reviewDemoMission(item.id, decision)
    setItem(null)
    setAsking(null)
  }

  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('reviewTitle')}</h1>
      <p className="banner banner-demo">{t('demoReviewNote')}</p>
      {!item ? (
        <p className="lead">{t('noPending')}</p>
      ) : (
        <Panel>
          <h2 className="panel-title">{item.title}</h2>
          <p className="lead">
            +{item.points} {t('points')} · {item.verifiedBy}
          </p>
          <p className="hint">{t('reviewLead')}</p>
          <div className="row-actions">
            <button type="button" className="btn btn-sun" onClick={() => setAsking('approved')}>
              {t('approve')}
            </button>
            <button type="button" className="btn btn-plain" onClick={() => setAsking('rejected')}>
              {t('reject')}
            </button>
          </div>
        </Panel>
      )}
      {item && asking && (
        <PinPrompt
          familyCode={parent.family.code}
          onSuccess={() => decide(asking)}
          onCancel={() => setAsking(null)}
        />
      )}
    </main>
  )
}

export function PlayReview() {
  const { t, parent } = useParent()
  const [rows, setRows] = useState<DemoPlay[]>([])
  const [asking, setAsking] = useState<{ id: string; status: 'allowed' | 'later' | 'declined' } | null>(null)
  useEffect(() => {
    if (parent) setRows(api.playRequests(parent.family.code))
  }, [parent])
  if (!parent) return <Navigate to="/login" replace />

  const answer = (id: string, status: 'allowed' | 'later' | 'declined') => {
    api.answerPlay(id, status)
    setRows(api.playRequests(parent.family.code))
    setAsking(null)
  }

  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('playTime')}</h1>
      <p className="banner banner-demo">{t('demoBanner')}</p>
      {rows.length === 0 ? (
        <p className="lead">{t('noPlay')}</p>
      ) : (
        <ul className="mission-list">
          {rows.map((row) => (
            <li key={row.id} className="panel">
              <strong>{row.childName}</strong>
              <p className="lead">{t(playKey(row.status))}</p>
              {row.status === 'sent' && (
                <div className="row-actions">
                  <button type="button" className="btn btn-sun" onClick={() => setAsking({ id: row.id, status: 'allowed' })}>
                    {t('allowPlay')}
                  </button>
                  <button type="button" className="btn btn-plain" onClick={() => setAsking({ id: row.id, status: 'later' })}>
                    {t('laterPlay')}
                  </button>
                  <button type="button" className="btn btn-plain" onClick={() => setAsking({ id: row.id, status: 'declined' })}>
                    {t('declinePlay')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <PinPrompt
          familyCode={parent.family.code}
          onSuccess={() => answer(asking.id, asking.status)}
          onCancel={() => setAsking(null)}
        />
      )}
    </main>
  )
}

function playKey(status: DemoPlay['status']): TranslationKey {
  if (status === 'allowed') return 'playAllowed'
  if (status === 'later') return 'playLater'
  if (status === 'declined') return 'playDeclined'
  return 'playSent'
}

export function Activity() {
  const { t, parent } = useParent()
  const [rows, setRows] = useState<DemoCompletion[]>([])
  useEffect(() => {
    if (parent) setRows(api.listActivity(parent.family.code))
  }, [parent])
  if (!parent) return <Navigate to="/login" replace />
  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('activity')}</h1>
      <p className="banner banner-demo">{t('activityDemoNote')}</p>
      {rows.length === 0 ? (
        <p className="lead">{t('noActivity')}</p>
      ) : (
        <ul className="facts">
          {rows.map((row) => (
            <li key={row.id}>
              {row.title} · +{row.points} · {row.status}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

export function Routines() {
  const { t, parent } = useParent()
  const [minutes, setMinutes] = useState(20)
  if (!parent) return <Navigate to="/login" replace />
  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('routinesTitle')}</h1>
      <p className="lead">{t('routinesLead')}</p>
      <p className="banner">{t('sampleData')}</p>
      <label className="text-field">
        <span>{t('playMinutes')}</span>
        <input
          type="number"
          min={5}
          max={60}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
        />
      </label>
      <p className="hint">{t('notSurveillance')}</p>
    </main>
  )
}

const NOTE_KEY: Record<DemoNote['kind'], TranslationKey> = {
  mission_pending: 'noteMissionPending',
  mission_approved: 'noteMissionApproved',
  mission_rejected: 'noteMissionRejected',
  play_sent: 'notePlaySent',
  play_answered: 'notePlayAnswered',
}

export function Notifications({ audience }: { audience: 'parent' | 'child' }) {
  const { t, session } = useApp()
  const [rows, setRows] = useState<DemoNote[]>([])
  useEffect(() => {
    if (!session) return
    api.markNotesRead(session.family.code, audience)
    setRows(api.notesFor(session.family.code, audience))
  }, [audience, session])
  if (!session) return <Navigate to="/login" replace />
  return (
    <main className="screen">
      <TopBar backTo={audience === 'parent' ? '/parent' : '/missions'} />
      <h1 className="title">{t('notifications')}</h1>
      <p className="banner banner-demo">{t('demoBanner')}</p>
      {rows.length === 0 ? (
        <p className="lead">{t('noNotifications')}</p>
      ) : (
        <ul className="facts">
          {rows.map((row) => (
            <li key={row.id}>{t(NOTE_KEY[row.kind])}</li>
          ))}
        </ul>
      )}
    </main>
  )
}

export function ParentSettings() {
  const { t, parent, signOut } = useParent()
  if (!parent) return <Navigate to="/login" replace />
  return (
    <main className="screen">
      <TopBar backTo="/parent">
        <LanguageSwitcher />
      </TopBar>
      <h1 className="title">{t('settingsTitle')}</h1>
      <p className="lead">{t('privacyNote')}</p>
      <p className="hint">{t('notSurveillance')}</p>
      <p className="code-chip">{parent.family.code}</p>
      <button type="button" className="btn btn-plain btn-block" onClick={signOut}>
        {t('signOut')}
      </button>
    </main>
  )
}
