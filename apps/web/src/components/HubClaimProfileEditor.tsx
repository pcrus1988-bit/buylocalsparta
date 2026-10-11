import Link from "next/link";
import { HubClaimMediaUploader } from "./HubClaimMediaUploader";
import type { HubClaimMedia } from "../lib/hub-claim-media-runtime";
import type { HubClaimPublicProfile } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";

/** One presentation for the actual CLAIM workspace and read-only Admin plan preview. */
export function HubClaimProfileEditor({
  profile, csrfToken, onSave, preview = false, media = []
}: {
  profile: HubClaimPublicProfile;
  csrfToken?: string;
  onSave?: (formData: FormData) => Promise<void>;
  preview?: boolean;
  media?: readonly HubClaimMedia[];
}) {
  return <section className={styles.panel}>
    <h2>{profile.businessName}</h2>
    <p className={styles.hint}>CLAIM {preview ? "· Προεπισκόπηση" : "ενεργό"} · €0 · HUB {profile.hubCity}. Η ταυτότητα και η διεύθυνση ΓΕΜΗ αλλάζουν μόνο μετά από νέο έλεγχο της ομάδας.</p>
    <form action={preview ? undefined : onSave}>
      <fieldset disabled={preview} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {!preview && <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />}
        {!preview && <input name="claimId" type="hidden" value={profile.id} />}
        <p className={styles.details}><strong>Επαληθευμένη ονομασία:</strong> {profile.businessName}. Για αλλαγή επωνυμίας απαιτείται νέος έλεγχος από την ομάδα.</p>
        <label className={styles.field}>Κατηγορία<input name="category" defaultValue={profile.category} required minLength={2} maxLength={100}/></label>
        <label className={styles.field}>Περιγραφή επιχείρησης<textarea name="description" defaultValue={profile.description} maxLength={1200} rows={5} placeholder="Ποιοι είστε, τι προσφέρετε και τι σας ξεχωρίζει;"/></label>
        <label className={styles.field}>Ωράριο λειτουργίας<textarea name="openingHours" defaultValue={profile.openingHours} maxLength={700} rows={4} placeholder="Δευτέρα–Παρασκευή 09:00–17:00"/></label>
        <label className={styles.field}>Instagram<input name="instagramUrl" type="url" defaultValue={profile.instagramUrl ?? ""} maxLength={240} placeholder="https://www.instagram.com/..."/></label>
        <label className={styles.field}>Facebook<input name="facebookUrl" type="url" defaultValue={profile.facebookUrl ?? ""} maxLength={240} placeholder="https://www.facebook.com/..."/></label>
        <label className={styles.field}>Τηλέφωνο επικοινωνίας<input name="phone" type="tel" defaultValue={profile.phone} required minLength={8} maxLength={32}/></label>
        <label className={styles.field}>Ιστοσελίδα (προαιρετικά)<input name="website" type="url" defaultValue={profile.website ?? ""} maxLength={240} placeholder="https://"/></label>
        <label className={styles.field}><span><input name="websiteEmbedEnabled" type="checkbox" defaultChecked={profile.websiteEmbedEnabled} /> Εμφάνιση της ιστοσελίδας μέσα στη δημόσια σελίδα CLAIM (iframe)</span></label>
        <p className={styles.hint}>Η ενσωμάτωση είναι προαιρετική και αρχικά κλειστή. Απαιτεί HTTPS. Ο επισκέπτης επιλέγει αν θα φορτώσει την εξωτερική ιστοσελίδα. Ορισμένοι ιστότοποι δεν επιτρέπουν iframe και ανοίγουν μόνο σε νέα καρτέλα.</p>
        <button className={styles.button + " " + styles.wide} type="submit" disabled={preview}>Αποθήκευση αλλαγών</button>
      </fieldset>
    </form>
    <HubClaimMediaUploader claimId={profile.id} csrfToken={csrfToken} preview={preview} media={media} />
    <div className={styles.actions}>
      {preview
        ? <><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δημόσια σελίδα ↗</span><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δες περισσότερα προγράμματα</span></>
        : <><Link className={styles.button + " " + styles.secondary} href={"/hubs/" + profile.hubSlug + "/business/" + profile.id}>Δημόσια σελίδα ↗</Link><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Δες περισσότερα προγράμματα</Link></>}
    </div>
  </section>;
}
