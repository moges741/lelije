import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CameraStage } from '../components/CameraStage'
import { Icon } from '../components/Icon'
import { MockControls } from '../components/MockControls'
import { SafetyBanner } from '../components/SafetyBanner'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { POSE_MOCK } from '../lib/pose/load'
import type { CatchTheStarsGame } from '../lib/pose/types'
import { stageMessage, usePoseSession } from '../lib/pose/usePoseSession'
import type { SuccessState } from '../types/navigation'

/** Contract A 5.3 default. VITE_GAME_MS shortens it for rehearsals. */
const GAME_MS = Number(import.meta.env.VITE_GAME_MS) || 60_000

/** Screen 6: Frontend owns the video and layout; ai/pose draws the stars. */
export function CatchStars() {
  const { t, submitGame } = useApp()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<CatchTheStarsGame | null>(null)
  const [withButtons, setWithButtons] = useState(false)
  const [score, setScore] = useState(0)
  const [paused, setPaused] = useState(false)
  const [saving, setSaving] = useState(false)
  const mock = POSE_MOCK || withButtons

  const session = usePoseSession({
    mock,
    onReady({ engine, pose }) {
      const canvas = canvasRef.current
      if (!canvas) return
      const game = pose.startCatchTheStars({ canvas, engine, durationMs: GAME_MS })
      gameRef.current = game
      setScore(0)
      setPaused(false)
      const offScore = game.on('score', (event) => setScore(event.score))
      const offEnd = game.on('end', (result) => {
        engine.stop()
        setSaving(true)
        void submitGame(result).then((outcome) => {
          const state: SuccessState = {
            kind: 'game',
            awarded: outcome.awarded,
            result,
            status: outcome.status,
            origin: outcome.origin,
          }
          navigate('/success', { replace: true, state })
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

  if (phase === 'unavailable') {
    return (
      <main className="screen">
        <TopBar backTo="/missions" />
        <div className="detail-head rise">
          <span className="mission-icon is-big">
            <Icon name="camera" size={40} />
          </span>
          <h1 className="title">{t('playCatchStars')}</h1>
          <p className="lead">{t('cameraUnavailable')}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-sun btn-block" onClick={session.begin}>
            {t('tryAgainCamera')}
          </button>
          <button
            type="button"
            className="btn btn-plain btn-block"
            onClick={() => {
              setWithButtons(true)
              session.begin()
            }}
          >
            {t('playWithButtons')}
          </button>
          <Link className="btn btn-plain btn-block" to="/missions">
            {t('home')}
          </Link>
        </div>
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

      <CameraStage videoRef={session.videoRef} mock={mock} message={message}>
        <canvas ref={canvasRef} className="stage-canvas" />
      </CameraStage>

      {phase === 'setup' ? (
        <>
          <p className="lead">{t('catchStarsHint')}</p>
          <SafetyBanner />
          <div className="actions">
            <button type="button" className="btn btn-sun btn-block" onClick={session.begin}>
              <Icon name={mock ? 'play' : 'camera'} />
              {t(mock ? 'startDemo' : 'allowCamera')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="hud">
            <p className="counter" aria-live="polite">
              <strong key={score}>{score}</strong>
              <span>{t('gameScore')}</span>
            </p>
            <button
              type="button"
              className="btn btn-plain"
              disabled={phase !== 'running' || saving}
              onClick={togglePause}
            >
              {t(paused ? 'resume' : 'pause')}
            </button>
          </div>
          {mock && phase === 'running' && !saving && !paused && (
            <MockControls actions={['armsUp', 'jump']} />
          )}
        </>
      )}
    </main>
  )
}
