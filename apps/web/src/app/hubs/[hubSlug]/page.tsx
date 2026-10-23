import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { SiteFooter } from "../../../components/SiteFooter";
import { getExpansionHubBySlug } from "../../../lib/expansion-hubs";
import { hubHasIndexReadyCensus, listPublicHubCensus, publicHubCensusCategoryCounts } from "../../../lib/hub-gemi-directory";
import { listPublicHubClaimsByHub } from "../../../lib/hub-claim-runtime";
import { listVerifiedHubPartnersByHub } from "../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../lib/hub-claim-public-url";
import { hubGemiApplicationPath } from "../../../lib/hub-gemi-join-links";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { jsonLdSafe } from "../../../lib/hub-business-structured-data";

type Props = { params: Promise<{ hubSlug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) return { title: "HUB δεν βρέθηκε · KONTA MOY", robots: { index: false, follow: false } };
  const [{ settings }, claims, partners, indexReadyCensus] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    listPublicHubClaimsByHub(hubSlug, 1),
    listVerifiedHubPartnersByHub(hubSlug, 1),
    hubHasIndexReadyCensus(hubSlug)
  ]);
  const hasListings = hub.isSpartaLegacy || claims.length > 0 || partners.length > 0 || indexReadyCensus;
  const canonical = "/hubs/" + hub.slug;
  const description = "Γνώρισε την τοπική αγορά του HUB " + hub.nameEl + " στο KONTA MOY. Κατηγορίες, κατάλογος επιχειρήσεων και χάρτης με επαληθευμένες θέσεις.";
  return {
    title: "HUB " + hub.nameEl + " · Τοπικές επιχειρήσεις · KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: settings.indexingEnabled && hasListings, follow: true },
    openGraph: {
      title: "ΚΟΝΤΑ ΜΟΥ HUB " + hub.nameEl,
      description,
      url: canonical,
      type: "website",
      images: ["/brand/kontamou-sparta-logo.webp"]
    },
    twitter: {
      card: "summary_large_image",
      title: "ΚΟΝΤΑ ΜΟΥ HUB " + hub.nameEl,
      description,
      images: ["/brand/kontamou-sparta-logo.webp"]
    }
  };
}

