"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clearTryOnPreviewsForScope,
  normalizeTryOnModelPhoto,
  readTryOnAutoMode,
  readTryOnModelPhoto,
  reconcileTryOnBrowserScope,
  removeTryOnModelPhoto,
  storeTryOnAutoMode,
  storeTryOnModelPhoto
} from "../lib/try-on-browser-profile";
import styles from "./AccountTryOnSetupClient.module.css";

type SessionPayload = Readonly<{ tryOnStorageScope?: string; tryOnAvailable?: boolean }>;
type TryOnQuota = Readonly<{ limit: number; used: number; remaining: number; resetAt: string }>;
type SavedTryOn = Readonly<{ id: string; productTitle: string; productSlug: string; imageUrl: string }>;

function resetLabel(quota: TryOnQuota | undefined): string {
  if (!quota) return "";
  const date = new Date(quota.resetAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("el-GR", { day: "numeric", month: "long", timeZone: "UTC" }).format(date);
}

function photoError(message: string): string {
  if (message === "TRY_ON_IMAGE_TOO_LARGE") return "Η φωτογραφία είναι πολύ μεγάλη. Διάλεξε άλλη φωτογραφία.";
  return "Χρησιμοποίησε καθαρή φωτογραφία JPG, PNG ή WebP.";
}

export function AccountTryOnSetupClient({ variant = "page" }: { variant?: "dashboard" | "page" }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [scope, setScope] = useState<string>();
  const [modelImage, setModelImage] = useState<string>();
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [quota, setQuota] = useState<TryOnQuota>();
  const [saved, setSaved] = useState<readonly SavedTryOn[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void fetch("/api/account/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("AUTH_REQUIRED");
        const payload = await response.json() as SessionPayload;
        if (!active) return;
        const nextScope = payload.tryOnStorageScope?.trim();
        setAvailable(payload.tryOnAvailable !== false);
        if (!nextScope) return;

        reconcileTryOnBrowserScope(nextScope);
        setScope(nextScope);
        setModelImage(readTryOnModelPhoto(nextScope));
        setAutoEnabled(readTryOnAutoMode(nextScope));

        const requests: Promise<void>[] = [
          fetch("/api/account/try-on/quota", { cache: "no-store", signal: controller.signal })
            .then(async (quotaResponse) => {
              if (!quotaResponse.ok || !active) return;
              const quotaPayload = await quotaResponse.json() as { quota?: TryOnQuota };
              if (active && quotaPayload.quota) setQuota(quotaPayload.quota);
            })
            .catch(() => undefined)
        ];

        if (variant === "page") {
          requests.push(
            fetch("/api/account/try-on/saved", { cache: "no-store", signal: controller.signal })
              .then(async (savedResponse) => {
                if (!savedResponse.ok || !active) return;
                const savedPayload = await savedResponse.json() as { tryOns?: SavedTryOn[] };
                if (active) setSaved(savedPayload.tryOns ?? []);
              })
              .catch(() => undefined)
          );
        }
        await Promise.all(requests);
      })
      .catch((cause) => {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error && cause.message === "AUTH_REQUIRED"
          ? "Η σύνδεσή σου έληξε. Συνδέσου ξανά."
          : "Δεν ήταν δυνατή η φόρτωση του Try On Me.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [variant]);

  async function choosePhoto(file: File | undefined) {
    if (!file || !scope || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const normalized = await normalizeTryOnModelPhoto(file);
      storeTryOnModelPhoto(scope, normalized);
      clearTryOnPreviewsForScope(scope);
      setModelImage(normalized);
      setStatus("Η φωτογραφία αποθηκεύτηκε μόνο σε αυτή τη συσκευή και είναι έτοιμη για Try On Me.");
    } catch (cause) {
      setError(photoError(cause instanceof Error ? cause.message : "INVALID_TRY_ON_IMAGE"));
    } finally {
      setBusy(false);
    }
  }

  function removePhoto() {
    if (!scope || busy) return;
    removeTryOnModelPhoto(scope);
    clearTryOnPreviewsForScope(scope);
    setModelImage(undefined);
    setStatus("Η φωτογραφία αφαιρέθηκε από αυτή τη συσκευή.");
    setError("");
  }

  function toggleAuto() {
    if (!scope || busy) return;
    const next = !autoEnabled;
    storeTryOnAutoMode(scope, next);
    setAutoEnabled(next);
    setStatus(next
      ? "Το Auto Try On είναι ενεργό. Συμβατά ρούχα μπορούν να δημιουργούνται αυτόματα όταν ανοίγεις τη σελίδα τους."
      : "Το Auto Try On είναι απενεργοποιημένο. Θα αποφασίζεις εσύ πότε θα χρησιμοποιείται μία από τις μηνιαίες δοκιμές σου.");
  }

  const quotaReset = resetLabel(quota);
  const photo = modelImage
    ? <img className={styles.photoPreview} src={modelImage} alt="Η φωτογραφία μου για Try On Me" />
    : <div className={styles.photoPlaceholder}><span>Δεν έχεις ορίσει ακόμη φωτογραφία για Try On Me σε αυτή τη συσκευή.</span></div>;

  const photoActions = (
    <div className={styles.actions}>
      <label className={`button ${styles.uploadButton}`}>
        {busy ? "Ετοιμασία…" : modelImage ? "Αλλαγή φωτογραφίας" : "Πρόσθεσε φωτογραφία"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !scope}
          onChange={(event) => void choosePhoto(event.currentTarget.files?.[0])}
        />
      </label>
      {modelImage ? <button className={styles.textButton} type="button" disabled={busy} onClick={removePhoto}>Αφαίρεση</button> : null}
    </div>
  );

  if (variant === "dashboard") {
    return (
      <section className={`shell ${styles.dashboardCard}`} aria-labelledby="dashboard-try-on-title">
        <div className={styles.dashboardHead}>
          <div>
            <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
            <h2 id="dashboard-try-on-title">{modelImage ? "Η φωτογραφία σου είναι έτοιμη" : "Δες τα ρούχα πάνω σου"}</h2>
          </div>
          {quota ? <span className={styles.quotaPill}>{quota.remaining}/{quota.limit} διαθέσιμα</span> : <span className={styles.spark}>✦</span>}
        </div>

        {loading ? <p className={styles.status}>Φόρτωση Try On Me…</p> : (
          <div className={styles.dashboardBody}>
            {photo}
            <div className={styles.dashboardCopy}>
              <p>{modelImage
                ? "Η ίδια φωτογραφία χρησιμοποιείται στα συμβατά ρούχα. Δεν χρειάζεται να την ανεβάζεις ξανά σε κάθε προϊόν."
                : "Πρόσθεσε μία καθαρή ολόσωμη ή 3/4 φωτογραφία. Παραμένει στη συσκευή σου και δεν γίνεται φωτογραφία προφίλ."}</p>
              {photoActions}
              {modelImage ? (
                <div className={styles.actions}>
                  <button className={styles.toggle} type="button" aria-pressed={autoEnabled} onClick={toggleAuto}>
                    Auto Try On: {autoEnabled ? "ON" : "OFF"}
                  </button>
                  <Link className="button button-secondary" href="/account/try-on">Διαχείριση Try On Me</Link>
                </div>
              ) : <Link className="text-link" href="/account/try-on">Πώς λειτουργεί το Try On Me →</Link>}
            </div>
          </div>
        )}
        {!available ? <p className={styles.error}>Το Try On Me δεν είναι διαθέσιμο αυτή τη στιγμή.</p> : null}
        {status ? <p className={styles.status} role="status">{status}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className={`shell ${styles.pageRoot}`} aria-labelledby="account-try-on-title">
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>KONTA MOY · TRY ON ME</span>
          <h1 id="account-try-on-title">Το δικό σου fitting preview</h1>
          <p>Ρύθμισε μία φορά τη φωτογραφία σου και μετά δες συμβατά ρούχα πάνω σου καθώς ψωνίζεις.</p>
        </div>
        <span className={styles.spark}>✦</span>
      </div>

      {quota ? (
        <div className={styles.quotaBlock}>
          <div className={styles.quotaLine}>
            <strong>{quota.remaining} από {quota.limit} Try On διαθέσιμα</strong>
            <span>{quota.used}/{quota.limit} χρησιμοποιήθηκαν</span>
          </div>
          <progress value={quota.used} max={quota.limit} aria-label={`${quota.used} από ${quota.limit} Try On χρησιμοποιήθηκαν`} />
          <small>Κάθε νέα FASHN προεπισκόπηση χρησιμοποιεί 1 δοκιμή. Η αποθήκευση και η σύγκριση looks δεν χρησιμοποιούν επιπλέον δοκιμές.{quotaReset ? ` Επαναφορά ${quotaReset}.` : ""}</small>
        </div>
      ) : null}

      <div className={styles.setupGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <span className={styles.eyebrow}>1 · Η φωτογραφία μου</span>
              <h2>{modelImage ? "Έτοιμη για δοκιμές" : "Πρόσθεσε φωτογραφία"}</h2>
            </div>
          </div>
          <div className={styles.photoPanelBody}>
            {photo}
            <div className={styles.photoCopy}>
              <p>Ιδανικά χρησιμοποίησε καθαρή ολόσωμη ή 3/4 φωτογραφία, με το σώμα ορατό και χωρίς έντονα εμπόδια.</p>
              {photoActions}
              <div className={styles.privacyNote}>
                Η αρχική φωτογραφία αποθηκεύεται μόνο στον browser αυτής της συσκευής. Αποστέλλεται προσωρινά στη FASHN μόνο όταν ζητάς πραγματική Try On δημιουργία και δεν αποθηκεύεται ως φωτογραφία προφίλ στο KONTA MOY.
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.panel} ${styles.autoPanel}`}>
          <div className={styles.autoCopy}>
            <span className={styles.eyebrow}>2 · Auto Try On</span>
            <h2>{autoEnabled ? "Αυτόματη δοκιμή ενεργή" : "Εσύ αποφασίζεις πότε"}</h2>
            <p>{autoEnabled
              ? "Όταν ανοίγεις συμβατό ρούχο και έχεις φωτογραφία, το KONTA MOY μπορεί να δημιουργεί αυτόματα την προεπισκόπηση."
              : "Τα συμβατά προϊόντα θα περιμένουν να πατήσεις εσύ «Δημιούργησε προεπισκόπηση»."}</p>
          </div>
          <button className={styles.toggle} type="button" aria-pressed={autoEnabled} disabled={!scope} onClick={toggleAuto}>
            Auto Try On: {autoEnabled ? "ON" : "OFF"}
          </button>
          <div className={styles.privacyNote}>
            Για οικονομία των 50 μηνιαίων δημιουργιών, απενεργοποίησε το Auto Try On όταν θέλεις απλώς να περιηγηθείς χωρίς νέα δημιουργία.
          </div>
        </article>
      </div>

      <section className={styles.savedSection} aria-labelledby="account-try-on-saved-title">
        <div className={styles.savedHead}>
          <div>
            <span className={styles.eyebrow}>3 · Saved looks</span>
            <h2 id="account-try-on-saved-title">Τα looks που κράτησες</h2>
            <p>Μόνο όσα αποθηκεύεις ρητά μένουν στον λογαριασμό σου.</p>
          </div>
          <Link className="button button-secondary" href="/account/saved">Όλα & σύγκριση</Link>
        </div>
        {saved.length ? (
          <div className={styles.savedGrid}>
            {saved.slice(0, 3).map((item) => (
              <Link className={styles.savedCard} href={`/product/${encodeURIComponent(item.productSlug)}`} key={item.id}>
                <img src={item.imageUrl} alt={`Try On Me · ${item.productTitle}`} loading="lazy" />
                <strong>{item.productTitle}</strong>
              </Link>
            ))}
          </div>
        ) : <p className={styles.status}>Δεν έχεις αποθηκεύσει Try On look ακόμη.</p>}
      </section>

      <div className={styles.footerCta}>
        <div>
          <strong>Η φωτογραφία είναι έτοιμη; Ξεκίνα να δοκιμάζεις.</strong>
          <p>Το Try On Me εμφανίζεται μόνο σε συμβατά ρούχα, όχι σε παπούτσια και αξεσουάρ.</p>
        </div>
        <Link className="button" href="/shop?category=fashion">Δοκίμασε ρούχα πάνω σου →</Link>
      </div>

      {!available ? <p className={styles.error}>Το Try On Me δεν είναι διαθέσιμο αυτή τη στιγμή.</p> : null}
      {loading ? <p className={styles.status}>Φόρτωση ρυθμίσεων…</p> : null}
      {status ? <p className={styles.status} role="status">{status}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
