"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./ProductTryOnMe.module.css";

const MODEL_PREFIX = "km:try-on:model:v2:";
const PREVIEW_PREFIX = "km:try-on:preview:v2:";
const LEGACY_MODEL_KEY = "km:try-on:model:v1";
const LEGACY_PREVIEW_PREFIX = "km:try-on:preview:v1:";
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const MAX_MODEL_DATA_URL_CHARS = 3_450_000;

type SessionPayload = Readonly<{ csrfToken?: string; tryOnStorageScope?: string; tryOnAvailable?: boolean }>;
type TryOnResult = Readonly<{
  productId: string;
  productTitle: string;
  predictionId: string;
  modelName: string;
  imageDataUrl: string;
  saveToken: string;
  generatedAt: string;
}>;
type CachedPreview = Readonly<{ expiresAt: number; result: TryOnResult }>;
type SharedGeneration = Readonly<{ controller: AbortController; promise: Promise<TryOnResult> }>;

const sharedGenerations = new Map<string, SharedGeneration>();
const latestGenerationBySlot = new Map<string, string>();

function messageFor(error: string): string {
  if (error === "TRY_ON_NOT_CONFIGURED") return "Το Try On Me δεν έχει ενεργοποιηθεί ακόμη στο περιβάλλον.";
  if (error === "TRY_ON_TIMEOUT") return "Η προεπισκόπηση άργησε περισσότερο από το αναμενόμενο. Δοκίμασε ξανά.";
  if (error === "TRY_ON_PRODUCT_UNSUPPORTED") return "Το συγκεκριμένο προϊόν δεν υποστηρίζεται ακόμη από το virtual try-on.";
  if (error === "TRY_ON_PRODUCT_IMAGE_REQUIRED") return "Χρειάζεται καθαρή φωτογραφία προϊόντος για να γίνει η δοκιμή.";
  if (error === "INVALID_TRY_ON_IMAGE") return "Χρησιμοποίησε καθαρή φωτογραφία JPG, PNG ή WebP.";
  if (error === "TRY_ON_IMAGE_TOO_LARGE") return "Η φωτογραφία είναι πολύ μεγάλη. Διάλεξε άλλη φωτογραφία.";
  if (error === "TRY_ON_STORAGE_NOT_CONFIGURED") return "Η αποθήκευση looks δεν είναι διαθέσιμη αυτή τη στιγμή.";
  if (error === "TRY_ON_RATE_LIMITED") return "Έχεις κάνει πολλές δοκιμές σε πολύ μικρό διάστημα. Περίμενε λίγο και δοκίμασε ξανά.";
  if (error === "TRY_ON_SAVE_TOKEN_EXPIRED") return "Η προσωρινή προεπισκόπηση έληξε. Δημιούργησε νέα προεπισκόπηση πριν την αποθηκεύσεις.";
  if (error === "INVALID_TRY_ON_SAVE_TOKEN") return "Η προεπισκόπηση δεν μπορεί να αποθηκευτεί με ασφάλεια. Δημιούργησε νέα.";
  if (error === "TRY_ON_POSE_REQUIRED") return "Δεν αναγνωρίστηκε καθαρά η στάση του σώματος. Χρησιμοποίησε ολόσωμη ή 3/4 φωτογραφία με καθαρή θέα του σώματος.";
  if (error === "TRY_ON_CONTENT_BLOCKED") return "Η φωτογραφία δεν μπορεί να χρησιμοποιηθεί για virtual try-on. Διάλεξε άλλη φωτογραφία.";
  if (error === "TRY_ON_INPUT_INVALID") return "Η φωτογραφία δεν είναι κατάλληλη για Try On Me. Δοκίμασε καθαρότερη φωτογραφία χωρίς έντονα εμπόδια.";
  if (error === "TRY_ON_PROVIDER_BUSY") return "Το Try On Me έχει προσωρινά αυξημένη κίνηση. Δοκίμασε ξανά σε λίγο.";
  if (error === "TRY_ON_CREDITS_UNAVAILABLE") return "Το Try On Me δεν είναι προσωρινά διαθέσιμο. Η υπηρεσία χρειάζεται ανανέωση χωρητικότητας.";
  return "Δεν μπόρεσε να δημιουργηθεί η προεπισκόπηση. Δοκίμασε ξανά.";
}

