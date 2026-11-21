import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { SafetyBanner } from '../components/SafetyBanner'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import type { SuccessState } from '../types/navigation'

export function MissionDetail() {
  const { id } = useParams()
  const { t, missions, missionsReady, progress, completeMission } = useApp()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (!missionsReady) {
    return (
      <main className="screen">
        <TopBar backTo="/missions" />
        <p className="lead">{t('loading')}</p>
      </main>
    )
  }

  const mission = missions.find((item) => item.id === id)
  if (!mission) return <Navigate to="/missions" replace />

  const done = progress.todayCompleted.includes(mission.id)
  const pending = progress.pendingIds.includes(mission.id)
  const goal = mission.verification === 'pose' ? mission.goal : undefined

  const confirmSelf = async () => {
    setSaving(true)
    const outcome = await completeMission(mission, 'self')
    const state: SuccessState = {
      kind: 'mission',
      awarded: outcome.awarded,
      title: mission.title,
      missionId: mission.id,
      status: outcome.status,
      origin: outcome.origin,
      verifiedBy: 'self',
    }
    navigate('/success', { replace: true, state })
  }

  return (
    <main className="screen">
      <TopBar backTo="/missions" />

      <div className="detail-head rise">
        <span className="mission-icon is-big">
          <Icon name={goal ? 'camera' : 'hand'} size={40} />
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
          <Icon name={goal ? (goal.detector === 'jump' ? 'jump' : 'arms') : 'hand'} />
          {goal
            ? `${goal.count} × ${t(goal.detector === 'jump' ? 'goalJump' : 'goalArmsUp')}`
            : t('selfMission')}
        </li>
      </ul>

      <SafetyBanner />

      <div className="actions">
        {done || pending ? (
          <>
            <p className="done-note">
              <Icon name="check" />
              {pending ? t('waitingApprovalDemo') : t('alreadyDone')}
            </p>
            <Link className="btn btn-plain btn-block" to="/missions">
              {t('home')}
            </Link>
          </>
        ) : goal ? (
          <Link
            className="btn btn-sun btn-block"
            to={`/missions/${encodeURIComponent(mission.id)}/play`}
          >
            {t('start')}
          </Link>
        ) : (
          <>
            <p className="hint">{t('selfDoneHint')}</p>
            <button
              type="button"
              className="btn btn-sun btn-block"
              disabled={saving}
              onClick={() => void confirmSelf()}
            >
              {saving ? t('saving') : t('selfDone')}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
