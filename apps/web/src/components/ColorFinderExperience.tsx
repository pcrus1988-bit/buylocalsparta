"use client";

import Link from "next/link";
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
  normalizeHex,
  type ColorFinderProduct,
  type ColorFinish,
  type ColorProductType
} from "../lib/color-finder";
import styles from "./ColorFinderExperience.module.css";

type FinishFilter = "all" | ColorFinish;
type ProductTypeFilter = "all" | ColorProductType;
type SelectorMode = "picker" | "photo";
type PhotoRect = Readonly<{ x: number; y: number; width: number; height: number }>;
type CropBox = Readonly<{ x: number; y: number; size: number }>;
type HsvColor = Readonly<{ h: number; s: number; v: number }>;

const PHOTO_TTL_MS = 15 * 60 * 1000;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_CANVAS_WIDTH = 1200;
const PHOTO_CANVAS_HEIGHT = 900;
const DEFAULT_CROP_RATIO = 0.28;
const MIN_CROP_RATIO = 0.08;
const MAX_CROP_RATIO = 0.65;

const FINISH_LABELS: Readonly<Record<ColorFinish, string>> = {
  cream: "Cream",
  pearly: "Pearly",
  shimmer: "Shimmer",
  metallic: "Metallic",
  glitter: "Glitter",
  matte: "Matte",
  jelly: "Jelly",
  classic: "Classic"
};

const TYPE_LABELS: Readonly<Record<ColorProductType, string>> = {
  gel: "Gel",
  regular: "Regular",
  other: "Other"
};

