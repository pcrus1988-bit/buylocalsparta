import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../../components/SiteHeader";
import { SiteFooter } from "../../../components/SiteFooter";
import { listPublicHubClaims } from "../../../lib/hub-claim-runtime";
import { listVerifiedHubPartners } from "../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../lib/hub-claim-public-url";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import styles from "../claim/claim.module.css";

// The directory reads live CLAIM records; never prerender it without a database.
export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/hubs/businesses", {
    title: "Επαληθευμένες επιχειρήσεις HUB · KONTA MOY",
    description: "Γνώρισε τις επαληθευμένες επιχειρήσεις με ενεργοποιημένη παρουσία στα KONTA MOY HUB."
  });
}

export default async function HubClaimDirectoryPage() {
  const [businesses, partners] = await Promise.all([
    listPublicHubClaims(100), listVerifiedHubPartners(100)
  ]);
  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB directory</div>
        <h1 className={styles.title}>Οι επιχειρήσεις των HUB.</h1>
        <p className={styles.lead}>Επαληθευμένες καταχωρίσεις CLAIM και ενεργοί συνεργάτες των προγραμμάτων HUB. Η παρουσία στον κατάλογο δεν συνεπάγεται ηλεκτρονικές πωλήσεις.</p>
      </div>
      {businesses.length === 0 && partners.length === 0 ? <section className={styles.panel}>
        <h2>Οι πρώτες καταχωρίσεις έρχονται σύντομα.</h2>
        <p>Δημοσιεύουμε μόνο μετά από έλεγχο της ομάδας και επιβεβαίωση από την ίδια την επιχείρηση.</p>
        <Link className={styles.button} href="/hubs/join">Δωρεάν καταχώριση CLAIM</Link>
      </section> : <div className={styles.grid}>
        {partners.map(partner => <article key={partner.id} className={styles.panel}>
          <div className={styles.kicker}>Επαληθευμένος συνεργάτης · HUB {partner.hubCity}</div>
          <h2>{partner.businessName}</h2>
          <p className={styles.details}>{partner.category}</p>
          <Link className={styles.button} href={partner.publicPath}>Προφίλ επιχείρησης →</Link>
        </article>)}
        {businesses.map(business =>
        <article key={business.id} className={styles.panel}>
          <div className={styles.kicker}>HUB {business.hubCity}</div>
          <h2>{business.businessName}</h2>
          <p className={styles.details}>{business.category} · {business.hubRegion}</p>
          <Link className={styles.button} href={hubClaimPublicPath(business)}>Δες την επιχείρηση →</Link>
        </article>
      )}</div>}
      <p className={styles.footer}>Προβάλλονται έως 100 πρόσφατες καταχωρίσεις ανά τύπο συμμετοχής. Εκκρεμείς αιτήσεις, μη ενεργοί και δοκιμαστικοί προμηθευτές δεν εμφανίζονται.</p>
    </section>
    <SiteFooter />
  </main>;
}
