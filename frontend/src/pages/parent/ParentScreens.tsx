import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { Failure, Result } from '../../api/http'
import { Icon } from '../../components/Icon'
import { LanguageSwitcher } from '../../components/LanguageSwitcher'
import { LoadState } from '../../components/LoadState'
import { PinPrompt } from '../../components/PinPrompt'
import { StatusPill, type StatusTone } from '../../components/Status'
import { Panel, SecretField } from '../../components/TextField'
import { TopBar } from '../../components/TopBar'
import { useApp } from '../../context/app-context'
import type { TranslationKey } from '../../i18n'
import { failureKey, pinFailureKey } from '../../lib/failure'
import { isValidPin, PIN_LENGTH, pinDigits } from '../../lib/pin'
import { groupByDay, whenText } from '../../lib/time'
import { useRemote } from '../../lib/useRemote'
import type { ChildRecord } from '../../types/account'
import type {
  ActivityItem,
  ChildReport,
  CompletionStatus,
  PlayAnswer,
  PlayRequest,
  PlayStatus,
  Progress,
  Review,
} from '../../types/api'
import { Notifications as NotificationList } from '../Notifications'

function useParent() {
  const app = useApp()
  return { ...app, parent: app.session?.role === 'parent' ? app.session : null }
}

type Toast = 'approved' | 'rejected'

function toastFrom(state: unknown): Toast | null {
  if (typeof state !== 'object' || state === null || !('toast' in state)) return null
  return state.toast === 'approved' || state.toast === 'rejected' ? state.toast : null
}

interface Home {
  hasPin: boolean
  children: ChildRecord[]
  progress: Progress[]
  reviews: Review[]
  waitingPlay: PlayRequest[]
  unread: number
}

async function loadHome(code: string): Promise<Result<Home>> {
  const [family, progress, reviews, play, notes] = await Promise.all([
    api.findFamily(code),
    api.familyProgress(code),
    api.pendingReviews(code),
    api.playRequests(code),
    api.notifications(code, { audience: 'parent' }),
  ])
  if (!family.ok) return family
  if (!progress.ok) return progress
  if (!reviews.ok) return reviews
  if (!play.ok) return play
  if (!notes.ok) return notes
  return {
    ok: true,
    data: {
      hasPin: family.data.family.hasPin,
      children: family.data.children,
      progress: progress.data,
      reviews: reviews.data,
      waitingPlay: play.data.filter((request) => request.status === 'sent'),
      unread: notes.data.unread,
    },
  }
}

