import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { StatusPill, type StatusTone } from '../components/Status'
import { useApp } from '../context/app-context'
import type { TranslationKey } from '../i18n'
import { gameSuccess, missionSuccess } from '../lib/outcome'
import { missionState } from '../lib/progress'
import { isSuccessState, type SuccessState } from '../types/navigation'

const SPARKS = [0, 1, 2, 3, 4, 5]

interface Copy {
  tone: StatusTone
  label: TranslationKey
  body: TranslationKey | null
}

function copyFor(state: SuccessState): Copy {
  const { status } = state.outcome
  if (status === 'failed') return { tone: 'problem', label: 'statusNotSaved', body: 'saveFailed' }
  if (status === 'pending') return { tone: 'waiting', label: 'statusWaiting', body: 'outcomeWaitingBody' }
  if (status === 'already') {
    return { tone: 'done', label: 'alreadyDone', body: state.kind === 'game' ? 'gameAlreadyToday' : null }
  }
  return { tone: 'done', label: 'statusSaved', body: 'outcomeSavedBody' }
}

/**
 * Screen 7: the result, as the server decided it: points earned, waiting for a
 * grown-up, already done today, or not saved (with a retry).
 */
export function Success() {
  const { t, missions, progress, completeMission, submitGame } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const state = isSuccessState(location.state) ? location.state : null
  if (!state) return <Navigate to="/missions" replace />

  const retry = async () => {
    setSaving(true)
    let next: SuccessState
    if (state.kind === 'mission') {
      const mission = missions.find((item) => item.id === state.missionId)
      if (!mission) {
        navigate('/missions', { replace: true })
        return
      }
      const saved = await completeMission(mission, state.verifiedBy, state.result)
      next = missionSuccess(mission, state.verifiedBy, state.result, saved)
    } else {
      next = gameSuccess(state.result, await submitGame(state.result))
    }
    setSaving(false)
    navigate('/success', { replace: true, state: next })
  }

  const { outcome } = state
  const copy = copyFor(state)
  const celebrate = outcome.status !== 'failed' && outcome.status !== 'already'
  const awarded = outcome.status === 'approved' || outcome.status === 'saved' ? outcome.awarded : 0
  const capReached = progress !== null && progress.pointsToday >= progress.dailyCap
  const next = missions.find((mission) => {
    const status = missionState(progress, mission.id)
    return status === 'todo' || status === 'redo'
  })

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
          <span className={outcome.status === 'failed' ? 'calm-badge is-problem' : 'calm-badge'}>
            <Icon name={outcome.status === 'failed' ? 'alert' : 'check'} size={64} />
          </span>
        </div>
      )}

      <div>
        <h1 className="title">{outcome.status === 'already' ? t('alreadyDone') : t('successTitle')}</h1>
        <p className="lead">{state.kind === 'mission' ? state.title : t('playCatchStars')}</p>
      </div>

      <div className="outcome" role="status">
        <StatusPill tone={copy.tone}>{t(copy.label)}</StatusPill>
        {copy.body && <p>{t(copy.body)}</p>}
      </div>

      {awarded > 0 && (
        <p className="points-earned">
          <strong>+{awarded}</strong>
          <span>{t('successPoints')}</span>
        </p>
      )}
      {outcome.status === 'pending' && state.kind === 'mission' && (
        <p className="points-held">
          <strong>{state.points}</strong>
          <span>{t('pointsWaiting')}</span>
        </p>
      )}
      {capReached && (outcome.status === 'approved' || outcome.status === 'saved') && (
        <p className="banner banner-ok">{t('capReached')}</p>
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

      {progress && (
        <p className="success-total">
          <Icon name="star" />
          {t('totalPoints')}: <strong>{progress.totalPoints}</strong>
        </p>
      )}

      <div className="actions">
        {outcome.status === 'failed' ? (
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
        ) : (
          <Link className="btn btn-sun btn-block" to="/stars">
            {state.kind === 'game' ? t('playAgain') : t('playCatchStars')}
          </Link>
        )}
        <Link className="text-link success-home" to="/missions">
          {t('home')}
        </Link>
      </div>
    </main>
  )
}
