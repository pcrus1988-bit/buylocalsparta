import Link from "next/link";
import { HubClaimProfileEditor } from "./HubClaimProfileEditor";
import { HubClaimPublicContent } from "./HubClaimPublicContent";
import type { HubClaimPublicProfile, HubClaimMediaItem } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";

type Props = {
  profiles: readonly HubClaimPublicProfile[];
  csrfToken?: string;
  onSave?: (formData: FormData) => Promise<void>;
  onUpload?: (formData: FormData) => Promise<void>;
  media?: readonly HubClaimMediaItem[];
  preview?: boolean;
};

/** The same tools and layout for real CLAIM owners and admin View-as-Vendor. */
export function HubClaimWorkspace({ profiles, csrfToken, onSave, onUpload, media = [], preview = false }: Props) {
  return <section className="shell">
    <div className={styles.hero}>
      <div className={styles.kicker}>KONTA MOY · CLAIM Vendor Dashboard</div>
      <h1 className={styles.title}>Το δωρεάν CLAIM σου.</h1>
      <p className={styles.lead}>Διαχειρίσου την παρουσία της επιχείρησής σου στο τοπικό HUB. Χωρίς χρέωση, παραγγελίες, εισπράξεις ή κατάλογο προϊόντων.</p>
      <nav className={styles.workspaceNav} aria-label="Ενότητες CLAIM">
        <a href="#claim-profile">Επεξεργασία καταχώρισης</a>
        <a href="#claim-public-view">Προεπισκόπηση δημόσιας σελίδας</a>
        <Link href="/hubs/join">Αναβάθμιση προγράμματος</Link>
      </nav>
    </div>
    <div className={styles.dashboardGrid}>
      {profiles.map(profile => <div key={profile.id}>
        <div id="claim-profile"><HubClaimProfileEditor profile={profile} preview={preview} csrfToken={csrfToken} onSave={onSave} onUpload={onUpload} media={media} /></div>
        <div className={styles.publicPreview} id="claim-public-view">
          <div className={styles.previewHeading}>
            <div><span className={styles.kicker}>Δημόσια σελίδα · ίδιο UI με τον πραγματικό ιστότοπο</span>
              <h2>Έτσι εμφανίζεται η καταχώρισή σου</h2>
            </div>
            {preview
              ? <span className={styles.hint}>Admin preview · χωρίς δημοσίευση</span>
              : <Link className={styles.button} href={"/hubs/" + profile.hubSlug + "/business/" + profile.id} target="_blank">Άνοιγμα δημόσιας σελίδας ↗</Link>}
          </div>
          <HubClaimPublicContent profile={profile} />
        </div>
      </div>)}
    </div>
    <p className={styles.footer}>Τα στοιχεία ΓΕΜΗ και η διεύθυνση αλλάζουν μόνο μετά από νέο έλεγχο. Για διόρθωση ή αλλαγή εκπροσώπου επικοινώνησε με info@kontamou.site.</p>
  </section>;
}
