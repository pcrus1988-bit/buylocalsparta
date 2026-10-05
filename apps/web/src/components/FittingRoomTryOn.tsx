"use client";

import { useMemo, useState } from "react";
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
  const [finalImage, setFinalImage] = useState<string>();
  const [quota, setQuota] = useState<TryOnQuota>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [resume, setResume] = useState<ResumeState>();

  const requiredPasses = garments.length;
  const insufficientQuota = quota ? quota.remaining < requiredPasses : false;

  const summary = useMemo(() => garments.map((garment) => layerLabel(garment.slot)).join(" + "), [garments]);

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
    setFinalImage(undefined);
    setResume(undefined);
    setStage(0);

    if (!initialCsrfToken) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    try {
      const session = await resolveSession();
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
    setFinalImage(undefined);
    setBusy(true);

    try {
      const session = existing
        ? { scope: existing.scope, csrfToken: existing.csrfToken, quota: existing.quota }
        : await resolveSession();
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

      for (let index = startIndex; index < garments.length; index += 1) {
        setStage(index + 1);
        try {
          const generated = await requestPass(garments[index], workingImage, session.csrfToken);
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

      setFinalImage(workingImage);
      setResume(undefined);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
    } catch (cause) {
      setError(errorMessage(cause instanceof Error ? cause.message : "TRY_ON_FAILED"));
    } finally {
      setBusy(false);
    }
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
          <strong>Δοκίμασέ το πάνω μου</strong>
          <small>{summary}</small>
        </button>
      </section>

      {open ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Fitting Room Try On Me">
          <button className={styles.close} type="button" onClick={() => { if (!busy) setOpen(false); }} aria-label="Κλείσιμο">×</button>

          <div className={styles.modalPanel}>
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
                  <img src={finalImage ?? modelImage} alt={finalImage ? `Try On αποτέλεσμα · ${lookName}` : "Η φωτογραφία μου"} />
                  <div>
                    <strong>{finalImage ? "Το outfit είναι έτοιμο" : "Έτοιμο για outfit Try On"}</strong>
                    <p>{requiredPasses === 1 ? "1 συμβατό ρούχο" : `${requiredPasses} συμβατά ρούχα · διαδοχική σύνθεση`}</p>
                    {quota ? <small>{quota.remaining}/{quota.limit} Try On δημιουργίες διαθέσιμες</small> : null}
                  </div>
                </div>

                {!finalImage ? (
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
                ) : (
                  <div className={styles.resultActions}>
                    <button className={styles.generate} type="button" onClick={() => { setFinalImage(undefined); setStage(0); setResume(undefined); }}>
                      Νέα προεπισκόπηση
                    </button>
                    <button className={styles.secondary} type="button" onClick={() => setOpen(false)}>Επιστροφή στο look</button>
                  </div>
                )}
              </>
            )}

            {insufficientQuota ? (
              <p className={styles.error}>Το συγκεκριμένο outfit χρειάζεται {requiredPasses} δημιουργίες, αλλά απομένουν {quota?.remaining ?? 0}.</p>
            ) : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
          </div>

          {busy && modelImage ? (
            <>
              <TryOnGenerationOverlay3D
                modelImage={modelImage}
                resultImage={finalImage}
                productTitle={lookName}
              />
              <div className={styles.progressBadge} role="status" aria-live="polite">
                <span>OUTFIT COMPOSITION</span>
                <strong>{Math.max(1, stage)} / {requiredPasses}</strong>
                <small>{garments[Math.max(0, stage - 1)]?.title ?? "Προετοιμασία look"}</small>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
