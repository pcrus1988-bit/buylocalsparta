import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { HubClaimPublicContent } from "../../../../../components/HubClaimPublicContent";
import { listPublicHubClaimMedia } from "../../../../../lib/hub-claim-media-runtime";
import { getPublicHubClaim } from "../../../../../lib/hub-claim-runtime";
import { hubClaimPublicPath } from "../../../../../lib/hub-claim-public-url";
import { getPublicHubCensus, hubCensusBusinessPath, convertedClaimUrlForGemiCensus } from "../../../../../lib/hub-gemi-directory";
import { getExpansionHubBySlug } from "../../../../../lib/expansion-hubs";
import { HUB_EXPANSION_PLANS, billingLabelForPlan } from "../../../../../lib/hub-expansion-plans";
import { hubGemiApplicationPath } from "../../../../../lib/hub-gemi-join-links";
import styles from "../../../claim/claim.module.css";

type Params = { params: Promise<{ hubSlug: string; id: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (profile) {
    const canonical = hubClaimPublicPath(profile);
    const description = profile.businessName + " · " + profile.category + " στο KONTA MOY HUB " + profile.hubCity +
      ". Επαληθευμένη δωρεάν καταχώριση επιχείρησης.";
    return {
      title: profile.businessName + " · HUB " + profile.hubCity + " · KONTA MOY",
      description,
      alternates: { canonical },
      robots: { index: true, follow: true },
      openGraph: { title: profile.businessName + " · KONTA MOY", description, url: canonical, type: "website" }
    };
  }
  const business = await getPublicHubCensus(hubSlug, id);
  const hub = getExpansionHubBySlug(hubSlug);
  if (!business || !hub) return { title: "Καταχώριση μη διαθέσιμη · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = hubCensusBusinessPath(business);
  const locality = business.city || hub.nameEl;
  const description = business.legalName + " · " + business.category + " · " + locality +
    ". Πληροφοριακή καταχώριση από δημόσιο μητρώο ΓΕΜΗ, μη διεκδικημένη από την επιχείρηση.";
  return {
    title: business.legalName + " – " + business.category + " · " + locality + " | KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: business.seoApproved, follow: true },
    openGraph: { title: business.legalName + " · KONTA MOY", description, url: canonical, type: "website" }
  };
}

export default async function PublicHubBusinessPage({ params }: Params) {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (profile) {
    if (id !== profile.slug) permanentRedirect(hubClaimPublicPath(profile));
    const photos = await listPublicHubClaimMedia(profile.id);
    return <main>
      <SiteHeader compact />
      <section className="shell"><HubClaimPublicContent profile={profile} media={photos} /></section>
      <SiteFooter />
    </main>;
  }

  const converted = await convertedClaimUrlForGemiCensus(hubSlug, id);
  if (converted) permanentRedirect(converted);
  const business = await getPublicHubCensus(hubSlug, id);
  const hub = getExpansionHubBySlug(hubSlug);
  if (!business || !hub) notFound();
  const directoryPath = "/hubs/" + hub.slug + "/business";
  const joinPath = hubGemiApplicationPath({ plan: "claim", billing: "annual", gemi: business.gemiNumber, showPlans: true });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: business.legalName,
    identifier: { "@type": "PropertyValue", propertyID: "ΓΕΜΗ", value: business.gemiNumber },
    areaServed: business.city || hub.nameEl,
    url: hubCensusBusinessPath(business)
  };

  return <main>
    <script type="application/ld+json" dangerouslySetInnerHTML={{
      __html: JSON.stringify(jsonLd).replaceAll("<", "\\u003c")
    }} />
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {hub.nameEl} · Επιχειρηματικός κατάλογος</div>
        <h1 className={styles.title}>{business.legalName}</h1>
        <p className={styles.lead}>{business.category} · {business.city || business.municipality || hub.nameEl}</p>
        <p className={styles.hint}>Μη διεκδικημένη πληροφοριακή καταχώριση. Η επιχείρηση δεν έχει
          επιβεβαιώσει αυτά τα στοιχεία και δεν παρουσιάζεται ως συνεργάτης ή ενεργός πωλητής του KONTA MOY.</p>
      </div>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <h2>Στοιχεία δημόσιου μητρώου</h2>
          <p className={styles.details}><strong>Επωνυμία:</strong> {business.legalName}</p>
          <p className={styles.details}><strong>Κλάδος:</strong> {business.category}</p>
          {business.city && <p className={styles.details}><strong>Πόλη:</strong> {business.city}</p>}
          {business.municipality && <p className={styles.details}><strong>Δήμος:</strong> {business.municipality}</p>}
          {business.postcode && <p className={styles.details}><strong>Τ.Κ.:</strong> {business.postcode}</p>}
          <p className={styles.details}><strong>Αριθμός ΓΕΜΗ:</strong> {business.gemiNumber}</p>
          <p className={styles.details}><strong>Πηγή:</strong> ΓΕΜΗ OpenData (στοιχεία έρευνας).</p>
          <p className={styles.details}>Τα στοιχεία ενδέχεται να έχουν μεταβληθεί. Δεν δημοσιεύονται
            προσωπικές επαφές από το αρχείο συμμετεχόντων της έρευνας.</p>
        </article>
        <article className={styles.panel}>
          <h2>Είναι δική σου η επιχείρηση;</h2>
          <p className={styles.details}>Μπορείς να διεκδικήσεις την υπάρχουσα καταχώριση με
            CLAIM ή να επιλέξεις PRESENCE, SHOP, GROWTH ή PRO. Η αίτηση συνδέεται με την ίδια
            επιχείρηση και το επαληθευμένο HUB ανεξάρτητα από το πρόγραμμα. Η ταυτοποίηση ΑΦΜ/ΓΕΜΗ,
            ο έλεγχος εκπροσώπησης και η έγκριση προηγούνται της ενεργοποίησης.</p>
          <div className={styles.actions}>
            <Link href={joinPath} className={styles.button}>Επίλεξε πρόγραμμα & διεκδίκησε τη σελίδα</Link>
            <Link href="mailto:info@kontamou.site?subject=GEMI%20directory%20correction" className={styles.button + " " + styles.secondary}>Αίτημα διόρθωσης</Link>
          </div>
          <h3>Προγράμματα συμμετοχής</h3>
          <div className={styles.actions}>{HUB_EXPANSION_PLANS.map((plan) =>
            <Link key={plan.code} className={styles.button + " " + styles.secondary}
              href={hubGemiApplicationPath({ plan: plan.code, billing: "annual", gemi: business.gemiNumber })}>
              {plan.name} · {billingLabelForPlan(plan, "annual")}
            </Link>
          )}</div>
          <p className={styles.details}>Η δημόσια καταχώριση δεν συνεπάγεται πρόσκληση ή συνεργασία.
            Η επιλογή εμπορικού προγράμματος δεν ενεργοποιεί άμεσα πωλήσεις ούτε προκαλεί χρέωση.</p>
        </article>
      </div>
      <div className={styles.actions}>
        <Link className={styles.button + " " + styles.secondary} href={directoryPath}>
          ← Όλες οι επιχειρήσεις του HUB
        </Link>
      </div>
      <p className={styles.footer}>Ανεξάρτητη πληροφοριακή καταχώριση. Καμία ένδειξη
        λειτουργίας καταστήματος, διαθέσιμων προϊόντων ή σχέσης συνεργασίας δεν συνάγεται από τη δημοσιευμένη εγγραφή ΓΕΜΗ.</p>
    </section>
    <SiteFooter />
  </main>;
}
