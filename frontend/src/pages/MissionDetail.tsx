import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SafetyBanner } from '../components/SafetyBanner'
import { TalkingBuddy } from '../components/TalkingBuddy'
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
      <div className="theme-child">
        <main className="screen screen-narrow">
          <TopBar backTo="/missions" />
          <p className="lead">{t('loading')}</p>
        </main>
      </div>
    )
  }

  const mission = missions.find((item) => item.id === id)
  if (!mission) return <Navigate to="/missions" replace />

  const state = missionState(progress, mission.id)
  const goal = mission.verification === 'pose' ? mission.goal : undefined
  const steps = goal
    ? (['stepPose1', 'stepPose2', 'stepPose3'] as const)
    : (['stepSelf1', 'stepSelf2', 'stepSelf3'] as const)

  const spokenSteps = `${mission.title}. ${mission.description}. ${steps.map((k, i) => `Step ${i + 1}: ${t(k)}`).join(' ')}`

  const confirmSelf = async () => {
    setSaving(true)
    const saved = await completeMission(mission, 'self')
    navigate('/success', { replace: true, state: missionSuccess(mission, 'self', undefined, saved) })
  }

  return (
    <div className="theme-child">
      <main className="screen screen-narrow">
        <TopBar backTo="/missions" />

        <TalkingBuddy
          message={mission.description}
          spokenText={spokenSteps}
        />

        <div className="panel detail-card rise">
          <div className="detail-head">
            <span className={`mission-icon is-big ${goal ? 'is-camera' : 'is-self'}`}>
              <Icon name={missionIcon(mission)} size={34} />
            </span>
            <h1 className="title">{mission.title}</h1>
          </div>

          <ul className="facts">
            <li>
              <Icon name="clock" size={18} />
              <span>
                {mission.durationMin} {t('minutes')}
              </span>
            </li>
            <li>
              <Icon name="star" size={18} />
              <span>
                +{mission.points} {t('points')}
              </span>
            </li>
            <li>
              <Icon name={goal ? 'camera' : 'family'} size={18} />
              <span>
                {goal
                  ? `${t('cameraMission')} · ${goal.count} × ${t(goal.detector === 'jump' ? 'goalJump' : 'goalArmsUp')}`
                  : t('grownUpConfirm')}
              </span>
            </li>
          </ul>
        </div>

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
                <Icon name={state === 'pending' ? 'clock' : 'check'} size={20} />
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
                <Link className="btn btn-sun btn-block btn-kid-cta" to={`/missions/${encodeURIComponent(mission.id)}/play`}>
                  <Icon name="play" size={20} />
                  {t('start')}
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-sun btn-block btn-kid-cta"
                  disabled={saving}
                  aria-busy={saving}
                  onClick={() => void confirmSelf()}
                >
                  <Icon name="check" size={20} />
                  {saving ? t('saving') : t('selfDone')}
                </button>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
