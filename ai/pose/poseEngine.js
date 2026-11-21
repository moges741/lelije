// @ts-check
// Camera + MediaPipe PoseLandmarker lifecycle.
//
// PRIVACY: frames and landmarks never leave this device. This file makes no
// network calls except loading the model file and the wasm runtime, and it
// never stores or logs frames or landmarks.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

/**
 * One MediaPipe pose landmark in normalised image coordinates
 * (x and y in 0..1, y grows DOWNWARD).
 * @typedef {{ x: number, y: number, z: number, visibility: number }} Landmark
 */

/** @typedef {"camera_denied" | "no_camera" | "model_load_failed" | "unsupported"} PoseErrorCode */

/** @typedef {{ code: PoseErrorCode, message: string }} PoseError */

/**
 * @typedef {object} PoseEngineOptions
 * @property {HTMLVideoElement} videoEl  Video element that will show the camera stream.
 * @property {string} modelPath  URL of pose_landmarker_lite.task (e.g. "/models/pose_landmarker_lite.task").
 * @property {string} wasmPath  URL of the folder holding the MediaPipe wasm files (e.g. "/wasm").
 * @property {(landmarks: Landmark[] | null, timestampMs: number) => void} onFrame
 *   Called once per processed frame. `landmarks` is the first detected pose
 *   (33 landmarks) or null when nobody is detected.
 * @property {(poses: Landmark[][], timestampMs: number) => void} [onMultiFrame]
 *   Optional callback receiving every detected pose (used for coop mode with numPoses: 2).
 * @property {number} [numPoses]  Number of poses to detect (1 or 2). Defaults to 1.
 * @property {(error: PoseError) => void} [onError]
 */

/**
 * @typedef {object} PoseEngine
 * @property {() => Promise<boolean>} start  Resolves true when the camera and model are running, false on failure (onError is called).
 * @property {() => void} stop  Releases the camera and closes the model. Safe to call at any time.
 * @property {() => number} getFps  Pose frames processed per second (0 until the first measurement).
 */

/** Tunable engine settings, all in one place. */
export const ENGINE_CONFIG = {
  /** Requested camera size. Small on purpose: faster on cheap phones. */
  cameraWidth: 640,
  cameraHeight: 480,
  /** Below this processed FPS the engine considers skipping frames. */
  lowFps: 15,
  /** Throttle only if detection itself is slow, so a dim room (slow camera) does not trigger it. */
  slowDetectMs: 30,
  /** Stop throttling once detection is this fast again. */
  fastDetectMs: 20,
  /** Length of one FPS measurement window. */
  fpsWindowMs: 1000,
  /** Consecutive windows needed before throttling is switched on or off. */
  windowsToSwitch: 2,
};

/**
 * @param {PoseErrorCode} code
 * @param {string} message
 * @returns {PoseError}
 */
function poseError(code, message) {
  return { code, message };
}

/**
 * @param {unknown} err
 * @returns {err is PoseError}
 */
function isPoseError(err) {
  return typeof err === "object" && err !== null && "code" in err && "message" in err;
}

/**
 * Turns a getUserMedia / video.play() failure into one of our error codes.
 * @param {unknown} err
 * @returns {PoseError}
 */
function mapCameraError(err) {
  const name = /** @type {{ name?: string }} */ (err)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return poseError("camera_denied", "Camera permission was denied.");
    case "NotFoundError":
    case "OverconstrainedError":
      return poseError("no_camera", "No camera was found on this device.");
    case "NotReadableError":
    case "AbortError":
      return poseError("no_camera", "The camera is busy or could not be started.");
    default:
      return poseError("unsupported", "The camera could not be used in this browser.");
  }
}

/**
 * @param {MediaStream | null} stream
 */
