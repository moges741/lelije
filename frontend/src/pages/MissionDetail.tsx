import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SafetyBanner } from '../components/SafetyBanner'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { missionIcon } from '../lib/missionIcon'
import { missionSuccess } from '../lib/outcome'
import { missionState } from '../lib/progress'

export function MissionDetail() {
  const { id } = useParams()
  const { t, missions, missionsStatus, progress, completeMission } = useApp()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (missionsStatus === 'loading') {
    return (
      <main className="screen">
        <TopBar backTo="/missions" />
        <p className="lead">{t('loading')}</p>
      </main>
    )
  }

  const mission = missions.find((item) => item.id === id)
  if (!mission) return <Navigate to="/missions" replace />

  const state = missionState(progress, mission.id)
  const goal = mission.verification === 'pose' ? mission.goal : undefined
  const steps = goal
    ? (['stepPose1', 'stepPose2', 'stepPose3'] as const)
    : (['stepSelf1', 'stepSelf2', 'stepSelf3'] as const)

  const confirmSelf = async () => {
    setSaving(true)
    const saved = await completeMission(mission, 'self')
    navigate('/success', { replace: true, state: missionSuccess(mission, 'self', undefined, saved) })
  }

  return (
    <main className="screen">
      <TopBar backTo="/missions" />

      <div className="detail-head rise">
        <span className="mission-icon is-big">
          <Icon name={missionIcon(mission)} size={40} />
        </span>
        <h1 className="title">{mission.title}</h1>
        <p className="lead">{mission.description}</p>
      </div>

      <ul className="facts rise">
        <li>
          <Icon name="clock" />
          {mission.durationMin} {t('minutes')}
        </li>
        <li>
          <Icon name="star" />+{mission.points} {t('points')}
        </li>
        <li>
          <Icon name={goal ? 'camera' : 'family'} />
          {goal
            ? `${t('cameraMission')} · ${goal.count} × ${t(goal.detector === 'jump' ? 'goalJump' : 'goalArmsUp')}`
            : t('grownUpConfirm')}
        </li>
      </ul>

      <section className="how">
        <h2 className="how-title">{t('howItWorks')}</h2>
        <ol className="how-steps">
          {steps.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </section>

      <SafetyBanner privacy={Boolean(goal)} />

      <div className="actions">
        {state === 'done' || state === 'pending' ? (
          <>
            <p className="done-note">
              <Icon name={state === 'pending' ? 'clock' : 'check'} />
              {state === 'pending' ? t('statusWaiting') : t('alreadyDone')}
            </p>
            <Link className="btn btn-plain btn-block" to="/missions">
              {t('home')}
            </Link>
          </>
        ) : (
          <>
            {state === 'redo' && <p className="banner banner-warn">{t('redoNote')}</p>}
            {goal ? (
              <Link className="btn btn-sun btn-block" to={`/missions/${encodeURIComponent(mission.id)}/play`}>
                <Icon name="play" />
                {t('start')}
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-sun btn-block"
                disabled={saving}
                aria-busy={saving}
                onClick={() => void confirmSelf()}
              >
                <Icon name="check" />
                {saving ? t('saving') : t('selfDone')}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
