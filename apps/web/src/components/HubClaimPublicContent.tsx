import Link from "next/link";
import { VendorExternalWebsiteFrame } from "./VendorExternalWebsiteFrame";
import type { HubClaimPublicProfile } from "../lib/hub-claim-runtime";
import type { HubClaimMedia } from "../lib/hub-claim-media-runtime";
import styles from "../app/hubs/claim/claim.module.css";

/** Single public listing renderer, used by the real HUB page and the CLAIM dashboard preview. */
export function HubClaimPublicContent({
  profile, media = [], preview = false, unpublished = false
}: {
  profile: HubClaimPublicProfile;
  media?: readonly HubClaimMedia[];
  preview?: boolean;
  unpublished?: boolean;
}) {
  // Even in an Admin preview, never expose unapproved uploads through the public media URL.
  const published = media.filter(photo => photo.status === "approved");
  const logo = published.find(photo => photo.role === "logo");
  const cover = published.find(photo => photo.role === "storefront");
  const gallery = published.filter(photo => photo.role === "gallery");
  const mediaUrl = (id: string) => "/api/hubs/claim/media/" + encodeURIComponent(id);

  return <>
    <div className={styles.hero}>
      <div className={styles.kicker}>KONTA MOY · HUB {profile.hubCity}</div>
      {logo && <img className={styles.publicLogo} src={mediaUrl(logo.id)} alt={logo.altText} />}
      <h1 className={styles.title}>{profile.businessName}</h1>
      <p className={styles.lead}>{profile.category} · {profile.hubCity}, {profile.hubRegion}</p>
    </div>
    {cover && <img className={styles.publicCover} src={mediaUrl(cover.id)} alt={cover.altText} />}
    <div className={styles.grid}>
      <article className={styles.panel}>
        <h2>Στοιχεία επιχείρησης</h2>
        <p className={styles.details}><strong>Κατηγορία:</strong> {profile.category}</p>
        <p className={styles.details}><strong>Περιοχή:</strong> {profile.hubCity} · {profile.postcode}</p>
        <p className={styles.details}><strong>Διεύθυνση:</strong> {profile.address}</p>
        <p className={styles.details}><strong>Τηλέφωνο:</strong> {profile.phone}</p>
        {profile.description && <div className={styles.details}><h3>Σχετικά με την επιχείρηση</h3><p style={{ whiteSpace: "pre-wrap" }}>{profile.description}</p></div>}
        {profile.openingHours && <div className={styles.details}><h3>Ωράριο λειτουργίας</h3><p style={{ whiteSpace: "pre-wrap" }}>{profile.openingHours}</p></div>}
        {profile.instagramUrl && <p className={styles.details}><a href={profile.instagramUrl} target="_blank" rel="noopener noreferrer nofollow">Instagram ↗</a></p>}
        {profile.facebookUrl && <p className={styles.details}><a href={profile.facebookUrl} target="_blank" rel="noopener noreferrer nofollow">Facebook ↗</a></p>}
        {profile.website && <p className={styles.details}><a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">Ιστοσελίδα επιχείρησης ↗</a></p>}
      </article>
      <aside className={styles.panel}>
        <h2>{unpublished ? "Προεπισκόπηση πριν την ενεργοποίηση" : "Επαληθευμένη παρουσία"}</h2>
        <p className={styles.hint}>{unpublished
          ? "Προτεινόμενη εμφάνιση εφόσον ολοκληρωθεί η επαλήθευση και η ενεργοποίηση CLAIM. Η καταχώριση δεν είναι δημοσιευμένη."
          : "Η επιχείρηση έχει επιβεβαιώσει τη δωρεάν παρουσία της στο KONTA MOY. Πρόκειται για καταχώριση καταλόγου, όχι για ενεργό ηλεκτρονικό κατάστημα ή δυνατότητα αγοράς."}</p>
        <div className={styles.actions}>{preview
          ? <span className={styles.button + " " + styles.secondary} aria-disabled="true">Γνώρισε το KONTA MOY HUB</span>
          : <Link className={styles.button + " " + styles.secondary} href="/hubs/join">Γνώρισε το KONTA MOY HUB</Link>}</div>
      </aside>
    </div>
    {gallery.length > 0 && <section className={styles.panel} style={{ marginTop: 20 }} aria-label="Φωτογραφίες επιχείρησης">
      <h2>Φωτογραφίες επιχείρησης</h2>
      <div className={styles.publicGallery}>{gallery.map(photo =>
        <img key={photo.id} src={mediaUrl(photo.id)} alt={photo.altText} loading="lazy" />
      )}</div>
    </section>}
    {profile.websiteEmbedEnabled && profile.website && <section className={styles.panel} style={{ marginTop: 20 }} aria-labelledby="claim-website-title">
      <h2 id="claim-website-title">Ιστοσελίδα επιχείρησης</h2>
      <VendorExternalWebsiteFrame url={profile.website} vendorName={profile.businessName} />
    </section>}
  </>;
}
