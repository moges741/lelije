import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { StatusPill, type StatusTone } from '../components/Status'
import { useApp } from '../context/app-context'
import type { TranslationKey } from '../i18n'
import { isSuccessState, type SaveStatus } from '../types/navigation'

const SPARKS = [0, 1, 2, 3, 4, 5]

type Outcome = 'saved' | 'waiting' | 'demo' | 'already' | 'failed'

function outcomeOf(status: SaveStatus): Outcome {
  if (status === 'server_awarded') return 'saved'
  if (status === 'demo_pending') return 'waiting'
  if (status === 'demo_only') return 'demo'
  if (status === 'already') return 'already'
  return 'failed'
}

const LABEL: Record<Outcome, { tone: StatusTone; label: TranslationKey; body: TranslationKey }> = {
  saved: { tone: 'done', label: 'statusSaved', body: 'serverSaved' },
  waiting: { tone: 'waiting', label: 'statusWaiting', body: 'outcomeWaitingBody' },
  demo: { tone: 'info', label: 'statusDemo', body: 'outcomeDemoBody' },
  already: { tone: 'done', label: 'alreadyDone', body: 'alreadyDone' },
  failed: { tone: 'problem', label: 'statusNotSaved', body: 'saveFailed' },
}

/**
 * Screen 7: the result. It says what happened (saved, waiting for a grown-up,
 * demo only, not saved) and only calls points "earned" once they are saved.
 */
export function Success() {
  const { t, missions, progress, completeMission, submitGame } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const state = isSuccessState(location.state) ? location.state : null
  const [saving, setSaving] = useState(false)

  if (!state) return <Navigate to="/missions" replace />

  const retry = async () => {
    setSaving(true)
    if (state.kind === 'mission') {
      const mission = missions.find((item) => item.id === state.missionId)
      if (!mission) {
        setSaving(false)
        return
      }
      const verifiedBy = state.verifiedBy ?? 'self'
      const outcome = await completeMission(mission, verifiedBy)
      navigate('/success', {
        replace: true,
        state: {
          kind: 'mission',
          awarded: outcome.awarded,
          title: mission.title,
          missionId: mission.id,
          status: outcome.status,
          origin: outcome.origin,
          verifiedBy,
        },
      })
      return
    }
    const outcome = await submitGame(state.result)
    navigate('/success', {
      replace: true,
      state: {
        kind: 'game',
        awarded: outcome.awarded,
        result: state.result,
        status: outcome.status,
        origin: outcome.origin,
      },
    })
  }

  const outcome = outcomeOf(state.status)
  const copy = LABEL[outcome]
  const celebrate = outcome === 'saved' || outcome === 'waiting' || outcome === 'demo'
  const waitingPoints =
    state.kind === 'mission'
      ? (missions.find((item) => item.id === state.missionId)?.points ?? 0)
      : 0
  const next = missions.find((mission) => !progress.todayCompleted.includes(mission.id))
  const heading = outcome === 'already' ? t('alreadyDone') : t('successTitle')

  return (
    <main className="screen success">
      {celebrate ? (
        <div className="burst" aria-hidden="true">
          {SPARKS.map((i) => (
            <span key={i} className="spark" style={{ rotate: `${i * 60}deg` }}>
              <Icon name="star" size={18} />
            </span>
          ))}
          <span className="burst-star">
            <Icon name="star" size={104} />
          </span>
        </div>
      ) : (
        <div className="burst is-calm" aria-hidden="true">
          <span className={outcome === 'failed' ? 'calm-badge is-problem' : 'calm-badge'}>
            <Icon name={outcome === 'failed' ? 'alert' : 'check'} size={64} />
          </span>
        </div>
      )}

      <div>
        <h1 className="title">{heading}</h1>
        <p className="lead">{state.kind === 'mission' ? state.title : t('playCatchStars')}</p>
      </div>

      <div className="outcome" role="status">
        <StatusPill tone={copy.tone}>{t(copy.label)}</StatusPill>
        {outcome !== 'already' && <p>{t(copy.body)}</p>}
      </div>

      {outcome === 'saved' && state.awarded > 0 && (
        <p className="points-earned">
          <strong>+{state.awarded}</strong>
          <span>{t('successPoints')}</span>
        </p>
      )}
      {outcome === 'waiting' && waitingPoints > 0 && (
        <p className="points-held">
          <strong>{waitingPoints}</strong>
          <span>{t('pointsWaiting')}</span>
        </p>
      )}
      {outcome === 'demo' && state.awarded > 0 && (
        <p className="points-held">
          <strong>{state.awarded}</strong>
          <span>{t('pointsDemoLabel')}</span>
        </p>
      )}

      {state.kind === 'game' && (
        <ul className="facts">
          <li>
            {t('gameScore')}: {state.result.score}
          </li>
          <li>
            {t('starsCaught')}: {state.result.starsCaught}
          </li>
          <li>
            {t('goldenCaught')}: {state.result.goldenCaught}
          </li>
        </ul>
      )}

      <p className="success-total">
        <Icon name="star" />
        {t('totalPoints')}: <strong>{progress.totalPoints}</strong>
      </p>

      <div className="actions">
        {state.status === 'save_failed' ? (
          <button
            type="button"
            className="btn btn-sun btn-block"
            disabled={saving}
            aria-busy={saving}
            onClick={() => void retry()}
          >
            {saving ? t('saving') : t('retrySave')}
          </button>
        ) : next ? (
          <Link className="btn btn-sun btn-block" to={`/missions/${encodeURIComponent(next.id)}`}>
            {t('nextMission')}
          </Link>
        ) : state.kind === 'game' ? (
          <Link className="btn btn-sun btn-block" to="/stars">
            {t('playAgain')}
          </Link>
        ) : (
          <Link className="btn btn-sun btn-block" to="/stars">
            {t('playCatchStars')}
          </Link>
        )}
        <Link className="text-link success-home" to="/missions">
          {t('home')}
        </Link>
      </div>
    </main>
  )
}
