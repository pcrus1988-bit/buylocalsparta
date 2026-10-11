"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { HubClaimMedia } from "../lib/hub-claim-media-runtime";
import styles from "../app/hubs/claim/claim.module.css";

const LABELS = { logo: "Λογότυπο", storefront: "Φωτογραφία καταστήματος", gallery: "Συλλογή φωτογραφιών" };

async function preparePhoto(file: File): Promise<File> {
  if (file.size <= 3_500_000) return file;
  if (typeof createImageBitmap !== "function") throw new Error("Η εικόνα είναι μεγάλη. Μείωσε το μέγεθός της.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Δεν ήταν δυνατή η προετοιμασία εικόνας.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.78));
    if (!blob || blob.size > 3_500_000) throw new Error("Δοκίμασε εικόνα μικρότερης ανάλυσης.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } finally { image.close(); }
}

export function HubClaimMediaUploader({
  claimId, csrfToken, preview = false, media = []
}: {
  claimId: string; csrfToken?: string; preview?: boolean; media?: readonly HubClaimMedia[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    const formEl = event.currentTarget;
    setPending(true); setError(""); setMessage("");
    try {
      const form = new FormData(formEl);
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new Error("Επίλεξε εικόνα.");
      const prepared = await preparePhoto(file);
      if (prepared.size > 4 * 1024 * 1024) throw new Error("Η εικόνα υπερβαίνει τα 4 MB.");
      form.set("file", prepared);
      form.set("claimId", claimId);
      const response = await fetch("/api/hubs/claim/media", {
        method: "POST", headers: { "x-csrf-token": csrfToken ?? "" }, body: form
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Αποτυχία αποστολής");
      formEl.reset();
      setMessage("Η εικόνα αποθηκεύτηκε ιδιωτικά και αναμένει έγκριση από την ομάδα.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Αποτυχία αποστολής");
    } finally { setPending(false); }
  }

  return <section className={styles.mediaSection}>
    <h3>Λογότυπο και φωτογραφίες</h3>
    <p className={styles.hint}>Ανέβασε λογότυπο, φωτογραφία της επιχείρησης ή εικόνες χώρου. JPEG, PNG, WebP, έως 4 MB ανά αρχείο. Η δημοσίευση γίνεται μόνο μετά από έγκριση.</p>
    <form onSubmit={onSubmit}>
      <fieldset disabled={preview || pending} className={styles.mediaFieldset}>
        <label className={styles.field}>Τύπος εικόνας
          <select name="role" required defaultValue="storefront">
            <option value="storefront">Κύρια φωτογραφία επιχείρησης</option>
            <option value="logo">Λογότυπο</option>
            <option value="gallery">Συλλογή φωτογραφιών</option>
          </select>
        </label>
        <label className={styles.field}>Εικόνα<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <label className={styles.field}>Περιγραφή εικόνας<input name="altText" maxLength={240} minLength={2} required placeholder="π.χ. Η πρόσοψη του καταστήματος" /></label>
        <label className={styles.field}>Κάτοχος δικαιωμάτων<input name="rightsOwner" maxLength={200} minLength={2} required placeholder="Επιχείρηση ή φωτογράφος" /></label>
        <button type="submit" className={styles.button + " " + styles.wide}>{pending ? "Αποστολή…" : "Υποβολή εικόνας για έλεγχο"}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.mediaError}>{error}</p>}
    {message && <p role="status" className={styles.hint}>{message}</p>}
    {!!media.length && <div className={styles.mediaList}>
      {media.map(item => <div key={item.id} className={styles.mediaItem}>
        <strong>{LABELS[item.role]}</strong> · {item.altText}
        <span>{item.status === "approved" ? "Δημοσιευμένη" : item.status === "pending" ? "Σε έλεγχο" : "Δεν εγκρίθηκε"}</span>
        {item.reason && <small>{item.reason}</small>}
        {item.status === "approved" && <img src={"/api/hubs/claim/media/" + encodeURIComponent(item.id)} alt={item.altText} loading="lazy" />}
      </div>)}
    </div>}
  </section>;
}
