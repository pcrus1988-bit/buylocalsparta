import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { SiteFooter } from "../../../components/SiteFooter";
import { getExpansionHubBySlug } from "../../../lib/expansion-hubs";
import { listPublicHubClaimsByHub } from "../../../lib/hub-claim-runtime";
import { hubClaimPublicPath } from "../../../lib/hub-claim-public-url";
import styles from "../claim/claim.module.css";

type Props = { params: Promise<{ hubSlug: string }> };

// A city becomes indexable only after a real, owner-claimed public listing exists.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) return { title: "HUB δεν βρέθηκε · KONTA MOY", robots: { index: false, follow: false } };
  const hasListings = (await listPublicHubClaimsByHub(hubSlug, 1)).length > 0;
  const canonical = `/hubs/${hub.slug}`;
  const description = `Γνώρισε επαληθευμένες επιχειρήσεις στο KONTA MOY HUB ${hub.nameEl}. Τοπική παρουσία επιχειρήσεων, χωρίς απαραίτητα ενεργές ηλεκτρονικές αγορές.`;
  return {
    title: `HUB ${hub.nameEl} · Τοπικές επιχειρήσεις · KONTA MOY`,
    description,
    alternates: { canonical },
    robots: { index: hasListings, follow: true },
    openGraph: { title: `KONTA MOY HUB ${hub.nameEl}`, description, url: canonical, type: "website" }
  };
}

export default async function PublicCityHubPage({ params }: Props) {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) notFound();

  const businesses = await listPublicHubClaimsByHub(hubSlug, 100);

  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {hub.nameEl}</div>
        <h1 className={styles.title}>Οι επιχειρήσεις του {hub.nameEl === "Βόλος" ? "Βόλου" : `HUB ${hub.nameEl}`}.</h1>
        <p className={styles.lead}>Ανακάλυψε επαληθευμένες τοπικές επιχειρήσεις. Η ενεργή παρουσία σε ένα HUB δεν σημαίνει απαραίτητα ότι υποστηρίζονται ήδη online παραγγελίες και πληρωμές.</p>
        <div className={styles.actions}>
          <Link className={styles.button} href="/hubs/businesses">Όλες οι επιχειρήσεις HUB</Link>
          <Link className={`${styles.button} ${styles.secondary}`} href="/hubs/join">Καταχώρισε την επιχείρησή σου</Link>
        </div>
      </div>
      {businesses.length > 0 ? <>
        <p className={styles.details}>Ενεργός κατάλογος · {businesses.length}{businesses.length === 100 ? "+" : ""} επαληθευμένες καταχωρίσεις</p>
        <div className={styles.grid}>{businesses.map((business) =>
          <article key={business.id} className={styles.panel}>
            <div className={styles.kicker}>HUB {business.hubCity}</div>
            <h2>{business.businessName}</h2>
            <p className={styles.details}>{business.category} · {business.hubRegion}</p>
            <Link className={styles.button} href={hubClaimPublicPath(business)}>Δες την επιχείρηση →</Link>
          </article>
        )}</div>
      </> : <section className={styles.panel}>
        <h2>Οι πρώτες επιχειρήσεις έρχονται σύντομα.</h2>
        <p>Το HUB έχει σχεδιαστεί για την περιοχή, αλλά δεν υπάρχουν ακόμη δημοσιευμένες καταχωρίσεις CLAIM.</p>
        <Link className={styles.button} href="/hubs/join">Συμμετοχή επιχείρησης →</Link>
      </section>}
      <p className={styles.footer}>Οι καταχωρίσεις CLAIM αποτελούν επαληθευμένη παρουσία στον κατάλογο και δεν προσφέρουν αγορές μέσα από το KONTA MOY.</p>
    </section>
    <SiteFooter />
  </main>;
}
