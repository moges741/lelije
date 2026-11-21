// @ts-check
// Visual juice & WebAudio feedback engine (F2).
// Particles, floating +points, combo counter, subtle shake on big combos,
// celebratory end screen, WebAudio tone engine with mute toggle, host voice-cheer hook,
// and automatic effect reduction below 15 FPS.

/**
 * @typedef {"jump" | "armsUp" | "rep" | "catch" | "miss" | "combo" | "levelUp" | "freeze" | "go" | "finish"} JuiceEventType
 */

/**
 * @typedef {object} ActivityEvent
 * @property {JuiceEventType} type
 * @property {number} value
 * @property {number} timeMs
 */

/**
 * @typedef {object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} life
 * @property {number} maxLife
 * @property {number} size
 * @property {string} color
 */

/**
 * @typedef {object} FloatingText
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} vy
 * @property {number} life
 * @property {number} maxLife
 * @property {string} color
 * @property {number} scale
 */

const PALETTE = ["#fca311", "#ffd166", "#06d6a0", "#4cc9f0", "#ff6b6b", "#ffffff"];

/**
 * Plays a short WebAudio tone sequence if AudioContext is available and not muted.
 * @param {AudioContext | null} audioCtx
 * @param {number[]} freqs
 * @param {number} stepSec
 * @param {OscillatorType} [wave]
 * @param {number} [volume]
 */
function playNotes(audioCtx, freqs, stepSec, wave = "triangle", volume = 0.12) {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    const base = audioCtx.currentTime;
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freqs[i], base + i * stepSec);
      gain.gain.setValueAtTime(0.001, base + i * stepSec);
      gain.gain.exponentialRampToValueAtTime(volume, base + i * stepSec + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, base + (i + 1) * stepSec);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(base + i * stepSec);
      osc.stop(base + (i + 1) * stepSec + 0.02);
    }
  } catch {
    // Audio unavailable or blocked by browser autoplay policy: fail silently.
  }
}

/**
 * Creates a reusable juice & audio feedback engine.
 * @param {object} [options]
 * @param {boolean} [options.muted]
 * @param {number} [options.lowFpsThreshold]  Reduce particles/shake below this FPS (default 15).
 * @param {(event: ActivityEvent) => void} [options.onVoiceCheer]  Optional hook for host-provided voice-cheer audio.
 */