export default async function PublicCityHubPage({ params }: Props) {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) notFound();
  const directoryPath = "/hubs/" + hub.slug + "/business";
  const joinPath = hubGemiApplicationPath({ plan: "claim", billing: "annual", showPlans: true });
  const [{ settings }, claims, partners, census, categories] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    listPublicHubClaimsByHub(hubSlug, 100),
    listVerifiedHubPartnersByHub(hubSlug, 100),
    listPublicHubCensus(hubSlug, { limit: 6 }),
    publicHubCensusCategoryCounts(hubSlug)
  ]);
  const directoryCount = categories.reduce((sum, item) => sum + item.count, 0);
  const approved = [
    ...partners.map((item) => ({
      id: item.id, name: item.businessName, category: item.category, href: item.publicPath,
      label: "Ενεργή παρουσία · " + item.planCode.toUpperCase()
    })),
    ...claims.map((item) => ({
      id: item.id, name: item.businessName, category: item.category,
      href: hubClaimPublicPath(item), label: "Επαληθευμένη παρουσία · CLAIM"
    }))
  ];

  const canonicalUrl = new URL("/hubs/" + hub.slug, `${settings.canonicalOrigin}/`).toString();
  const approvedHighlights = approved.slice(0, 6);
  const hubStructuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${canonicalUrl}#directory-page`,
        url: canonicalUrl,
        name: "HUB " + hub.nameEl + " · Τοπικές επιχειρήσεις",
        inLanguage: "el-GR",
        isPartOf: { "@id": `${settings.canonicalOrigin}/#website` },
        publisher: { "@id": `${settings.canonicalOrigin}/#organization` },
        about: { "@type": "Place", name: hub.nameEl },
        mainEntity: { "@id": `${canonicalUrl}#verified-businesses` }
      },
      {
        "@type": "ItemList",
        "@id": `${canonicalUrl}#verified-businesses`,
        numberOfItems: approvedHighlights.length,
        itemListElement: approvedHighlights.map((business, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: business.name,
          url: new URL(business.href, `${settings.canonicalOrigin}/`).toString()
        }))
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: settings.canonicalOrigin },
          { "@type": "ListItem", position: 2, name: "HUB " + hub.nameEl, item: canonicalUrl }
        ]
      }
    ]
  };

  return (
    <main>
      {settings.indexingEnabled && (hub.isSpartaLegacy || approved.length > 0) ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(hubStructuredData) }} /> : null}
      <div className="announcement">HUB {hub.nameEl} · Η τοπική αγορά κοντά σου.</div>
      <SiteHeader />
      <section className="shops-hero">
        <div className="shell shops-hero-grid">
          <div>
            <div className="eyebrow">Explore {hub.nameEl} locally</div>
            <h1>Ανακάλυψε την τοπική αγορά του HUB {hub.nameEl}.</h1>
            <p>Ένα μέρος για τις επιχειρήσεις της περιοχής, με τις επαληθευμένες παρουσίες πρώτες και
              τις μη διεκδικημένες δημόσιες καταχωρίσεις οργανωμένες ανά κατηγορία.
              Το HUB δεν ενεργοποιεί απαραίτητα ηλεκτρονικές αγορές ή παραδόσεις.</p>
            <div className="hero-actions">
              <Link className="button" href={directoryPath + "/map"}>Δες τα στον χάρτη</Link>
              <Link className="button button-secondary" href={directoryPath}>Προβολή ως λίστα</Link>
              <Link className="button button-secondary" href={joinPath}>Καταχώρισε την επιχείρησή σου</Link>
            </div>
          </div>
          <div className="shops-hero-art" aria-hidden="true">
            <div className="shops-orbit"><span className="shops-orbit-mark">HUB<br />{hub.nameEl}</span></div>
            <span className="shops-orbit-note shops-orbit-note-a">Εγκεκριμένες επιχειρήσεις πρώτα</span>
            <span className="shops-orbit-note shops-orbit-note-b">Δημόσια στοιχεία · ανά κατηγορία</span>
          </div>
        </div>
      </section>
      <div className="shops-principles" aria-label="Πώς λειτουργεί ο κατάλογος">
        <div><strong>Εγκεκριμένες παρουσίες πρώτα</strong><span>Επιχειρήσεις με ενεργοποιημένο πρόγραμμα CLAIM ή άλλη εγκεκριμένη παρουσία.</span></div>
        <div><strong>Όλες οι κατηγορίες σε τάξη</strong><span>Η δημόσια αγορά παρουσιάζεται με αναζήτηση, φίλτρα και αναδιπλούμενες κατηγορίες.</span></div>
        <div><strong>Χάρτης χωρίς αυθαίρετα pins</strong><span>Επιχειρήσεις χωρίς επιβεβαιωμένη φυσική θέση φαίνονται στη λίστα, όχι σε φανταστική τοποθεσία.</span></div>
      </div>

      <section className="shell section" aria-labelledby="hub-overview-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Η αγορά σου</div><h2 id="hub-overview-title">Βρες επιχειρήσεις στο HUB {hub.nameEl}</h2></div>
          <p>{approved.length} εγκεκριμένες παρουσίες · {directoryCount} μη διεκδικημένες δημόσιες καταχωρίσεις.
            {" "}<Link className="text-link" href={directoryPath}>Άνοιξε τον πλήρη κατάλογο →</Link></p>
        </div>
        <nav className="shop-category-list" aria-label="Κατηγορίες επιχειρήσεων">
          {categories.map((entry) => <Link className="shop-category-chip" key={entry.slug}
            href={directoryPath + "?category=" + encodeURIComponent(entry.slug) + "&status=research"}>
            {entry.label} · {entry.count}
          </Link>)}
        </nav>

        {approved.length > 0 && <div className="section">
          <div className="shops-directory-head">
            <div><div className="eyebrow">Δημοσιευμένη παρουσία</div><h2>Εγκεκριμένες επιχειρήσεις</h2></div>
            <p>Τα προγράμματα παρουσίας δεν αποτελούν ένδειξη λειτουργίας marketplace checkout.</p>
          </div>
          <div className="shops-grid">
            {approved.slice(0, 6).map((business, index) => (
              <article className="shop-card" key={business.id}>
                <div className="shop-card-visual" aria-hidden="true">
                  <span className="shop-card-index">ΕΓΚΕΚΡΙΜΕΝΟ · {String(index + 1).padStart(2, "0")}</span>
                  <span className="shop-card-initial">{business.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="shop-card-body">
                  <span className="eyebrow">{business.label}</span>
                  <h2>{business.name}</h2>
                  <p className="shop-card-copy">{business.category}</p>
                  <div className="shop-card-action"><small>Δημόσιο προφίλ</small>
                    <Link className="text-link" href={business.href}>Γνώρισε την επιχείρηση →</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>}

        {census.items.length > 0 && <div className="section">
          <div className="shops-directory-head">
            <div><div className="eyebrow">Ευρύτερη τοπική αγορά</div><h2>Περισσότερες επιχειρήσεις</h2></div>
            <p>Μη διεκδικημένες καταχωρίσεις από δημόσια μητρώα, χωρίς ισχυρισμό συνεργασίας.</p>
          </div>
          <div className="shops-grid">
            {census.items.map((entry) => <article className="shop-card" key={entry.gemiNumber}>
              <div className="shop-card-body">
                <span className="eyebrow">ΓΕΜΗ · Μη διεκδικημένη</span>
                <h2>{entry.legalName}</h2>
                <p className="shop-card-copy">{entry.category} · {entry.city || entry.municipality || hub.nameEl}</p>
                <div className="shop-card-action"><small>Πληροφοριακή καταχώριση</small>
                  <Link className="text-link" href={directoryPath + "/" + entry.slug}>Άνοιγμα dossier →</Link>
                </div>
              </div>
            </article>)}
          </div>
        </div>}

        {!approved.length && !census.items.length && <div className="empty-state">
          <h2>Το HUB {hub.nameEl} ετοιμάζεται.</h2>
          <p>Δεν υπάρχουν ακόμη δημοσιευμένες επαληθευμένες επιχειρήσεις. Μπορείς να δηλώσεις ενδιαφέρον ή να καταχωρίσεις την επιχείρησή σου.</p>
          <Link className="button" href={joinPath}>Συμμετοχή επιχείρησης</Link>
        </div>}
        {hub.isSpartaLegacy && <p className="shop-card-copy">Η τοπική αγορά της Σπάρτης υποστηρίζει επιπλέον <Link className="text-link" href="/shops">καταστήματα</Link> και <Link className="text-link" href="/shop">online προϊόντα</Link>.</p>}
        <div className="hero-actions" style={{ marginTop: 28 }}>
          <Link className="button" href={directoryPath}>Όλες οι επιχειρήσεις & φίλτρα</Link>
          <Link className="button button-secondary" href={directoryPath + "/map"}>Χάρτης HUB</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
