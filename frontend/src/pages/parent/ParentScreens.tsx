import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as api from '../../api/client'
import type { Failure, Result } from '../../api/http'
import { Icon } from '../../components/Icon'
import { LoadState } from '../../components/LoadState'
import { ParentShell } from '../../components/ParentShell'
import { PinPrompt } from '../../components/PinPrompt'
import { StatusPill, type StatusTone } from '../../components/Status'
import { Panel, SecretField } from '../../components/TextField'
import { useApp } from '../../context/app-context'
import type { TranslationKey } from '../../i18n'
import { failureKey, pinFailureKey } from '../../lib/failure'
import { isValidPin, PIN_LENGTH, pinDigits } from '../../lib/pin'
import { activityDisplayName } from '../../lib/pose/activityMeta'
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
  WeeklySummary,
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

/** Calm Executive Parent Overview: flat KPI strip, priority approvals queue, and children progress roster. */
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

  const openChild = async (child: ChildRecord) => {
    const auth = await api.childLogin(parent.family.code, child.id)
    if (auth.ok) {
      setSession({ role: 'child', family: auth.data.family, child: auth.data.child })
    } else {
      setSession({ role: 'child', family: parent.family, child })
    }
    navigate('/missions')
  }

  const data = home.data
  const pendingMissions = data ? data.reviews.length : 0
  const pendingPlay = data ? data.waitingPlay.length : 0
  const waitingCount = pendingMissions + pendingPlay
  const familyPointsToday = data
    ? data.progress.reduce((sum, row) => sum + row.pointsToday, 0)
    : 0

  return (
    <ParentShell
      title={parent.family.name}
      subtitle={t('parentLead')}
      unreadCount={data?.unread ?? 0}
      waitingPlayCount={pendingPlay}
      action={
        <Link className="btn btn-primary btn-sm" to="/family">
          + {t('addChildTitle')}
        </Link>
      }
    >
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
        <>
          <section className="exec-kpi-strip" aria-label={t('parentHome')}>
            <div className={`exec-kpi ${pendingMissions > 0 ? 'is-attention' : ''}`}>
              <span className="exec-kpi-label">{t('missionsWaiting')}</span>
              <strong className="exec-kpi-value">{pendingMissions}</strong>
            </div>
            <div className={`exec-kpi ${pendingPlay > 0 ? 'is-attention' : ''}`}>
              <span className="exec-kpi-label">{t('playTime')}</span>
              <strong className="exec-kpi-value">{pendingPlay}</strong>
            </div>
            <div className="exec-kpi">
              <span className="exec-kpi-label">{t('children')}</span>
              <strong className="exec-kpi-value">{data.children.length}</strong>
            </div>
            <div className="exec-kpi is-accent">
              <span className="exec-kpi-label">{t('pointsToday')}</span>
              <strong className="exec-kpi-value">{familyPointsToday}</strong>
            </div>
          </section>

          <div className="exec-grid">
            <section className="exec-panel">
              <div className="exec-panel-head">
                <h2>{t('waitingForYou')}</h2>
                <span className="exec-panel-meta">{waitingCount}</span>
              </div>
              {waitingCount === 0 ? (
                <div className="exec-empty">
                  <Icon name="check" size={20} />
                  <p>{t('noPending')}</p>
                </div>
              ) : (
                <ul className="exec-list">
                  {data.reviews.map((item) => (
                    <li key={item.id}>
                      <Link className="exec-row" to={`/parent/review/${encodeURIComponent(item.id)}`}>
                        <div className="exec-row-main">
                          <strong>{item.title ?? t('missionFallbackTitle')}</strong>
                          <span className="exec-row-meta">
                            {item.nickname || t('childProfile')} · +{item.points} {t('points')}
                          </span>
                        </div>
                        <span className="exec-row-action">{t('approve')} →</span>
                      </Link>
                    </li>
                  ))}
                  {data.waitingPlay.map((item) => (
                    <li key={item.id}>
                      <Link className="exec-row" to="/parent/play">
                        <div className="exec-row-main">
                          <strong>{item.nickname || t('childProfile')}</strong>
                          <span className="exec-row-meta">{t('asksForPlay')}</span>
                        </div>
                        <span className="exec-row-action">{t('reviewPlay')} →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="exec-panel">
              <div className="exec-panel-head">
                <h2>{t('children')}</h2>
                <Link className="text-link" to="/parent/activity">
                  {t('reportTitle')} →
                </Link>
              </div>
              {data.children.length === 0 ? (
                <div className="exec-empty">
                  <p>{t('noChildrenYet')}</p>
                  <Link className="btn btn-primary btn-sm" to="/family">
                    {t('addChildTitle')}
                  </Link>
                </div>
              ) : (
                <ul className="exec-roster">
                  {data.children.map((child) => {
                    const stats = data.progress.find((row) => row.childId === child.id)
                    const pct =
                      stats && stats.dailyCap > 0
                        ? Math.min(100, Math.round((stats.pointsToday / stats.dailyCap) * 100))
                        : 0
                    return (
                      <li key={child.id} className="exec-roster-row">
                        <div className="exec-roster-info">
                          <div className="exec-roster-head">
                            <strong>{child.nickname || t('childProfile')}</strong>
                            <span className="exec-row-meta">
                              {t('age')} {child.age} · {child.language.toUpperCase()}
                            </span>
                          </div>
                          {stats && (
                            <>
                              <p className="exec-roster-nums">
                                <span>
                                  {stats.pointsToday} / {stats.dailyCap} {t('pointsToday')}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {stats.streak} {t('streak')}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {stats.totalPoints} {t('totalPoints')}
                                </span>
                              </p>
                              <div className="cap-track is-slim" aria-hidden="true">
                                <span className="cap-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-plain btn-sm"
                          onClick={() => void openChild(child)}
                        >
                          {t('openChild')}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          <p className="exec-privacy-foot">
            <Icon name="shield" size={16} />
            <span>{t('notSurveillance')}</span>
          </p>
        </>
      )}
    </ParentShell>
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
    <ParentShell
      title={t('reviewTitle')}
      subtitle={t('reviewLead')}
      action={
        <Link className="btn btn-plain btn-sm" to="/parent">
          {t('back')}
        </Link>
      }
    >
      {failed && (
        <p className="banner banner-warn" role="alert">
          {t(failureKey(failed))}
        </p>
      )}
      {!reviews.data ? (
        <LoadState error={reviews.error} onRetry={reviews.reload} />
      ) : !item ? (
        <div className="exec-panel">
          <p className="lead">{t('reviewGone')}</p>
          <Link className="btn btn-plain btn-sm" to="/parent">
            {t('parentHome')}
          </Link>
        </div>
      ) : (
        <Panel>
          <h2 className="panel-title">{item.title ?? t('missionFallbackTitle')}</h2>
          <ul className="facts">
            <li>
              <Icon name="child" size={18} />
              <span>{item.nickname || t('childProfile')}</span>
            </li>
            <li>
              <Icon name="star" size={18} />
              <span>
                +{item.points} {t('points')}
              </span>
            </li>
            <li>
              <Icon name={item.verifiedBy === 'pose' ? 'camera' : 'hand'} size={18} />
              <span>{t(item.verifiedBy === 'pose' ? 'verifiedByCamera' : 'verifiedBySelf')}</span>
            </li>
            <li>
              <Icon name="clock" size={18} />
              <span>{whenText(item.completedAt, language)}</span>
            </li>
          </ul>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => setAsking('approve')}>
              <Icon name="check" size={18} />
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
    </ParentShell>
  )
}

const PLAY_LABEL: Record<PlayStatus, { tone: StatusTone; label: TranslationKey }> = {
  sent: { tone: 'waiting', label: 'playStatusSent' },
  allowed: { tone: 'done', label: 'playStatusAllowed' },
  later: { tone: 'info', label: 'laterPlay' },
  declined: { tone: 'redo', label: 'declinePlay' },
}

const ANSWERS: { answer: PlayAnswer; label: TranslationKey; className: string }[] = [
  { answer: 'allowed', label: 'allowPlay', className: 'btn btn-primary btn-sm' },
  { answer: 'later', label: 'laterPlay', className: 'btn btn-plain btn-sm' },
  { answer: 'declined', label: 'declinePlay', className: 'btn btn-danger btn-sm' },
]

export function PlayReview() {
  const { t, language, parent } = useParent()
  const code = parent?.family.code ?? ''
  const requests = useRemote(parent ? `play:${code}` : null, () => api.playRequests(code), 15_000)
  const [asking, setAsking] = useState<{ id: string; answer: PlayAnswer } | null>(null)
  const [failed, setFailed] = useState<Failure | null>(null)
  if (!parent) return null

  return (
    <ParentShell title={t('playTime')} subtitle={t('reviewPlay')}>
      {failed && (
        <p className="banner banner-warn" role="alert">
          {t(failureKey(failed))}
        </p>
      )}
      {!requests.data ? (
        <LoadState error={requests.error} onRetry={requests.reload} />
      ) : requests.data.length === 0 ? (
        <div className="exec-panel">
          <p className="lead">{t('noPlay')}</p>
        </div>
      ) : (
        <ul className="mission-list">
          {requests.data.map((row) => (
            <li key={row.id} className="exec-panel">
              <div className="split">
                <div>
                  <strong>{row.nickname || t('childProfile')}</strong>
                  <p className="meta">{whenText(row.requestedAt, language)}</p>
                </div>
                <StatusPill tone={PLAY_LABEL[row.status].tone}>
                  {t(PLAY_LABEL[row.status].label)}
                </StatusPill>
              </div>
              {row.status === 'sent' && (
                <div className="row-actions">
                  {ANSWERS.map((choice) => (
                    <button
                      key={choice.answer}
                      type="button"
                      className={choice.className}
                      onClick={() => setAsking({ id: row.id, answer: choice.answer })}
                    >
                      {t(choice.label)}
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
          action={(pin) =>
            api.answerPlay(asking.id, { familyCode: code, pin, answer: asking.answer })
          }
          onCancel={() => setAsking(null)}
          onDone={(result) => {
            setAsking(null)
            if (!result.ok) setFailed(result.error)
            requests.reload()
          }}
        />
      )}
    </ParentShell>
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

/** 7-day executive report with AI Weekly Insight on left, chronological feed on right. */
export function Activity() {
  const { t, language, parent } = useParent()
  const code = parent?.family.code ?? ''
  const activity = useRemote(parent ? `activity:${code}` : null, () => loadActivity(code))
  const [insights, setInsights] = useState<Record<string, WeeklySummary>>({})
  const [insightBusy, setInsightBusy] = useState<Record<string, boolean>>({})
  if (!parent) return null
  const data = activity.data

  const loadInsight = async (childId: string) => {
    setInsightBusy((prev) => ({ ...prev, [childId]: true }))
    const res = await api.generateWeeklySummary({ familyCode: code, childId, language })
    setInsightBusy((prev) => ({ ...prev, [childId]: false }))
    if (res.ok) {
      setInsights((prev) => ({ ...prev, [childId]: res.data }))
    }
  }

  return (
    <ParentShell title={t('activity')} subtitle={t('reportTitle')}>
      {!data ? (
        <LoadState error={activity.error} onRetry={activity.reload} />
      ) : (
        <div className="activity-grid">
          <section className="stack">
            <h2 className="panel-title">{t('reportTitle')}</h2>
            {data.report.length === 0 && <p className="lead">{t('noChildrenYet')}</p>}
            {data.report.map((child) => {
              const insight = insights[child.childId]
              const busy = Boolean(insightBusy[child.childId])
              return (
                <Panel key={child.childId}>
                  <div className="split">
                    <strong className="panel-title">{child.nickname || t('childProfile')}</strong>
                    <span className="meta">
                      {child.totalPoints} {t('totalPoints')}
                    </span>
                  </div>
                  <div className="report-stats">
                    <div className="report-stat">
                      <strong>{child.pointsInPeriod}</strong>
                      <span>{t('pointsInWeek')}</span>
                    </div>
                    <div className="report-stat">
                      <strong>{child.streak}</strong>
                      <span>{t('streak')}</span>
                    </div>
                    <div className="report-stat">
                      <strong>{child.period.missionsApproved}</strong>
                      <span>{t('missionsApproved')}</span>
                    </div>
                    <div className="report-stat">
                      <strong>{child.period.gamesPlayed}</strong>
                      <span>{t('gamesPlayed')}</span>
                    </div>
                  </div>
                  {child.period.missionsPending > 0 && (
                    <p className="meta">
                      {child.period.missionsPending} {t('missionsWaiting')}
                    </p>
                  )}

                  {insight ? (
                    <div className="ai-insight-box rise">
                      <div className="split">
                        <strong>{insight.headline}</strong>
                        <StatusPill tone="info">
                          {insight.source === 'ai' ? 'AI Insight' : 'Weekly Summary'}
                        </StatusPill>
                      </div>
                      <p>{insight.summary}</p>
                      <p className="ai-insight-tip">{insight.suggestion}</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-plain btn-sm"
                      disabled={busy}
                      onClick={() => void loadInsight(child.childId)}
                    >
                      <Icon name="star" size={16} />
                      {busy ? t('loading') : 'Generate AI Weekly Insight'}
                    </button>
                  )}
                </Panel>
              )
            })}
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
                            : `${activityDisplayName(item.game, language)} · ${t('gameScore')} ${item.score}`}
                        </span>
                      </span>
                      <span className="feed-meta">
                        {item.kind === 'mission' && (
                          <StatusPill tone={MISSION_STATUS[item.status].tone}>
                            {t(MISSION_STATUS[item.status].label)}
                          </StatusPill>
                        )}
                        {item.points > 0 && <span className="mission-points">+{item.points}</span>}
                        <span>{whenText(item.at, language)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </ParentShell>
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
    <ParentShell title={t('settingsTitle')} subtitle={t('privacyNote')}>
      <div className="exec-grid">
        <Panel>
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
            <button type="submit" className="btn btn-primary btn-block" disabled={busy} aria-busy={busy}>
              {busy ? t('saving') : t('pinChangeTitle')}
            </button>
          </form>
        </Panel>

        <Panel>
          <h2 className="panel-title">{t('familyCode')}</h2>
          <p className="meta">{t('notSurveillance')}</p>
          <p className="code-chip">{parent.family.code}</p>
          <button type="button" className="btn btn-plain btn-block" onClick={signOut}>
            {t('signOut')}
          </button>
        </Panel>
      </div>
    </ParentShell>
  )
}
