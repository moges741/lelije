// @ts-check
// Keyboard and tap input: the fallback when the camera or the pose model is
// not available, so a game can always be played.
//
//   Space            -> jump
//   Arrow up         -> arms up
//   Tap / click on the LEFT half of the canvas  -> jump
//   Tap / click on the RIGHT half of the canvas -> arms up
//
// Nothing is recorded: a key or tap is turned into an action and forgotten.

import { DETECTOR_CONFIG } from "./detectors.js";

/** @typedef {"jump" | "armsUp"} InputAction */

/** Keys and timing in one place. The cooldowns match the camera detectors, so key mashing gives no advantage. */
export const KEYBOARD_CONFIG = {
  jumpCodes: ["Space"],
  jumpKeys: [" ", "Spacebar"],
  armsUpCodes: ["ArrowUp"],
  armsUpKeys: ["ArrowUp", "Up"],
  jumpCooldownMs: DETECTOR_CONFIG.jump.cooldownMs,
  armsUpCooldownMs: DETECTOR_CONFIG.armsUp.cooldownMs,
  /** Taps left of this fraction of the canvas width are a jump, the rest are arms up. */
  tapSplit: 0.5,
};

/**
 * Which action a key means, or null for any other key.
 * @param {{ code?: string, key?: string }} event
 * @returns {InputAction | null}
 */
export function actionForKey(event) {
  const code = event.code ?? "";
  const key = event.key ?? "";
  if (KEYBOARD_CONFIG.jumpCodes.includes(code) || KEYBOARD_CONFIG.jumpKeys.includes(key)) return "jump";
  if (KEYBOARD_CONFIG.armsUpCodes.includes(code) || KEYBOARD_CONFIG.armsUpKeys.includes(key)) return "armsUp";
  return null;
}

/**
 * Which action a tap means.
 * @param {number} xFraction  Where the tap landed across the canvas, 0 (left) to 1 (right).
 * @returns {InputAction}
 */
export function actionForTap(xFraction) {
  return xFraction < KEYBOARD_CONFIG.tapSplit ? "jump" : "armsUp";
}

/**
 * True when the key press belongs to something the user is typing in.
 * @param {unknown} target
 */
function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  const element = /** @type {{ tagName?: string, isContentEditable?: boolean }} */ (target);
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

/**
 * @typedef {object} KeyboardInputState
 * @property {boolean} attached
 * @property {boolean} used  True once any game key or tap happened while attached. The result must then say input_mode "keyboard".
 * @property {number} actions  Actions passed on to the game.
 */

/**
 * @typedef {object} KeyboardInputOptions
 * @property {(action: InputAction, source: "key" | "tap") => void} onAction
 * @property {EventTarget | null} [tapTarget]  Usually the game canvas.
 * @property {EventTarget} [keyTarget]  Default: window.
 * @property {() => number} [now]  Clock in milliseconds. Default: performance.now().
 */

/**
 * Creates the keyboard / tap input. Nothing is listened to until attach().
 * @param {KeyboardInputOptions} options
 */
export function createKeyboardInput({ onAction, tapTarget = null, keyTarget, now = () => performance.now() }) {
  const keys = keyTarget ?? globalThis.window ?? null;

  /** @type {KeyboardInputState} */
  const state = { attached: false, used: false, actions: 0 };
  let lastJumpAt = Number.NEGATIVE_INFINITY;
  let lastArmsUpAt = Number.NEGATIVE_INFINITY;

  /**
   * @param {InputAction} action
   * @param {"key" | "tap"} source
   */
  function fire(action, source) {
    state.used = true;
    const time = now();
    if (action === "jump") {
      if (time - lastJumpAt < KEYBOARD_CONFIG.jumpCooldownMs) return;
      lastJumpAt = time;
    } else {
      if (time - lastArmsUpAt < KEYBOARD_CONFIG.armsUpCooldownMs) return;
      lastArmsUpAt = time;
    }
    state.actions += 1;
    onAction(action, source);
  }

  /** @param {Event} event */
  function onKeyDown(event) {
    const keyEvent = /** @type {KeyboardEvent} */ (event);
    const action = actionForKey(keyEvent);
    if (!action || isTypingTarget(keyEvent.target)) return;
    // Keep Space from scrolling the page or pressing a focused button.
    keyEvent.preventDefault();
    // A held key repeats; one press is one action.
    if (keyEvent.repeat) return;
    fire(action, "key");
  }

  /** @param {Event} event */
  function onKeyUp(event) {
    const keyEvent = /** @type {KeyboardEvent} */ (event);
    if (actionForKey(keyEvent) && !isTypingTarget(keyEvent.target)) keyEvent.preventDefault();
  }

  /** @param {Event} event */
  function onPointerDown(event) {
    const pointer = /** @type {PointerEvent} */ (event);
    if (pointer.isPrimary === false) return;
    if (typeof pointer.button === "number" && pointer.button > 0) return;

    let xFraction = 0;
    const element = /** @type {{ getBoundingClientRect?: () => { left: number, width: number } }} */ (tapTarget);
    if (element && typeof element.getBoundingClientRect === "function" && typeof pointer.clientX === "number") {
      const box = element.getBoundingClientRect();
      if (box.width > 0) xFraction = (pointer.clientX - box.left) / box.width;
    }
    pointer.preventDefault();
    fire(actionForTap(xFraction), "tap");
  }

  function attach() {
    if (state.attached) return;
    state.attached = true;
    if (keys) {
      keys.addEventListener("keydown", onKeyDown);
      keys.addEventListener("keyup", onKeyUp);
    }
    if (tapTarget) tapTarget.addEventListener("pointerdown", onPointerDown);
  }

  function detach() {
    if (!state.attached) return;
    state.attached = false;
    if (keys) {
      keys.removeEventListener("keydown", onKeyDown);
      keys.removeEventListener("keyup", onKeyUp);
    }
    if (tapTarget) tapTarget.removeEventListener("pointerdown", onPointerDown);
  }

  return { attach, detach, state };
}
