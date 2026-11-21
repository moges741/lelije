import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActivityHud, CameraIntro, CameraProblem, TimeBar } from '../components/Activity'
import { CameraStage } from '../components/CameraStage'
import { MockControls } from '../components/MockControls'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { gameSuccess } from '../lib/outcome'
import { POSE_MOCK } from '../lib/pose/load'
import type { CatchTheStarsGame } from '../lib/pose/types'
import { stageMessage, usePoseSession } from '../lib/pose/usePoseSession'

/** Contract A 5.3 default. VITE_GAME_MS shortens it for rehearsals. */
const GAME_MS = Number(import.meta.env.VITE_GAME_MS) || 60_000

function formatTime(ms: number) {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Screen 6: Frontend owns the video and layout; ai/pose draws the stars. */
export function CatchStars() {
  const { t, submitGame } = useApp()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<CatchTheStarsGame | null>(null)
  const [mock, setMock] = useState(POSE_MOCK)
  const canUseCamera = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia)
  const [score, setScore] = useState(0)
  const [paused, setPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [timeLeft, setTimeLeft] = useState(GAME_MS)
  const remain = useRef(GAME_MS)

  const session = usePoseSession({
    mock,
    onReady({ engine, pose }) {
      const canvas = canvasRef.current
      if (!canvas) return
      remain.current = GAME_MS
      setTimeLeft(GAME_MS)
      const game = pose.startCatchTheStars({ canvas, engine, durationMs: GAME_MS })
      gameRef.current = game
      setScore(0)
      setPaused(false)
      const offScore = game.on('score', (event) => setScore(event.score))
      const offEnd = game.on('end', (result) => {
        engine.stop()
        setSaving(true)
        void submitGame(result).then((saved) => {
          navigate('/success', { replace: true, state: gameSuccess(result, saved) })
        })
      })
      return () => {
        // Unsubscribe first so leaving the screen never posts a result.
        offScore()
        offEnd()
        game.stop()
        gameRef.current = null
      }
    },
  })

  const { phase } = session

  useEffect(() => {
    if (phase !== 'running' || paused || saving) return
    const started = performance.now()
    const from = remain.current
    const timer = window.setInterval(() => {
      const next = Math.max(0, from - (performance.now() - started))
      remain.current = next
      setTimeLeft(next)
    }, 200)
    return () => window.clearInterval(timer)
  }, [phase, paused, saving])

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
        <TopBar backTo="/missions" />
        <CameraProblem onRetry={useCamera} onButtons={useButtons} />
      </main>
    )
  }

  const togglePause = () => {
    const game = gameRef.current
    if (!game) return
    if (paused) game.resume()
    else game.pause()
    setPaused(!paused)
  }

  const message = saving
    ? t('saving')
    : (stageMessage(t, phase, session.personVisible) ?? (paused ? t('paused') : null))

  return (
    <main className="screen screen-camera">
      <TopBar backTo="/missions">
        <span className="topbar-title">{t('playCatchStars')}</span>
      </TopBar>

      <CameraStage
        videoRef={session.videoRef}
        mock={mock}
        message={message}
        instruction={t('catchStarsHint')}
        instructionIcon="star"
        instructionFades={phase === 'running'}
        compact={phase === 'setup'}
      >
        <canvas ref={canvasRef} className="stage-canvas" />
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
            main={{ value: score, label: t('gameScore') }}
            side={{ value: formatTime(timeLeft), label: t('timeLeft') }}
            paused={paused}
            disabled={phase !== 'running' || saving}
            onPause={togglePause}
          />
          <TimeBar value={timeLeft} max={GAME_MS} label={t('timeLeft')} />
          {mock && phase === 'running' && !saving && !paused && (
            <MockControls actions={['armsUp', 'jump']} />
          )}
        </>
      )}
    </main>
  )
}
