"use client";

/**
 * Explicit-consent, on-device, approximate nail AR try-on.
 * Hand Landmarker returns joints, not a trained nail segmentation mask.
 * All camera/photo pixels stay in this browser; no upload or profile persistence.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { coverProjection, drawArNails, type ArLook, type Point } from "./nail-ar-geometry";

type TryMode = "live" | "photo";
type StageStatus = "idle" | "loading" | "tracking" | "no-hand" | "error";
type Props = { look: ArLook; mode: TryMode; active: boolean; onNextShade: () => void; onNextShape: () => void; onNextFinish: () => void };
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const DETECTION_INTERVAL_MS = 90;

async function loadTracker(mode: "VIDEO" | "IMAGE"): Promise<HandLandmarker> {
  // Lazy-load the ML runtime only after consent or deliberate photo selection.
  const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
    runningMode: mode,
    numHands: 1,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };
  try {
    return await HandLandmarker.createFromOptions(fileset, options);
  } catch {
    return await HandLandmarker.createFromOptions(fileset, { ...options, baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" } });
  }
}

function readableCameraError(error: unknown): string {
  if (error instanceof Error && /NotAllowed|PermissionDenied|SecurityError/i.test(error.name)) return "Η άδεια κάμερας δεν δόθηκε. Μπορείς να χρησιμοποιήσεις τη λειτουργία φωτογραφίας.";
  if (error instanceof Error && /NotFound|Overconstrained/i.test(error.name)) return "Δεν βρέθηκε διαθέσιμη κάμερα σε αυτή τη συσκευή.";
  if (error instanceof Error && /NotReadable|TrackStart/i.test(error.name)) return "Η κάμερα χρησιμοποιείται ήδη από άλλη εφαρμογή.";
  return "Δεν ήταν δυνατή η εκκίνηση της κάμερας ή η φόρτωση του μοντέλου. Δοκίμασε ξανά ή επίλεξε φωτογραφία.";
}

export default function NailArTryOn({ look, mode, active, onNextShade, onNextShape, onNextFinish }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<HandLandmarker | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const photoHandsRef = useRef<Point[][]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const runningRef = useRef(false);
  const statusRef = useRef<StageStatus>("idle");
  const lookRef = useRef(look);
  const cameraSideRef = useRef<"user" | "environment">("environment");
  const [status, setStatus] = useState<StageStatus>("idle");
  const [message, setMessage] = useState("");
  const [detected, setDetected] = useState(0);
  const [cameraSide, setCameraSide] = useState<"user" | "environment">("environment");
  const [hasPhoto, setHasPhoto] = useState(false);

  lookRef.current = look;
  cameraSideRef.current = cameraSide;
  const changeStatus = useCallback((next: StageStatus) => {
    if (next !== statusRef.current) { statusRef.current = next; setStatus(next); }
  }, []);

  const stopCamera = useCallback(() => {
    generationRef.current++;
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
    trackerRef.current?.close();
    trackerRef.current = null;
    setDetected(0);
    changeStatus("idle");
  }, [changeStatus]);

  const render = useCallback((
    source: CanvasImageSource, imageWidth: number, imageHeight: number,
    landmarks: Point[][], mirrored: boolean, timestamp: number,
  ) => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (!stage || !canvas || imageWidth <= 0 || imageHeight <= 0) return 0;
    const ratio = Math.min(1.8, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(stage.clientWidth * ratio));
    const height = Math.max(1, Math.round(stage.clientHeight * ratio));
    if (!width || !height) return 0;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return 0;
    const projection = { width, height, imageWidth, imageHeight, mirror: mirrored };
    const crop = coverProjection(projection);
    if (!crop) return 0;
    ctx.fillStyle = "#ead4dc"; ctx.fillRect(0, 0, width, height);
    ctx.save();
    if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, crop.cropX, crop.cropY, imageWidth * crop.scale, imageHeight * crop.scale);
    ctx.restore();
    return drawArNails(ctx, landmarks, projection, lookRef.current, timestamp);
  }, []);

  const startCamera = useCallback(async (side: "user" | "environment" = cameraSideRef.current) => {
    stopCamera();
    setMessage("");
    setHasPhoto(false);
    const generation = generationRef.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Η κάμερα χρειάζεται HTTPS και υποστηριζόμενο browser. Χρησιμοποίησε φωτογραφία εάν δεν είναι διαθέσιμη.");
      changeStatus("error");
      return;
    }
    changeStatus("loading");
    let stream: MediaStream | null = null;
    let tracker: HandLandmarker | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: side }, width: { ideal: 960 }, height: { ideal: 1280 }, frameRate: { ideal: 24, max: 30 } },
      });
      if (generation !== generationRef.current || !active) { stream.getTracks().forEach(track => track.stop()); return; }
      const video = videoRef.current;
      if (!video) throw new Error("video_missing");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      tracker = await loadTracker("VIDEO");
      if (generation !== generationRef.current || !active) {
        tracker.close();stream.getTracks().forEach(track => track.stop());video.srcObject = null;return;
      }
      streamRef.current = stream;
      trackerRef.current = tracker;
      runningRef.current = true;
      changeStatus("no-hand");
      let lastDetection = -Infinity;
      let lastVideoTime = -1;
      let hands: Point[][] = [];
      let prevNailCount = -1;
      const tick = (now: number) => {
        if (!runningRef.current || generation !== generationRef.current) return;
        const currentVideo = videoRef.current;
        if (!currentVideo || currentVideo.readyState < 2 || !currentVideo.videoWidth) {
          rafRef.current = requestAnimationFrame(tick);return;
        }
        if (now - lastDetection >= DETECTION_INTERVAL_MS && currentVideo.currentTime !== lastVideoTime) {
          lastVideoTime = currentVideo.currentTime;
          lastDetection = now;
          try {
            hands = tracker!.detectForVideo(currentVideo, now).landmarks as Point[][];
            changeStatus(hands.length ? "tracking" : "no-hand");
          } catch {
            hands = [];
            changeStatus("no-hand");
          }
        }
        const painted = render(currentVideo, currentVideo.videoWidth, currentVideo.videoHeight, hands, side === "user", now);
        if (painted !== prevNailCount) { setDetected(painted); prevNailCount = painted; }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (error) {
      tracker?.close();
      stream?.getTracks().forEach(track => track.stop());
      if (generation !== generationRef.current) return;
      setMessage(readableCameraError(error));
      changeStatus("error");
    }
  }, [active, changeStatus, render, stopCamera]);

  const choosePhoto = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    stopCamera();
    bitmapRef.current?.close();
    bitmapRef.current = null;
    photoHandsRef.current = [];
    setHasPhoto(false);
    if (!IMAGE_TYPES.includes(file.type)) { setMessage("Επίλεξε φωτογραφία JPG, PNG ή WebP."); changeStatus("error"); return; }
    if (file.size > IMAGE_MAX_BYTES) { setMessage("Μέγιστο μέγεθος φωτογραφίας: 8 MB."); changeStatus("error"); return; }
    setMessage("");
    const generation = generationRef.current;
    changeStatus("loading");
    let bitmap: ImageBitmap | null = null;
    let tracker: HandLandmarker | null = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      if (generation !== generationRef.current || !active) { bitmap.close(); return; }
      tracker = await loadTracker("IMAGE");
      if (generation !== generationRef.current || !active) { bitmap.close();tracker.close();return; }
      const hands = tracker.detect(bitmap).landmarks as Point[][];
      bitmapRef.current = bitmap;
      photoHandsRef.current = hands;
      setHasPhoto(true);
      setDetected(render(bitmap, bitmap.width, bitmap.height, hands, false, performance.now()));
      changeStatus(hands.length ? "tracking" : "no-hand");
      if (!hands.length) setMessage("Δεν εντοπίστηκε χέρι. Δοκίμασε φωτογραφία με τα νύχια ορατά, καλό φως και ανοιχτά δάχτυλα.");
    } catch {
      bitmap?.close();
      setMessage("Η φωτογραφία δεν αναλύθηκε. Δοκίμασε άλλη εικόνα ή τη live κάμερα.");
      changeStatus("error");
    } finally {
      tracker?.close();
    }
  }, [active, changeStatus, render, stopCamera]);

  const saveImage = useCallback(() => {
    if (!canvasRef.current || (!hasPhoto && !runningRef.current)) return;
    canvasRef.current.toBlob(blob => {
      if (!blob) { setMessage("Δεν ήταν δυνατή η αποθήκευση εικόνας."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "nyxi-nail-look.png"; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }, [hasPhoto]);

  useEffect(() => {
    if (!active || mode !== "live") stopCamera();
  }, [active, mode, stopCamera]);
  useEffect(() => {
    if (!active || mode !== "photo") return;
    const bitmap = bitmapRef.current;
    if (bitmap) setDetected(render(bitmap, bitmap.width, bitmap.height, photoHandsRef.current, false, performance.now()));
  }, [look, mode, active, render]);

  useEffect(() => {
    if (mode !== "live") return;
    const stopWhenBackgrounded = () => { if (document.visibilityState === "hidden") stopCamera(); };
    const stopOnPageLeave = () => stopCamera();
    document.addEventListener("visibilitychange", stopWhenBackgrounded);
    window.addEventListener("pagehide", stopOnPageLeave);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenBackgrounded);
      window.removeEventListener("pagehide", stopOnPageLeave);
    };
  }, [mode, stopCamera]);

  useEffect(() => () => {
    generationRef.current++;
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    trackerRef.current?.close();
    bitmapRef.current?.close();
  }, []);

  const currentStatus = status === "loading" ? "Φόρτωση μοντέλου ανίχνευσης…" : status === "tracking" ? (detected > 0 ? "Το χέρι εντοπίστηκε · " + detected + " νύχια" : "Κράτησε το χέρι πιο σταθερά") : status === "no-hand" ? "Δείξε τα νύχια σου καθαρά στην κάμερα" : "Η δοκιμή είναι έτοιμη";
  return <div className="nyxi-ar">
    <div className="ar-stage" ref={stageRef}>
      <canvas ref={canvasRef} className="ar-canvas" aria-label="Τοπική προεπισκόπηση της κάμερας ή της φωτογραφίας με ενδεικτικό ψηφιακό βερνίκι" role="img" />
      <video className="ar-video-source" ref={videoRef} autoPlay playsInline muted aria-hidden="true" />
      {(status === "idle" || status === "error" || (mode === "photo" && !hasPhoto)) && <div className="ar-empty" aria-hidden="true"><div className="ar-hand">✋</div><span>{mode === "live" ? "LIVE NAIL TRY-ON" : "PHOTO NAIL TRY-ON"}</span><small>Το δικό σου χέρι, το δικό σου χρώμα.</small></div>}
      {status === "loading" && <div className="ar-loading" role="status"><span className="ar-loader" />Προετοιμάζουμε τη δοκιμή σου…</div>}
      {status === "no-hand" && mode === "live" && <div className="ar-guidance" aria-live="polite">Άνοιξε λίγο τα δάχτυλα και βάλε το χέρι στο κέντρο.</div>}
      {(status === "tracking" && detected > 0) && <div className="ar-quick-controls" role="group" aria-label="Γρήγορες αλλαγές live μανικιούρ">
        <button type="button" aria-label="Επόμενο χρώμα" onClick={onNextShade}>◉ <span>Χρώμα</span></button>
        <button type="button" aria-label="Επόμενο σχήμα" onClick={onNextShape}>◇ <span>Σχήμα</span></button>
        <button type="button" aria-label="Επόμενο φινίρισμα" onClick={onNextFinish}>✦ <span>Εφέ</span></button>
      </div>}
      <div className="ar-live-indicator"><span className={runningRef.current ? "ar-on" : ""} />{mode === "live" ? "LIVE AR · BETA" : "PHOTO AR · BETA"}</div>
    </div>
    <div className="ar-under">
      <p className="ar-status" aria-live="polite">{currentStatus}</p>
      {message && <p className="notice warning ar-error" role="alert">{message}</p>}
      {mode === "live" ? <div className="ar-actions">
        {status === "idle" || status === "error" ? <button className="primary-action" type="button" onClick={() => void startCamera()}>◉ Άνοιξε την κάμερα</button> : <button type="button" className="ar-secondary" onClick={stopCamera} disabled={status === "loading"}>■ Κλείσε κάμερα</button>}
        {runningRef.current && <button type="button" className="ar-secondary" onClick={() => { const next = cameraSide === "user" ? "environment" : "user"; setCameraSide(next); void startCamera(next); }}>↻ Εναλλαγή κάμερας</button>}
        {runningRef.current && <button type="button" className="ar-secondary" onClick={saveImage}>↓ Αποθήκευση look</button>}
      </div> : <div className="ar-actions">
        <label className="primary-action ar-upload" htmlFor="nyxi-ar-photo">＋ {hasPhoto ? "Άλλαξε φωτογραφία" : "Πρόσθεσε φωτογραφία"}</label>
        <input id="nyxi-ar-photo" className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void choosePhoto(event)} />
        {hasPhoto && <button className="ar-secondary" type="button" onClick={saveImage}>↓ Αποθήκευση look</button>}
      </div>}
      <p className="ar-privacy"><strong>Ιδιωτική δοκιμή:</strong> τα καρέ και οι φωτογραφίες επεξεργάζονται μόνο στη συσκευή σου. Η φόρτωση του μοντέλου χρειάζεται σύνδεση, και ο πάροχος του λογισμικού μπορεί να συλλέγει τεχνικά στατιστικά. Το περίγραμμα νυχιών προσεγγίζεται από σημεία του χεριού — δεν είναι ακριβής σάρωση ή φωτορεαλιστική εγγύηση.</p>
      <div className="ar-tips"><span>☼ Φυσικό φως</span><span>↔ Χώρισε τα δάχτυλα</span><span>⌁ Κράτησε το χέρι σταθερό</span></div>
    </div>
  </div>;
}