/** The grown-up's home: what is waiting for them first, then each child. */
export function ParentHome() {
  const { t, parent, setSession, signOut } = useParent()
  const navigate = useNavigate()
  const location = useLocation()
  const code = parent?.family.code ?? ''
  const home = useRemote(parent ? `home:${code}` : null, () => loadHome(code), 15_000)
  const toast = toastFrom(location.state)

  useEffect(() => {
    if (home.error === 'not_found') signOut()
  }, [home.error, signOut])

  useEffect(() => {
    if (parent && home.data && home.data.hasPin !== parent.family.hasPin) {
      setSession({ ...parent, family: { ...parent.family, hasPin: home.data.hasPin } })
    }
  }, [home.data, parent, setSession])

  if (!parent) return null

  const openChild = (child: ChildRecord) => {
    setSession({ role: 'child', family: parent.family, child })
    navigate('/missions')
  }

  const data = home.data
  const waitingCount = data ? data.reviews.length + data.waitingPlay.length : 0

  return (
    <main className="screen screen-wide">
      <TopBar>
        <LanguageSwitcher />
        <Link className="icon-btn" to="/parent/notifications" aria-label={t('notifications')}>
          <Icon name="bell" />
          {data && data.unread > 0 && <span className="dot">{data.unread}</span>}
        </Link>
        <Link className="icon-btn" to="/parent/settings" aria-label={t('settings')}>
          <Icon name="settings" />
        </Link>
      </TopBar>
      <div>
        <h1 className="title">{parent.family.name}</h1>
        <p className="lead">{t('parentLead')}</p>
      </div>
      {toast && (
        <p className="banner banner-ok" role="status">
          {t(toast === 'approved' ? 'approvedToast' : 'rejectedToast')}
        </p>
      )}
      {data && home.error === 'network' && (
        <p className="banner banner-warn" role="status">
          {t('networkError')}
        </p>
      )}

      {!data ? (
        <LoadState error={home.error} onRetry={home.reload} />
      ) : (
        <div className="parent-grid">
          <Panel>
            <h2 className="panel-title">
              {t('waitingForYou')} {waitingCount > 0 && `(${waitingCount})`}
            </h2>
            {waitingCount === 0 ? (
              <p className="lead">{t('noPending')}</p>
            ) : (
              <ul className="mission-list">
                {data.reviews.map((item) => (
                  <li key={item.id}>
                    <Link className="mission-card" to={`/parent/review/${encodeURIComponent(item.id)}`}>
                      <span className="mission-icon">
                        <Icon name={item.verifiedBy === 'pose' ? 'camera' : 'hand'} size={26} />
                      </span>
                      <span className="mission-body">
                        <strong>{item.title ?? t('missionFallbackTitle')}</strong>
                        <span>
                          {item.nickname || t('childProfile')} · +{item.points}
                        </span>
                      </span>
                      <span className="mission-go" aria-hidden="true">
                        <Icon name="play" size={20} />
                      </span>
                    </Link>
                  </li>
                ))}
                {data.waitingPlay.map((item) => (
                  <li key={item.id}>
                    <Link className="mission-card" to="/parent/play">
                      <span className="mission-icon">
                        <Icon name="clock" size={26} />
                      </span>
                      <span className="mission-body">
                        <strong>{item.nickname || t('childProfile')}</strong>
                        <span>{t('asksForPlay')}</span>
                      </span>
                      <span className="mission-go" aria-hidden="true">
                        <Icon name="play" size={20} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="panel-title">{t('children')}</h2>
            {data.children.length === 0 ? (
              <p className="lead">{t('noChildrenYet')}</p>
            ) : (
              <ul className="child-list">
                {data.children.map((child) => {
                  const stats = data.progress.find((row) => row.childId === child.id)
                  return (
                    <li key={child.id} className="child-row">
                      <span className="mission-body">
                        <strong>{child.nickname || t('childProfile')}</strong>
                        <span>
                          {t('age')} {child.age}
                          {stats && ` · ${stats.pointsToday} / ${stats.dailyCap} ${t('pointsToday')}`}
                        </span>
                        {stats && (
                          <span>
                            {stats.streak} {t('streak')} · {stats.totalPoints} {t('totalPoints')}
                          </span>
                        )}
                      </span>
                      <button type="button" className="btn btn-plain" onClick={() => openChild(child)}>
                        {t('openChild')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <Link className="btn btn-plain" to="/family">
              {t('addChildTitle')}
            </Link>
          </Panel>

          <Panel>
            <h2 className="panel-title">{t('familyCode')}</h2>
            <p className="code-chip">{parent.family.code}</p>
            <Link className="btn btn-plain" to="/parent/activity">
              {t('activity')}
            </Link>
            <Link className="btn btn-plain" to="/parent/play">
              {t('reviewPlay')}
            </Link>
          </Panel>
        </div>
      )}
      <button type="button" className="btn btn-plain" onClick={signOut}>
        {t('signOut')}
      </button>
    </main>
  )
}

export function MissionReview() {
  const { id = '' } = useParams()
  const { t, language, parent } = useParent()
  const navigate = useNavigate()
  const code = parent?.family.code ?? ''
  const reviews = useRemote(parent ? `reviews:${code}` : null, () => api.pendingReviews(code))
  const [asking, setAsking] = useState<'approve' | 'reject' | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  if (!parent) return null

  const item = reviews.data?.find((row) => row.id === id) ?? null

  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('reviewTitle')}</h1>
      {failed && (
        <p className="banner banner-warn" role="alert">
          {t(failureKey(failed))}
        </p>
      )}
      {!reviews.data ? (
        <LoadState error={reviews.error} onRetry={reviews.reload} />
      ) : !item ? (
        <div className="empty">
          <p className="lead">{t('reviewGone')}</p>
          <Link className="btn btn-plain" to="/parent">
            {t('parentHome')}
          </Link>
        </div>
      ) : (
        <Panel>
          <h2 className="panel-title">{item.title ?? t('missionFallbackTitle')}</h2>
          <ul className="facts">
            <li>
              <Icon name="child" />
              {item.nickname || t('childProfile')}
            </li>
            <li>
              <Icon name="star" />+{item.points} {t('points')}
            </li>
            <li>
              <Icon name={item.verifiedBy === 'pose' ? 'camera' : 'hand'} />
              {t(item.verifiedBy === 'pose' ? 'verifiedByCamera' : 'verifiedBySelf')}
            </li>
            <li>
              <Icon name="clock" />
              {whenText(item.completedAt, language)}
            </li>
          </ul>
          <p className="lead">{t('reviewLead')}</p>
          <div className="row-actions">
            <button type="button" className="btn btn-sun" onClick={() => setAsking('approve')}>
              {t('approve')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setAsking('reject')}>
              {t('reject')}
            </button>
          </div>
        </Panel>
      )}
      {item && asking && (
        <PinPrompt
          family={parent.family}
          action={(pin) => api.reviewMission(item.id, { familyCode: code, pin, decision: asking })}
          onCancel={() => setAsking(null)}
          onDone={(result) => {
            setAsking(null)
            if (!result.ok) {
              setFailed(result.error)
              reviews.reload()
              return
            }
            const toast: Toast = result.data.status === 'approved' ? 'approved' : 'rejected'
            navigate('/parent', { replace: true, state: { toast } })
          }}
        />
      )}
    </main>
  )
}

const PLAY_LABEL: Record<PlayStatus, { tone: StatusTone; label: TranslationKey }> = {
  sent: { tone: 'waiting', label: 'playStatusSent' },
  allowed: { tone: 'done', label: 'playStatusAllowed' },
  later: { tone: 'info', label: 'laterPlay' },
  declined: { tone: 'redo', label: 'declinePlay' },
}

const ANSWERS: { answer: PlayAnswer; label: TranslationKey; className: string }[] = [
  { answer: 'allowed', label: 'allowPlay', className: 'btn btn-sun' },
  { answer: 'later', label: 'laterPlay', className: 'btn btn-plain' },
  { answer: 'declined', label: 'declinePlay', className: 'btn btn-plain' },
]

export function PlayReview() {
  const { t, language, parent } = useParent()
  const code = parent?.family.code ?? ''
  const requests = useRemote(parent ? `play:${code}` : null, () => api.playRequests(code), 15_000)
  const [asking, setAsking] = useState<{ id: string; answer: PlayAnswer } | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  if (!parent) return null

  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('playTime')}</h1>
      {failed && (
        <p className="banner banner-warn" role="alert">
          {t(failureKey(failed))}
        </p>
      )}
      {!requests.data ? (
        <LoadState error={requests.error} onRetry={requests.reload} />
      ) : requests.data.length === 0 ? (
        <p className="lead">{t('noPlay')}</p>
      ) : (
        <ul className="mission-list">
          {requests.data.map((row) => (
            <li key={row.id} className="panel">
              <div className="split">
                <strong>{row.nickname || t('childProfile')}</strong>
                <StatusPill tone={PLAY_LABEL[row.status].tone}>{t(PLAY_LABEL[row.status].label)}</StatusPill>
              </div>
              <span className="meta">{whenText(row.requestedAt, language)}</span>
              {row.status === 'sent' && (
                <div className="row-actions">
                  {ANSWERS.map((option) => (
                    <button
                      key={option.answer}
                      type="button"
                      className={option.className}
                      onClick={() => setAsking({ id: row.id, answer: option.answer })}
                    >
                      {t(option.label)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <PinPrompt
          family={parent.family}
          action={(pin) => api.answerPlay(asking.id, { familyCode: code, pin, answer: asking.answer })}
          onCancel={() => setAsking(null)}
          onDone={(result) => {
            setAsking(null)
            setFailed(result.ok ? null : result.error)
            requests.reload()
          }}
        />
      )}
    </main>
  )
}

const MISSION_STATUS: Record<CompletionStatus, { tone: StatusTone; label: TranslationKey }> = {
  approved: { tone: 'done', label: 'statusApproved' },
  pending: { tone: 'waiting', label: 'statusPending' },
  rejected: { tone: 'redo', label: 'statusRedo' },
}

async function loadActivity(code: string): Promise<Result<{ report: ChildReport[]; items: ActivityItem[] }>> {
  const [report, items] = await Promise.all([api.report(code), api.activity(code)])
  if (!report.ok) return report
  if (!items.ok) return items
  return { ok: true, data: { report: report.data, items: items.data } }
}

/** The last 7 days: one summary per child, then everything they did, newest first. */
export function Activity() {
  const { t, language, parent } = useParent()
  const code = parent?.family.code ?? ''
  const activity = useRemote(parent ? `activity:${code}` : null, () => loadActivity(code))
  if (!parent) return null
  const data = activity.data

  return (
    <main className="screen">
      <TopBar backTo="/parent" />
      <h1 className="title">{t('activity')}</h1>
      {!data ? (
        <LoadState error={activity.error} onRetry={activity.reload} />
      ) : (
        <>
          <section className="stack">
            <h2 className="panel-title">{t('reportTitle')}</h2>
            {data.report.length === 0 && <p className="lead">{t('noChildrenYet')}</p>}
            {data.report.map((child) => (
              <Panel key={child.childId}>
                <div className="split">
                  <strong className="panel-title">{child.nickname || t('childProfile')}</strong>
                  <span className="meta">
                    {child.totalPoints} {t('totalPoints')}
                  </span>
                </div>
                <ul className="facts">
                  <li>
                    <Icon name="star" />
                    {child.pointsInPeriod} {t('pointsInWeek')}
                  </li>
                  <li>
                    <Icon name="flame" />
                    {child.streak} {t('streak')}
                  </li>
                  <li>
                    <Icon name="check" />
                    {child.period.missionsApproved} {t('missionsApproved')}
                  </li>
                  {child.period.missionsPending > 0 && (
                    <li>
                      <Icon name="clock" />
                      {child.period.missionsPending} {t('missionsWaiting')}
                    </li>
                  )}
                  <li>
                    <Icon name="play" />
                    {child.period.gamesPlayed} {t('gamesPlayed')}
                  </li>
                </ul>
              </Panel>
            ))}
          </section>

          <section className="stack">
            <h2 className="panel-title">{t('recentActivity')}</h2>
            {data.items.length === 0 && <p className="lead">{t('noActivity')}</p>}
            {groupByDay(data.items, (item) => item.at).map((group) => (
              <div key={group.key} className="stack">
                <h3 className="feed-day">{t(group.key)}</h3>
                <ul className="feed">
                  {group.items.map((item) => (
                    <li key={`${item.kind}:${item.id}`} className="feed-item">
                      <span className="feed-text">
                        <strong>{item.nickname || t('childProfile')}</strong>
                        <span>
                          {item.kind === 'mission'
                            ? (item.title ?? t('missionFallbackTitle'))
                            : `${t('playCatchStars')} · ${t('gameScore')} ${item.score}`}
                        </span>
                      </span>
                      <span className="feed-meta">
                        {item.kind === 'mission' && (
                          <StatusPill tone={MISSION_STATUS[item.status].tone}>
                            {t(MISSION_STATUS[item.status].label)}
                          </StatusPill>
                        )}
                        {item.points > 0 && <span>+{item.points}</span>}
                        <span>{whenText(item.at, language)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  )
}

export function ParentNotifications() {
  return <NotificationList audience="parent" />
}

export function ParentSettings() {
  const { t, parent, setSession, signOut } = useParent()
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<TranslationKey | null>(null)
  if (!parent) return null

  const needsCurrent = parent.family.hasPin

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValidPin(nextPin) || (needsCurrent && !isValidPin(currentPin))) {
      setMessage('pinInvalid')
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await api.setFamilyPin(parent.family.code, nextPin, needsCurrent ? currentPin : undefined)
    setBusy(false)
    if (!result.ok) {
      setMessage(pinFailureKey(result.error))
      return
    }
    setSession({ ...parent, family: { ...parent.family, hasPin: true } })
    setCurrentPin('')
    setNextPin('')
    setMessage('pinSaved')
  }

  return (
    <main className="screen">
      <TopBar backTo="/parent">
        <LanguageSwitcher />
      </TopBar>
      <h1 className="title">{t('settingsTitle')}</h1>
      <p className="lead">{t('privacyNote')}</p>
      <p className="hint">{t('notSurveillance')}</p>
      <p className="code-chip">{parent.family.code}</p>
      <form className="auth-form" onSubmit={(event) => void save(event)}>
        <h2 className="panel-title">{t('pinChangeTitle')}</h2>
        {needsCurrent && (
          <SecretField
            name="currentPin"
            inputMode="numeric"
            pattern="[0-9]*"
            label={t('pinCurrent')}
            value={currentPin}
            maxLength={PIN_LENGTH}
            autoComplete="off"
            onChange={(event) => setCurrentPin(pinDigits(event.target.value))}
          />
        )}
        <SecretField
          name="newPin"
          inputMode="numeric"
          pattern="[0-9]*"
          label={t('pinNew')}
          value={nextPin}
          maxLength={PIN_LENGTH}
          autoComplete="new-password"
          onChange={(event) => setNextPin(pinDigits(event.target.value))}
        />
        {message && (
          <p className={message === 'pinSaved' ? 'banner banner-ok' : 'banner banner-warn'} role="status">
            {t(message)}
          </p>
        )}
        <button type="submit" className="btn btn-sun btn-block" disabled={busy} aria-busy={busy}>
          {busy ? t('saving') : t('pinChangeTitle')}
        </button>
      </form>
      <button type="button" className="btn btn-plain btn-block" onClick={signOut}>
        {t('signOut')}
      </button>
    </main>
  )
}
