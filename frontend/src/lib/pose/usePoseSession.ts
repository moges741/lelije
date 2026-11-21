import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Translate } from '../../i18n'
import { loadPoseModule, POSE_ASSETS } from './load'
import { STATES, type ActionEvent, type PoseEngine, type PoseModule } from './types'

export type CameraPhase = 'setup' | 'starting' | 'calibrating' | 'running' | 'unavailable'

export interface PoseSession {
  engine: PoseEngine
  pose: PoseModule
}

interface Options {
  mock: boolean
  /** Runs once the engine is calibrated. May return a cleanup function. */
  onReady?: (session: PoseSession) => void | (() => void)
  onAction?: (event: ActionEvent, engine: PoseEngine) => void
}

/** Build Contract 8.2: no person for 10 s switches to the fallback. */
const NO_PERSON_LIMIT_MS = 10_000
/** Never leave a child stuck on the calibration step. */
const CALIBRATION_LIMIT_MS = 5_000

/**
 * Runs the Contract A lifecycle: init, start, calibrate, then events.
 * Nothing loads and no permission is requested until `begin()` is called.
 * Any failure ends in phase `unavailable`, never in a thrown error.
 */
export function usePoseSession(options: Options) {
  const { mock } = options
  const videoRef = useRef<HTMLVideoElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<CameraPhase>('setup')
  const [personVisible, setPersonVisible] = useState(true)

  const ready = useEffectEvent((session: PoseSession) => options.onReady?.(session))
  const action = useEffectEvent((event: ActionEvent, engine: PoseEngine) =>
    options.onAction?.(event, engine),
  )

  useEffect(() => {
    const video = videoRef.current
    if (attempt === 0 || !video) return

    let active = true
    let running = false
    let engine: PoseEngine | undefined
    let teardown: void | (() => void)
    let noPersonTimer = 0
    let calibrationTimer = 0
    const offs: (() => void)[] = []

    const release = () => {
      active = false
      window.clearTimeout(noPersonTimer)
      window.clearTimeout(calibrationTimer)
      offs.forEach((off) => off())
      if (typeof teardown === 'function') teardown()
      try {
        engine?.destroy()
      } catch {
        // Already released.
      }
    }

    const giveUp = () => {
      if (!active) return
      release()
      setPhase('unavailable')
    }

    const run = (pose: PoseModule, current: PoseEngine) => {
      if (!active || running) return
      running = true
      window.clearTimeout(calibrationTimer)
      offs.push(current.on('action', (event) => action(event, current)))
      teardown = ready({ engine: current, pose })
      setPhase('running')
    }

    void (async () => {
      try {
        const pose = await loadPoseModule()
        if (!active) return
        const current = pose.createPoseEngine({
          video,
          ...POSE_ASSETS,
          targetFps: 15,
          mock,
        })
        engine = current

        offs.push(
          current.on('status', ({ state, message }) => {
            // Developer strings go to the console only, never to the child.
            if (import.meta.env.DEV) console.debug('[pose]', state, message ?? '')
            if (state === STATES.NEEDS_PERMISSION || state === STATES.ERROR) {
              giveUp()
            } else if (state === STATES.NO_PERSON) {
              setPersonVisible(false)
              if (!noPersonTimer) {
                noPersonTimer = window.setTimeout(giveUp, NO_PERSON_LIMIT_MS)
              }
            } else if (state === STATES.RUNNING) {
              setPersonVisible(true)
              window.clearTimeout(noPersonTimer)
              noPersonTimer = 0
            }
          }),
          current.on('calibrated', () => run(pose, current)),
        )

        await current.init()
        if (!active) return
        await current.start()
        if (!active) return
        setPhase('calibrating')
        calibrationTimer = window.setTimeout(() => run(pose, current), CALIBRATION_LIMIT_MS)
        current.calibrate()
      } catch {
        giveUp()
      }
    })()

    return release
  }, [attempt, mock])

  return {
    videoRef,
    phase,
    personVisible,
    begin() {
      setPersonVisible(true)
      setPhase('starting')
      setAttempt((n) => n + 1)
    },
  }
}

/** Child-facing text for the camera stage. */
export function stageMessage(
  t: Translate,
  phase: CameraPhase,
  personVisible: boolean,
): string | null {
  if (phase === 'setup') return t('cameraSetupBody')
  if (phase === 'starting') return t('loading')
  if (phase === 'calibrating') return t('calibrating')
  if (phase === 'running' && !personVisible) return t('stepIntoView')
  return null
}
