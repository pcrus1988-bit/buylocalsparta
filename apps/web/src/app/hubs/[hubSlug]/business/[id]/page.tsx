import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { SiteHeader } from "../../../../../components/SiteHeader";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { HubClaimPublicContent } from "../../../../../components/HubClaimPublicContent";
import { listPublicHubClaimMedia } from "../../../../../lib/hub-claim-media-runtime";
import { getPublicHubClaim } from "../../../../../lib/hub-claim-runtime";
import { getVerifiedHubPartnerBySlug } from "../../../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../../../lib/hub-claim-public-url";
import { getPublicHubCensus, hubCensusBusinessPath, convertedClaimUrlForGemiCensus, supersedingPartnerUrlForGemiCensus } from "../../../../../lib/hub-gemi-directory";
import { getExpansionHubBySlug } from "../../../../../lib/expansion-hubs";
import { officialGemiPublicityUrl } from "../../../../../lib/hub-gemi-publicity";
import { HUB_EXPANSION_PLANS, billingLabelForPlan } from "../../../../../lib/hub-expansion-plans";
import { hubGemiApplicationPath } from "../../../../../lib/hub-gemi-join-links";
import styles from "../../../claim/claim.module.css";
import { hubBusinessStructuredData, jsonLdSafe } from "../../../../../lib/hub-business-structured-data";
import { getSeoGlobalSettingsSnapshot } from "../../../../../lib/seo-settings";

