// @ts-check
// Optional child-friendly dress-up landmark overlay (F5).
// Draws a crown, animal ears, or superhero cape anchored to body landmarks,
// scaled by torsoLength and automatically hidden when visibility is low.

import { LANDMARK } from "./calibration.js";

/** @typedef {import("./poseEngine.js").Landmark} Landmark */
/** @typedef {"none" | "crown" | "cat_ears" | "cape"} DressUpItem */

export const DRESS_UP_ITEMS = /** @type {const} */ (["none", "crown", "cat_ears", "cape"]);

const MIN_VISIBILITY = 0.5;

/**
 * Pure geometry calculation so dress-up positioning can be unit-tested without a canvas.
 * Returns null when required landmarks are missing or low visibility.
 *
 * @param {DressUpItem} item
 * @param {Landmark[] | null | undefined} landmarks
 * @param {number} torsoLength
 * @returns {{ item: DressUpItem, x: number, y: number, scale: number, extra?: Record<string, number> } | null}
 */
export function computeDressUpAnchor(item, landmarks, torsoLength) {
  if (!item || item === "none" || !landmarks || !(torsoLength > 0)) return null;

  if (item === "crown" || item === "cat_ears") {
    const nose = landmarks[LANDMARK.NOSE];
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    if (!nose || !(nose.visibility > MIN_VISIBILITY)) return null;
    if (!ls || !rs || !(ls.visibility > MIN_VISIBILITY) || !(rs.visibility > MIN_VISIBILITY)) {
      return null;
    }
    return {
      item,
      x: nose.x,
      y: nose.y - torsoLength * 0.42,
      scale: torsoLength,
    };
  }

  if (item === "cape") {
    const ls = landmarks[LANDMARK.LEFT_SHOULDER];
    const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    const lh = landmarks[LANDMARK.LEFT_HIP];
    const rh = landmarks[LANDMARK.RIGHT_HIP];
    if (
      !ls ||
      !rs ||
      !lh ||
      !rh ||
      !(ls.visibility > MIN_VISIBILITY) ||
      !(rs.visibility > MIN_VISIBILITY) ||
      !(lh.visibility > MIN_VISIBILITY) ||
      !(rh.visibility > MIN_VISIBILITY)
    ) {
      return null;
    }
    return {
      item,
      x: (ls.x + rs.x) / 2,
      y: (ls.y + rs.y) / 2,
      scale: torsoLength,
      extra: {
        leftShoulderX: ls.x,
        leftShoulderY: ls.y,
        rightShoulderX: rs.x,
        rightShoulderY: rs.y,
        hipY: (lh.y + rh.y) / 2,
      },
    };
  }

  return null;
}

/**
 * Draws the chosen dress-up item inside a mirrored canvas transform.
 * @param {CanvasRenderingContext2D} ctx
 * @param {DressUpItem} item
 * @param {Landmark[] | null | undefined} landmarks
 * @param {number} torsoLength
 * @param {number} width
 * @param {number} height
 */
export function drawDressUpOverlay(ctx, item, landmarks, torsoLength, width, height) {
  const anchor = computeDressUpAnchor(item, landmarks, torsoLength);
  if (!anchor) return;

  const px = anchor.x * width;
  const py = anchor.y * height;
  const unit = anchor.scale * height;

  ctx.save();
  if (anchor.item === "crown") {
    const w = unit * 0.65;
    const h = unit * 0.36;
    ctx.fillStyle = "#ffd166";
    ctx.strokeStyle = "#fca311";
    ctx.lineWidth = Math.max(2, unit * 0.03);
    ctx.beginPath();
    ctx.moveTo(px - w / 2, py + h / 2);
    ctx.lineTo(px - w * 0.45, py - h * 0.35);
    ctx.lineTo(px - w * 0.16, py + h * 0.05);
    ctx.lineTo(px, py - h * 0.55);
    ctx.lineTo(px + w * 0.16, py + h * 0.05);
    ctx.lineTo(px + w * 0.45, py - h * 0.35);
    ctx.lineTo(px + w / 2, py + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (anchor.item === "cat_ears") {
    const spread = unit * 0.32;
    const earW = unit * 0.26;
    const earH = unit * 0.36;
    for (const sign of [-1, 1]) {
      const ex = px + sign * spread;
      ctx.fillStyle = "#ff9f1c";
      ctx.beginPath();
      ctx.moveTo(ex - earW / 2, py + earH * 0.4);
      ctx.lineTo(ex, py - earH * 0.6);
      ctx.lineTo(ex + earW / 2, py + earH * 0.4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffcad4";
      ctx.beginPath();
      ctx.moveTo(ex - earW * 0.25, py + earH * 0.28);
      ctx.lineTo(ex, py - earH * 0.25);
      ctx.lineTo(ex + earW * 0.25, py + earH * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  } else if (anchor.item === "cape" && anchor.extra) {
    const lsx = anchor.extra.leftShoulderX * width;
    const lsy = anchor.extra.leftShoulderY * height;
    const rsx = anchor.extra.rightShoulderX * width;
    const rsy = anchor.extra.rightShoulderY * height;
    const bottomY = anchor.extra.hipY * height + unit * 0.7;
    const flare = unit * 0.45;
    const leftEdge = Math.min(lsx, rsx);
    const rightEdge = Math.max(lsx, rsx);

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#ef476f";
    ctx.beginPath();
    ctx.moveTo(leftEdge, Math.min(lsy, rsy));
    ctx.lineTo(rightEdge, Math.min(lsy, rsy));
    ctx.lineTo(rightEdge + flare, bottomY);
    ctx.lineTo(leftEdge - flare, bottomY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
