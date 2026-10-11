import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { getPublicHubClaim } from "../../../../../lib/hub-claim-runtime";
import styles from "../../../claim/claim.module.css";

type Params = { params: Promise<{ hubSlug: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) return { title: "Καταχώριση μη διαθέσιμη · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = "/hubs/" + hubSlug + "/business/" + id;
  const description = profile.businessName + " · " + profile.category + " στο KONTA MOY HUB " + profile.hubCity + ". Επαληθευμένη δωρεάν καταχώριση επιχείρησης.";
  return {
    title: profile.businessName + " · HUB " + profile.hubCity + " · KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: { title: profile.businessName + " · KONTA MOY", description, url: canonical, type: "website" }
  };
}

export default async function PublicHubClaimPage({ params }: Params) {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (!profile) notFound();

  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {profile.hubCity}</div>
        <h1 className={styles.title}>{profile.businessName}</h1>
        <p className={styles.lead}>{profile.category} · {profile.hubCity}, {profile.hubRegion}</p>
      </div>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <h2>Στοιχεία επιχείρησης</h2>
          <p className={styles.details}><strong>Κατηγορία:</strong> {profile.category}</p>
          <p className={styles.details}><strong>Περιοχή:</strong> {profile.hubCity} · {profile.postcode}</p>
          <p className={styles.details}><strong>Διεύθυνση:</strong> {profile.address}</p>
          <p className={styles.details}><strong>Τηλέφωνο:</strong> {profile.phone}</p>
          {profile.website && <p className={styles.details}><a href={profile.website} target="_blank" rel="noopener noreferrer nofollow">Ιστοσελίδα επιχείρησης ↗</a></p>}
        </article>
        <aside className={styles.panel}>
          <h2>Επαληθευμένη παρουσία</h2>
          <p className={styles.hint}>Η επιχείρηση έχει επιβεβαιώσει τη δωρεάν παρουσία της στο KONTA MOY. Πρόκειται για καταχώριση καταλόγου, όχι για ενεργό ηλεκτρονικό κατάστημα ή δυνατότητα αγοράς.</p>
          <div className={styles.actions}><Link className={styles.button + " " + styles.secondary} href="/hubs/join">Γνώρισε το KONTA MOY HUB</Link></div>
        </aside>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