type Params = { params: Promise<{ hubSlug: string; id: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hubSlug, id } = await params;
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const profile = await getPublicHubClaim(hubSlug, id);
  if (profile) {
    const canonical = hubClaimPublicPath(profile);
    const description = profile.businessName + " · " + profile.category + " στο KONTA MOY HUB " + profile.hubCity +
      ". Επαληθευμένη δωρεάν καταχώριση επιχείρησης.";
    return {
      title: profile.businessName + " · HUB " + profile.hubCity + " · KONTA MOY",
      description,
      alternates: { canonical },
      robots: { index: settings.indexingEnabled, follow: true },
      openGraph: { title: profile.businessName + " · KONTA MOY", description, url: canonical, type: "website" }
    };
  }
  const partner = await getVerifiedHubPartnerBySlug(hubSlug, id);
  if (partner) {
    const description = partner.businessName + " · " + partner.category +
      " · Επαληθευμένος συνεργάτης KONTA MOY HUB " + partner.hubCity + ".";
    return {
      title: partner.businessName + " · HUB " + partner.hubCity + " · KONTA MOY",
      description,
      alternates: { canonical: partner.publicPath },
      robots: { index: settings.indexingEnabled, follow: true },
      openGraph: { title: partner.businessName + " · KONTA MOY", description, url: partner.publicPath, type: "website" }
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
    robots: { index: settings.indexingEnabled && business.seoApproved, follow: true },
    openGraph: { title: business.legalName + " · KONTA MOY", description, url: canonical, type: "website" }
  };
}

export default async function PublicHubBusinessPage({ params }: Params) {
  const { hubSlug, id } = await params;
  const profile = await getPublicHubClaim(hubSlug, id);
  if (profile) {
    if (id !== profile.slug) permanentRedirect(hubClaimPublicPath(profile));
    const photos = await listPublicHubClaimMedia(profile.id);
    const claimStructuredData = hubBusinessStructuredData({
      kind: "claimed",
      url: hubClaimPublicPath(profile),
      name: profile.businessName,
      category: profile.category,
      description: profile.description || undefined,
      city: profile.hubCity,
      region: profile.hubRegion,
      addressLine: profile.address,
      postcode: profile.postcode,
      telephone: profile.phone,
      website: profile.website,
      instagramUrl: profile.instagramUrl,
      facebookUrl: profile.facebookUrl,
      gemiNumber: profile.gemiNumber
    });
    return <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(claimStructuredData) }} />
      <SiteHeader compact />
      <section className="shell"><HubClaimPublicContent profile={profile} media={photos} /></section>
      <SiteFooter />
    </main>;
  }

  const partner = await getVerifiedHubPartnerBySlug(hubSlug, id);
  if (partner) {
    const plan = HUB_EXPANSION_PLANS.find((entry) => entry.code === partner.planCode);
    const directoryPath = "/hubs/" + partner.hubSlug + "/business";
    const partnerStructuredData = hubBusinessStructuredData({
      kind: "verified_partner",
      url: partner.publicPath,
      name: partner.businessName,
      category: partner.category,
      city: partner.hubCity
    });
    return <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(partnerStructuredData) }} />
      <SiteHeader compact />
      <section className="shell">
        <div className={styles.hero}>
          <div className={styles.kicker}>KONTA MOY · HUB {partner.hubCity} · Ενεργή παρουσία</div>
          <h1 className={styles.title}>{partner.businessName}</h1>
          <p className={styles.lead}>{partner.category}</p>
          <p className={styles.hint}>Επαληθευμένη συμμετοχή στο τοπικό HUB. Η ενεργή
            παρουσία στον κατάλογο δεν σημαίνει ότι το marketplace της περιοχής
            υποστηρίζει ήδη παραγγελίες ή ηλεκτρονικές πληρωμές.</p>
        </div>
        <article className={styles.panel}>
          <h2>Στοιχεία παρουσίας</h2>
          <p className={styles.details}><strong>HUB:</strong> {partner.hubCity}</p>
          <p className={styles.details}><strong>Κατηγορία:</strong> {partner.category}</p>
          {plan && <p className={styles.details}><strong>Πρόγραμμα:</strong> {plan.name}</p>}
          <p className={styles.details}>Η παρουσία και η διαθεσιμότητα αγοράς αποτελούν
            διαφορετικά στάδια ενεργοποίησης του KONTA MOY.</p>
          <Link className={styles.button} href={directoryPath}>← Όλες οι επιχειρήσεις του HUB</Link>
        </article>
      </section>
      <SiteFooter />
    </main>;
  }

  const converted = await convertedClaimUrlForGemiCensus(hubSlug, id);
  if (converted) permanentRedirect(converted);
  const partnerRedirect = await supersedingPartnerUrlForGemiCensus(hubSlug, id);
  if (partnerRedirect) permanentRedirect(partnerRedirect);
  const business = await getPublicHubCensus(hubSlug, id);
  const hub = getExpansionHubBySlug(hubSlug);
  if (!business || !hub) notFound();
  const directoryPath = "/hubs/" + hub.slug + "/business";
  const joinPath = hubGemiApplicationPath({ plan: "claim", billing: "annual", gemi: business.gemiNumber, showPlans: true });
  const gemiSourceUrl = officialGemiPublicityUrl(business.gemiNumber);

  // Municipality assignment is not evidence of a street-level business premise.
  const registryStructuredData = hubBusinessStructuredData({
    kind: "unclaimed_registry",
    url: hubCensusBusinessPath(business),
    name: business.legalName,
    category: business.category,
    description: "Ανεξάρτητη πληροφοριακή καταχώριση επιχείρησης από ΓΕΜΗ.",
    city: business.city || hub.nameEl,
    postcode: business.postcode || undefined,
    gemiNumber: business.gemiNumber,
    reviewedAt: business.registryVerifiedAt || undefined,
    officialRegistryUrl: gemiSourceUrl || undefined
  });

  return <main>
    {business.seoApproved ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(registryStructuredData) }} /> : null}
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB {hub.nameEl} · Επιχειρηματικός κατάλογος</div>
        <h1 className={styles.title}>{business.legalName}</h1>
        <p className={styles.lead}>{business.category} · {business.city || business.municipality || hub.nameEl}</p>
        <p className={styles.hint}>Μη διεκδικημένη πληροφοριακή καταχώριση.
          {business.gemiActiveVerified ? " Η κατάσταση «Ενεργή» και η ταυτότητα της επιχείρησης ελέγχθηκαν μέσω ΓΕΜΗ κατά την ημερομηνία επαλήθευσης." : " Τα στοιχεία της επιχείρησης προέρχονται από δημόσιο μητρώο."}
          {" "}Η καταχώριση δεν αποδεικνύει ιδιοκτησία, τρέχον ωράριο ή εμπορική συνεργασία με το KONTA MOY.</p>
        {business.locationBasis === "municipality" && <p className={styles.hint}>
          Γεωγραφική κατάταξη σε επίπεδο δήμου. Η ακριβής θέση της επιχείρησης και
          η απόσταση από το HUB δεν έχουν ακόμη επαληθευτεί.
        </p>}
      </div>
      <div className={styles.grid}>
        <article className={styles.panel}>
          <h2>Στοιχεία δημόσιου μητρώου</h2>
          <p className={styles.details}><strong>Επωνυμία:</strong> {business.legalName}</p>
          <p className={styles.details}><strong>Κλάδος:</strong> {business.category}</p>
          {business.city && <p className={styles.details}><strong>Πόλη:</strong> {business.city}</p>}
          {business.municipality && <p className={styles.details}><strong>Δήμος:</strong> {business.municipality}</p>}
          {business.locationBasis === "municipality" && <p className={styles.details}>
            <strong>Χωρική ακρίβεια:</strong> Δήμος (χωρίς επαληθευμένες συντεταγμένες ή κάλυψη 25 χλμ.)
          </p>}
          {business.postcode && <p className={styles.details}><strong>Τ.Κ.:</strong> {business.postcode}</p>}
          <p className={styles.details}><strong>Αριθμός ΓΕΜΗ:</strong> {business.gemiNumber}</p>
          {business.gemiActiveVerified && <p className={styles.details}><strong>Κατάσταση ΓΕΜΗ κατά τον έλεγχο:</strong> Ενεργή</p>}
          {business.registryVerifiedAt && <p className={styles.details}><strong>Ημερομηνία επαλήθευσης ΓΕΜΗ:</strong> {new Date(business.registryVerifiedAt).toLocaleDateString("el-GR")}</p>}
          {gemiSourceUrl && <p className={styles.details}><strong>Επίσημη μερίδα ΓΕΜΗ:</strong>{" "}
            <a href={gemiSourceUrl} target="_blank" rel="noopener noreferrer">Δες τα δημόσια στοιχεία στο ΓΕΜΗ ↗</a>
          </p>}
          <p className={styles.details}><strong>Email:</strong>{" "}
            {gemiSourceUrl ? <a href={gemiSourceUrl} target="_blank" rel="noopener noreferrer">Δες την επίσημη μερίδα ΓΕΜΗ ↗</a> : "Δεν δημοσιεύεται"}
          </p>
          <p className={styles.details}><strong>Τηλέφωνο:</strong>{" "}
            {gemiSourceUrl ? <a href={gemiSourceUrl} target="_blank" rel="noopener noreferrer">Δες την επίσημη μερίδα ΓΕΜΗ ↗</a> : "Δεν δημοσιεύεται"}
          </p>
          <p className={styles.details}><strong>Πηγή:</strong> ΓΕΜΗ OpenData (στοιχεία δημόσιου μητρώου).</p>
          <p className={styles.details}>Δεν αντιγράφονται τηλέφωνα ή email από το ΓΕΜΗ ή τα ερευνητικά αρχεία.
            Η επίσημη μερίδα μπορεί να έχει νεότερα στοιχεία.</p>
          <p className={styles.details}>Η καταχώριση χρησιμοποιεί μόνο τα αναγκαία εταιρικά στοιχεία
            για ενημέρωση και εύρεση επιχειρήσεων στην περιοχή. Δεν αποτελεί συνεργασία ή διαφήμιση από την επιχείρηση.
            Για διόρθωση, ένσταση ή αίτημα αφαίρεσης μπορείς να επικοινωνήσεις μαζί μας από τη φόρμα επικοινωνίας
            και να διαβάσεις την <Link href="/privacy">πολιτική απορρήτου</Link>.</p>
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
