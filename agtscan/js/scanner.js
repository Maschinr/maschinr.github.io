// Barcode scanning via the camera.
//
// Decoding uses the native BarcodeDetector API where available (fast, e.g.
// Chrome/Android) and falls back to a locally-vendored zxing-wasm decoder
// everywhere else (e.g. iOS Safari, which has no BarcodeDetector). Both paths
// share the same getUserMedia camera pipeline; only the per-frame decode differs.

const NATIVE = 'BarcodeDetector' in window;

/** Scanning is possible whenever the camera is reachable — decoding is always covered. */
export function scannerSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Lazily load and configure the vendored zxing-wasm reader (once). */
let zxingPromise = null;
function loadZXing() {
  if (!zxingPromise) {
    zxingPromise = import('../vendor/zxing-reader.js').then((mod) => {
      // Point the wasm loader at our vendored binary. Resolving against this
      // module's URL keeps it correct under any base path (e.g. /agtscan/).
      mod.setZXingModuleOverrides({
        locateFile: (path, prefix) =>
          path.endsWith('.wasm')
            ? new URL('../vendor/zxing_reader.wasm', import.meta.url).href
            : prefix + path,
      });
      return mod;
    });
  }
  return zxingPromise;
}

/**
 * Build a detector with a uniform `detect(video) -> [{ rawValue }]` interface.
 * Native uses BarcodeDetector; the fallback grabs a downscaled video frame and
 * decodes it with zxing-wasm.
 */
async function makeDetector() {
  if (NATIVE) {
    let formats = null;
    try { formats = await BarcodeDetector.getSupportedFormats(); } catch { /* ignore */ }
    const det = new BarcodeDetector(formats && formats.length ? { formats } : undefined);
    return { detect: (video) => det.detect(video), native: true };
  }

  const zx = await loadZXing();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    native: false,
    detect: async (video) => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return [];
      // Downscale so decoding stays fast; barcodes remain legible at ~720px.
      const scale = Math.min(1, 720 / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const results = await zx.readBarcodes(imageData, {
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        maxNumberOfSymbols: 1,
        formats: [], // all readable formats
      });
      return results
        .filter((r) => r.text)
        .map((r) => ({ rawValue: r.text }));
    },
  };
}

/**
 * Start the camera in `videoEl` and detect barcodes.
 * Calls onDetected(payload) once, then stops.
 * Returns a stop() function. Throws on camera/permission error.
 */
export async function startScanner(videoEl, onDetected, onError) {
  let stream, stopped = false, timer;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    videoEl.srcObject = null;
  };

  try {
    const detector = await makeDetector();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.setAttribute('playsinline', '');
    await videoEl.play();

    // The zxing fallback decodes sequentially (each pass takes real time), so we
    // simply re-run after each attempt; the native path can poll more eagerly.
    const delay = detector.native ? 60 : 120;
    const loop = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(videoEl);
        if (!stopped && codes && codes.length && codes[0].rawValue) {
          if (navigator.vibrate) navigator.vibrate(80);
          stop();
          onDetected(codes[0].rawValue);
          return;
        }
      } catch { /* transient decode errors are ignored */ }
      if (!stopped) timer = setTimeout(loop, delay);
    };
    loop();
  } catch (err) {
    stop();
    onError && onError(err);
    throw err;
  }

  return stop;
}