function validStoredModel(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized?.startsWith("data:image/") ? normalized : undefined;
}

function modelKey(scope: string): string {
  return `${MODEL_PREFIX}${scope}`;
}

function previewKey(scope: string, productId: string): string {
  return `${PREVIEW_PREFIX}${scope}:${productId}`;
}

function photoFingerprint(value: string): string {
  // This never leaves the browser; it only prevents duplicate paid generations.
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(value.length / 4096));
  for (let index = 0; index < value.length; index += stride) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function generationKey(scope: string, productId: string, photo: string): string {
  return `${previewKey(scope, productId)}:${photo.length.toString(36)}:${photoFingerprint(photo)}`;
}

function readStoredModel(scope: string): string | undefined {
  const key = modelKey(scope);
  try {
    const persistent = validStoredModel(window.localStorage.getItem(key));
    if (persistent) return persistent;
  } catch {
    // Fall through to session storage when persistent storage is unavailable.
  }
  try {
    return validStoredModel(window.sessionStorage.getItem(key));
  } catch {
    return undefined;
  }
}

function storeModelPhoto(scope: string, value: string): void {
  const key = modelKey(scope);
  try {
    window.localStorage.setItem(key, value);
    try { window.sessionStorage.removeItem(key); } catch {}
    return;
  } catch {
    // Private browsing / quota policies can reject localStorage.
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // The current in-memory React state still supports Try On Me on this page.
  }
}

function readPreview(scope: string, productId: string): CachedPreview | undefined {
  const key = previewKey(scope, productId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CachedPreview;
    if (
      !cached?.result?.imageDataUrl
      || !cached.result.saveToken
      || cached.result.productId !== productId
      || !cached.expiresAt
      || cached.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(key);
      return undefined;
    }
    return cached;
  } catch {
    return undefined;
  }
}

function writePreview(scope: string, productId: string, result: TryOnResult, expiresAt: number) {
  try {
    const cached: CachedPreview = { expiresAt, result };
    window.sessionStorage.setItem(previewKey(scope, productId), JSON.stringify(cached));
  } catch {
    // The preview still works in memory if sessionStorage quota/privacy mode blocks persistence.
  }
}

function removePreview(scope: string, productId: string) {
  try { window.sessionStorage.removeItem(previewKey(scope, productId)); } catch {}
}

function cancelSharedGeneration(scope: string, productId: string) {
  const slot = previewKey(scope, productId);
  const activeKey = latestGenerationBySlot.get(slot);
  if (!activeKey) return;
  sharedGenerations.get(activeKey)?.controller.abort();
  latestGenerationBySlot.delete(slot);
}

function requestSharedGeneration(input: {
  scope: string;
  productId: string;
  photo: string;
  csrfToken: string;
}): Promise<TryOnResult> {
  const slot = previewKey(input.scope, input.productId);
  const key = generationKey(input.scope, input.productId, input.photo);
  const existing = sharedGenerations.get(key);
  if (existing) {
    latestGenerationBySlot.set(slot, key);
    return existing.promise;
  }

  const previousKey = latestGenerationBySlot.get(slot);
  if (previousKey && previousKey !== key) sharedGenerations.get(previousKey)?.controller.abort();

  const controller = new AbortController();
  latestGenerationBySlot.set(slot, key);
  const promise = fetch("/api/account/try-on", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": input.csrfToken },
    body: JSON.stringify({ productId: input.productId, modelImageDataUrl: input.photo }),
    cache: "no-store",
    signal: controller.signal
  })
    .then(async (response) => {
      const payload = await response.json() as { result?: TryOnResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "TRY_ON_FAILED");
      if (latestGenerationBySlot.get(slot) === key) {
        const generatedAt = Date.parse(payload.result.generatedAt);
        const expiresAt = Number.isFinite(generatedAt)
          ? generatedAt + PREVIEW_TTL_MS
          : Date.now() + PREVIEW_TTL_MS;
        if (expiresAt > Date.now()) writePreview(input.scope, input.productId, payload.result, expiresAt);
      }
      return payload.result;
    })
    .finally(() => {
      sharedGenerations.delete(key);
      if (latestGenerationBySlot.get(slot) === key) latestGenerationBySlot.delete(slot);
    });

  sharedGenerations.set(key, { controller, promise });
  return promise;
}

