// @ts-check
// Keyboard and tap fallback controller (P5).
// Allows every pose activity to be played without a camera, and strictly tracks
// whether ANY keyboard or tap input occurred so result.input_mode is always truthful.

/** @typedef {"jump" | "armsUp" | "squat" | "jumpingJack" | "balance" | "move"} KeyboardAction */

/**
 * Default key map (case-insensitive via KeyboardEvent.code / key).
 * Designed so children can use Arrow keys, Space, or simple letter keys.
 */
export const KEY_BINDINGS = Object.freeze({
  Space: /** @type {KeyboardAction} */ ("jump"),
  ArrowUp: /** @type {KeyboardAction} */ ("jump"),
  KeyW: /** @type {KeyboardAction} */ ("jump"),
  KeyJ: /** @type {KeyboardAction} */ ("jump"),

  KeyA: /** @type {KeyboardAction} */ ("armsUp"),
  KeyE: /** @type {KeyboardAction} */ ("armsUp"),
  KeyU: /** @type {KeyboardAction} */ ("armsUp"),

  ArrowDown: /** @type {KeyboardAction} */ ("squat"),
  KeyS: /** @type {KeyboardAction} */ ("squat"),
  KeyD: /** @type {KeyboardAction} */ ("squat"),

  KeyX: /** @type {KeyboardAction} */ ("jumpingJack"),
  KeyB: /** @type {KeyboardAction} */ ("balance"),
  KeyM: /** @type {KeyboardAction} */ ("move"),
});

/**
 * Maps a DOM KeyboardEvent-like object to a KeyboardAction, or null.
 * @param {{ code?: string, key?: string }} event
 * @returns {KeyboardAction | null}
 */
export function mapKeyToAction(event) {
  if (event.code && event.code in KEY_BINDINGS) {
    return KEY_BINDINGS[/** @type {keyof typeof KEY_BINDINGS} */ (event.code)];
  }
  const key = (event.key || "").toLowerCase();
  if (key === " " || key === "arrowup" || key === "w" || key === "j") return "jump";
  if (key === "a" || key === "e" || key === "u") return "armsUp";
  if (key === "arrowdown" || key === "s" || key === "d") return "squat";
  if (key === "x") return "jumpingJack";
  if (key === "b") return "balance";
  if (key === "m") return "move";
  return null;
}

/**
 * @typedef {object} KeyboardController
 * @property {() => void} attach  Starts listening on the target (window by default).
 * @property {() => void} detach  Stops listening and clears held states.
 * @property {(action: KeyboardAction, nowMs?: number) => void} trigger  Programmatic tap/button input.
 * @property {(action: KeyboardAction, held: boolean, nowMs?: number) => void} setHeld  Hold/release for squat/balance.
 * @property {(action: KeyboardAction) => boolean} isHeld
 * @property {() => boolean} hasUsedInput  True if ANY keyboard or tap input occurred.
 * @property {() => void} reset
 */

/**
 * Creates a keyboard + touch-tap input controller.
 * @param {object} options
 * @param {(action: KeyboardAction, nowMs: number) => void} options.onAction
 * @param {(action: KeyboardAction, held: boolean, nowMs: number) => void} [options.onHoldChange]
 * @param {EventTarget | null} [options.target]  Defaults to globalThis.window when in a browser.
 * @param {() => number} [options.now]
 * @returns {KeyboardController}
 */
export function createKeyboardController({
  onAction,
  onHoldChange,
  target = typeof window !== "undefined" ? window : null,
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
}) {
  /** @type {Set<KeyboardAction>} */
  const heldActions = new Set();
  let usedInput = false;
  let attached = false;

  /** @param {KeyboardAction} action @param {number} [timeMs] */
  function trigger(action, timeMs = now()) {
    usedInput = true;
    onAction(action, timeMs);
  }

  /** @param {KeyboardAction} action @param {boolean} held @param {number} [timeMs] */
  function setHeld(action, held, timeMs = now()) {
    if (held) usedInput = true;
    const wasHeld = heldActions.has(action);
    if (held) heldActions.add(action);
    else heldActions.delete(action);
    if (wasHeld !== held && onHoldChange) {
      onHoldChange(action, held, timeMs);
    }
  }

  /** @param {Event} rawEvent */
  function handleKeyDown(rawEvent) {
    const event = /** @type {KeyboardEvent} */ (rawEvent);
    if (event.repeat) return;
    // Ignore typing inside inputs/selects so form controls keep working.
    const tag = /** @type {HTMLElement | null} */ (event.target)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const action = mapKeyToAction(event);
    if (!action) return;

    if (event.code === "Space" || event.code === "ArrowUp" || event.code === "ArrowDown") {
      event.preventDefault();
    }
    const t = now();
    setHeld(action, true, t);
    trigger(action, t);
  }

  /** @param {Event} rawEvent */
  function handleKeyUp(rawEvent) {
    const event = /** @type {KeyboardEvent} */ (rawEvent);
    const action = mapKeyToAction(event);
    if (!action) return;
    setHeld(action, false, now());
  }

  function attach() {
    if (attached || !target) return;
    attached = true;
    target.addEventListener("keydown", handleKeyDown);
    target.addEventListener("keyup", handleKeyUp);
  }

  function detach() {
    if (!attached || !target) return;
    attached = false;
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
    heldActions.clear();
  }

  function reset() {
    usedInput = false;
    heldActions.clear();
  }

  return {
    attach,
    detach,
    trigger,
    setHeld,
    isHeld: (action) => heldActions.has(action),
    hasUsedInput: () => usedInput,
    reset,
  };
}
