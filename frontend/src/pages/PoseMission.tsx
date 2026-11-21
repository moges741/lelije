import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ActivityHud, CameraIntro, CameraProblem } from '../components/Activity'
import { CameraStage } from '../components/CameraStage'
import { MockControls } from '../components/MockControls'
import { StarProgress } from '../components/StarProgress'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { missionSuccess } from '../lib/outcome'
import { POSE_MOCK } from '../lib/pose/load'
import type { Landmark } from '../lib/pose/types'
import { stageMessage, usePoseSession } from '../lib/pose/usePoseSession'
import { missionState } from '../lib/progress'
import type { PoseResult, Verified } from '../types/api'
import type { Mission, MissionGoal } from '../types/mission'

const SKELETON_JOINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const SKELETON_BONES: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
]

function drawMirroredSkeleton(canvas: HTMLCanvasElement, landmarks: Landmark[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = canvas.clientWidth || 640
  const height = canvas.clientHeight || 480
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#F59E0B'
  ctx.beginPath()
  for (const [a, b] of SKELETON_BONES) {
    const p = landmarks[a]
    const q = landmarks[b]
    if (!p || !q || p.visibility < 0.45 || q.visibility < 0.45) continue
    ctx.moveTo((1 - p.x) * width, p.y * height)
    ctx.lineTo((1 - q.x) * width, q.y * height)
  }
  ctx.stroke()

  ctx.fillStyle = '#FFFFFF'
  for (const idx of SKELETON_JOINTS) {
    const p = landmarks[idx]
    if (!p || p.visibility < 0.45) continue
    ctx.beginPath()
    ctx.arc((1 - p.x) * width, p.y * height, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Screens 4 and 5: real on-device MediaPipe camera pose mission with live skeleton feedback. */
export function PoseMission() {
  const { id } = useParams()
  const { t, missions, missionsStatus } = useApp()

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
  if (mission.verification !== 'pose' || !mission.goal) {
    return <Navigate to={`/missions/${encodeURIComponent(mission.id)}`} replace />
  }
  return <Play key={mission.id} mission={mission} goal={mission.goal} />
}

function Play({ mission, goal }: { mission: Mission; goal: MissionGoal }) {
  const { t, progress, completeMission } = useApp()
  const navigate = useNavigate()
  const [alreadyDone] = useState(() => {
    const state = missionState(progress, mission.id)
    return state === 'done' || state === 'pending'
  })
  const [count, setCount] = useState(0)
  const [paused, setPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  // Defaults to REAL MediaPipe camera pose detection; switches to buttons only on request or camera failure.
  const [mock, setMock] = useState(POSE_MOCK)
  const canUseCamera = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia)
  const tally = useRef({ count: 0, startedAt: 0 })
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const finish = async (verifiedBy: Verified, result?: PoseResult) => {
    setSaving(true)
    const saved = await completeMission(mission, verifiedBy, result)
    navigate('/success', { replace: true, state: missionSuccess(mission, verifiedBy, result, saved) })
  }

  const session = usePoseSession({
    mock,
    onReady({ engine }) {
      tally.current = { count: 0, startedAt: performance.now() }
      setCount(0)
      const offLandmarks = engine.on('landmarks', ({ landmarks }) => {
        if (overlayRef.current && landmarks.length > 0) {
          drawMirroredSkeleton(overlayRef.current, landmarks)
        }
      })
      return () => {
        offLandmarks()
        const ctx = overlayRef.current?.getContext('2d')
        if (ctx && overlayRef.current) {
          ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
        }
      }
    },
    onAction(event, engine) {
      const current = tally.current
      if (paused || event.type !== goal.detector || current.count >= goal.count) return
      current.count += 1
      setCount(current.count)
      if (current.count === goal.count) {
        engine.stop()
        void finish(mock ? 'self' : 'pose', {
          count: current.count,
          durationMs: Math.round(performance.now() - current.startedAt),
        })
      }
    },
  })

  const backTo = `/missions/${encodeURIComponent(mission.id)}`
  if (alreadyDone) return <Navigate to={backTo} replace />

  const { phase } = session
  const useButtons = () => {
    setMock(true)
    session.begin()
  }
  const useCamera = () => {
    setMock(false)
    session.begin()
  }

  if (phase === 'unavailable') {
    return (
      <main className="screen">
        <TopBar backTo={backTo} />
        <CameraProblem
          saving={saving}
          onRetry={useCamera}
          onButtons={useButtons}
          onGrownUp={() => void finish('self')}
        />
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

      <CameraStage
        videoRef={session.videoRef}
        mock={mock}
        message={message}
        instruction={`${goal.count} × ${goalLabel}`}
        instructionIcon={goal.detector === 'jump' ? 'jump' : 'arms'}
        compact={phase === 'setup'}
      >
        {!mock && <canvas ref={overlayRef} className="stage-canvas" />}
      </CameraStage>

      {phase === 'setup' ? (
        <CameraIntro
          mock={mock}
          canUseCamera={canUseCamera}
          onStart={session.begin}
          onFallback={useButtons}
          onUseCamera={useCamera}
        />
      ) : (
        <>
          <ActivityHud
            main={{ value: count, label: goalLabel }}
            side={{ value: Math.max(goal.count - count, 0), label: t('toGo') }}
            paused={paused}
            disabled={saving || phase !== 'running'}
            onPause={() => setPaused((value) => !value)}
          />
          <StarProgress count={count} goal={goal.count} />
          {mock && phase === 'running' && !saving && !paused && (
            <MockControls actions={[goal.detector]} />
          )}
        </>
      )}
    </main>
  )
}
