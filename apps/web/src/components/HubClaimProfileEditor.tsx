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
    <div className={styles.hint}>Επεξεργάσου την καταχώριση και τη σύντομη παρουσίαση που θα βλέπουν οι επισκέπτες. Η δημόσια διεύθυνση και τα στοιχεία ταυτοποίησης προστατεύονται με έλεγχο.</div>
    <form action={preview ? undefined : onSave}>
      <fieldset disabled={preview} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {!preview && <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />}
        {!preview && <input name="claimId" type="hidden" value={profile.id} />}
        <p className={styles.details}><strong>Επαληθευμένη ονομασία:</strong> {profile.businessName}. Για αλλαγή επωνυμίας απαιτείται νέος έλεγχος από την ομάδα.</p>
        <label className={styles.field}>Κατηγορία<input name="category" defaultValue={profile.category} required minLength={2} maxLength={100}/></label>
        <label className={styles.field}>Τηλέφωνο επικοινωνίας<input name="phone" type="tel" defaultValue={profile.phone} required minLength={8} maxLength={32}/></label>
        <label className={styles.field}>Σύντομη παρουσίαση της επιχείρησης<textarea name="description" defaultValue={profile.description ?? ""} rows={4} maxLength={750} placeholder="Τι κάνει την επιχείρησή σου ξεχωριστή; Υπηρεσίες, εξειδίκευση και τοπική παρουσία."/></label>
        <label className={styles.field}>Ωράριο λειτουργίας<textarea name="openingHours" defaultValue={profile.openingHours ?? ""} rows={3} maxLength={500} placeholder="Δευ–Παρ 09:00–17:00, Σάββατο 09:00–14:00"/></label>
        <label className={styles.field}>Δημόσιο email επικοινωνίας (προαιρετικά)<input name="publicEmail" type="email" defaultValue={profile.publicEmail ?? ""} maxLength={160} placeholder="info@business.gr"/></label>
        <p className={styles.hint}>Το email αίτησης παραμένει ιδιωτικό. Μόνο το email που συμπληρώνεις εδώ δημοσιεύεται.</p>
        <label className={styles.field}>Instagram επιχείρησης (προαιρετικά)<input name="instagramUrl" type="url" defaultValue={profile.instagramUrl ?? ""} maxLength={240} placeholder="https://www.instagram.com/yourbusiness/"/></label>
        <label className={styles.field}>Ιστοσελίδα (προαιρετικά)<input name="website" type="url" defaultValue={profile.website ?? ""} maxLength={240} placeholder="https://"/></label>
        <label className={styles.field}><span><input name="websiteEmbedEnabled" type="checkbox" defaultChecked={profile.websiteEmbedEnabled} /> Εμφάνιση της ιστοσελίδας μέσα στη δημόσια σελίδα CLAIM (iframe)</span></label>
        <p className={styles.hint}>Η ενσωμάτωση είναι προαιρετική και αρχικά κλειστή. Απαιτεί HTTPS. Ο επισκέπτης επιλέγει αν θα φορτώσει την εξωτερική ιστοσελίδα. Ορισμένοι ιστότοποι δεν επιτρέπουν iframe και ανοίγουν μόνο σε νέα καρτέλα.</p>
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