export function createJuiceEngine(options = {}) {
  const lowFpsThreshold = options.lowFpsThreshold ?? 15;
  let muted = Boolean(options.muted);
  let reducedEffects = false;
  let shakeTimeMs = 0;
  let shakeIntensity = 0;

  /** @type {Particle[]} */
  const particles = [];
  /** @type {FloatingText[]} */
  const popups = [];

  /** @type {AudioContext | null} */
  let audioCtx = null;
  let lastCombo = 0;

  function ensureAudio() {
    if (muted || audioCtx) return audioCtx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
    } catch {
      audioCtx = null;
    }
    return audioCtx;
  }

  /**
   * Updates performance-adaptive effect scaling based on live FPS.
   * @param {number} fps
   */
  function setFps(fps) {
    if (fps > 0 && fps < lowFpsThreshold) {
      reducedEffects = true;
    } else if (fps >= lowFpsThreshold + 2) {
      reducedEffects = false;
    }
  }

  /**
   * Spawns a burst of celebratory particles.
   * @param {number} x  Normalised 0..1 x.
   * @param {number} y  Normalised 0..1 y.
   * @param {number} count
   * @param {string} [tint]
   */
  function burst(x, y, count, tint) {
    const actual = reducedEffects ? Math.min(4, Math.ceil(count / 3)) : Math.min(28, count);
    const maxParticles = reducedEffects ? 24 : 120;
    for (let i = 0; i < actual; i += 1) {
      if (particles.length >= maxParticles) particles.shift();
      const angle = (Math.PI * 2 * i) / actual + (Math.random() - 0.5) * 0.4;
      const speed = 0.18 + Math.random() * 0.35;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.12,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        size: 4 + Math.random() * 5,
        color: tint || PALETTE[i % PALETTE.length],
      });
    }
  }

  /**
   * Spawns a floating text popup (+10, COMBO x3!, LEVEL UP!).
   * @param {string} text
   * @param {number} x  Normalised 0..1
   * @param {number} y  Normalised 0..1
   * @param {string} [color]
   * @param {number} [scale]
   */
  function popup(text, x, y, color = "#ffd166", scale = 1) {
    if (popups.length >= 12) popups.shift();
    popups.push({
      text,
      x,
      y,
      vy: -0.22,
      life: 0,
      maxLife: 0.9,
      color,
      scale,
    });
  }

  /**
   * Triggers visual + audio juice for a game event.
   * @param {ActivityEvent} event
   * @param {{ x?: number, y?: number }} [pos]
   */
  function emit(event, pos = {}) {
    const x = pos.x ?? 0.5;
    const y = pos.y ?? 0.3;
    const ctx = ensureAudio();

    switch (event.type) {
      case "catch":
      case "rep": {
        burst(x, y, 14, "#ffd166");
        popup(`+${Math.max(1, event.value)}`, x, y, "#ffd166", 1.1);
        playNotes(ctx, [523.25, 659.25], 0.07, "triangle", 0.11);
        break;
      }
      case "jump": {
        burst(x, 0.72, 6, "#4cc9f0");
        playNotes(ctx, [392, 523.25], 0.05, "sine", 0.08);
        break;
      }
      case "armsUp": {
        burst(x, 0.25, 6, "#06d6a0");
        playNotes(ctx, [440, 587.33], 0.05, "sine", 0.08);
        break;
      }
      case "combo": {
        lastCombo = event.value;
        burst(0.5, 0.26, 20, "#fca311");
        popup(`COMBO x${event.value}!`, 0.5, 0.22, "#fca311", 1.35);
        if (!reducedEffects && event.value >= 3) {
          shakeTimeMs = 220;
          shakeIntensity = Math.min(8, 3 + event.value);
        }
        playNotes(ctx, [523.25, 659.25, 783.99, 1046.5], 0.06, "triangle", 0.12);
        if (options.onVoiceCheer) options.onVoiceCheer(event);
        break;
      }
      case "levelUp": {
        burst(0.5, 0.35, 24, "#06d6a0");
        popup(`LEVEL ${event.value}!`, 0.5, 0.28, "#06d6a0", 1.4);
        playNotes(ctx, [523.25, 659.25, 783.99, 1046.5], 0.08, "triangle", 0.13);
        if (options.onVoiceCheer) options.onVoiceCheer(event);
        break;
      }
      case "miss": {
        lastCombo = 0;
        popup("Try again!", x, y, "#ffb4a2", 0.95);
        playNotes(ctx, [293.66, 246.94], 0.09, "sine", 0.08);
        break;
      }
      case "freeze": {
        popup("FREEZE!", 0.5, 0.25, "#4cc9f0", 1.45);
        playNotes(ctx, [880, 440], 0.1, "square", 0.08);
        break;
      }
      case "go": {
        popup("DANCE!", 0.5, 0.25, "#06d6a0", 1.4);
        playNotes(ctx, [440, 554.37, 659.25], 0.07, "triangle", 0.1);
        break;
      }
      case "finish": {
        burst(0.3, 0.35, 22);
        burst(0.7, 0.35, 22);
        playNotes(ctx, [523.25, 659.25, 783.99, 1046.5], 0.1, "triangle", 0.14);
        if (options.onVoiceCheer) options.onVoiceCheer(event);
        break;
      }
    }
  }

  /**
   * Advances particles, popups, and screen shake by dtMs.
   * @param {number} dtMs
   */
  function update(dtMs) {
    const dt = Math.min(0.1, Math.max(0, dtMs / 1000));

    if (shakeTimeMs > 0) {
      shakeTimeMs = Math.max(0, shakeTimeMs - dtMs);
    }

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.65 * dt;
    }

    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const t = popups[i];
      t.life += dt;
      if (t.life >= t.maxLife) {
        popups.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
    }
  }

  /**
   * Returns current subtle camera shake offset in pixels.
   * @returns {{ dx: number, dy: number }}
   */
  function getShakeOffset() {
    if (reducedEffects || shakeTimeMs <= 0) return { dx: 0, dy: 0 };
    const ratio = shakeTimeMs / 220;
    const mag = shakeIntensity * ratio;
    return {
      dx: (Math.random() - 0.5) * 2 * mag,
      dy: (Math.random() - 0.5) * 2 * mag,
    };
  }

  /**
   * Renders particles and floating popups onto a 2D canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  function draw(ctx, width, height) {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, p.size * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < popups.length; i += 1) {
      const t = popups[i];
      const alpha = Math.max(0, 1 - t.life / t.maxLife);
      const px = t.x * width;
      const py = t.y * height;
      const fontSize = Math.round(Math.max(18, height * 0.065) * t.scale);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#14213d";
      ctx.fillStyle = t.color;
      ctx.strokeText(t.text, px, py);
      ctx.fillText(t.text, px, py);
      ctx.restore();
    }
  }

  /**
   * Draws a warm, celebratory end screen over the canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {{ title?: string, subtitle?: string, points: number, reps: number, target: number, completed: boolean }} summary
   */
  function drawEndScreen(ctx, width, height, summary) {
    ctx.save();
    ctx.fillStyle = "rgba(15, 29, 58, 0.84)";
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    // Warm sun badge behind the headline.
    ctx.fillStyle = summary.completed ? "#fca311" : "#4cc9f0";
    ctx.beginPath();
    ctx.arc(cx, cy - height * 0.14, Math.min(width, height) * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Star inside badge.
    ctx.fillStyle = "#14213d";
    ctx.font = `700 ${Math.round(height * 0.11)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★", cx, cy - height * 0.135);

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(height * 0.085)}px system-ui, sans-serif`;
    ctx.fillText(summary.title || (summary.completed ? "Great job!" : "Nice moving!"), cx, cy + height * 0.04);

    ctx.fillStyle = "#ffd166";
    ctx.font = `700 ${Math.round(height * 0.065)}px system-ui, sans-serif`;
    ctx.fillText(`+${summary.points} points`, cx, cy + height * 0.15);

    ctx.fillStyle = "#e0e7ff";
    ctx.font = `600 ${Math.round(height * 0.042)}px system-ui, sans-serif`;
    ctx.fillText(
      summary.subtitle || `${summary.reps} / ${summary.target} completed`,
      cx,
      cy + height * 0.24
    );
    ctx.restore();
    draw(ctx, width, height);
  }

  function reset() {
    particles.length = 0;
    popups.length = 0;
    shakeTimeMs = 0;
    shakeIntensity = 0;
    lastCombo = 0;
  }

  function dispose() {
    reset();
    if (audioCtx && typeof audioCtx.close === "function") {
      audioCtx.close().catch(() => {});
    }
    audioCtx = null;
  }

  return {
    emit,
    update,
    draw,
    drawEndScreen,
    getShakeOffset,
    setFps,
    setMuted(nextMuted) {
      muted = Boolean(nextMuted);
    },
    isMuted: () => muted,
    isReducedEffects: () => reducedEffects,
    getParticleCount: () => particles.length,
    getPopupCount: () => popups.length,
    getLastCombo: () => lastCombo,
    reset,
    dispose,
  };
}
