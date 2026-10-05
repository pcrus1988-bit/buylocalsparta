"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./ProductTryOnMe.module.css";
import {
  TRY_ON_ACTIVE_SCOPE_KEY,
  TRY_ON_AUTO_PREFIX,
  TRY_ON_LEGACY_MODEL_KEY,
  TRY_ON_LEGACY_PREVIEW_PREFIX,
  TRY_ON_MODEL_PREFIX,
  TRY_ON_PREVIEW_PREFIX
} from "../lib/try-on-browser-storage";

const MODEL_PREFIX = TRY_ON_MODEL_PREFIX;
const PREVIEW_PREFIX = TRY_ON_PREVIEW_PREFIX;
const ACTIVE_SCOPE_KEY = TRY_ON_ACTIVE_SCOPE_KEY;
const AUTO_PREFIX = TRY_ON_AUTO_PREFIX;
const LEGACY_MODEL_KEY = TRY_ON_LEGACY_MODEL_KEY;
const LEGACY_PREVIEW_PREFIX = TRY_ON_LEGACY_PREVIEW_PREFIX;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const MAX_MODEL_DATA_URL_CHARS = 3_450_000;

type SessionPayload = Readonly<{ csrfToken?: string; tryOnStorageScope?: string; tryOnAvailable?: boolean }>;
type TryOnQuota = Readonly<{
  limit: number;
  used: number;
  remaining: number;
  monthStart: string;
  resetAt: string;
}>;
type TryOnResult = Readonly<{
  productId: string;
  productTitle: string;
  predictionId: string;
  modelName: string;
  imageDataUrl: string;
  saveToken: string;
  generatedAt: string;
  expiresAt?: string;
}>;
type CachedPreview = Readonly<{ expiresAt: number; result: TryOnResult }>;
type TryOnGenerationResponse = Readonly<{ result: TryOnResult; quota?: TryOnQuota }>;
type SharedGeneration = Readonly<{ controller: AbortController; promise: Promise<TryOnGenerationResponse> }>;

class TryOnRequestError extends Error {
  readonly quota?: TryOnQuota;
  constructor(message: string, quota?: TryOnQuota) {
    super(message);
    this.name = "TryOnRequestError";
    this.quota = quota;
  }
}

const sharedGenerations = new Map<string, SharedGeneration>();
const latestGenerationBySlot = new Map<string, string>();

