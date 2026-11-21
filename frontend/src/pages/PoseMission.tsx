import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CameraStage } from '../components/CameraStage'
import { Icon } from '../components/Icon'
import { MockControls } from '../components/MockControls'
import { SafetyBanner } from '../components/SafetyBanner'
import { StarProgress } from '../components/StarProgress'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { POSE_MOCK } from '../lib/pose/load'
import { stageMessage, usePoseSession } from '../lib/pose/usePoseSession'
import type { Mission, MissionGoal } from '../types/mission'
import type { SuccessState } from '../types/navigation'

/** Screens 4 and 5: camera setup, then the mission in progress (Build Contract 8.2). */
export function PoseMission() {
  const { id } = useParams()
  const { t, missions, missionsReady } = useApp()

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
  if (mission.verification !== 'pose' || !mission.goal) {
    return <Navigate to={`/missions/${encodeURIComponent(mission.id)}`} replace />
  }
  return <Play key={mission.id} mission={mission} goal={mission.goal} />
}

function Play({ mission, goal }: { mission: Mission; goal: MissionGoal }) {
  const { t, progress, completeMission } = useApp()
  const navigate = useNavigate()
  const [alreadyDone] = useState(
    () =>
      progress.todayCompleted.includes(mission.id) || progress.pendingIds.includes(mission.id),
  )
  const [count, setCount] = useState(0)
  const [paused, setPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  const tally = useRef({ count: 0, startedAt: 0 })

  const finish = async (
    verifiedBy: 'pose' | 'self',
    result?: { count: number; durationMs: number },
  ) => {
    setSaving(true)
    const outcome = await completeMission(mission, verifiedBy, result)
    const state: SuccessState = {
      kind: 'mission',
      awarded: outcome.awarded,
      title: mission.title,
      missionId: mission.id,
      status: outcome.status,
      origin: outcome.origin,
      verifiedBy,
    }
    navigate('/success', { replace: true, state })
  }

  const session = usePoseSession({
    mock: POSE_MOCK,
    onReady() {
      tally.current = { count: 0, startedAt: performance.now() }
      setCount(0)
    },
    onAction(event, engine) {
      const current = tally.current
      if (paused || event.type !== goal.detector || current.count >= goal.count) return
      current.count += 1
      setCount(current.count)
      if (current.count === goal.count) {
        engine.stop()
        void finish('pose', {
          count: current.count,
          durationMs: Math.round(performance.now() - current.startedAt),
        })
      }
    },
  })

  const backTo = `/missions/${encodeURIComponent(mission.id)}`
  if (alreadyDone) return <Navigate to={backTo} replace />

  const { phase } = session

  if (phase === 'unavailable') {
    return (
      <main className="screen">
        <TopBar backTo={backTo} />
        <div className="detail-head rise">
          <span className="mission-icon is-big">
            <Icon name="hand" size={40} />
          </span>
          <h1 className="title">{t('selfConfirmTitle')}</h1>
          <p className="lead">{t('selfConfirmBody')}</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn btn-sun btn-block"
            disabled={saving}
            onClick={() => void finish('self')}
          >
            {saving ? t('saving') : t('grownUpConfirm')}
          </button>
          <button
            type="button"
            className="btn btn-plain btn-block"
            disabled={saving}
            onClick={session.begin}
          >
            {t('tryAgainCamera')}
          </button>
        </div>
      </main>
    )
  }

  const goalLabel = t(goal.detector === 'jump' ? 'goalJump' : 'goalArmsUp')
  const message = saving
    ? t('saving')
    : paused
      ? t('paused')
      : (stageMessage(t, phase, session.personVisible) ??
        (count > 0 ? t('keepGoing') : null))

  return (
    <main className="screen screen-camera">
      <TopBar backTo={backTo}>
        <span className="topbar-title">{mission.title}</span>
      </TopBar>

      <CameraStage videoRef={session.videoRef} mock={POSE_MOCK} message={message} />

      {phase === 'setup' ? (
        <>
          <SafetyBanner />
          <div className="actions">
            <button type="button" className="btn btn-sun btn-block" onClick={session.begin}>
              <Icon name="camera" />
              {t(POSE_MOCK ? 'startDemo' : 'allowCamera')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="counter" aria-live="polite">
            <strong key={count}>{count}</strong>
            <span>
              / {goal.count} {goalLabel}
            </span>
          </p>
          <StarProgress count={count} goal={goal.count} />
          <button
            type="button"
            className="btn btn-plain btn-block"
            disabled={saving || phase !== 'running'}
            onClick={() => setPaused((value) => !value)}
          >
            {t(paused ? 'resume' : 'pause')}
          </button>
          {POSE_MOCK && phase === 'running' && !saving && !paused && (
            <MockControls actions={[goal.detector]} />
          )}
        </>
      )}
    </main>
  )
}
