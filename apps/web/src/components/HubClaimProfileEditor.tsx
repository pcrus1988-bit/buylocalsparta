import Link from "next/link";
import type { HubClaimPublicProfile } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";

/** One presentation for the actual CLAIM workspace and read-only Admin plan preview. */
export function HubClaimProfileEditor({
  profile, csrfToken, onSave, preview = false
}: {
  profile: HubClaimPublicProfile;
  csrfToken?: string;
  onSave?: (formData: FormData) => Promise<void>;
  preview?: boolean;
}) {
  return <section className={styles.panel}>
    <h2>{profile.businessName}</h2>
    <p className={styles.hint}>CLAIM {preview ? "· Προεπισκόπηση" : "ενεργό"} · €0 · HUB {profile.hubCity}. Η ταυτότητα και η διεύθυνση ΓΕΜΗ αλλάζουν μόνο μετά από νέο έλεγχο της ομάδας.</p>
    <form action={preview ? undefined : onSave}>
      <fieldset disabled={preview} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {!preview && <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />}
        {!preview && <input name="claimId" type="hidden" value={profile.id} />}
        <p className={styles.details}><strong>Επαληθευμένη ονομασία:</strong> {profile.businessName}. Για αλλαγή επωνυμίας απαιτείται νέος έλεγχος από την ομάδα.</p>
        <p className={styles.details}><strong>Επαληθευμένη διεύθυνση:</strong> {profile.address}, {profile.postcode} · {profile.hubCity}</p>
        <label className={styles.field}>Κατηγορία<input name="category" defaultValue={profile.category} required minLength={2} maxLength={100}/></label>
        <label className={styles.field}>Περιγραφή επιχείρησης<textarea name="description" defaultValue={profile.description ?? ""} maxLength={1200} rows={5} placeholder="Πες λίγα λόγια για την επιχείρηση, τις υπηρεσίες και τους ανθρώπους της"/></label>
        <label className={styles.field}>Ωράριο λειτουργίας<textarea name="openingHours" defaultValue={profile.openingHours ?? ""} maxLength={700} rows={4} placeholder={"Δευτέρα – Παρασκευή 09:00–18:00\nΣάββατο 09:00–14:00"}/></label>
        <label className={styles.field}>Τηλέφωνο επικοινωνίας<input name="phone" type="tel" defaultValue={profile.phone} required minLength={8} maxLength={32}/></label>
        <label className={styles.field}>Ιστοσελίδα (HTTPS)<input name="website" type="url" defaultValue={profile.website ?? ""} maxLength={240} placeholder="https://"/></label>
        <label className={styles.field}>Instagram<input name="instagramUrl" type="url" defaultValue={profile.instagramUrl ?? ""} maxLength={240} placeholder="https://instagram.com/"/></label>
        <label className={styles.field}>Facebook<input name="facebookUrl" type="url" defaultValue={profile.facebookUrl ?? ""} maxLength={240} placeholder="https://facebook.com/"/></label>
        <label className={styles.field}><span><input name="iframeEnabled" type="checkbox" defaultChecked={Boolean(profile.iframeEnabled)} disabled={preview}/> Προαιρετική προβολή της ιστοσελίδας εντός KONTA MOY (iframe)</span></label>
        <p className={styles.hint}>Η προβολή iframe ξεκινά μόνο όταν ο επισκέπτης τη ζητήσει. Η ιστοσελίδα πρέπει να επιτρέπει ενσωμάτωση. Απαιτείται δημόσια διεύθυνση HTTPS.</p>
        <button className={styles.button + " " + styles.wide} type="submit" disabled={preview}>Αποθήκευση αλλαγών</button>
      </fieldset>
    </form>
    <div className={styles.actions}>
      {preview
        ? <><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δημόσια σελίδα ↗</span><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δες περισσότερα προγράμματα</span></>
        : <><Link className={styles.button + " " + styles.secondary} href={"/hubs/" + profile.hubSlug + "/business/" + profile.id}>Δημόσια σελίδα ↗</Link><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Δες περισσότερα προγράμματα</Link></>}
    </div>
  </section>;
}
