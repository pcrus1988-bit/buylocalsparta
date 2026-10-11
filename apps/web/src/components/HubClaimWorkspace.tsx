import Link from "next/link";
import { HubClaimProfileEditor } from "./HubClaimProfileEditor";
import { HubClaimPublicContent } from "./HubClaimPublicContent";
import type { HubClaimMedia } from "../lib/hub-claim-media-runtime";
import type { HubClaimPublicProfile } from "../lib/hub-claim-runtime";
import { hubClaimPublicPath } from "../lib/hub-claim-public-url";
import styles from "../app/hubs/claim/claim.module.css";

type Props = {
  profiles: readonly HubClaimPublicProfile[];
  csrfToken?: string;
  onSave?: (formData: FormData) => Promise<void>;
  media?: readonly HubClaimMedia[];
  preview?: boolean;
  unpublished?: boolean;
};

/** Render exactly the same CLAIM workspace in the owner dashboard and Admin View-as-Vendor. */
export function HubClaimWorkspace({ profiles, csrfToken, onSave, media = [], preview = false, unpublished = false }: Props) {
  return <section className="shell" aria-label="CLAIM vendor workspace">
    <div className={styles.hero}>
      <div className={styles.kicker}>KONTA MOY · CLAIM Vendor Dashboard</div>
      <h2 className={styles.workspaceTitle}>Το δωρεάν CLAIM σου.</h2>
      <p className={styles.lead}>Διαχειρίσου την παρουσία της επιχείρησής σου στο τοπικό HUB. Χωρίς χρέωση, παραγγελίες, εισπράξεις ή κατάλογο προϊόντων.</p>
      <nav className={styles.workspaceNav} aria-label="Ενότητες CLAIM">
        <a href="#claim-profile">Επεξεργασία καταχώρισης</a>
        <a href="#claim-public-view">Προεπισκόπηση δημόσιας σελίδας</a>
        {preview
          ? <span aria-disabled="true">Αναβάθμιση προγράμματος</span>
          : <Link href="/hubs/join">Αναβάθμιση προγράμματος</Link>}
      </nav>
      {preview && <p className={styles.previewNotice}>Admin View-as-Vendor · Μόνο ανάγνωση. Δεν αποθηκεύονται αλλαγές ούτε δημιουργείται λογαριασμός.</p>}
    </div>
    {profiles.map(profile => {
      const ownedMedia = media.filter(item => item.claimId === profile.id || (!item.claimId && profiles.length === 1));
      return <div key={profile.id} className={styles.dashboardGrid}>
        <div id="claim-profile">
          <HubClaimProfileEditor profile={profile} csrfToken={csrfToken} onSave={onSave} preview={preview} media={ownedMedia} />
        </div>
        <section id="claim-public-view" className={styles.publicPreview} aria-label="Actual public CLAIM page preview">
          <div className={styles.previewHeading}>
            <div>
              <div className={styles.kicker}>Δημόσια καταχώριση · το πραγματικό UI</div>
              <h2>Έτσι εμφανίζεται η καταχώρισή σου</h2>
            </div>
            {preview || unpublished
              ? <span className={styles.hint}>Προεπισκόπηση · χωρίς δημοσίευση</span>
              : <Link className={styles.button} href={hubClaimPublicPath(profile)} target="_blank">Άνοιγμα δημόσιας σελίδας ↗</Link>}
          </div>
          <HubClaimPublicContent profile={profile} media={ownedMedia} preview unpublished={unpublished} />
        </section>
      </div>;
    })}
    <p className={styles.footer}>Η επαληθευμένη νομική ταυτότητα και η διεύθυνση ΓΕΜΗ παραμένουν προστατευμένες. Αλλαγές μόνο μετά από νέο έλεγχο στο info@kontamou.site.</p>
  </section>;
}
