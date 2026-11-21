// @ts-check
// Public API of the pose module. Import from this file only.
//
//   import { startCatchTheStars } from "<path>/ai/pose/index.js";
//   const game = await startCatchTheStars({ videoEl, canvasEl, onStatus, onFinish });
//   game.stop();

export { startCatchTheStars } from "./catchTheStars.js";
export { createArmsUpDetector, createJumpDetector } from "./detectors.js";