export function ColorFinderExperience({ products }: { products: readonly ColorFinderProduct[] }) {
  const [selectedHex, setSelectedHex] = useState("#B52E2E");
  const [hexDraft, setHexDraft] = useState("#B52E2E");
  const [finish, setFinish] = useState<FinishFilter>("all");
  const [productType, setProductType] = useState<ProductTypeFilter>("all");
  const [selectorMode, setSelectorMode] = useState<SelectorMode>("picker");
  const [pickerHsv, setPickerHsv] = useState<HsvColor>(() => hexToHsv("#B52E2E"));

  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoExpiresAt, setPhotoExpiresAt] = useState<number>();
  const [photoSecondsLeft, setPhotoSecondsLeft] = useState(0);
  const [photoRect, setPhotoRect] = useState<PhotoRect>();
  const [crop, setCrop] = useState<CropBox>();
  const [photoReady, setPhotoReady] = useState(false);
  const [photoSampleHex, setPhotoSampleHex] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef(false);
  const pickerDragRef = useRef(false);

  const matches = useMemo(() => {
    const targetLab = hexToLab(selectedHex);
    return products
      .filter((product) => finish === "all" || product.finish === finish)
      .filter((product) => productType === "all" || product.productType === productType)
      .map((product) => {
        const deltaE = deltaE2000(targetLab, hexToLab(product.colorHex));
        return { ...product, deltaE, match: colorMatchPercent(deltaE) };
      })
      .sort((left, right) => left.deltaE - right.deltaE || left.priceMinor - right.priceMinor);
  }, [finish, productType, products, selectedHex]);

  const visibleMatches = matches.slice(0, 24);
  const availableFinishes = useMemo(() => [...new Set(products.map((product) => product.finish))], [products]);
  const availableTypes = useMemo(() => [...new Set(products.map((product) => product.productType))], [products]);

  useEffect(() => {
    setPickerHsv(hexToHsv(selectedHex));
  }, [selectedHex]);

  useEffect(() => {
    if (!photoUrl) return undefined;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (!photoExpiresAt) {
      setPhotoSecondsLeft(0);
      return undefined;
    }

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((photoExpiresAt - Date.now()) / 1000));
      setPhotoSecondsLeft(seconds);
      if (seconds > 0) return;

      setPhotoUrl(undefined);
      setPhotoExpiresAt(undefined);
      setPhotoRect(undefined);
      setCrop(undefined);
      setPhotoReady(false);
      setPhotoSampleHex(undefined);
      setPhotoError(undefined);
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
      setCrop({
        x: x + (width - size) / 2,
        y: y + (height - size) / 2,
        size
      });
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

  function applyHex(value: string) {
    setHexDraft(value);
    const normalized = normalizeHex(value);
    if (normalized) setSelectedHex(normalized);
  }

  function updatePickerColor(next: HsvColor) {
    const normalized: HsvColor = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1)
    };
    const hex = hsvToHex(normalized);
    setPickerHsv(normalized);
    setSelectedHex(hex);
    setHexDraft(hex);
  }

  function movePickerToPoint(clientX: number, clientY: number, element: HTMLDivElement) {
    const bounds = element.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const saturation = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    const value = clamp(1 - ((clientY - bounds.top) / bounds.height), 0, 1);
    updatePickerColor({ ...pickerHsv, s: saturation, v: value });
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
    setPhotoError(undefined);
  }

  function clearPhoto() {
    setPhotoUrl(undefined);
    setPhotoExpiresAt(undefined);
    setPhotoRect(undefined);
    setCrop(undefined);
    setPhotoReady(false);
    setPhotoSampleHex(undefined);
    setPhotoError(undefined);
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

  function moveCropBy(deltaX: number, deltaY: number) {
    if (!photoRect) return;
    setCrop((current) => {
      if (!current) return current;
      return {
        ...current,
        x: clamp(current.x + deltaX, photoRect.x, photoRect.x + photoRect.width - current.size),
        y: clamp(current.y + deltaY, photoRect.y, photoRect.y + photoRect.height - current.size)
      };
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
    if (!photoReady) return;
    const distance = event.shiftKey ? 36 : 12;
    if (event.key === "ArrowLeft") moveCropBy(-distance, 0);
    else if (event.key === "ArrowRight") moveCropBy(distance, 0);
    else if (event.key === "ArrowUp") moveCropBy(0, -distance);
    else if (event.key === "ArrowDown") moveCropBy(0, distance);
    else return;
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

  function useSelectedPhotoColor() {
    const canvas = canvasRef.current;
    if (!canvas || !crop || !photoReady) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο χρώμα.");
      return;
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
        return;
      }

      setSelectedHex(detectedHex);
      setHexDraft(detectedHex);
      setPhotoSampleHex(detectedHex);
      setPhotoError(undefined);
    } catch {
      setPhotoError("Δεν μπορέσαμε να αναλύσουμε το επιλεγμένο σημείο.");
    }
  }

  return (
    <div className={styles.experience}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>COLOR FINDER · NAIL EDITION</span>
          <h1>Find the shade<br /><em>you imagined.</em></h1>
          <p>
            Διάλεξε ένα χρώμα ή πάρε το από μια φωτογραφία και ανακάλυψε τα πιο κοντινά βερνίκια που μπορείς να αγοράσεις απευθείας στο ΚΟΝΤΑ ΜΟΥ.
          </p>
          <div className={styles.signature}>
            <span>Perceptual matching</span>
            <span aria-hidden="true">·</span>
            <span>CIE LAB / ΔE2000</span>
          </div>
        </div>

        <div className={styles.selectorCard}>
          <div className={styles.selectorHeading}>
            <span>YOUR COLOR</span>
            <strong>{selectedHex}</strong>
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
                aria-valuetext={selectedHex}
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
                    backgroundColor: selectedHex
                  }}
                  aria-hidden="true"
                />
              </div>

              <div className={styles.pickerControls}>
                <div className={styles.pickerPreview}>
                  <span style={{ backgroundColor: selectedHex }} aria-hidden="true" />
                  <div>
                    <small>SELECTED COLOR</small>
                    <strong>{selectedHex}</strong>
                  </div>
                </div>

                <label className={styles.hueControl}>
                  <span>HUE</span>
                  <input
                    aria-label="Hue"
                    type="range"
                    min="0"
                    max="359"
                    step="1"
                    value={Math.round(pickerHsv.h)}
                    onChange={(event) => updatePickerColor({
                      ...pickerHsv,
                      h: Number(event.target.value)
                    })}
                  />
                </label>

                <p className={styles.pickerHint}>Tap or drag anywhere in the color field. No popup, no confirmation.</p>
              </div>
            </div>
          ) : photoUrl ? (
            <div className={styles.photoEditor}>
              <div
                className={styles.photoCanvasWrap}
                tabIndex={0}
                aria-label="Μετακίνησε το πλαίσιο πάνω στο χρώμα που θέλεις. Μπορείς επίσης να χρησιμοποιήσεις τα βελάκια."
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerEnd}
                onPointerCancel={handleCropPointerEnd}
                onKeyDown={handleCropKeyDown}
              >
                <canvas ref={canvasRef} width={PHOTO_CANVAS_WIDTH} height={PHOTO_CANVAS_HEIGHT} />
                {photoReady && cropStyle ? (
                  <div className={styles.photoCropBox} style={cropStyle} aria-hidden="true">
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                    <i className={styles.cropCorner} />
                  </div>
                ) : null}
              </div>

              <div className={styles.photoEditorMeta}>
                <span>DRAG THE FRAME OVER THE COLOR</span>
                <strong>AUTO-CLEAR {formatCountdown(photoSecondsLeft)}</strong>
              </div>

              <div className={styles.photoControls}>
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
                  <strong>{cropPercent}%</strong>
                </label>

                {photoSampleHex ? (
                  <div className={styles.detectedColor}>
                    <span style={{ backgroundColor: photoSampleHex }} />
                    <div>
                      <small>DETECTED FROM PHOTO</small>
                      <strong>{photoSampleHex}</strong>
                    </div>
                  </div>
                ) : null}

                <div className={styles.photoToolbar}>
                  <button
                    type="button"
                    className={styles.photoAction}
                    disabled={!photoReady}
                    onClick={useSelectedPhotoColor}
                  >
                    USE THIS COLOR
                  </button>
                  <label className={styles.photoGhostAction}>
                    NEW PHOTO
                    <input
                      className={styles.photoFileInput}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFile}
                    />
                  </label>
                </div>

                <div className={styles.photoToolbarSecondary}>
                  <label className={styles.photoGhostAction}>
                    CAMERA
                    <input
                      className={styles.photoFileInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoFile}
                    />
                  </label>
                  <button type="button" className={styles.photoDeleteAction} onClick={clearPhoto}>
                    DELETE NOW
                  </button>
                </div>

                {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
                <p className={styles.privacyNote}>
                  Η φωτογραφία δεν ανεβαίνει στο ΚΟΝΤΑ ΜΟΥ και δεν αποθηκεύεται σε λογαριασμό, βάση δεδομένων ή analytics. Μένει μόνο προσωρινά στον browser και διαγράφεται αυτόματα σε έως 15 λεπτά.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.photoEmpty}>
              <span className={styles.photoKicker}>PHOTO TO COLOR · PRIVATE</span>
              <h3>Capture the shade around you.</h3>
              <p>
                Τράβηξε ή ανέβασε μια φωτογραφία, μετακίνησε το πλαίσιο πάνω στο χρώμα που θέλεις και άφησε τον Color Finder να το μετατρέψει σε χρωματικό στόχο.
              </p>

              <div className={styles.photoActions}>
                <label className={styles.photoAction}>
                  TAKE A PHOTO
                  <input
                    className={styles.photoFileInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoFile}
                  />
                </label>
                <label className={styles.photoGhostAction}>
                  UPLOAD PHOTO
                  <input
                    className={styles.photoFileInput}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFile}
                  />
                </label>
              </div>

              {photoError ? <p className={styles.photoError}>{photoError}</p> : null}
              <p className={styles.privacyNote}>
                Privacy by design: καμία φωτογραφία δεν φεύγει από τη συσκευή. Δεν γίνεται μόνιμη αποθήκευση και το προσωρινό τοπικό αντικείμενο λήγει σε 15 λεπτά ή νωρίτερα αν πατήσεις διαγραφή.
              </p>
            </div>
          )}

          <div className={styles.hexField}>
            <label htmlFor="color-finder-hex">HEX</label>
            <input
              id="color-finder-hex"
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => applyHex(event.target.value)}
              onBlur={() => setHexDraft(selectedHex)}
            />
          </div>
          <div className={styles.presetRail} aria-label="Προτεινόμενες αποχρώσεις">
            {COLOR_FINDER_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={selectedHex === preset.hex}
                className={styles.preset}
                style={{ backgroundColor: preset.hex }}
                onClick={() => {
                  setSelectedHex(preset.hex);
                  setHexDraft(preset.hex);
                }}
              />
            ))}
          </div>
        </div>
      </section>

      <section className={styles.resultsSection} id="matches" aria-labelledby="color-finder-results">
        <div className={styles.resultsHeader}>
          <div>
            <span className={styles.eyebrow}>CURATED BY COLOR</span>
            <h2 id="color-finder-results">Your closest matches</h2>
            <p>
              {visibleMatches.length
                ? `${visibleMatches.length} από ${matches.length} διαθέσιμες αντιστοιχίες, ταξινομημένες με βάση την οπτική απόσταση από ${selectedHex}.`
                : "Δεν υπάρχουν ακόμη προϊόντα με επαρκές χρωματικό προφίλ για αυτόν τον συνδυασμό φίλτρων."}
            </p>
          </div>
          <div className={styles.targetChip}>
            <span style={{ backgroundColor: selectedHex }} />
            <strong>{selectedHex}</strong>
          </div>
        </div>

        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <span>TYPE</span>
            <div>
              <button type="button" className={productType === "all" ? styles.activeFilter : undefined} onClick={() => setProductType("all")}>All</button>
              {availableTypes.map((type) => (
                <button key={type} type="button" className={productType === type ? styles.activeFilter : undefined} onClick={() => setProductType(type)}>
                  {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterGroup}>
            <span>FINISH</span>
            <div>
              <button type="button" className={finish === "all" ? styles.activeFilter : undefined} onClick={() => setFinish("all")}>All</button>
              {availableFinishes.map((item) => (
                <button key={item} type="button" className={finish === item ? styles.activeFilter : undefined} onClick={() => setFinish(item)}>
                  {FINISH_LABELS[item]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visibleMatches.length ? (
          <div className={styles.grid}>
            {visibleMatches.map((product, index) => (
              <article className={styles.productCard} key={product.id}>
                <Link className={styles.imageWrap} href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>
                  <span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span>
                  <img src={product.imageSrc} alt={product.mediaAlt ?? product.title} loading={index < 4 ? "eager" : "lazy"} decoding="async" />
                </Link>
                <div className={styles.productBody}>
                  <div className={styles.brandRow}>
                    <span>{product.brand ?? "KONTA MOY"}</span>
                    <strong>{product.match}% match</strong>
                  </div>
                  <h3><Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>{product.title}</Link></h3>
                  {product.brandShade || product.shadeCode ? (
                    <p className={styles.shadeName}>
                      {[product.shadeCode, product.brandShade].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {product.profilePrecision ? (
                    <p className={styles.profileNote}>
                      {product.profilePrecision === "exact"
                        ? "Verified colour profile"
                        : product.profilePrecision === "canonicalized"
                          ? "Canonicalized brand shade"
                          : "Approximate colour family"}
                      {typeof product.profileConfidence === "number" ? ` · ${Math.round(product.profileConfidence * 100)}% confidence` : ""}
                    </p>
                  ) : null}
                  <div className={styles.swatches}>
                    <div>
                      <span style={{ backgroundColor: product.colorHex }} />
                      <small>{product.profilePrecision === "exact" ? "PRODUCT" : "PROFILE"}</small>
                    </div>
                    <div>
                      <span style={{ backgroundColor: selectedHex }} />
                      <small>YOUR COLOR</small>
                    </div>
                    <p>ΔE {product.deltaE.toFixed(1)}</p>
                  </div>
                  <div className={styles.cardFooter}>
                    <div>
                      <span>{FINISH_LABELS[product.finish]}</span>
                      <strong>{product.price}</strong>
                    </div>
                    <Link href={`/product/${encodeURIComponent(product.slug || product.id)}`} prefetch={false}>View shade →</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptySwatch} style={{ backgroundColor: selectedHex }} />
            <h3>We are still learning this shade.</h3>
            <p>Δοκίμασε διαφορετικό finish ή τύπο προϊόντος. Ο Color Finder θα γίνεται πλουσιότερος όσο εμπλουτίζονται τα χρωματικά δεδομένα του καταλόγου.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function representativeHex(
  data: Uint8ClampedArray,
  width: number,
  height: number
): string | undefined {
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
    const distanceSquared =
      (r - median[0]) ** 2 +
      (g - median[1]) ** 2 +
      (b - median[2]) ** 2;
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

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
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