function messageFor(error: string): string {
  if (error === "AUTH_REQUIRED") return "Η σύνδεσή σου έληξε. Συνδέσου ξανά για να συνεχίσεις με το Try On Me.";
  if (error === "TRY_ON_NOT_CONFIGURED") return "Το Try On Me δεν έχει ενεργοποιηθεί ακόμη στο περιβάλλον.";
  if (error === "TRY_ON_TIMEOUT") return "Η προεπισκόπηση άργησε περισσότερο από το αναμενόμενο. Δοκίμασε ξανά.";
  if (error === "TRY_ON_PRODUCT_UNSUPPORTED") return "Το συγκεκριμένο προϊόν δεν υποστηρίζεται ακόμη από το virtual try-on.";
  if (error === "TRY_ON_PRODUCT_IMAGE_REQUIRED") return "Χρειάζεται καθαρή φωτογραφία προϊόντος για να γίνει η δοκιμή.";
  if (error === "INVALID_TRY_ON_IMAGE") return "Χρησιμοποίησε καθαρή φωτογραφία JPG, PNG ή WebP.";
  if (error === "TRY_ON_IMAGE_TOO_LARGE") return "Η φωτογραφία είναι πολύ μεγάλη. Διάλεξε άλλη φωτογραφία.";
  if (error === "TRY_ON_STORAGE_NOT_CONFIGURED") return "Η αποθήκευση looks δεν είναι διαθέσιμη αυτή τη στιγμή.";
  if (error === "TRY_ON_RATE_LIMITED") return "Έχεις κάνει πολλές δοκιμές σε πολύ μικρό διάστημα. Περίμενε λίγο και δοκίμασε ξανά.";
  if (error === "TRY_ON_MONTHLY_LIMIT_REACHED") return "Έχεις χρησιμοποιήσει τις 50 Try On προεπισκοπήσεις αυτού του μήνα. Το όριο ανανεώνεται την 1η του επόμενου μήνα.";
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

function autoModeKey(scope: string): string {
  return `${AUTO_PREFIX}${scope}`;
}

function readAutoTryOn(scope: string): boolean {
  const key = autoModeKey(scope);
  try {
    const value = window.localStorage.getItem(key);
    if (value) return value !== "off";
  } catch {
    // Fall through to session storage.
  }
  try {
    const value = window.sessionStorage.getItem(key);
    return value !== "off";
  } catch {
    return true;
  }
}

function storeAutoTryOn(scope: string, enabled: boolean): void {
  const key = autoModeKey(scope);
  const value = enabled ? "on" : "off";
  try {
    window.localStorage.setItem(key, value);
    try { window.sessionStorage.removeItem(key); } catch {}
    return;
  } catch {
    // Private browsing can reject localStorage.
  }
  try { window.sessionStorage.setItem(key, value); } catch {}
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

function resultExpiresAt(result: TryOnResult): number {
  const serverExpiry = result.expiresAt ? Date.parse(result.expiresAt) : Number.NaN;
  if (Number.isFinite(serverExpiry)) return serverExpiry;
  const generatedAt = Date.parse(result.generatedAt);
  return Number.isFinite(generatedAt) ? generatedAt + PREVIEW_TTL_MS : Date.now() + PREVIEW_TTL_MS;
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
}): Promise<TryOnGenerationResponse> {
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
      const payload = await response.json() as { result?: TryOnResult; quota?: TryOnQuota; error?: string };
      if (response.status === 401) reconcileActiveTryOnScope(undefined);
      if (!response.ok || !payload.result) throw new TryOnRequestError(payload.error || "TRY_ON_FAILED", payload.quota);
      if (latestGenerationBySlot.get(slot) === key) {
        const expiresAt = resultExpiresAt(payload.result);
        if (expiresAt > Date.now()) writePreview(input.scope, input.productId, payload.result, expiresAt);
      }
      return { result: payload.result, quota: payload.quota };
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

function removeStoredModel(scope: string) {
  const key = modelKey(scope);
  try { window.localStorage.removeItem(key); } catch {}
  try { window.sessionStorage.removeItem(key); } catch {}
}

function cancelSharedGenerationsForScope(scope: string) {
  const prefix = `${PREVIEW_PREFIX}${scope}:`;
  for (const [slot, activeKey] of latestGenerationBySlot.entries()) {
    if (!slot.startsWith(prefix)) continue;
    sharedGenerations.get(activeKey)?.controller.abort();
    latestGenerationBySlot.delete(slot);
  }
}

function clearTryOnArtifactsForScope(scope: string) {
  cancelSharedGenerationsForScope(scope);
  removeStoredModel(scope);
  clearTryOnPreviews(scope);
}

function activeTryOnScope(): string | undefined {
  try {
    const value = window.localStorage.getItem(ACTIVE_SCOPE_KEY)?.trim();
    if (value) return value;
  } catch {
    // Fall through to the tab-scoped marker.
  }
  try {
    const value = window.sessionStorage.getItem(ACTIVE_SCOPE_KEY)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function reconcileActiveTryOnScope(nextScope: string | undefined) {
  const previousScope = activeTryOnScope();
  if (previousScope && previousScope !== nextScope) clearTryOnArtifactsForScope(previousScope);

  if (!nextScope) {
    try { window.localStorage.removeItem(ACTIVE_SCOPE_KEY); } catch {}
    try { window.sessionStorage.removeItem(ACTIVE_SCOPE_KEY); } catch {}
    return;
  }

  try {
    window.localStorage.setItem(ACTIVE_SCOPE_KEY, nextScope);
    try { window.sessionStorage.removeItem(ACTIVE_SCOPE_KEY); } catch {}
    return;
  } catch {
    // Private browsing can reject localStorage while sessionStorage remains available.
  }
  try { window.sessionStorage.setItem(ACTIVE_SCOPE_KEY, nextScope); } catch {}
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
  const [quota, setQuota] = useState<TryOnQuota>();
  const [quotaChecked, setQuotaChecked] = useState(false);
  const [autoTryOnEnabled, setAutoTryOnEnabled] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [modelImage, setModelImage] = useState<string>();
  const [result, setResult] = useState<TryOnResult>();
  const [previewExpiresAt, setPreviewExpiresAt] = useState<number>();
  const [busy, setBusy] = useState<"photo" | "generate" | "save" | "">("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function generate(photo: string, token: string, scope: string) {
    if (quota?.remaining === 0) {
      setError(messageFor("TRY_ON_MONTHLY_LIMIT_REACHED"));
      return;
    }
    const attempt = generationAttempt.current + 1;
    generationAttempt.current = attempt;
    setBusy("generate");
    setError("");
    setSaved(false);
    try {
      const response = await requestSharedGeneration({
        scope,
        productId,
        photo,
        csrfToken: token
      });
      if (generationAttempt.current !== attempt) return;
      if (response.quota) setQuota(response.quota);
      const generated = response.result;
      const cached = readPreview(scope, productId);
      const expiresAt = cached?.result.predictionId === generated.predictionId
        ? cached.expiresAt
        : resultExpiresAt(generated);
      if (expiresAt <= Date.now()) throw new Error("TRY_ON_SAVE_TOKEN_EXPIRED");
      setResult(generated);
      setPreviewExpiresAt(expiresAt);
    } catch (cause) {
      if (generationAttempt.current !== attempt) return;
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      if (cause instanceof TryOnRequestError && cause.quota) setQuota(cause.quota);
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
    setQuota(undefined);
    setQuotaChecked(false);
    setAutoTryOnEnabled(true);
    setModelImage(undefined);
    setResult(undefined);
    setPreviewExpiresAt(undefined);
    setSaved(false);
    setError("");

    void fetch("/api/account/session", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          if (response.status === 401) reconcileActiveTryOnScope(undefined);
          setSessionChecked(true);
          return;
        }
        const payload = await response.json() as SessionPayload;
        if (!active) return;
        const token = payload.csrfToken;
        const scope = payload.tryOnStorageScope;
        if (!token || !scope) {
          setQuotaChecked(true);
          setSessionChecked(true);
          return;
        }

        const available = payload.tryOnAvailable !== false;
        reconcileActiveTryOnScope(scope);
        setStorageScope(scope);
        setCsrfToken(token);
        setTryOnAvailable(available);
        clearLegacyUnscopedTryOnData();
        if (available) {
          try {
            const quotaResponse = await fetch("/api/account/try-on/quota", { cache: "no-store" });
            if (!active) return;
            if (quotaResponse.status === 401) reconcileActiveTryOnScope(undefined);
            if (quotaResponse.ok) {
              const quotaPayload = await quotaResponse.json() as { quota?: TryOnQuota };
              if (quotaPayload.quota) setQuota(quotaPayload.quota);
            }
          } catch {
            // Server-side quota enforcement remains authoritative if this display read fails.
          }
          if (!active) return;
          const cached = readPreview(scope, productId);
          setAutoTryOnEnabled(readAutoTryOn(scope));
          setModelImage(readStoredModel(scope));
          setResult(cached?.result);
          setPreviewExpiresAt(cached?.expiresAt);
        }
        setQuotaChecked(true);
        setSessionChecked(true);
      })
      .catch(() => {
        if (active) {
          setQuotaChecked(true);
          setSessionChecked(true);
        }
      });
    return () => {
      active = false;
      // Deliberately keep an in-flight request alive across a quick route remount.
      // The shared request writes only the five-minute account-scoped session cache.
      generationAttempt.current += 1;
    };
  }, [productId]);

  useEffect(() => {
    if (!sessionChecked || !quotaChecked || !csrfToken || !storageScope || !modelImage || result || autoStarted.current) return;
    if (!autoTryOnEnabled || quota?.remaining === 0) return;
    autoStarted.current = true;
    void generate(modelImage, csrfToken, storageScope);
  // generate is deliberately driven only by resolved session/model/product state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, quotaChecked, csrfToken, storageScope, modelImage, productId, result, quota?.remaining, autoTryOnEnabled]);

  useEffect(() => {
    if (!csrfToken || !quota?.resetAt) return;
    let cancelled = false;
    let timer = 0;
    const resetAt = Date.parse(quota.resetAt);
    if (!Number.isFinite(resetAt)) return;

    const refreshAtBoundary = () => {
      if (cancelled) return;
      const remaining = resetAt - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(refreshAtBoundary, Math.min(remaining + 250, 6 * 60 * 60 * 1000));
        return;
      }
      void fetch("/api/account/try-on/quota", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok || cancelled) return;
          const payload = await response.json() as { quota?: TryOnQuota };
          if (!cancelled && payload.quota) {
            setQuota(payload.quota);
            autoStarted.current = false;
          }
        })
        .catch(() => undefined);
    };

    refreshAtBoundary();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [csrfToken, quota?.resetAt]);

  async function choosePhoto(file: File | undefined) {
    if (quota?.remaining === 0) {
      setError(messageFor("TRY_ON_MONTHLY_LIMIT_REACHED"));
      return;
    }
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

  function toggleAutoTryOn() {
    if (!storageScope) return;
    const next = !autoTryOnEnabled;
    storeAutoTryOn(storageScope, next);
    setAutoTryOnEnabled(next);
    if (next && modelImage && !result && quota?.remaining !== 0 && csrfToken) {
      autoStarted.current = true;
      void generate(modelImage, csrfToken, storageScope);
    }
  }

  function removePhoto() {
    generationAttempt.current += 1;
    if (storageScope) {
      clearTryOnArtifactsForScope(storageScope);
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

  const quotaExhausted = quota?.remaining === 0;
  const quotaResetLabel = quota
    ? new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(quota.resetAt))
    : "";

  if (!sessionChecked) {
    return <section id={`try-on-card-${productId}`} className={styles.card} aria-label="Try On Me"><div className={styles.loading}>Try On Me…</div></section>;
  }

  if (csrfToken && tryOnAvailable === false) {
    return (
      <section id={`try-on-card-${productId}`} className={styles.card} aria-labelledby={`try-on-${productId}`}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
            <h2 id={`try-on-card-${productId}`}>Δες το πάνω σου</h2>
          </div>
          <span className={styles.spark}>✦</span>
        </div>
        <p>Το Try On Me δεν είναι ενεργό σε αυτό το περιβάλλον ακόμη. Η φωτογραφία σου δεν αποστέλλεται και δεν καταναλώνεται generation credit.</p>
      </section>
    );
  }

  if (!csrfToken) {
    return (
      <section id={`try-on-card-${productId}`} className={styles.card} aria-labelledby={`try-on-${productId}`}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
            <h2 id={`try-on-card-${productId}`}>Δες το πάνω σου</h2>
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
    <section id={`try-on-card-${productId}`} className={styles.card} aria-labelledby={`try-on-${productId}`}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
          <h2 id={`try-on-card-${productId}`}>Δες το πάνω σου</h2>
        </div>
        <span className={styles.spark}>✦</span>
      </div>

      {quota ? (
        <div className={quotaExhausted ? `${styles.quota} ${styles.quotaExhausted}` : styles.quota}>
          <div className={styles.quotaTopline}>
            <strong>{quota.remaining} από {quota.limit} διαθέσιμες αυτόν τον μήνα</strong>
            <span>{quota.used}/{quota.limit} χρησιμοποιήθηκαν</span>
          </div>
          <progress className={styles.quotaProgress} value={quota.used} max={quota.limit} aria-label={`${quota.used} από ${quota.limit} Try On προεπισκοπήσεις χρησιμοποιήθηκαν`} />
          <small>Κάθε νέα προεπισκόπηση μετράει ως 1 χρήση. Η αποθήκευση look δεν μετράει. Το Auto Try On μπορεί να απενεργοποιηθεί για οικονομία χρήσεων. Επαναφορά {quotaResetLabel}.</small>
        </div>
      ) : null}

      {!modelImage ? (
        <>
          <p>Βάλε μία καθαρή φωτογραφία σου. Το KONTA MOY την αποθηκεύει μόνο στη συσκευή σου· για τη δημιουργία της προεπισκόπησης αποστέλλεται προσωρινά στον πάροχο FASHN και δεν αποθηκεύεται ως φωτογραφία προφίλ. Σε αλλαγή λογαριασμού ή ληγμένη σύνδεση, τα τοπικά Try On δεδομένα του προηγούμενου λογαριασμού καθαρίζονται.</p>
          {quotaExhausted ? (
            <div className={styles.quotaReached} role="status">
              <strong>Το μηνιαίο όριο ολοκληρώθηκε.</strong>
              <span>Νέες προεπισκοπήσεις θα είναι διαθέσιμες ξανά {quotaResetLabel}.</span>
            </div>
          ) : (
            <label className={styles.upload}>
              <span>{busy === "photo" ? "Ετοιμασία φωτογραφίας…" : "Πρόσθεσε φωτογραφία σου"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={Boolean(busy)}
                onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
              />
            </label>
          )}
        </>
      ) : (
        <>
          <div className={styles.modelControls}>
            <span>Η φωτογραφία σου είναι ενεργή για Try On Me.</span>
            <button
              className={styles.autoToggle}
              type="button"
              aria-pressed={autoTryOnEnabled}
              onClick={toggleAutoTryOn}
              disabled={Boolean(busy)}
            >
              Auto Try On: {autoTryOnEnabled ? "ON" : "OFF"}
            </button>
            {!quotaExhausted ? (
              <label className={styles.textAction}>
                Αλλαγή
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={Boolean(busy)}
                  onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
                />
              </label>
            ) : null}
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
              disabled={Boolean(busy) || !storageScope || quotaExhausted}
              onClick={() => storageScope && void generate(modelImage, csrfToken, storageScope)}
            >
              {autoTryOnEnabled ? "Δοκίμασε ξανά" : "Δημιούργησε προεπισκόπηση"}
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
                  disabled={Boolean(busy) || quotaExhausted}
                  onClick={() => storageScope && void generate(modelImage, csrfToken, storageScope)}
                >
                  {quotaExhausted ? "Μηνιαίο όριο 50/50" : "Νέα προεπισκόπηση"}
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
