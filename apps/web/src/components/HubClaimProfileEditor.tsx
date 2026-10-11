import Link from "next/link";
import type { HubClaimPublicProfile, HubClaimMediaItem } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";

/** One presentation for the actual CLAIM workspace and read-only Admin plan preview. */
export function HubClaimProfileEditor({
  profile, csrfToken, onSave, onUpload, media = [], preview = false
}: {
  profile: HubClaimPublicProfile;
  csrfToken?: string;
  onSave?: (formData: FormData) => Promise<void>;
  onUpload?: (formData: FormData) => Promise<void>;
  media?: readonly HubClaimMediaItem[];
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
    <div className={styles.mediaBox}>
      <h3>Λογότυπο & φωτογραφία καταστήματος</h3>
      <p>Ανέβασε JPEG, PNG ή WebP έως 3 MB. Οι εικόνες μένουν ιδιωτικές μέχρι να ολοκληρωθεί ο έλεγχος ασφάλειας, δικαιωμάτων και δημοσίευσης από το KONTA MOY. Το CLAIM περιλαμβάνει 1 λογότυπο και 1 φωτογραφία εξωφύλλου.</p>
      <form action={preview ? undefined : onUpload}>
        <fieldset disabled={preview} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {!preview && <input type="hidden" name="csrfToken" value={csrfToken ?? ""}/>}
          {!preview && <input type="hidden" name="claimId" value={profile.id}/>}
          <label className={styles.field}>Τύπος εικόνας
            <select name="role" defaultValue="logo"><option value="logo">Λογότυπο</option><option value="cover">Φωτογραφία εξωφύλλου</option></select>
          </label>
          <label className={styles.field}>Αρχείο εικόνας<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label>
          <label className={styles.field}>Περιγραφή εικόνας<input type="text" name="altText" maxLength={240} required placeholder="Πρόσοψη καταστήματος" /></label>
          <label className={styles.field}>Κάτοχος δικαιωμάτων<input type="text" name="rightsOwner" maxLength={200} required placeholder="Η επιχείρησή μου" /></label>
          <label className={styles.field}><span><input name="rightsConfirmed" type="checkbox" required /> Επιβεβαιώνω ότι έχω δικαίωμα χρήσης και δημόσιας προβολής αυτής της εικόνας.</span></label>
          <button className={styles.button + " " + styles.wide} type="submit" disabled={preview}>Υποβολή εικόνας για έγκριση</button>
        </fieldset>
      </form>
      {media.length > 0 ? <ul className={styles.mediaHistory}>
        {media.filter(item => item.claimId === profile.id).map(item => <li key={item.id}>
          <strong>{item.role === "logo" ? "Λογότυπο" : "Εξώφυλλο"} · {item.filename}</strong>
          {item.status === "published" ? "Δημοσιευμένο" : item.status === "rejected" ? "Απορρίφθηκε" : item.status === "archived" ? "Αντικαταστάθηκε" : "Σε έλεγχο"}
          {" · scan: "}{item.scanStatus}
        </li>)}
      </ul> : <p className={styles.hint}>Δεν υπάρχουν ακόμη φωτογραφίες προς έγκριση.</p>}
    </div>
    <div className={styles.actions}>
      {preview
        ? <><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δημόσια σελίδα ↗</span><span className={styles.button + " " + styles.secondary} aria-disabled="true">Δες περισσότερα προγράμματα</span></>
        : <><Link className={styles.button + " " + styles.secondary} href={"/hubs/" + profile.hubSlug + "/business/" + profile.id}>Δημόσια σελίδα ↗</Link><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Δες περισσότερα προγράμματα</Link></>}
    </div>
  </section>;
}