function clearTryOnPreviews(scope: string) {
  const prefix = `${PREVIEW_PREFIX}${scope}:`;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(prefix)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Browser privacy settings may block sessionStorage.
  }
}

function clearLegacyUnscopedTryOnData() {
  try { window.localStorage.removeItem(LEGACY_MODEL_KEY); } catch {}
  try {
    window.sessionStorage.removeItem(LEGACY_MODEL_KEY);
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(LEGACY_PREVIEW_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup of the old unscoped cache.
  }
}

async function normalizeModelPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_TRY_ON_IMAGE");
  const bitmap = await createImageBitmap(file);
  try {
    // Re-rendering strips EXIF and other source-file metadata before the image
    // leaves the shopper's device. 1296px retains the useful visual detail for
    // VTON while keeping the base64 request safely below the serverless limit.
    const scale = Math.min(1, 1296 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("INVALID_TRY_ON_IMAGE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of [0.92, 0.88, 0.84, 0.8, 0.76, 0.7, 0.64]) {
      const encoded = canvas.toDataURL("image/jpeg", quality);
      if (encoded.length <= MAX_MODEL_DATA_URL_CHARS) return encoded;
    }
    throw new Error("TRY_ON_IMAGE_TOO_LARGE");
  } finally {
    bitmap.close();
  }
}

export function ProductTryOnMe({ productId, productTitle }: { productId: string; productTitle: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const autoStarted = useRef(false);
  const generationAttempt = useRef(0);
  const [csrfToken, setCsrfToken] = useState<string>();
  const [storageScope, setStorageScope] = useState<string>();
  const [tryOnAvailable, setTryOnAvailable] = useState<boolean>();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [modelImage, setModelImage] = useState<string>();
  const [result, setResult] = useState<TryOnResult>();
  const [previewExpiresAt, setPreviewExpiresAt] = useState<number>();
  const [busy, setBusy] = useState<"photo" | "generate" | "save" | "">("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function generate(photo: string, token: string, scope: string) {
    const attempt = generationAttempt.current + 1;
    generationAttempt.current = attempt;
    setBusy("generate");
    setError("");
    setSaved(false);
    try {
      const generated = await requestSharedGeneration({
        scope,
        productId,
        photo,
        csrfToken: token
      });
      if (generationAttempt.current !== attempt) return;
      const cached = readPreview(scope, productId);
      const generatedAt = Date.parse(generated.generatedAt);
      const expiresAt = cached?.result.predictionId === generated.predictionId
        ? cached.expiresAt
        : Number.isFinite(generatedAt)
          ? generatedAt + PREVIEW_TTL_MS
          : Date.now() + PREVIEW_TTL_MS;
      if (expiresAt <= Date.now()) throw new Error("TRY_ON_SAVE_TOKEN_EXPIRED");
      setResult(generated);
      setPreviewExpiresAt(expiresAt);
    } catch (cause) {
      if (generationAttempt.current !== attempt) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(messageFor(cause instanceof Error ? cause.message : "TRY_ON_FAILED"));
    } finally {
      if (generationAttempt.current === attempt) setBusy("");
    }
  }

  useEffect(() => {
    let active = true;
    generationAttempt.current += 1;
    autoStarted.current = false;
    setSessionChecked(false);
    setCsrfToken(undefined);
    setStorageScope(undefined);
    setTryOnAvailable(undefined);
    setModelImage(undefined);
    setResult(undefined);
    setPreviewExpiresAt(undefined);
    setSaved(false);
    setError("");

    void fetch("/api/account/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setSessionChecked(true);
          return;
        }
        const payload = await response.json() as SessionPayload;
        if (!active) return;
        const token = payload.csrfToken;
        const scope = payload.tryOnStorageScope;
        if (!token || !scope) {
          setSessionChecked(true);
          return;
        }

        const available = payload.tryOnAvailable !== false;
        setStorageScope(scope);
        setCsrfToken(token);
        setTryOnAvailable(available);
        clearLegacyUnscopedTryOnData();
        if (available) {
          const cached = readPreview(scope, productId);
          setModelImage(readStoredModel(scope));
          setResult(cached?.result);
          setPreviewExpiresAt(cached?.expiresAt);
        }
        setSessionChecked(true);
      })
      .catch(() => {
        if (active) setSessionChecked(true);
      });
    return () => {
      active = false;
      // Deliberately keep an in-flight request alive across a quick route remount.
      // The shared request writes only the five-minute account-scoped session cache.
      generationAttempt.current += 1;
    };
  }, [productId]);

  useEffect(() => {
    if (!sessionChecked || !csrfToken || !storageScope || !modelImage || result || autoStarted.current) return;
    autoStarted.current = true;
    void generate(modelImage, csrfToken, storageScope);
  // generate is deliberately driven only by resolved session/model/product state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, csrfToken, storageScope, modelImage, productId, result]);

  async function choosePhoto(file: File | undefined) {
    if (!file || busy || !storageScope) return;
    setBusy("photo");
    setError("");
    try {
      const normalized = await normalizeModelPhoto(file);
      cancelSharedGeneration(storageScope, productId);
      storeModelPhoto(storageScope, normalized);
      clearTryOnPreviews(storageScope);
      setModelImage(normalized);
      setResult(undefined);
      setPreviewExpiresAt(undefined);
      setSaved(false);
      autoStarted.current = true;
      if (csrfToken) await generate(normalized, csrfToken, storageScope);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "INVALID_TRY_ON_IMAGE"));
    } finally {
      setBusy("");
    }
  }

  function removePhoto() {
    generationAttempt.current += 1;
    if (storageScope) {
      cancelSharedGeneration(storageScope, productId);
      const key = modelKey(storageScope);
      try { window.localStorage.removeItem(key); } catch {}
      try { window.sessionStorage.removeItem(key); } catch {}
      clearTryOnPreviews(storageScope);
    }
    setModelImage(undefined);
    setResult(undefined);
    setPreviewExpiresAt(undefined);
    setSaved(false);
    setError("");
    autoStarted.current = false;
  }

  async function saveResult() {
    if (!result || !csrfToken || busy) return;
    setBusy("save");
    setError("");
    try {
      const response = await fetch("/api/account/try-on/saved", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          productId,
          predictionId: result.predictionId,
          imageDataUrl: result.imageDataUrl,
          saveToken: result.saveToken
        }),
        cache: "no-store"
      });
      const payload = await response.json() as { saved?: unknown; error?: string };
      if (!response.ok || !payload.saved) throw new Error(payload.error || "TRY_ON_SAVE_FAILED");
      setSaved(true);
      if (storageScope) removePreview(storageScope, productId);
      setPreviewExpiresAt(undefined);
    } catch (cause) {
      setError(messageFor(cause instanceof Error ? cause.message : "TRY_ON_SAVE_FAILED"));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!result || saved || !previewExpiresAt || !storageScope) return;
    const expire = () => {
      removePreview(storageScope, productId);
      setResult(undefined);
      setPreviewExpiresAt(undefined);
      setSaved(false);
      setError("Η προσωρινή προεπισκόπηση έληξε. Πάτησε «Δοκίμασε ξανά» για νέα εικόνα.");
      autoStarted.current = true;
    };
    const remaining = previewExpiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [previewExpiresAt, productId, result, saved, storageScope]);

  if (!sessionChecked) {
    return <section className={styles.card} aria-label="Try On Me"><div className={styles.loading}>Try On Me…</div></section>;
  }

  if (csrfToken && tryOnAvailable === false) {
    return (
      <section className={styles.card} aria-labelledby={`try-on-${productId}`}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
            <h2 id={`try-on-${productId}`}>Δες το πάνω σου</h2>
          </div>
          <span className={styles.spark}>✦</span>
        </div>
        <p>Το Try On Me δεν είναι ενεργό σε αυτό το περιβάλλον ακόμη. Η φωτογραφία σου δεν αποστέλλεται και δεν καταναλώνεται generation credit.</p>
      </section>
    );
  }

  if (!csrfToken) {
    return (
      <section className={styles.card} aria-labelledby={`try-on-${productId}`}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
            <h2 id={`try-on-${productId}`}>Δες το πάνω σου</h2>
          </div>
          <span className={styles.spark}>✦</span>
        </div>
        <p>Συνδέσου για να χρησιμοποιήσεις τη δική σου φωτογραφία και να δεις το {productTitle} πάνω σου.</p>
        <button className="button button-secondary" type="button" onClick={() => router.push(`/login?next=${encodeURIComponent(pathname)}`)}>
          Σύνδεση για Try On Me
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby={`try-on-${productId}`}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
          <h2 id={`try-on-${productId}`}>Δες το πάνω σου</h2>
        </div>
        <span className={styles.spark}>✦</span>
      </div>

      {!modelImage ? (
        <>
          <p>Βάλε μία καθαρή φωτογραφία σου. Το KONTA MOY την αποθηκεύει μόνο στη συσκευή σου· για τη δημιουργία της προεπισκόπησης αποστέλλεται προσωρινά στον πάροχο FASHN και δεν αποθηκεύεται ως φωτογραφία προφίλ.</p>
          <label className={styles.upload}>
            <span>{busy === "photo" ? "Ετοιμασία φωτογραφίας…" : "Πρόσθεσε φωτογραφία σου"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={Boolean(busy)}
              onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
            />
          </label>
        </>
      ) : (
        <>
          <div className={styles.modelControls}>
            <span>Η φωτογραφία σου είναι ενεργή για Try On Me.</span>
            <label className={styles.textAction}>
              Αλλαγή
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(busy)}
                onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
              />
            </label>
            <button className={styles.textAction} type="button" onClick={removePhoto} disabled={Boolean(busy)}>Αφαίρεση</button>
          </div>

          {busy === "generate" && !result ? (
            <div className={styles.generating}>
              <span className={styles.pulse} aria-hidden="true" />
              <strong>Δημιουργούμε το look σου…</strong>
              <small>Το αποτέλεσμα είναι μόνο οπτική προεπισκόπηση.</small>
            </div>
          ) : null}

          {!result && busy !== "generate" ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(busy) || !storageScope}
              onClick={() => storageScope && void generate(modelImage, csrfToken, storageScope)}
            >
              Δοκίμασε ξανά
            </button>
          ) : null}

          {result ? (
            <div className={styles.preview}>
              <img src={result.imageDataUrl} alt={`Virtual try-on: ${productTitle}`} />
              <div className={styles.previewActions}>
                <button className="button" type="button" disabled={Boolean(busy) || saved} onClick={() => void saveResult()}>
                  {saved ? "★ Αποθηκεύτηκε" : busy === "save" ? "Αποθήκευση…" : "☆ Κράτησέ το για σύγκριση"}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => storageScope && void generate(modelImage, csrfToken, storageScope)}
                >
                  Νέα προεπισκόπηση
                </button>
              </div>
              <small className={styles.expiry}>Αν δεν το κρατήσεις, η προεπισκόπηση παραμένει προσωρινά για 5 λεπτά στη συνεδρία σου.</small>
            </div>
          ) : null}
        </>
      )}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.disclaimer}>Το Try On Me είναι οπτική προεπισκόπηση και δεν υπολογίζει μέγεθος ή εφαρμογή. Επίλεξε το μέγεθός σου ξεχωριστά.</p>
    </section>
  );
}
