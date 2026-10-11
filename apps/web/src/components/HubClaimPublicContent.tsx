import Link from "next/link";
import { VendorExternalWebsiteFrame } from "./VendorExternalWebsiteFrame";
import type { HubClaimPublicProfile } from "../lib/hub-claim-runtime";
import styles from "../app/hubs/claim/claim.module.css";

/** Exactly the same public CLAIM content is used by the live storefront and admin preview. */
export function HubClaimPublicContent({ profile }: { profile: HubClaimPublicProfile }) {
  return <>
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {profile.hubCity}</div>
        <h1 className={styles.title}>{profile.businessName}</h1>
        <p className={styles.lead}>{profile.category} · {profile.hubCity}, {profile.hubRegion}</p>
        {profile.description && <p className={styles.description}>{profile.description}</p>}
      </div>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <h2>Στοιχεία επιχείρησης</h2>
          <p className={styles.details}><strong>Κατηγορία:</strong> {profile.category}</p>
          <p className={styles.details}><strong>Περιοχή:</strong> {profile.hubCity} · {profile.postcode}</p>
          <p className={styles.details}><strong>Διεύθυνση:</strong> {profile.address}</p>
          <p className={styles.details}><strong>Τηλέφωνο:</strong> <a href={"tel:" + profile.phone.replace(/[^+0-9]/g, "")}>{profile.phone}</a></p>
          {profile.publicEmail && <p className={styles.details}><strong>Email:</strong> <a href={"mailto:" + profile.publicEmail}>{profile.publicEmail}</a></p>}
          {profile.openingHours && <div className={styles.hours}><strong>Ωράριο λειτουργίας:</strong><p>{profile.openingHours}</p></div>}
          {profile.instagramUrl && <p className={styles.details}><a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer nofollow">Instagram ↗</a></p>}
          {profile.website && <p className={styles.details}><a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">Ιστοσελίδα επιχείρησης ↗</a></p>}
        </article>
        <aside className={styles.panel}>
          <h2>Επαληθευμένη παρουσία</h2>
          <p className={styles.hint}>Η επιχείρηση έχει επιβεβαιώσει τη δωρεάν παρουσία της στο KONTA MOY. Πρόκειται για καταχώριση καταλόγου, όχι για ενεργό ηλεκτρονικό κατάστημα ή δυνατότητα αγοράς.</p>
          <div className={styles.actions}><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Γνώρισε το KONTA MOY HUB</Link></div>
        </aside>
      </div>
      {profile.websiteEmbedEnabled && profile.website && <section className={styles.panel} style={{ marginTop: 20 }} aria-labelledby="claim-website-title">
        <h2 id="claim-website-title">Ιστοσελίδα επιχείρησης</h2>
        <VendorExternalWebsiteFrame url={profile.website} vendorName={profile.businessName} />
      </section>}
    </section>
  </>;
}