function stopTracks(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

/**
 * @param {PoseLandmarker | null} landmarker
 */
function closeLandmarker(landmarker) {
  if (!landmarker) return;
  try {
    landmarker.close();
  } catch {
    // Already closed or never fully initialised: nothing left to release.
  }
}

/**
 * Creates the pose engine. Nothing happens until start() is called.
 * @param {PoseEngineOptions} options
 * @returns {PoseEngine}
 */
export function createPoseEngine({
  videoEl,
  modelPath,
  wasmPath,
  onFrame,
  onMultiFrame,
  numPoses = 1,
  onError,
}) {
  const maxPoses = numPoses === 2 ? 2 : 1;
  /** @type {"idle" | "starting" | "running"} */
  let state = "idle";
  /** Bumped by every stop(), so a start() that is still loading knows it was cancelled. */
  let sessionId = 0;

  /** @type {MediaStream | null} */
  let stream = null;
  /** @type {PoseLandmarker | null} */
  let landmarker = null;
  /** @type {Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null} */
  let fileset = null;
  /** @type {"GPU" | "CPU"} */
  let delegate = "GPU";
  let swappingDelegate = false;

  let rafId = 0;
  let lastVideoTime = -1;

  // FPS measurement and adaptive throttling.
  let fps = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let windowDetectMs = 0;
  let slowWindows = 0;
  let fastWindows = 0;
  let throttled = false;
  let skipThisFrame = false;

  /** @param {PoseError} error */
  function report(error) {
    if (onError) onError(error);
  }

  function resetFpsWindow() {
    windowStart = 0;
    windowFrames = 0;
    windowDetectMs = 0;
  }

  /**
   * @param {"GPU" | "CPU"} useDelegate
   * @returns {Promise<PoseLandmarker>}
   */
  async function createLandmarker(useDelegate) {
    if (!fileset) throw new Error("wasm fileset not loaded");
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelPath, delegate: useDelegate },
      runningMode: "VIDEO",
      numPoses: maxPoses,
    });
  }

  /**
   * Loads the wasm runtime and the model. Tries the GPU first, then the CPU once.
   * @returns {Promise<{ landmarker: PoseLandmarker, delegate: "GPU" | "CPU" }>}
   */
  async function loadLandmarker() {
    try {
      fileset = await FilesetResolver.forVisionTasks(wasmPath);
      try {
        return { landmarker: await createLandmarker("GPU"), delegate: "GPU" };
      } catch {
        return { landmarker: await createLandmarker("CPU"), delegate: "CPU" };
      }
    } catch {
      throw poseError(
        "model_load_failed",
        "The pose model could not be loaded. Check modelPath and wasmPath."
      );
    }
  }

  /** @returns {Promise<MediaStream>} */
  async function openCamera() {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: ENGINE_CONFIG.cameraWidth },
          height: { ideal: ENGINE_CONFIG.cameraHeight },
        },
      });
    } catch (err) {
      throw mapCameraError(err);
    }
  }

  /** @param {MediaStream} cameraStream */
  async function attachStream(cameraStream) {
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.srcObject = cameraStream;
    try {
      await videoEl.play();
    } catch (err) {
      throw mapCameraError(err);
    }
  }

  /**
   * Updates the FPS reading once per window and decides whether to skip frames.
   * @param {number} now
   * @param {number} detectMs
   */
  function recordDetection(now, detectMs) {
    if (windowStart === 0) windowStart = now;
    windowFrames += 1;
    windowDetectMs += detectMs;

    const elapsed = now - windowStart;
    if (elapsed < ENGINE_CONFIG.fpsWindowMs) return;

    fps = (windowFrames * 1000) / elapsed;
    const averageDetectMs = windowDetectMs / windowFrames;

    if (!throttled) {
      const struggling = fps < ENGINE_CONFIG.lowFps && averageDetectMs > ENGINE_CONFIG.slowDetectMs;
      slowWindows = struggling ? slowWindows + 1 : 0;
      if (slowWindows >= ENGINE_CONFIG.windowsToSwitch) {
        throttled = true;
        slowWindows = 0;
        fastWindows = 0;
      }
    } else {
      fastWindows = averageDetectMs < ENGINE_CONFIG.fastDetectMs ? fastWindows + 1 : 0;
      if (fastWindows >= ENGINE_CONFIG.windowsToSwitch) {
        throttled = false;
        skipThisFrame = false;
        slowWindows = 0;
        fastWindows = 0;
      }
    }

    windowStart = now;
    windowFrames = 0;
    windowDetectMs = 0;
  }

  /**
   * Detection threw while running. A GPU delegate can initialise fine and
   * still fail on the first real frame, so fall back to the CPU once.
   */
  function handleDetectFailure() {
    if (delegate !== "GPU" || swappingDelegate) {
      stop();
      report(poseError("model_load_failed", "Pose detection stopped working."));
      return;
    }

    swappingDelegate = true;
    const session = sessionId;
    cancelAnimationFrame(rafId);
    rafId = 0;
    closeLandmarker(landmarker);
    landmarker = null;

    createLandmarker("CPU").then(
      (cpuLandmarker) => {
        if (session !== sessionId) {
          closeLandmarker(cpuLandmarker);
          return;
        }
        landmarker = cpuLandmarker;
        delegate = "CPU";
        swappingDelegate = false;
        resetFpsWindow();
        if (!document.hidden) rafId = requestAnimationFrame(tick);
      },
      () => {
        if (session !== sessionId) return;
        stop();
        report(poseError("model_load_failed", "Pose detection could not run on this device."));
      }
    );
  }

  /** @param {number} now */
  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!landmarker || videoEl.readyState < 2) return;

    // Only work when the camera delivered a new frame.
    const videoTime = videoEl.currentTime;
    if (videoTime === lastVideoTime) return;
    lastVideoTime = videoTime;

    if (throttled) {
      skipThisFrame = !skipThisFrame;
      if (skipThisFrame) return;
    }

    const detectStart = performance.now();
    let result;
    try {
      result = landmarker.detectForVideo(videoEl, now);
    } catch {
      handleDetectFailure();
      return;
    }
    recordDetection(now, performance.now() - detectStart);

    const poses = Array.isArray(result.landmarks) ? result.landmarks : [];
    if (onMultiFrame) onMultiFrame(poses, now);
    onFrame(poses.length > 0 ? poses[0] : null, now);
  }

  function onVisibilityChange() {
    if (state !== "running") return;
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }
    if (rafId !== 0 || !landmarker) return;
    // The pause must not count as "slow" frames.
    resetFpsWindow();
    // Some mobile browsers pause the video while the tab is in the background.
    videoEl.play().catch(() => {});
    rafId = requestAnimationFrame(tick);
  }

  /** Camera unplugged or permission revoked while running. */
  function onTrackEnded() {
    if (state !== "running") return;
    stop();
    report(poseError("no_camera", "The camera stopped working."));
  }

  async function start() {
    if (state !== "idle") return state === "running";

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      // navigator.mediaDevices is missing on plain http:// pages (not localhost).
      const insecure = typeof window !== "undefined" && window.isSecureContext === false;
      report(
        poseError(
          "unsupported",
          insecure
            ? "The camera needs a secure page (https:// or localhost)."
            : "This browser does not support camera access."
        )
      );
      return false;
    }

    state = "starting";
    const session = sessionId;

    /** @type {MediaStream | null} */
    let cameraStream = null;
    // Start loading the model while the child / parent answers the camera prompt.
    const landmarkerPromise = loadLandmarker();
    // Handled below; this only avoids an "unhandled rejection" if the camera fails first.
    landmarkerPromise.catch(() => {});

    /** @type {{ landmarker: PoseLandmarker, delegate: "GPU" | "CPU" } | null} */
    let loaded = null;
    /** @type {PoseError | null} */
    let failure = null;

    try {
      cameraStream = await openCamera();
      if (session === sessionId) await attachStream(cameraStream);
      if (session === sessionId) loaded = await landmarkerPromise;
    } catch (err) {
      failure = isPoseError(err)
        ? err
        : poseError("unsupported", "The pose engine could not start.");
    }

    if (session !== sessionId || !cameraStream || !loaded) {
      // Failed, or stop() was called while loading: release everything we opened.
      stopTracks(cameraStream);
      landmarkerPromise.then(
        (result) => closeLandmarker(result.landmarker),
        () => {}
      );
      if (session === sessionId) {
        videoEl.srcObject = null;
        state = "idle";
        report(failure ?? poseError("unsupported", "The pose engine could not start."));
      }
      return false;
    }

    stream = cameraStream;
    landmarker = loaded.landmarker;
    delegate = loaded.delegate;

    for (const track of stream.getVideoTracks()) track.addEventListener("ended", onTrackEnded);
    document.addEventListener("visibilitychange", onVisibilityChange);

    state = "running";
    lastVideoTime = -1;
    resetFpsWindow();
    if (!document.hidden) rafId = requestAnimationFrame(tick);
    return true;
  }

  function stop() {
    sessionId += 1;
    cancelAnimationFrame(rafId);
    rafId = 0;

    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (stream) {
      for (const track of stream.getVideoTracks()) track.removeEventListener("ended", onTrackEnded);
    }
    stopTracks(stream);
    stream = null;
    videoEl.srcObject = null;

    closeLandmarker(landmarker);
    landmarker = null;
    swappingDelegate = false;

    fps = 0;
    throttled = false;
    skipThisFrame = false;
    slowWindows = 0;
    fastWindows = 0;
    resetFpsWindow();
    state = "idle";
  }

  return {
    start,
    stop,
    getFps: () => fps,
  };
}
