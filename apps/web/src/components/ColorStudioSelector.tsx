"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  COLOR_FINDER_PRESETS,
  colorMatchPercent,
  deltaE2000,
  hexToLab,
  nearestColorName,
  normalizeHex
} from "../lib/color-finder";
import styles from "./ColorFinderExperience.module.css";

type SelectorMode = "picker" | "photo";
type PhotoRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type CropBox = Readonly<{ x: number; y: number; size: number }>;
type HsvColor = Readonly<{ h: number; s: number; v: number }>;
type PhotoPickMode = "spot" | "area";
type PhotoSpot = Readonly<{ x: number; y: number; hex: string }>;

export type ColorStudioShadeCandidate = Readonly<{
  id: string;
  label: string;
  hex: string;
  manufacturer?: string;
  code?: string;
}>;

const PHOTO_TTL_MS = 15 * 60 * 1000;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_CANVAS_WIDTH = 1200;
const PHOTO_CANVAS_HEIGHT = 900;
const DEFAULT_CROP_RATIO = 0.28;
const MIN_CROP_RATIO = 0.08;
const MAX_CROP_RATIO = 0.65;

export function ColorStudioSelector({
  value,
  onChange,
  onConfirm,
  shadeCandidates,
  title = "ΤΟ ΧΡΩΜΑ ΣΟΥ",
  photoKicker = "PHOTO TO COLOR · PRIVATE",
  photoTitle = "Capture the color you want.",
  photoBody = "Πάτησε πάνω σε μια απόχρωση της φωτογραφίας και χρησιμοποίησέ την ως σημείο αναφοράς."
}: {
  value: string;
  onChange: (hex: string) => void;
  onConfirm: () => void;
  shadeCandidates?: readonly ColorStudioShadeCandidate[];
  title?: string;
  photoKicker?: string;
  photoTitle?: string;
  photoBody?: string;
}) {
  const normalizedValue = normalizeHex(value) ?? "#C4A68C";
  const [selectorMode, setSelectorMode] = useState<SelectorMode>("picker");
  const [pickerHsv, setPickerHsv] = useState<HsvColor>(() => hexToHsv(normalizedValue));
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoExpiresAt, setPhotoExpiresAt] = useState<number>();
  const [photoSecondsLeft, setPhotoSecondsLeft] = useState(0);
  const [photoRect, setPhotoRect] = useState<PhotoRect>();
  const [crop, setCrop] = useState<CropBox>();
  const [photoReady, setPhotoReady] = useState(false);
  const [photoSampleHex, setPhotoSampleHex] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();
  const [photoPickMode, setPhotoPickMode] = useState<PhotoPickMode>("spot");
  const [photoSpot, setPhotoSpot] = useState<PhotoSpot>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef(false);
  const pickerDragRef = useRef(false);
  const photoSpotDragRef = useRef(false);

  const selectedShade = useMemo(() => nearestColorName(normalizedValue), [normalizedValue]);
  const fineTuneColors = useMemo(() => {
    const candidates = [
      hsvToHex({ ...pickerHsv, h: pickerHsv.h - 9 }),
      hsvToHex({ ...pickerHsv, h: pickerHsv.h + 9 }),
      hsvToHex({ ...pickerHsv, s: clamp(pickerHsv.s - 0.14, 0, 1) }),
      hsvToHex({ ...pickerHsv, s: clamp(pickerHsv.s + 0.14, 0, 1) }),
      hsvToHex({ ...pickerHsv, v: clamp(pickerHsv.v - 0.12, 0, 1) }),
      hsvToHex({ ...pickerHsv, v: clamp(pickerHsv.v + 0.12, 0, 1) })
    ];
    return [...new Set(candidates)].filter((hex) => hex !== normalizedValue).slice(0, 6);
  }, [pickerHsv, normalizedValue]);

  const matchingShades = useMemo(() => {
    if (!shadeCandidates?.length) return [];
    const targetLab = hexToLab(normalizedValue);
    return shadeCandidates
      .map((shade) => {
        const hex = normalizeHex(shade.hex);
        if (!hex) return undefined;
        const deltaE = deltaE2000(targetLab, hexToLab(hex));
        return { ...shade, hex, deltaE, match: colorMatchPercent(deltaE) };
      })
      .filter((shade): shade is ColorStudioShadeCandidate & { hex: string; deltaE: number; match: number } => Boolean(shade))
      .sort((left, right) => left.deltaE - right.deltaE || right.match - left.match || left.label.localeCompare(right.label, "el"))
      .slice(0, 6);
  }, [normalizedValue, shadeCandidates]);

  useEffect(() => {
    setPickerHsv(hexToHsv(normalizedValue));
  }, [normalizedValue]);

  useEffect(() => {
    if (!photoUrl) return undefined;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (!photoSpot || photoPickMode !== "spot") return;
    const source = canvasRef.current;
    const loupe = loupeCanvasRef.current;
    if (!source || !loupe) return;

    const context = loupe.getContext("2d");
    if (!context) return;
    const sourceSize = 24;
    const half = sourceSize / 2;
    const sx = clamp(photoSpot.x - half, 0, PHOTO_CANVAS_WIDTH - sourceSize);
    const sy = clamp(photoSpot.y - half, 0, PHOTO_CANVAS_HEIGHT - sourceSize);

    context.clearRect(0, 0, loupe.width, loupe.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      source,
      Math.floor(sx),
      Math.floor(sy),
      sourceSize,
      sourceSize,
      0,
      0,
      loupe.width,
      loupe.height
    );
  }, [photoPickMode, photoSpot]);

  useEffect(() => {
    if (!photoExpiresAt) {
      setPhotoSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((photoExpiresAt - Date.now()) / 1000));
      setPhotoSecondsLeft(seconds);
      if (seconds > 0) return;
      clearPhotoState();
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [photoExpiresAt]);

  useEffect(() => {
    if (!photoUrl) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    setPhotoReady(false);
    setPhotoError(undefined);
    setPhotoSampleHex(undefined);

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || !image.naturalWidth || !image.naturalHeight) {
        setPhotoError("Δεν μπορέσαμε να διαβάσουμε αυτή τη φωτογραφία.");
        return;
      }

      canvas.width = PHOTO_CANVAS_WIDTH;
      canvas.height = PHOTO_CANVAS_HEIGHT;
      context.clearRect(0, 0, PHOTO_CANVAS_WIDTH, PHOTO_CANVAS_HEIGHT);
      context.fillStyle = "#070708";
      context.fillRect(0, 0, PHOTO_CANVAS_WIDTH, PHOTO_CANVAS_HEIGHT);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      const scale = Math.min(
        PHOTO_CANVAS_WIDTH / image.naturalWidth,
        PHOTO_CANVAS_HEIGHT / image.naturalHeight
      );
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const x = Math.round((PHOTO_CANVAS_WIDTH - width) / 2);
      const y = Math.round((PHOTO_CANVAS_HEIGHT - height) / 2);
      context.drawImage(image, x, y, width, height);

      const nextRect = { x, y, width, height };
      const minDimension = Math.min(width, height);
      const size = Math.max(40, minDimension * DEFAULT_CROP_RATIO);
      setPhotoRect(nextRect);
      setCrop({ x: x + (width - size) / 2, y: y + (height - size) / 2, size });
      setPhotoReady(true);
    };
    image.onerror = () => {
      setPhotoReady(false);
      setPhotoError("Η μορφή της φωτογραφίας δεν υποστηρίζεται από αυτόν τον browser.");
    };
    image.src = photoUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [photoUrl]);

  const cropPercent = useMemo(() => {
    if (!crop || !photoRect) return Math.round(DEFAULT_CROP_RATIO * 100);
    return Math.round((crop.size / Math.min(photoRect.width, photoRect.height)) * 100);
  }, [crop, photoRect]);

  const cropStyle = useMemo<CSSProperties | undefined>(() => {
    if (!crop) return undefined;
    return {
      left: `${(crop.x / PHOTO_CANVAS_WIDTH) * 100}%`,
      top: `${(crop.y / PHOTO_CANVAS_HEIGHT) * 100}%`,
      width: `${(crop.size / PHOTO_CANVAS_WIDTH) * 100}%`,
      height: `${(crop.size / PHOTO_CANVAS_HEIGHT) * 100}%`
    };
  }, [crop]);

  function updatePickerColor(next: HsvColor) {
    const normalized: HsvColor = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1)
    };
    const hex = hsvToHex(normalized);
    setPickerHsv(normalized);
    onChange(hex);
  }

  function movePickerToPoint(clientX: number, clientY: number, element: HTMLDivElement) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const saturation = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    const nextValue = clamp(1 - ((clientY - bounds.top) / bounds.height), 0, 1);
    updatePickerColor({ ...pickerHsv, s: saturation, v: nextValue });
  }

  function handlePickerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pickerDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    movePickerToPoint(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePickerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pickerDragRef.current) return;
    movePickerToPoint(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePickerPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pickerDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePickerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.06 : 0.02;
    if (event.key === "ArrowLeft") updatePickerColor({ ...pickerHsv, s: pickerHsv.s - step });
    else if (event.key === "ArrowRight") updatePickerColor({ ...pickerHsv, s: pickerHsv.s + step });
    else if (event.key === "ArrowUp") updatePickerColor({ ...pickerHsv, v: pickerHsv.v + step });
    else if (event.key === "ArrowDown") updatePickerColor({ ...pickerHsv, v: pickerHsv.v - step });
    else return;
    event.preventDefault();
  }

  function handlePhotoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setPhotoError("Επίλεξε αρχείο εικόνας.");
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("Η φωτογραφία είναι πολύ μεγάλη. Μέγιστο μέγεθος: 25 MB.");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setSelectorMode("photo");
    setPhotoUrl(nextUrl);
    setPhotoExpiresAt(Date.now() + PHOTO_TTL_MS);
    setPhotoSecondsLeft(PHOTO_TTL_MS / 1000);
    setPhotoRect(undefined);
    setCrop(undefined);
    setPhotoReady(false);
    setPhotoSampleHex(undefined);
    setPhotoPickMode("spot");
    setPhotoSpot(undefined);
    setPhotoError(undefined);
  }

  function clearPhotoState() {
    setPhotoUrl(undefined);
    setPhotoExpiresAt(undefined);
    setPhotoRect(undefined);
    setCrop(undefined);
    setPhotoReady(false);
    setPhotoSampleHex(undefined);
    setPhotoSpot(undefined);
    setPhotoError(undefined);
  }

  function samplePhotoSpot(clientX: number, clientY: number, element: HTMLDivElement) {
    const canvas = canvasRef.current;
    if (!canvas || !photoRect || !photoReady) return;

    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const rawX = (clientX - bounds.left) * (PHOTO_CANVAS_WIDTH / bounds.width);
    const rawY = (clientY - bounds.top) * (PHOTO_CANVAS_HEIGHT / bounds.height);
    const x = clamp(rawX, photoRect.x, photoRect.x + photoRect.width - 1);
    const y = clamp(rawY, photoRect.y, photoRect.y + photoRect.height - 1);
    const sampleSize = Math.max(12, Math.round(Math.min(photoRect.width, photoRect.height) * 0.035));
    const sampleX = Math.max(photoRect.x, x - sampleSize / 2);
    const sampleY = Math.max(photoRect.y, y - sampleSize / 2);
    const width = Math.max(1, Math.min(sampleSize, photoRect.x + photoRect.width - sampleX));
    const height = Math.max(1, Math.min(sampleSize, photoRect.y + photoRect.height - sampleY));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const imageData = context.getImageData(
      Math.floor(sampleX),
      Math.floor(sampleY),
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height))
    );
    const detectedHex = representativeHex(imageData.data, Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
    if (!detectedHex) return;

    setPhotoSpot({ x, y, hex: detectedHex });
    setPhotoSampleHex(detectedHex);
    onChange(detectedHex);
    setPhotoError(undefined);
  }

  function handlePhotoPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!photoReady) return;
    if (photoPickMode === "area") {
      handleCropPointerDown(event);
      return;
    }
    photoSpotDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    samplePhotoSpot(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePhotoPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (photoPickMode === "area") {
      handleCropPointerMove(event);
      return;
    }
    if (!photoSpotDragRef.current) return;
    samplePhotoSpot(event.clientX, event.clientY, event.currentTarget);
  }

  function handlePhotoPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (photoPickMode === "area") {
      handleCropPointerEnd(event);
      return;
    }
    photoSpotDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveCropToPoint(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas || !photoRect) return;

    const bounds = canvas.getBoundingClientRect();
    const pointX = (clientX - bounds.left) * (PHOTO_CANVAS_WIDTH / bounds.width);
    const pointY = (clientY - bounds.top) * (PHOTO_CANVAS_HEIGHT / bounds.height);

    setCrop((current) => {
      if (!current) return current;
      const x = clamp(pointX - current.size / 2, photoRect.x, photoRect.x + photoRect.width - current.size);
      const y = clamp(pointY - current.size / 2, photoRect.y, photoRect.y + photoRect.height - current.size);
      return { ...current, x, y };
    });
    setPhotoSampleHex(undefined);
  }

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!photoReady) return;
    cropDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveCropToPoint(event.clientX, event.clientY);
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropDragRef.current) return;
    moveCropToPoint(event.clientX, event.clientY);
  }

  function handleCropPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    cropDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCropKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!photoReady || !photoRect) return;
    const distance = event.shiftKey ? 36 : 12;
    const delta = event.key === "ArrowLeft"
      ? [-distance, 0]
      : event.key === "ArrowRight"
        ? [distance, 0]
        : event.key === "ArrowUp"
          ? [0, -distance]
          : event.key === "ArrowDown"
            ? [0, distance]
            : undefined;
    if (!delta) return;
    setCrop((current) => {
      if (!current) return current;
      return {
        ...current,
        x: clamp(current.x + delta[0], photoRect.x, photoRect.x + photoRect.width - current.size),
        y: clamp(current.y + delta[1], photoRect.y, photoRect.y + photoRect.height - current.size)
      };
    });
    setPhotoSampleHex(undefined);
    event.preventDefault();
  }

  function resizeCrop(percent: number) {
    if (!photoRect) return;
    const minDimension = Math.min(photoRect.width, photoRect.height);
    const size = minDimension * clamp(percent / 100, MIN_CROP_RATIO, MAX_CROP_RATIO);
    setCrop((current) => {
      if (!current) {
        return {
          x: photoRect.x + (photoRect.width - size) / 2,
          y: photoRect.y + (photoRect.height - size) / 2,
          size
        };
      }
      const centerX = current.x + current.size / 2;
      const centerY = current.y + current.size / 2;
      return {
        x: clamp(centerX - size / 2, photoRect.x, photoRect.x + photoRect.width - size),
        y: clamp(centerY - size / 2, photoRect.y, photoRect.y + photoRect.height - size),
        size
      };
    });
    setPhotoSampleHex(undefined);
  }

  function useSelectedPhotoColor(): boolean {
    const canvas = canvasRef.current;
    if (!canvas || !crop || !photoReady) return false;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο χρώμα.");
      return false;
    }

    try {
      const x = Math.max(0, Math.floor(crop.x));
      const y = Math.max(0, Math.floor(crop.y));
      const width = Math.max(1, Math.min(PHOTO_CANVAS_WIDTH - x, Math.round(crop.size)));
      const height = Math.max(1, Math.min(PHOTO_CANVAS_HEIGHT - y, Math.round(crop.size)));
      const imageData = context.getImageData(x, y, width, height);
      const detectedHex = representativeHex(imageData.data, width, height);
      if (!detectedHex) {
        setPhotoError("Δεν βρέθηκε αρκετό χρωματικό δείγμα μέσα στο πλαίσιο.");
        return false;
      }

      onChange(detectedHex);
      setPhotoSampleHex(detectedHex);
      setPhotoError(undefined);
      return true;
    } catch {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο σημείο.");
      return false;
    }
  }

  return (
    <div className={styles.selectorCard}>
      <div className={styles.selectorHeading}>
        <span>{title}</span>
        <strong>{selectedShade.label}</strong>
      </div>

      <div className={styles.modeSwitch} aria-label="Τρόπος επιλογής χρώματος">
        <button
          type="button"
          className={selectorMode === "picker" ? styles.activeMode : undefined}
          aria-pressed={selectorMode === "picker"}
          onClick={() => setSelectorMode("picker")}
        >
          COLOR
        </button>
        <button
          type="button"
          className={selectorMode === "photo" ? styles.activeMode : undefined}
          aria-pressed={selectorMode === "photo"}
          onClick={() => setSelectorMode("photo")}
        >
          PHOTO
        </button>
      </div>

      {selectorMode === "picker" ? (
        <div className={styles.inlinePicker}>
          <div
            className={styles.svPicker}
            style={{ "--picker-hue": `hsl(${pickerHsv.h} 100% 50%)` } as CSSProperties}
            role="slider"
            tabIndex={0}
            aria-label="Διάλεξε απόχρωση και ένταση"
            aria-valuetext={selectedShade.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pickerHsv.s * 100)}
            onKeyDown={handlePickerKeyDown}
            onPointerDown={handlePickerPointerDown}
            onPointerMove={handlePickerPointerMove}
            onPointerUp={handlePickerPointerEnd}
            onPointerCancel={handlePickerPointerEnd}
          >
            <span
              className={styles.pickerThumb}
              style={{
                left: `${pickerHsv.s * 100}%`,
                top: `${(1 - pickerHsv.v) * 100}%`,
                backgroundColor: normalizedValue
              }}
              aria-hidden="true"
            />
          </div>

          <div className={styles.pickerControls}>
            <div className={styles.pickerPreview}>
              <span style={{ backgroundColor: normalizedValue }} aria-hidden="true" />
              <div>
                <small>{selectedShade.label.toUpperCase()}</small>
                <strong>{selectedShade.label}</strong>
              </div>
            </div>

            <label className={styles.hueControl}>
              <span>ΑΠΟΧΡΩΣΗ</span>
              <input
                aria-label="Hue"
                type="range"
                min="0"
                max="359"
                step="1"
                value={Math.round(pickerHsv.h)}
                onChange={(event) => updatePickerColor({ ...pickerHsv, h: Number(event.target.value) })}
              />
            </label>

            <div className={styles.fineTune}>
              <span>ΠΑΡΑΛΛΑΓΕΣ</span>
              <div>
                {fineTuneColors.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Δοκίμασε ${nearestColorName(hex).label}`}
                    title={nearestColorName(hex).label}
                    style={{ backgroundColor: hex }}
                    onClick={() => onChange(hex)}
                  />
                ))}
              </div>
            </div>

            {matchingShades.length ? (
              <div className={styles.fineTune}>
                <span>ΚΟΝΤΙΝΕΣ ΑΠΟΧΡΩΣΕΙΣ</span>
                <div>
                  {matchingShades.map((shade) => (
                    <button
                      key={shade.id}
                      type="button"
                      aria-label={`${shade.label} · ${shade.match}% ταίριασμα`}
                      title={`${shade.manufacturer ? shade.manufacturer + " · " : ""}${shade.code ? shade.code + " · " : ""}${shade.label} · ${shade.match}%`}
                      style={{ backgroundColor: shade.hex }}
                      onClick={() => onChange(shade.hex)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.pickerActions}>
              <button type="button" onClick={onConfirm}>ΔΕΣ ΤΙ ΤΑΙΡΙΑΖΕΙ</button>
              <button type="button" onClick={() => setSelectorMode("photo")}>ΧΡΩΜΑ ΑΠΟ ΦΩΤΟΓΡΑΦΙΑ</button>
            </div>

            <p className={styles.pickerHint}>Πάτησε ή σύρε πάνω στο χρώμα μέχρι να βρεις αυτό που θέλεις.</p>
          </div>
        </div>
      ) : photoUrl ? (
        <div className={styles.photoEditor}>
          <div className={styles.photoPickSwitch} aria-label="Τρόπος επιλογής από φωτογραφία">
            <button
              type="button"
              className={photoPickMode === "spot" ? styles.activePhotoPickMode : undefined}
              onClick={() => {
                setPhotoPickMode("spot");
                setPhotoSampleHex(photoSpot?.hex);
              }}
            >
              ΔΙΑΛΕΞΕ ΣΗΜΕΙΟ
            </button>
            <button
              type="button"
              className={photoPickMode === "area" ? styles.activePhotoPickMode : undefined}
              onClick={() => {
                setPhotoPickMode("area");
                setPhotoSampleHex(undefined);
              }}
            >
              ΠΕΡΙΟΧΗ
            </button>
          </div>

          <div
            className={styles.photoCanvasWrap}
            tabIndex={0}
            aria-label={photoPickMode === "spot"
              ? "Πάτησε ή σύρε πάνω στο ακριβές χρώμα που θέλεις."
              : "Μετακίνησε το πλαίσιο πάνω στην περιοχή χρώματος που θέλεις."}
            onPointerDown={handlePhotoPointerDown}
            onPointerMove={handlePhotoPointerMove}
            onPointerUp={handlePhotoPointerEnd}
            onPointerCancel={handlePhotoPointerEnd}
            onKeyDown={photoPickMode === "area" ? handleCropKeyDown : undefined}
          >
            <canvas ref={canvasRef} width={PHOTO_CANVAS_WIDTH} height={PHOTO_CANVAS_HEIGHT} />
            {photoReady && photoPickMode === "area" && cropStyle ? (
              <div className={styles.photoCropBox} style={cropStyle} aria-hidden="true">
                <i className={styles.cropCorner} />
                <i className={styles.cropCorner} />
                <i className={styles.cropCorner} />
                <i className={styles.cropCorner} />
              </div>
            ) : null}
            {photoReady && photoPickMode === "spot" && photoSpot ? (
              <div
                className={[
                  styles.photoSpotMarker,
                  photoSpot.y > PHOTO_CANVAS_HEIGHT * 0.72 ? styles.photoSpotMarkerUp : ""
                ].filter(Boolean).join(" ")}
                style={{
                  left: `${(photoSpot.x / PHOTO_CANVAS_WIDTH) * 100}%`,
                  top: `${(photoSpot.y / PHOTO_CANVAS_HEIGHT) * 100}%`,
                  "--spot-color": photoSpot.hex
                } as CSSProperties}
                aria-hidden="true"
              >
                <canvas ref={loupeCanvasRef} width={96} height={96} />
                <span className={styles.photoSpotCrosshair} />
                <strong>{nearestColorName(photoSpot.hex).label}</strong>
              </div>
            ) : null}
          </div>

          <div className={styles.photoEditorMeta}>
            <span>{photoPickMode === "spot" ? "Πάτησε πάνω στο χρώμα που θέλεις" : "Μετακίνησε το πλαίσιο στο χρώμα που θέλεις"}</span>
            <strong>Η φωτογραφία σβήνει σε {formatCountdown(photoSecondsLeft)}</strong>
          </div>

          <div className={styles.photoControls}>
            {photoPickMode === "area" ? (
              <label className={styles.cropSizeControl}>
                <span>Μέγεθος επιλογής</span>
                <input
                  aria-label="Μέγεθος περιοχής επιλογής"
                  type="range"
                  min={MIN_CROP_RATIO * 100}
                  max={MAX_CROP_RATIO * 100}
                  step="1"
                  value={cropPercent}
                  disabled={!photoReady}
                  onChange={(event) => resizeCrop(Number(event.target.value))}
                />
                <strong>↔</strong>
              </label>
            ) : null}

            {photoSampleHex ? (
              <div className={styles.detectedColor}>
                <span style={{ backgroundColor: photoSampleHex }} />
                <div>
                  <small>ΧΡΩΜΑ ΑΠΟ ΦΩΤΟΓΡΑΦΙΑ</small>
                  <strong>{nearestColorName(photoSampleHex).label}</strong>
                </div>
              </div>
            ) : null}

            <div className={styles.photoToolbar}>
              <button
                type="button"
                className={styles.photoAction}
                disabled={photoPickMode === "spot" ? !photoSampleHex : !photoReady}
                onClick={() => {
                  if (photoPickMode === "area") {
                    if (useSelectedPhotoColor()) window.requestAnimationFrame(onConfirm);
                  } else {
                    onConfirm();
                  }
                }}
              >
                {photoPickMode === "spot" ? "ΔΕΣ ΤΙ ΤΑΙΡΙΑΖΕΙ" : "ΧΡΗΣΙΜΟΠΟΙΗΣΕ ΤΟ ΧΡΩΜΑ"}
              </button>
              <label className={styles.photoGhostAction}>
                ΑΛΛΗ ΦΩΤΟΓΡΑΦΙΑ
                <input className={styles.photoFileInput} type="file" accept="image/*" onChange={handlePhotoFile} />
              </label>
            </div>

            <div className={styles.photoToolbarSecondary}>
              <label className={styles.photoGhostAction}>
                ΚΑΜΕΡΑ
                <input className={styles.photoFileInput} type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} />
              </label>
              <button type="button" className={styles.photoDeleteAction} onClick={clearPhotoState}>
                ΔΙΑΓΡΑΦΗ
              </button>
            </div>

            {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
            <p className={styles.privacyNote}>
              Η φωτογραφία μένει μόνο στη συσκευή σου και διαγράφεται αυτόματα σε έως 15 λεπτά.
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.photoEmpty}>
          <span className={styles.photoKicker}>{photoKicker}</span>
          <h3>{photoTitle}</h3>
          <p>{photoBody} Αν θέλεις, μπορείς να επιλέξεις ένα μικρό σημείο ή μια μεγαλύτερη περιοχή της φωτογραφίας.</p>

          <div className={styles.photoActions}>
            <label className={styles.photoAction}>
              ΒΓΑΛΕ ΦΩΤΟΓΡΑΦΙΑ
              <input className={styles.photoFileInput} type="file" accept="image/*" capture="environment" onChange={handlePhotoFile} />
            </label>
            <label className={styles.photoGhostAction}>
              ΑΝΕΒΑΣΕ ΦΩΤΟΓΡΑΦΙΑ
              <input className={styles.photoFileInput} type="file" accept="image/*" onChange={handlePhotoFile} />
            </label>
          </div>

          {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
          <p className={styles.privacyNote}>
            Η φωτογραφία μένει μόνο στη συσκευή σου και διαγράφεται αυτόματα σε έως 15 λεπτά. Για πιο φυσικό αποτέλεσμα, προτίμησε καλό φως και φωτογραφία χωρίς φίλτρα.
          </p>
        </div>
      )}

      <div className={styles.presetRail} aria-label="Προτεινόμενες αποχρώσεις">
        {COLOR_FINDER_PRESETS.map((preset) => (
          <button
            key={preset.hex}
            type="button"
            title={preset.label}
            aria-label={preset.label}
            aria-pressed={normalizedValue === preset.hex}
            className={styles.preset}
            style={{ backgroundColor: preset.hex }}
            onClick={() => onChange(preset.hex)}
          />
        ))}
      </div>
    </div>
  );
}

function representativeHex(data: Uint8ClampedArray, width: number, height: number): string | undefined {
  const sampleTarget = 12_000;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / sampleTarget)));
  const samples: Array<readonly [number, number, number]> = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 200) continue;
      samples.push([data[index], data[index + 1], data[index + 2]]);
    }
  }
  if (!samples.length) return undefined;

  const red = samples.map((sample) => sample[0]).sort((a, b) => a - b);
  const green = samples.map((sample) => sample[1]).sort((a, b) => a - b);
  const blue = samples.map((sample) => sample[2]).sort((a, b) => a - b);
  const medianIndex = Math.floor(samples.length / 2);
  const median = [red[medianIndex], green[medianIndex], blue[medianIndex]] as const;

  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
  let accepted = 0;
  const maxDistanceSquared = 95 * 95;

  for (const [r, g, b] of samples) {
    const distanceSquared = (r - median[0]) ** 2 + (g - median[1]) ** 2 + (b - median[2]) ** 2;
    if (distanceSquared > maxDistanceSquared) continue;
    totalRed += r;
    totalGreen += g;
    totalBlue += b;
    accepted += 1;
  }

  if (accepted < Math.min(20, Math.ceil(samples.length * 0.04))) {
    return rgbToHex(median[0], median[1], median[2]);
  }

  return rgbToHex(
    Math.round(totalRed / accepted),
    Math.round(totalGreen / accepted),
    Math.round(totalBlue / accepted)
  );
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function formatCountdown(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string): HsvColor {
  const normalized = normalizeHex(hex) ?? "#000000";
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }

  return { h: hue < 0 ? hue + 360 : hue, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(color: HsvColor): string {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clamp(color.s, 0, 1);
  const value = clamp(color.v, 0, 1);
  const chroma = value * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green] = [chroma, x];
  else if (segment < 2) [red, green] = [x, chroma];
  else if (segment < 3) [green, blue] = [chroma, x];
  else if (segment < 4) [green, blue] = [x, chroma];
  else if (segment < 5) [red, blue] = [x, chroma];
  else [red, blue] = [chroma, x];

  const match = value - chroma;
  return rgbToHex(
    Math.round((red + match) * 255),
    Math.round((green + match) * 255),
    Math.round((blue + match) * 255)
  );
}
