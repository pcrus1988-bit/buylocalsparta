"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeTryOnModelPhoto, readTryOnModelPhoto, reconcileTryOnBrowserScope, storeTryOnModelPhoto } from "../lib/try-on-browser-profile";
import { TryOnGenerationOverlay3D } from "./TryOnGenerationOverlay3D";
import styles from "./FittingRoomTryOn.module.css";

type Garment = Readonly<{
  id: string;
  title: string;
  slot: "main" | "bottom" | "layer";
}>;

type SessionPayload = Readonly<{
  csrfToken?: string;
  tryOnStorageScope?: string;
  tryOnAvailable?: boolean;
}>;

type TryOnQuota = Readonly<{
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}>;

type TryOnResult = Readonly<{
  productId: string;
  productTitle: string;
  predictionId: string;
  imageDataUrl: string;
  saveToken: string;
  generatedAt: string;
  expiresAt?: string;
}>;

type ResumeState = Readonly<{
  nextIndex: number;
  workingImage: string;
  originalImage: string;
  csrfToken: string;
  scope: string;
  quota?: TryOnQuota;
}>;

function errorMessage(value: string): string {
  if (value === "TRY_ON_MONTHLY_LIMIT_REACHED") return "Δεν υπάρχουν αρκετές Try On δημιουργίες για να ολοκληρωθεί αυτό το outfit.";
  if (value === "TRY_ON_RATE_LIMITED") return "Έγιναν πολλές δημιουργίες σε μικρό διάστημα. Περίμενε λίγο και συνέχισε.";
  if (value === "TRY_ON_POSE_REQUIRED") return "Η φωτογραφία δεν επιτρέπει καθαρή αναγνώριση της στάσης. Δοκίμασε άλλη φωτογραφία.";
  if (value === "TRY_ON_PRODUCT_UNSUPPORTED") return "Ένα από τα επιλεγμένα ρούχα δεν υποστηρίζεται ακόμη από το Try On Me.";
  if (value === "TRY_ON_PRODUCT_IMAGE_REQUIRED" || value === "TRY_ON_PRODUCT_IMAGE_LOAD_FAILED") return "Δεν μπορέσαμε να διαβάσουμε καθαρά τη φωτογραφία ενός από τα προϊόντα.";
  if (value === "TRY_ON_MODEL_IMAGE_LOAD_FAILED" || value === "INVALID_TRY_ON_IMAGE") return "Η φωτογραφία σου δεν μπόρεσε να χρησιμοποιηθεί. Δοκίμασε άλλη.";
  if (value === "TRY_ON_PROVIDER_BUSY" || value === "TRY_ON_TIMEOUT") return "Το Try On Me είναι προσωρινά απασχολημένο. Μπορείς να συνεχίσεις από το σημείο που σταμάτησε.";
  if (value === "TRY_ON_SAVE_TOKEN_EXPIRED") return "Η προσωρινή αποθήκευση έληξε. Δημιούργησε νέα προεπισκόπηση και αποθήκευσέ την μέσα σε λίγα λεπτά.";
  if (value === "AUTH_REQUIRED") return "Η σύνδεσή σου έληξε. Συνδέσου ξανά για να συνεχίσεις.";
  return "Δεν ολοκληρώθηκε το outfit Try On. Μπορείς να δοκιμάσεις ξανά.";
}

function layerLabel(slot: Garment["slot"]): string {
  if (slot === "bottom") return "Κάτω μέρος";
  if (slot === "layer") return "Πανωφόρι";
  return "Κύριο κομμάτι";
}

