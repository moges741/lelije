/**
 * Stand-in for ai/pose/index.js with the same four exports (Contract A).
 * Vite resolves `lelije-pose` to this file only while ../ai/pose/index.js
 * does not exist. It never opens the camera: J = jump, A = arms up.
 */
import {
  ACTIONS,
  STATES,
  type ActionType,
  type CatchTheStarsGame,
  type CreatePoseEngineOptions,
  type EngineEventMap,
  type EngineSnapshot,
  type EngineState,
  type GameEventMap,
  type PoseEngine,
  type StartCatchTheStarsOptions,
} from './types'

export { ACTIONS, STATES }

type Handler<T> = (payload: T) => void

function createEmitter<M extends Record<string, unknown>>() {
  const map = new Map<keyof M, Set<Handler<M[keyof M]>>>()
  return {
    on<K extends keyof M>(event: K, handler: Handler<M[K]>) {
      if (!map.has(event)) map.set(event, new Set())
      const set = map.get(event)!
      set.add(handler as Handler<M[keyof M]>)
      return () => {
        set.delete(handler as Handler<M[keyof M]>)
      }
    },
    emit<K extends keyof M>(event: K, payload: M[K]) {
      map.get(event)?.forEach((h) => h(payload))
    },
    clear() {
      map.clear()
    },
  }
}

export function createPoseEngine(options: CreatePoseEngineOptions): PoseEngine {
  const bus = createEmitter<EngineEventMap>()
  let state: EngineState = STATES.IDLE
  let armsUp = false
  let personVisible = false
  let destroyed = false
  let keyHandler: ((e: KeyboardEvent) => void) | null = null

  const setState = (next: EngineState, message?: string) => {
    state = next
    bus.emit('status', { state: next, message })
  }

  const emitAction = (type: ActionType) => {
    bus.emit('action', { type, t: performance.now(), confidence: 0.95 })
  }

  const removeKeys = () => {
    if (!keyHandler) return
    window.removeEventListener('keydown', keyHandler)
    keyHandler = null
  }

  return {
    async init() {
      if (destroyed) return
      if (options.mock === false) {
        // Never pretend to be a camera: the app falls back to self-confirm.
        setState(STATES.ERROR, 'ai/pose is not installed; only mock mode works')
        return
      }
      setState(STATES.LOADING, 'mock loading')
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (!destroyed) setState(STATES.READY, 'mock ready')
    },

    async start() {
      if (destroyed || state === STATES.ERROR) return
      options.video.muted = true
      options.video.playsInline = true
      personVisible = true
      removeKeys()
      keyHandler = (e: KeyboardEvent) => {
        if (state !== STATES.RUNNING || e.repeat) return
        const key = e.key.toLowerCase()
        if (key === 'j') emitAction(ACTIONS.JUMP)
        if (key === 'a') {
          armsUp = true
          emitAction(ACTIONS.ARMS_UP)
          window.setTimeout(() => {
            armsUp = false
          }, 400)
        }
      }
      window.addEventListener('keydown', keyHandler)
      setState(STATES.RUNNING, 'mock running: J = jump, A = arms up')
    },

    on(event, handler) {
      return bus.on(event, handler)
    },

    calibrate() {
      bus.emit('calibrated', { torso: 0.35, baselineHipY: 0.62 })
    },

    getState(): EngineSnapshot {
      return { state, armsUp, personVisible, fps: options.targetFps ?? 15 }
    },

    stop() {
      removeKeys()
      armsUp = false
      personVisible = false
      if (!destroyed) setState(STATES.READY, 'stopped')
    },

    destroy() {
      removeKeys()
      destroyed = true
      state = STATES.IDLE
      bus.clear()
    },
  }
}

interface Star {
  x: number
  y: number
  speed: number
  golden: boolean
  r: number
}

export function startCatchTheStars(
  options: StartCatchTheStarsOptions,
): CatchTheStarsGame {
  const { canvas, engine, durationMs = 60_000 } = options
  const bus = createEmitter<GameEventMap>()
  const ctx = canvas.getContext('2d')
  const stars: Star[] = []
  let score = 0
  let starsCaught = 0
  let goldenCaught = 0
  let jumps = 0
  let armsUp = 0
  let paused = false
  let stopped = false
  let raf = 0
  let elapsed = 0
  let last = performance.now()
  let sinceSpawn = 0

  const resize = () => {
    const parent = canvas.parentElement
    canvas.width = parent?.clientWidth || 360
    canvas.height = parent?.clientHeight || 480
  }
  resize()
  window.addEventListener('resize', resize)

  const catchStar = (golden: boolean) => {
    const index = stars.findIndex((s) => s.golden === golden && s.y > 20)
    if (index === -1) return false
    stars.splice(index, 1)
    return true
  }

  const offAction = engine.on('action', (e) => {
    if (paused || stopped) return
    if (e.type === ACTIONS.JUMP) {
      jumps += 1
      if (catchStar(true)) {
        goldenCaught += 1
        score += 5
        bus.emit('score', { score })
      }
    }
    if (e.type === ACTIONS.ARMS_UP) {
      armsUp += 1
      if (catchStar(false)) {
        starsCaught += 1
        score += 1
        bus.emit('score', { score })
      }
    }
  })

  const draw = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const s of stars) {
      ctx.beginPath()
      ctx.fillStyle = s.golden ? '#ffcf3f' : '#c3ee4b'
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2
        const radius = i % 2 === 0 ? s.r : s.r * 0.45
        const x = s.x + Math.cos(angle) * radius
        const y = s.y + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    }
  }

  const game: CatchTheStarsGame = {
    on(event, handler) {
      return bus.on(event, handler)
    },
    pause() {
      paused = true
    },
    resume() {
      paused = false
      last = performance.now()
    },
    stop() {
      if (stopped) return
      stopped = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      offAction()
      bus.emit('end', {
        score,
        starsCaught,
        goldenCaught,
        jumps,
        armsUp,
        durationMs: Math.round(elapsed),
      })
    },
  }

  const loop = (now: number) => {
    if (stopped) return
    const dt = Math.min(100, now - last)
    last = now
    if (!paused) {
      elapsed += dt
      sinceSpawn += dt
      if (sinceSpawn > 650) {
        sinceSpawn = 0
        stars.push({
          x: 24 + Math.random() * (canvas.width - 48),
          y: -20,
          speed: 0.09 + Math.random() * 0.08,
          golden: Math.random() < 0.2,
          r: 13 + Math.random() * 7,
        })
      }
      for (let i = stars.length - 1; i >= 0; i--) {
        stars[i].y += stars[i].speed * dt
        if (stars[i].y > canvas.height + 30) stars.splice(i, 1)
      }
      draw()
    }
    if (elapsed >= durationMs) {
      game.stop()
      return
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  return game
}
