import { Link, Navigate, useLocation } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useApp } from '../context/app-context'
import { isSuccessState } from '../types/navigation'

const SPARKS = [0, 1, 2, 3, 4, 5]

/** Screen 7: celebration, points and the next mission. */
export function Success() {
  const { t, missions, progress } = useApp()
  const location = useLocation()
  const state = isSuccessState(location.state) ? location.state : null

  if (!state) return <Navigate to="/missions" replace />

  const next = missions.find((mission) => !progress.todayCompleted.includes(mission.id))

  return (
    <main className="screen success">
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

      <div>
        <h1 className="title">{t('successTitle')}</h1>
        <p className="lead">{state.kind === 'mission' ? state.title : t('playCatchStars')}</p>
      </div>

      <p className="success-points">
        <strong>+{state.awarded}</strong>
        <span>{t(state.status === 'demo_pending' ? 'waitingApprovalDemo' : 'successPoints')}</span>
      </p>
      <p className={state.origin === 'demo' || state.status === 'not_saved' || state.status === 'save_failed' ? 'banner banner-demo' : 'banner'}>
        {t(
          state.status === 'save_failed'
            ? 'saveFailed'
            : state.status === 'not_saved'
              ? 'gameNotSaved'
              : state.status === 'demo_only'
                ? 'demoOnlyPoints'
                : state.status === 'demo_pending'
                  ? 'demoReviewNote'
                  : state.status === 'already'
                    ? 'alreadyDone'
                    : 'serverSaved',
        )}
      </p>

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
        {t('pointsToday')}: <strong>{progress.pointsToday}</strong>
      </p>

      <div className="actions">
        {next && (
          <Link
            className="btn btn-sun btn-block"
            to={`/missions/${encodeURIComponent(next.id)}`}
          >
            {t('nextMission')}
          </Link>
        )}
        {state.kind === 'game' && (
          <Link className={next ? 'btn btn-plain btn-block' : 'btn btn-sun btn-block'} to="/stars">
            {t('playAgain')}
          </Link>
        )}
        <Link className="btn btn-plain btn-block" to="/missions">
          {t('home')}
        </Link>
      </div>
    </main>
  )
}
