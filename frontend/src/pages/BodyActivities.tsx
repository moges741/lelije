import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import * as api from '../api/client'
import { Icon } from '../components/Icon'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { AppNav } from '../components/NavBar'
import { SafetyBanner } from '../components/SafetyBanner'
import { StatusPill } from '../components/Status'
import { TalkingBuddy } from '../components/TalkingBuddy'
import { TopBar } from '../components/TopBar'
import { useApp } from '../context/app-context'
import { ACTIVITY_META, ORDERED_ACTIVITY_IDS } from '../lib/pose/activityMeta'
import { loadPoseModule, POSE_ASSETS } from '../lib/pose/load'
import type {
  ActivityCatalogItem,
  ActivityController,
  ActivityId,
  ActivityResult,
  ActivityStatus,
  DressUpItem,
} from '../lib/pose/types'
import type { GameSaved } from '../types/api'

const DRESS_UP_OPTIONS: { id: DressUpItem; label: string }[] = [
  { id: 'none', label: 'No AR Hat' },
  { id: 'crown', label: 'Crown' },
  { id: 'cat_ears', label: 'Cat Ears' },
  { id: 'cape', label: 'Hero Cape' },
]

/** Child Body-AI Movement Arena: launches all 7 real MediaPipe pose-detection activities. */
export function ActivitiesHub() {
  const { language, session } = useApp()
  const [catalog, setCatalog] = useState<ActivityCatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    void api.activityCatalog().then(async (res) => {
      if (!active) return
      if (res.ok && res.data.length > 0) {
        setCatalog(res.data)
        setLoading(false)
        return
      }
      // Fallback to local ai/pose catalog if offline.
      try {
        const mod = await loadPoseModule()
        if (active && mod.getActivityCatalog) {
          setCatalog(mod.getActivityCatalog())
        }
      } finally {
        if (active) setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (!session?.child) return null

  const byId = new Map(catalog.map((item) => [item.id, item]))
  const arenaBuddy =
    language === 'am'
      ? 'የሚወዱትን የእንቅስቃሴ ጨዋታ ይምረጡ! ካሜራው ሙሉ ሰውነትዎን እንዲያይ ትንሽ ወደ ኋላ ይቁሙ።'
      : language === 'om'
        ? 'Tapha sochii jaallattu filadhu! Kaameeraan akka si arguuf xiqqoo duubatti dhaabbadhu.'
        : 'Pick a fun movement game below! Stand back so the camera can watch you jump, dance, and catch stars!'

  return (
    <div className="theme-child">
      <main className="screen screen-child">
        <TopBar>
          <LanguageSwitcher />
          <Link className="icon-btn" to="/child/settings" aria-label="Settings">
            <Icon name="settings" size={20} />
          </Link>
        </TopBar>

        <AppNav role="child" />

        <TalkingBuddy message={arenaBuddy} />

        <header className="section-head">
          <h1 className="title">
            {language === 'am'
              ? 'የሰውነት እንቅስቃሴ AI ጨዋታዎች'
              : language === 'om'
                ? 'Taphoota Sochii Qaamaa AI'
                : 'Body-Activity AI Games'}
          </h1>
          <p className="lead">
            {language === 'am'
              ? 'ካሜራው በመሳሪያዎ ላይ ብቻ ይሰራል፤ ቪዲዮ በጭራሽ አይላክም።'
              : language === 'om'
                ? 'Kaameeraan meeshaa kee irratti qofa hojjeta; viidiyoon hin ergamu.'
                : 'Your camera counts every move right on this device — no video ever leaves your screen.'}
          </p>
        </header>

        {loading && catalog.length === 0 ? (
          <div className="activity-catalog-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : (
          <div className="activity-catalog-grid">
            {ORDERED_ACTIVITY_IDS.map((id, idx) => {
              const meta = ACTIVITY_META[id]
              const entry = byId.get(id)
              return (
                <Link
                  key={id}
                  to={`/activities/${id}`}
                  className="activity-tile rise"
                  style={{ animationDelay: `${idx * 45}ms` }}
                >
                  <div className="activity-tile-top">
                    <span className="mission-icon is-camera">
                      <Icon name={meta.icon} size={24} />
                    </span>
                    <span className="activity-movement">{meta.movement[language]}</span>
                  </div>
                  <div className="activity-tile-body">
                    <strong>{meta.title[language]}</strong>
                    <p>{meta.desc[language]}</p>
                  </div>
                  <div className="activity-tile-foot">
                    <span className="meta">
                      {entry ? `${entry.defaultTarget} target · ${entry.durationSec}s` : '60s'}
                    </span>
                    <span className="activity-launch">
                      <Icon name="play" size={16} />
                      <span>{language === 'am' ? 'ጀምር' : language === 'om' ? 'Jalqabi' : 'Play'}</span>
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

/** Live MediaPipe Pose AI Runner for any of the 7 ai/pose body activities. */
export function ActivityRunner() {
  const { id } = useParams()
  const { language, session, refreshProgress } = useApp()
  const child = session?.child ?? null

  const validId = ORDERED_ACTIVITY_IDS.includes(id as ActivityId) ? (id as ActivityId) : null
  const meta = validId ? ACTIVITY_META[validId] : null

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<ActivityController | null>(null)

  const [phase, setPhase] = useState<'ready' | 'running' | 'finished'>('ready')
  const [inputMode, setInputMode] = useState<'camera' | 'keyboard'>('camera')
  const [status, setStatus] = useState<ActivityStatus | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [coop, setCoop] = useState(false)
  const [dressUp, setDressUp] = useState<DressUpItem>('none')
  const [result, setResult] = useState<ActivityResult | null>(null)
  const [saved, setSaved] = useState<GameSaved | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => {
      controllerRef.current?.stop()
      controllerRef.current = null
    }
  }, [])

  if (!validId || !meta || !child) {
    return <Navigate to="/activities" replace />
  }

  const startSession = async (mode: 'camera' | 'keyboard') => {
    controllerRef.current?.stop()
    controllerRef.current = null
    setResult(null)
    setSaved(null)
    setSaveError(null)
    setPaused(false)
    setInputMode(mode)
    setPhase('running')
    setStatus({
      state: 'loading',
      hint:
        mode === 'camera'
          ? 'Starting camera and loading MediaPipe PoseLandmarker from /models/pose_landmarker_lite.task...'
          : 'Starting keyboard / touch activity mode...',
    })

    try {
      const pose = await loadPoseModule()
      if (!pose.startActivity || !canvasRef.current) {
        setStatus({ state: 'error', message: 'Pose activity engine is unavailable.' })
        return
      }

      const ctrl = pose.startActivity({
        activity: validId,
        canvas: canvasRef.current,
        video: mode === 'camera' ? (videoRef.current ?? undefined) : undefined,
        mode,
        debug: showSkeleton,
        coop,
        dressUp,
        muted,
        modelPath: POSE_ASSETS.modelUrl,
        wasmPath: POSE_ASSETS.wasmUrl,
        onStatus(next) {
          setStatus(next)
        },
        onFinish(activityResult) {
          controllerRef.current = null
          setResult(activityResult)
          setPhase('finished')
          setSaving(true)
          void api.saveActivityResult(child.id, validId, activityResult).then(async (res) => {
            setSaving(false)
            if (res.ok) {
              setSaved(res.data)
              await refreshProgress()
            } else {
              setSaveError('Could not save score to backend right now.')
            }
          })
        },
      })

      controllerRef.current = ctrl
    } catch {
      setStatus({
        state: 'error',
        message: 'Could not start the MediaPipe pose engine. You can try keyboard/touch mode below.',
      })
    }
  }

  const stopSession = () => {
    controllerRef.current?.stop()
    controllerRef.current = null
    setPhase('ready')
    setStatus(null)
    setPaused(false)
  }

  const togglePause = () => {
    const ctrl = controllerRef.current
    if (!ctrl) return
    if (paused) {
      ctrl.resume()
      setPaused(false)
    } else {
      ctrl.pause()
      setPaused(true)
    }
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    controllerRef.current?.setMuted(next)
  }

  const changeDressUp = (next: DressUpItem) => {
    setDressUp(next)
    controllerRef.current?.setDressUp(next)
  }

  const isError = status?.state === 'error'

  return (
    <main className="screen screen-camera">
      <TopBar backTo="/activities">
        <span className="topbar-title">{meta.title[language]}</span>
      </TopBar>

      <div className="runner-stage-wrap">
        <div className="stage runner-stage">
          <video
            ref={videoRef}
            className="stage-video is-hidden-feed"
            muted
            playsInline
            aria-label="Camera feed for body detection"
          />
          <canvas ref={canvasRef} className="stage-canvas is-interactive" width={640} height={480} />

          {phase === 'ready' && (
            <div className="runner-ready-overlay">
              <span className="mission-icon is-big is-camera">
                <Icon name={meta.icon} size={34} />
              </span>
              <h2>{meta.title[language]}</h2>
              <p>{meta.desc[language]}</p>
            </div>
          )}

          {phase === 'running' && status && (status.state === 'loading' || status.state === 'calibrating' || isError) && (
            <p className="stage-status" role="status">
              {status.message || status.hint}
            </p>
          )}
        </div>

        {/* Live AI options strip */}
        {phase === 'ready' && (
          <div className="panel runner-setup">
            <div className="runner-options">
              <label className="check">
                <input
                  type="checkbox"
                  checked={showSkeleton}
                  onChange={(e) => setShowSkeleton(e.target.checked)}
                />
                <span>Show live 33-point AI skeleton overlay</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={coop}
                  onChange={(e) => setCoop(e.target.checked)}
                />
                <span>2-Player Co-op body detection</span>
              </label>
            </div>

            <div className="field">
              <legend>AR Dress-Up Overlay (follows detected pose)</legend>
              <div className="choices">
                {DRESS_UP_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={dressUp === item.id ? 'choice is-on' : 'choice'}
                    onClick={() => changeDressUp(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <SafetyBanner privacy />

            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void startSession('camera')}
              >
                <Icon name="camera" size={18} />
                Start Live Camera AI
              </button>
              <button
                type="button"
                className="btn btn-plain"
                onClick={() => void startSession('keyboard')}
              >
                <Icon name="play" size={18} />
                Use Buttons / Keyboard
              </button>
            </div>
          </div>
        )}

        {phase === 'running' && (
          <div className="panel runner-controls">
            <div className="split">
              <StatusPill tone={isError ? 'problem' : status?.state === 'playing' ? 'done' : 'waiting'}>
                {isError
                  ? 'Camera unavailable'
                  : status?.state === 'playing'
                    ? inputMode === 'camera'
                      ? 'Camera AI Active'
                      : 'Buttons / Keyboard Mode'
                    : status?.state === 'calibrating'
                      ? 'Calibrating body frame...'
                      : 'Loading MediaPipe model...'}
              </StatusPill>

              <div className="runner-mini-actions">
                <button type="button" className="btn btn-plain btn-sm" onClick={toggleMute}>
                  {muted ? 'Unmute' : 'Sound On'}
                </button>
                <button type="button" className="btn btn-plain btn-sm" onClick={togglePause} disabled={isError}>
                  {paused ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className="btn btn-danger btn-sm" onClick={stopSession}>
                  Stop
                </button>
              </div>
            </div>

            {isError && (
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void startSession('camera')}
                >
                  Retry Camera AI
                </button>
                <button
                  type="button"
                  className="btn btn-plain"
                  onClick={() => void startSession('keyboard')}
                >
                  Switch to Buttons / Keyboard
                </button>
              </div>
            )}

            {/* AR Dress-Up live switcher when camera is active */}
            {inputMode === 'camera' && !isError && (
              <div className="choices">
                {DRESS_UP_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={dressUp === item.id ? 'choice is-on' : 'choice'}
                    onClick={() => changeDressUp(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* Touch/Keyboard controls when running in keyboard fallback */}
            {inputMode === 'keyboard' && !isError && (
              <div className="mock-buttons">
                {meta.controls.map((ctrl) =>
                  ctrl.hold ? (
                    <button
                      key={ctrl.action}
                      type="button"
                      className="btn btn-primary"
                      onPointerDown={() => controllerRef.current?.setActionHeld(ctrl.action, true)}
                      onPointerUp={() => controllerRef.current?.setActionHeld(ctrl.action, false)}
                      onPointerLeave={() => controllerRef.current?.setActionHeld(ctrl.action, false)}
                    >
                      {ctrl.label} <kbd>{ctrl.keyHint}</kbd>
                    </button>
                  ) : (
                    <button
                      key={ctrl.action}
                      type="button"
                      className="btn btn-primary"
                      onClick={() => controllerRef.current?.triggerAction(ctrl.action)}
                    >
                      {ctrl.label} <kbd>{ctrl.keyHint}</kbd>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'finished' && result && (
          <div className="panel runner-summary rise">
            <div className="split">
              <h2 className="panel-title">{result.completed ? 'Activity Complete!' : 'Nice Moving!'}</h2>
              <StatusPill tone={saveError ? 'problem' : 'done'}>
                {saving
                  ? 'Saving to backend...'
                  : saveError
                    ? 'Save failed'
                    : saved?.alreadyRecorded
                      ? 'Already credited today'
                      : `Saved (+${saved?.pointsAwarded ?? result.points} pts)`}
              </StatusPill>
            </div>

            <div className="report-stats">
              <div className="report-stat">
                <strong>{result.score}</strong>
                <span>Score</span>
              </div>
              <div className="report-stat">
                <strong>
                  {result.reps}/{result.target}
                </strong>
                <span>Reps</span>
              </div>
              <div className="report-stat">
                <strong>+{saved?.pointsAwarded ?? 0}</strong>
                <span>Points Awarded</span>
              </div>
              <div className="report-stat">
                <strong>{result.input_mode === 'camera' ? 'Camera' : 'Keys'}</strong>
                <span>Detection</span>
              </div>
            </div>

            {saveError && <p className="banner banner-warn">{saveError}</p>}

            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void startSession(inputMode)}
              >
                Play Again
              </button>
              <Link className="btn btn-plain" to="/activities">
                All Body AI Games
              </Link>
              <Link className="btn btn-ghost" to="/missions">
                Back to Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
