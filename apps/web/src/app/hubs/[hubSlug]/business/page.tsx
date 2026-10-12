import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { getExpansionHubBySlug } from "../../../../lib/expansion-hubs";
import { hubCensusBusinessPath, listPublicHubCensus, hubHasIndexReadyCensus, publicHubCensusCategoryCounts } from "../../../../lib/hub-gemi-directory";
import { listPublicHubClaimsByHub } from "../../../../lib/hub-claim-runtime";
import { listVerifiedHubPartnersByHub } from "../../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../../lib/hub-claim-public-url";
import { hubGemiApplicationPath } from "../../../../lib/hub-gemi-join-links";
import { hubBusinessDirectoryIndexable } from "../../../../lib/public-hub-availability";
import styles from "../../claim/claim.module.css";

type Params = {
  params: Promise<{ hubSlug: string }>;
  searchParams: Promise<{ q?: string; after?: string; category?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { hubSlug } = await params;
  const query = await searchParams;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) return { title: "HUB δεν βρέθηκε · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = "/hubs/" + hub.slug + "/business";
  const hasFilters = Boolean(query.q || query.after || query.category);
  const [verifiedClaims, verifiedPartners, indexReadyCensus] = hasFilters
    ? [[], [], false] as const
    : await Promise.all([
      listPublicHubClaimsByHub(hub.slug, 1),
      listVerifiedHubPartnersByHub(hub.slug, 1),
      hubHasIndexReadyCensus(hub.slug)
    ]);
  const indexable = hubBusinessDirectoryIndexable({
    hasVerifiedClaim: verifiedClaims.length > 0 || verifiedPartners.length > 0,
    hasIndexReadyCensus: indexReadyCensus,
    hasFilters
  });
  return {
    title: "Επιχειρήσεις " + hub.nameEl + " · Τοπικός κατάλογος · KONTA MOY",
    description: "Ανακάλυψε καταστήματα και επιχειρήσεις στο HUB " + hub.nameEl +
      ", με διαχωρισμό μεταξύ εγκεκριμένων και μη διεκδικημένων καταχωρίσεων.",
    alternates: { canonical },
    // Research indexation is governed, not granted by a GEMI import alone.
    robots: { index: indexable, follow: true },
    openGraph: { url: canonical, title: "Επιχειρήσεις HUB " + hub.nameEl }
  };
}

export default async function HubBusinessesDirectoryPage({ params, searchParams }: Params) {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) notFound();
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 70) : "";
  const after = typeof query.after === "string" ? query.after : "";
  const category = typeof query.category === "string" ? query.category : "";
  const [census, claimedAll, partnersAll, categories] = await Promise.all([
    listPublicHubCensus(hub.slug, { q, after, category, limit: 24 }),
    listPublicHubClaimsByHub(hub.slug, 24, q),
    listVerifiedHubPartnersByHub(hub.slug, 100),
    publicHubCensusCategoryCounts(hub.slug)
  ]);
  // Registry sectors and seller-defined CLAIM categories are not equivalent.
  const claimed = category ? [] : claimedAll;
  const partners = category || after ? [] : partnersAll.filter((partner) =>
    !q || partner.businessName.toLocaleLowerCase("el-GR").includes(q.toLocaleLowerCase("el-GR"))
  );
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  if (category) next.set("category", category);
  if (census.nextAfter) next.set("after", census.nextAfter);
  const nextUrl = "/hubs/" + hub.slug + "/business?" + next.toString();

  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {hub.nameEl}</div>
        <h1 className={styles.title}>Επιχειρήσεις {hub.nameEl}</h1>
        <p className={styles.lead}>Ο τοπικός επιχειρηματικός κατάλογος του HUB.
          Οι πληροφοριακές καταχωρίσεις βασίζονται σε δημόσια μητρώα και δεν σημαίνουν
          συμμετοχή, συνεργασία ή δυνατότητα παραγγελίας.</p>
        <div className={styles.actions}>
          <Link className={styles.button} href={hubGemiApplicationPath({ plan: "claim", billing: "annual", showPlans: true })}>
            Διεκδίκησε την επιχείρησή σου · όλα τα προγράμματα
          </Link>
          <Link className={styles.button + " " + styles.secondary} href={"/hubs/" + hub.slug}>
            Επιστροφή στο HUB
          </Link>
        </div>
      </div>
      {hub.isSpartaLegacy && <section className={styles.panel}>
        <h2>Η αγορά της Σπάρτης λειτουργεί ήδη.</h2>
        <p className={styles.details}>Η υπάρχουσα αγορά με ενεργούς συνεργάτες και προσκεκλημένες επιχειρήσεις
          είναι διαθέσιμη στον κεντρικό κατάλογο Σπάρτης. Οι καταχωρίσεις CLAIM και ΓΕΜΗ
          παρουσιάζονται χωριστά, χωρίς να υποδηλώνουν δυνατότητα αγορών.</p>
        <Link className={styles.button} href="/shops">Καταστήματα Σπάρτης →</Link>
      </section>}
      <form method="get" action={"/hubs/" + hub.slug + "/business"} className={styles.panel}>
        <label className={styles.field}>Αναζήτηση επιχείρησης
          <input name="q" maxLength={70} defaultValue={q} placeholder="Επωνυμία επιχείρησης" />
        </label>
        <label className={styles.field}>Κατηγορία
          <select name="category" defaultValue={category}>
            <option value="">Όλες οι κατηγορίες</option>
            {categories.map(entry => <option key={entry.slug} value={entry.slug}>
              {entry.label} ({entry.count.toLocaleString("el-GR")})
            </option>)}
          </select>
        </label>
        <button className={styles.button} type="submit">Αναζήτηση</button>
      </form>

      {partners.length > 0 && <section>
        <h2>Ενεργοί συνεργάτες από τα προγράμματα HUB</h2>
        <p className={styles.details}>Επαληθευμένοι συνεργάτες με ολοκληρωμένη δημόσια ενεργοποίηση. Η εμφάνιση εδώ δεν ενεργοποιεί από μόνη της αγορές.</p>
        <div className={styles.grid}>{partners.map((partner) =>
          <article key={partner.id} className={styles.panel}>
            <div className={styles.kicker}>Ενεργή παρουσία</div>
            <h3>{partner.businessName}</h3>
            <p className={styles.details}>{partner.category}</p>
            <Link className={styles.button} href={partner.publicPath}>Προφίλ επιχείρησης →</Link>
          </article>
        )}</div>
      </section>}
      {claimed.length > 0 && !after && <section>
        <h2>Επαληθευμένες καταχωρίσεις CLAIM</h2>
        <div className={styles.grid}>{claimed.map((business) =>
          <article key={business.id} className={styles.panel}>
            <div className={styles.kicker}>Εγκεκριμένη καταχώριση</div>
            <h3>{business.businessName}</h3>
            <p className={styles.details}>{business.category}</p>
            <Link className={styles.button} href={hubClaimPublicPath(business)}>Δες την επιχείρηση →</Link>
          </article>
        )}</div>
      </section>}

      <section>
        <h2>Πληροφοριακές καταχωρίσεις από δημόσια μητρώα</h2>
        <p className={styles.details}>Οι επιχειρήσεις δεν έχουν απαραίτητα διεκδικήσει την καταχώρισή τους.
          Τα στοιχεία προέρχονται από έρευνα και υπόκεινται σε διορθώσεις.</p>
        {census.items.length === 0
          ? <div className={styles.panel}><p>Δεν υπάρχουν ακόμη δημοσιευμένες καταχωρίσεις για αυτό το HUB ή το φίλτρο.</p></div>
          : <div className={styles.grid}>{census.items.map((business) =>
            <article key={business.gemiNumber} className={styles.panel}>
              <div className={styles.kicker}>Μη διεκδικημένη · Πληροφοριακή καταχώριση</div>
              <h3>{business.legalName}</h3>
              <p className={styles.details}>{business.category} · {business.city || business.municipality || hub.nameEl}</p>
              <div className={styles.actions}>
                <Link className={styles.button} href={hubCensusBusinessPath(business)}>Πληροφορίες επιχείρησης →</Link>
                <Link className={styles.button + " " + styles.secondary}
                  href={hubGemiApplicationPath({ plan: "claim", billing: "annual", gemi: business.gemiNumber, showPlans: true })}>
                  Συμμετοχή / προγράμματα →
                </Link>
              </div>
            </article>
          )}</div>}
        {census.nextAfter && <div className={styles.actions}><Link className={styles.button} href={nextUrl}>
          Επόμενες επιχειρήσεις →
        </Link></div>}
      </section>
      <p className={styles.footer}>Τα δεδομένα ΓΕΜΗ αποτελούν πληροφορίες έρευνας, όχι επιβεβαίωση της
        τρέχουσας λειτουργίας ή των στοιχείων εκπροσώπησης. Δεν δημοσιεύονται στοιχεία συμμετοχής στην έρευνα.</p>
    </section>
    <SiteFooter />
  </main>;
}