export function FittingRoomTryOn({
  garments,
  lookName,
  csrfToken: initialCsrfToken
}: {
  garments: readonly Garment[];
  lookName: string;
  csrfToken?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modelImage, setModelImage] = useState<string>();
  const [finalResult, setFinalResult] = useState<TryOnResult>();
  const [quota, setQuota] = useState<TryOnQuota>();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [resume, setResume] = useState<ResumeState>();
  const [resultCsrfToken, setResultCsrfToken] = useState("");
  const [zoom, setZoom] = useState(1);

  const requiredPasses = garments.length;
  const passesStillNeeded = finalResult ? 0 : Math.max(0, requiredPasses - (resume?.nextIndex ?? 0));
  const insufficientQuota = quota ? quota.remaining < passesStillNeeded : false;

  const summary = useMemo(() => garments.map((garment) => layerLabel(garment.slot)).join(" + "), [garments]);
  const outfitKey = useMemo(() => garments.map((garment) => `${garment.slot}:${garment.id}`).join("|"), [garments]);

  useEffect(() => {
    setOpen(false);
    setFinalResult(undefined);
    setResume(undefined);
    setStage(0);
    setError("");
    setSaved(false);
    setSaving(false);
    setZoom(1);
  }, [lookName, outfitKey]);

  async function resolveSession() {
    const response = await fetch("/api/account/session", { cache: "no-store" });
    if (!response.ok) throw new Error("AUTH_REQUIRED");
    const payload = await response.json() as SessionPayload;
    if (payload.tryOnAvailable === false) throw new Error("TRY_ON_NOT_CONFIGURED");
    const scope = payload.tryOnStorageScope?.trim();
    const csrfToken = payload.csrfToken?.trim() || initialCsrfToken?.trim();
    if (!scope || !csrfToken) throw new Error("AUTH_REQUIRED");

    reconcileTryOnBrowserScope(scope);

    const quotaResponse = await fetch("/api/account/try-on/quota", { cache: "no-store" });
    if (!quotaResponse.ok) throw new Error(quotaResponse.status === 401 ? "AUTH_REQUIRED" : "TRY_ON_FAILED");
    const quotaPayload = await quotaResponse.json() as { quota?: TryOnQuota };
    if (quotaPayload.quota) setQuota(quotaPayload.quota);

    return { scope, csrfToken, quota: quotaPayload.quota };
  }

  async function openTryOn() {
    setError("");
    setStage(0);
    setZoom(1);

    if (finalResult) {
      setOpen(true);
      return;
    }

    if (!initialCsrfToken) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    try {
      const session = await resolveSession();
      setResultCsrfToken(session.csrfToken);
      setModelImage(readTryOnModelPhoto(session.scope));
      setOpen(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "TRY_ON_FAILED";
      if (message === "AUTH_REQUIRED") {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setOpen(true);
      setError(errorMessage(message));
    }
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || busy) return;
    setError("");
    try {
      const session = await resolveSession();
      const normalized = await normalizeTryOnModelPhoto(file);
      storeTryOnModelPhoto(session.scope, normalized);
      setResultCsrfToken(session.csrfToken);
      setModelImage(normalized);
      setQuota(session.quota);
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "INVALID_TRY_ON_IMAGE"));
    }
  }

  async function requestPass(garment: Garment, image: string, csrfToken: string): Promise<{ result: TryOnResult; quota?: TryOnQuota }> {
    const response = await fetch("/api/account/try-on", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      cache: "no-store",
      body: JSON.stringify({ productId: garment.id, modelImageDataUrl: image })
    });
    const payload = await response.json().catch(() => ({})) as { result?: TryOnResult; quota?: TryOnQuota; error?: string };
    if (payload.quota) setQuota(payload.quota);
    if (!response.ok || !payload.result) throw new Error(payload.error || "TRY_ON_FAILED");
    return { result: payload.result, quota: payload.quota };
  }

  async function runSequence(existing?: ResumeState) {
    if (!garments.length || busy) return;
    setError("");
    setFinalResult(undefined);
    setSaved(false);
    setSaving(false);
    setZoom(1);
    setBusy(true);

    try {
      const session = existing
        ? { scope: existing.scope, csrfToken: existing.csrfToken, quota: existing.quota }
        : await resolveSession();
      setResultCsrfToken(session.csrfToken);

      const originalImage = existing?.originalImage ?? readTryOnModelPhoto(session.scope);
      const startingImage = existing?.workingImage ?? originalImage;
      const startIndex = existing?.nextIndex ?? 0;

      if (!originalImage || !startingImage) {
        setModelImage(undefined);
        setError("Πρόσθεσε πρώτα μία φωτογραφία σου για να δοκιμάσεις το outfit.");
        return;
      }

      const remainingPasses = garments.length - startIndex;
      const available = session.quota?.remaining;
      if (typeof available === "number" && available < remainingPasses) {
        setQuota(session.quota);
        setError(`Το outfit χρειάζεται ${remainingPasses} ακόμη δημιουργήσε${remainingPasses === 1 ? "η" : "ις"}, αλλά έχεις ${available} διαθέσιμ${available === 1 ? "η" : "ες"} αυτόν τον μήνα.`);
        return;
      }

      setModelImage(originalImage);
      let workingImage = startingImage;
      let latestQuota = session.quota;
      let lastResult: TryOnResult | undefined;

      for (let index = startIndex; index < garments.length; index += 1) {
        setStage(index + 1);
        try {
          const generated = await requestPass(garments[index], workingImage, session.csrfToken);
          lastResult = generated.result;
          workingImage = generated.result.imageDataUrl;
          latestQuota = generated.quota ?? latestQuota;
          setResume({
            nextIndex: index + 1,
            workingImage,
            originalImage,
            csrfToken: session.csrfToken,
            scope: session.scope,
            quota: latestQuota
          });
        } catch (cause) {
          setResume({
            nextIndex: index,
            workingImage,
            originalImage,
            csrfToken: session.csrfToken,
            scope: session.scope,
            quota: latestQuota
          });
          throw cause;
        }
      }

      if (!lastResult) throw new Error("TRY_ON_FAILED");

      // Keep the 3D overlay long enough to reveal the final provider result, then
      // transition to the persistent result viewer. The result viewer never closes
      // itself; only an explicit customer action can dismiss it.
      setFinalResult(lastResult);
      setResume(undefined);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1100));
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "TRY_ON_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function saveOutfit() {
    if (!finalResult || saving || saved) return;
    setSaving(true);
    setError("");
    try {
      let csrfToken = resultCsrfToken;
      if (!csrfToken) {
        const session = await resolveSession();
        csrfToken = session.csrfToken;
        setResultCsrfToken(csrfToken);
      }
      const response = await fetch("/api/account/try-on/saved", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        cache: "no-store",
        body: JSON.stringify({
          productId: finalResult.productId,
          predictionId: finalResult.predictionId,
          imageDataUrl: finalResult.imageDataUrl,
          saveToken: finalResult.saveToken,
          outfitName: lookName
        })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "TRY_ON_SAVE_FAILED");
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "TRY_ON_SAVE_FAILED"));
    } finally {
      setSaving(false);
    }
  }

  function startFreshPreview() {
    setFinalResult(undefined);
    setResume(undefined);
    setStage(0);
    setSaved(false);
    setSaving(false);
    setZoom(1);
    setError("");
  }

  if (!garments.length) return null;

  return (
    <>
      <section className={styles.card} aria-label="Try On Me για το ολοκληρωμένο look">
        <div className={styles.cardCopy}>
          <span>KONTA MOY · TRY ON ME</span>
          <h3>Δες όλο το look πάνω σου</h3>
          <p>
            Συνδυάζουμε τα συμβατά ρούχα του look διαδοχικά πάνω στη φωτογραφία σου.
            {requiredPasses > 1 ? ` Για αυτό το look θα γίνουν έως ${requiredPasses} διαδοχικές δημιουργίες.` : ""}
          </p>
          <div className={styles.layers}>
            {garments.map((garment, index) => (
              <span key={garment.id}><b>{index + 1}</b>{layerLabel(garment.slot)}</span>
            ))}
          </div>
        </div>
        <button className={styles.cta} type="button" onClick={() => void openTryOn()}>
          <span>✦</span>
          <strong>{finalResult ? "Δες ξανά το Try On" : "Δοκίμασέ το πάνω μου"}</strong>
          <small>{summary}</small>
        </button>
      </section>

      {open ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Fitting Room Try On Me">
          <button className={styles.close} type="button" onClick={() => { if (!busy) setOpen(false); }} aria-label="Κλείσιμο">×</button>

          <div className={finalResult && !busy ? styles.resultPanel : styles.modalPanel}>
            {finalResult && !busy ? (
              <>
                <div className={styles.resultHeader}>
                  <div>
                    <span className={styles.eyebrow}>TRY ON COMPLETE · FITTING ROOM</span>
                    <h2>{lookName}</h2>
                    <p>Το αποτέλεσμα θα παραμείνει ανοιχτό μέχρι να το κλείσεις εσύ.</p>
                  </div>
                  {saved ? <span className={styles.savedBadge}>★ Αποθηκεύτηκε</span> : null}
                </div>

                <div className={styles.resultCanvas}>
                  <img
                    src={finalResult.imageDataUrl}
                    alt={`Try On αποτέλεσμα · ${lookName}`}
                    style={{ transform: `scale(${zoom})` }}
                    onClick={() => setZoom((current) => current > 1 ? 1 : 1.65)}
                  />
                </div>

                <div className={styles.zoomBar} aria-label="Έλεγχος μεγέθυνσης">
                  <button type="button" onClick={() => setZoom((current) => Math.max(1, Number((current - .25).toFixed(2))))}>−</button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom((current) => Math.min(2.5, Number((current + .25).toFixed(2))))}>＋</button>
                  <button type="button" onClick={() => setZoom(1)}>Fit</button>
                </div>

                <div className={styles.resultActions}>
                  <button className={styles.saveResult} type="button" disabled={saving || saved} onClick={() => void saveOutfit()}>
                    {saved ? "★ Αποθηκεύτηκε στα Try On" : saving ? "Αποθήκευση…" : "☆ Αποθήκευσε αυτό το outfit"}
                  </button>
                  <button className={styles.secondary} type="button" onClick={startFreshPreview}>Νέα προεπισκόπηση</button>
                  <button className={styles.secondary} type="button" onClick={() => setOpen(false)}>Επιστροφή στο Fitting Room</button>
                </div>

                {quota ? <p className={styles.resultMeta}>{quota.remaining}/{quota.limit} Try On δημιουργίες διαθέσιμες αυτόν τον μήνα.</p> : null}
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
              </>
            ) : (
              <>
                <span className={styles.eyebrow}>FITTING ROOM · TRY ON ME</span>
                <h2>{lookName}</h2>

                {!modelImage ? (
                  <>
                    <p>Χρειάζεται μία καθαρή ολόσωμη ή 3/4 φωτογραφία. Θα αποθηκευτεί μόνο στη συσκευή σου, όπως και στο κανονικό Try On Me.</p>
                    <label className={styles.upload}>
                      <strong>Πρόσθεσε φωτογραφία</strong>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(event.currentTarget.files?.[0])} />
                    </label>
                  </>
                ) : (
                  <>
                    <div className={styles.previewRow}>
                      <img src={modelImage} alt="Η φωτογραφία μου" />
                      <div>
                        <strong>Έτοιμο για outfit Try On</strong>
                        <p>{requiredPasses === 1 ? "1 συμβατό ρούχο" : `${requiredPasses} συμβατά ρούχα · διαδοχική σύνθεση`}</p>
                        {quota ? <small>{quota.remaining}/{quota.limit} Try On δημιουργίες διαθέσιμες</small> : null}
                      </div>
                    </div>

                    <button
                      className={styles.generate}
                      type="button"
                      disabled={busy || insufficientQuota}
                      onClick={() => void runSequence(resume)}
                    >
                      {busy
                        ? `Δημιουργία ${Math.max(1, stage)}/${requiredPasses}…`
                        : resume
                          ? `Συνέχισε από το βήμα ${resume.nextIndex + 1}`
                          : `Δημιούργησε το outfit · ${requiredPasses} Try On`}
                    </button>
                  </>
                )}

                {insufficientQuota ? (
                  <p className={styles.error}>Το outfit χρειάζεται ακόμη {passesStillNeeded} δημιουργήσε{passesStillNeeded === 1 ? "η" : "ις"}, αλλά απομένουν {quota?.remaining ?? 0}.</p>
                ) : null}
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
              </>
            )}
          </div>

          {busy && modelImage ? (
            <>
              <TryOnGenerationOverlay3D
                modelImage={modelImage}
                resultImage={finalResult?.imageDataUrl}
                productTitle={lookName}
              />
              <div className={styles.progressBadge} role="status" aria-live="polite">
                <span>{finalResult ? "OUTFIT READY" : "OUTFIT COMPOSITION"}</span>
                <strong>{finalResult ? "✓" : `${Math.max(1, stage)} / ${requiredPasses}`}</strong>
                <small>{finalResult ? "Ανοίγουμε το αποτέλεσμα…" : garments[Math.max(0, stage - 1)]?.title ?? "Προετοιμασία look"}</small>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
