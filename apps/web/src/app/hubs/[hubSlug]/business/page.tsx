import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { getExpansionHubBySlug } from "../../../../lib/expansion-hubs";
import {
  hubCensusBusinessPath, hubCensusCategoryOptions, listPublicHubCensus,
  hubHasIndexReadyCensus, publicHubCensusCategoryCounts, type HubCensusBusiness
} from "../../../../lib/hub-gemi-directory";
import { listPublicHubClaimsByHub } from "../../../../lib/hub-claim-runtime";
import { listVerifiedHubPartnersByHub } from "../../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../../lib/hub-claim-public-url";
import { hubGemiApplicationPath } from "../../../../lib/hub-gemi-join-links";
import { hubBusinessDirectoryIndexable } from "../../../../lib/public-hub-availability";

type Params = Readonly<{
  params: Promise<{ hubSlug: string }>;
  searchParams: Promise<{ q?: string; after?: string; category?: string; status?: string }>;
}>;

export const dynamic = "force-dynamic";

type CensusGroup = Readonly<{ code: string; label: string; entries: readonly HubCensusBusiness[] }>;

function groupCensus(items: readonly HubCensusBusiness[], requested: string): CensusGroup[] {
  const groups = new Map<string, HubCensusBusiness[]>();
  for (const item of items) {
    const key = requested || item.sectorCode;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const labels = new Map(hubCensusCategoryOptions().map((category) => [category.slug, category.label]));
  return [...groups.entries()]
    .map(([code, entries]) => ({
      code, label: labels.get(code) ?? "Τοπικές επιχειρήσεις",
      entries: [...entries].sort((a, b) => a.legalName.localeCompare(b.legalName, "el"))
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "el"));
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { hubSlug } = await params;
  const query = await searchParams;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) return { title: "HUB δεν βρέθηκε · KONTA MOY", robots: { index: false, follow: false } };
  const canonical = "/hubs/" + hub.slug + "/business";
  const hasFilters = Boolean(query.q || query.after || query.category || query.status);
  const [claims, partners, approvedCensus] = hasFilters
    ? [[], [], false] as const
    : await Promise.all([
      listPublicHubClaimsByHub(hubSlug, 1),
      listVerifiedHubPartnersByHub(hubSlug, 1),
      hubHasIndexReadyCensus(hubSlug)
    ]);
  const indexable = hubBusinessDirectoryIndexable({
    hasVerifiedClaim: claims.length > 0 || partners.length > 0,
    hasIndexReadyCensus: approvedCensus,
    hasFilters
  });
  const description = "Ανακάλυψε την αγορά του HUB " + hub.nameEl +
    " με χάρτη, κατηγορίες, φίλτρα, εγκεκριμένες παρουσίες και δημόσιες πληροφοριακές καταχωρίσεις.";
  return {
    title: "Επιχειρήσεις " + hub.nameEl + " · Τοπικός κατάλογος · KONTA MOY",
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      title: "Επιχειρήσεις " + hub.nameEl + " · ΚΟΝΤΑ ΜΟΥ",
      description,
      url: canonical,
      type: "website",
      images: ["/brand/kontamou-sparta-logo.webp"]
    },
    twitter: {
      card: "summary_large_image",
      title: "Επιχειρήσεις " + hub.nameEl + " · ΚΟΝΤΑ ΜΟΥ",
      description,
      images: ["/brand/kontamou-sparta-logo.webp"]
    }
  };
}

export default async function HubBusinessesDirectoryPage({ params, searchParams }: Params) {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) notFound();
  const raw = await searchParams;
  const query = typeof raw.q === "string" ? raw.q.trim().slice(0, 70) : "";
  const categoryOptions = hubCensusCategoryOptions();
  const category = categoryOptions.some((item) => item.slug === raw.category) ? raw.category ?? "" : "";
  const status = raw.status === "partner" || raw.status === "research" ? raw.status : "";
  const after = typeof raw.after === "string" ? raw.after : "";
  const hasFilters = Boolean(query || category || status || after);
  const basePath = "/hubs/" + hub.slug + "/business";
  const mapPath = basePath + "/map";
  const joinPath = hubGemiApplicationPath({ plan: "claim", billing: "annual", showPlans: true });

  // Approved public-only reads. Never project the private census or pending applications.
  const [census, claims, partners, categoryCounts] = await Promise.all([
    status === "partner"
      ? Promise.resolve({ items: [] as HubCensusBusiness[], nextAfter: undefined as string | undefined })
      : listPublicHubCensus(hub.slug, { q: query, category, after, limit: 24 }),
    status === "research" || Boolean(category || after)
      ? Promise.resolve([]) : listPublicHubClaimsByHub(hub.slug, 100, query),
    status === "research" || Boolean(category || after)
      ? Promise.resolve([]) : listVerifiedHubPartnersByHub(hub.slug, 100, query),
    publicHubCensusCategoryCounts(hub.slug)
  ]);
  const filteredPartners = [...partners.map((partner) => ({
    id: partner.id, name: partner.businessName, category: partner.category,
    href: partner.publicPath, label: "Ενεργή εγκεκριμένη παρουσία · " + partner.planCode.toUpperCase()
  })), ...claims.map((claim) => ({
    id: claim.id, name: claim.businessName, category: claim.category,
    href: hubClaimPublicPath(claim), label: "Επαληθευμένη καταχώριση CLAIM"
  }))].sort((a, b) => a.name.localeCompare(b.name, "el"));
  const categoryCountMap = new Map(categoryCounts.map((item) => [item.slug, item.count]));
  const directoryCount = categoryCounts.reduce((sum, item) => sum + item.count, 0);
  const groups = groupCensus(census.items, category);
  const expanded = hasFilters;
  const next = new URLSearchParams();
  if (query) next.set("q", query);
  if (category) next.set("category", category);
  if (status) next.set("status", status);
  if (census.nextAfter) next.set("after", census.nextAfter);

  return (
    <main>
      <div className="announcement">HUB {hub.nameEl} · Γνώρισε τις επιχειρήσεις της περιοχής σου.</div>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Explore {hub.nameEl} locally</div>
          <h1>Η αγορά του HUB {hub.nameEl}, πάνω στον χάρτη.</h1>
          <p className="lead compact">
            Αναζήτησε επιχείρηση, φιλτράρισε ανά κατηγορία ή στάδιο συμμετοχής,
            δες τις επαληθευμένες παρουσίες και άνοιξε το δημόσιο προφίλ κάθε επιχείρησης.
            Οι μη διεκδικημένες καταχωρίσεις ΓΕΜΗ παραμένουν σαφώς διαχωρισμένες από τους συνεργάτες.
          </p>
          <div className="hero-actions">
            <Link className="button" href={mapPath}>Άνοιξε τον χάρτη</Link>
            <Link className="button button-secondary" href="#hub-directory">Προβολή ως λίστα</Link>
            <Link className="button button-secondary" href={joinPath}>Καταχώρισε την επιχείρησή σου</Link>
          </div>
          <div className="hero-proof">
            <span><strong>{filteredPartners.length}</strong> εγκεκριμένες παρουσίες{query ? " στην αναζήτηση" : ""}</span>
            <span><strong>{directoryCount}</strong> δημόσιες καταχωρίσεις ΓΕΜΗ</span>
            <span><strong>{categoryCounts.length}</strong> κατηγορίες ΓΕΜΗ</span>
          </div>
        </div>
      </section>

      <div className="shops-principles" aria-label="Κανόνες καταλόγου HUB">
        <div><strong>Εγκεκριμένες παρουσίες πρώτα</strong><span>CLAIM και ενεργοποιημένα προγράμματα εμφανίζονται πριν από τις πληροφοριακές καταχωρίσεις.</span></div>
        <div><strong>Η τοπική αγορά ανά κατηγορία</strong><span>Ανακάλυψε τα δημοσιευμένα προφίλ σε αναδιπλούμενες ομάδες, χωρίς εκατοντάδες κάρτες μαζί.</span></div>
        <div><strong>Σωστές θέσεις στον χάρτη</strong><span>Ακριβές pin μόνο με επαληθευμένη φυσική θέση. Η ταξινόμηση σε δήμο δεν αποτελεί pin ή απόδειξη εμπορικής συνεργασίας.</span></div>
      </div>

      <section id="hub-directory" className="shell section" aria-labelledby="hub-directory-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Καταστήματα & επιχειρήσεις</div><h2 id="hub-directory-title">Βρες την τοπική αγορά</h2></div>
          <p>Επίλεξε κατηγορία ή αναζήτησε ένα όνομα. <Link className="text-link" href={mapPath}>Προβολή στον χάρτη →</Link></p>
        </div>
        <nav className="shop-category-list" aria-label="Κατηγορίες δημόσιων καταχωρίσεων">
          {categoryCounts.map((item) => <Link className="shop-category-chip" key={item.slug}
            href={basePath + "?category=" + encodeURIComponent(item.slug) + "&status=research"}>
            {item.label} · {item.count.toLocaleString("el-GR")}
          </Link>)}
        </nav>
        <form className="shops-filter" method="get" action={basePath} role="search">
          <label><span>Αναζήτηση επιχείρησης</span>
            <input type="search" name="q" defaultValue={query} maxLength={70} placeholder="Επωνυμία ή ειδικότητα" />
          </label>
          <label><span>Κατηγορία ΓΕΜΗ</span>
            <select name="category" defaultValue={category}>
              <option value="">Όλες οι κατηγορίες</option>
              {categoryOptions.filter((item) => categoryCountMap.has(item.slug)).map((item) =>
                <option value={item.slug} key={item.slug}>{item.label} ({categoryCountMap.get(item.slug) ?? 0})</option>
              )}
            </select>
          </label>
          <label><span>Στάδιο συνεργασίας</span>
            <select name="status" defaultValue={status}>
              <option value="">Εγκεκριμένες παρουσίες + δημόσιος κατάλογος</option>
              <option value="partner">Μόνο εγκεκριμένες παρουσίες</option>
              <option value="research">Μόνο δημόσιες καταχωρίσεις ΓΕΜΗ</option>
            </select>
          </label>
          <button className="button" type="submit">Εφαρμογή φίλτρων</button>
          {hasFilters && <Link className="shops-filter-reset" href={basePath}>Καθαρισμός</Link>}
        </form>

        {status !== "research" && (
          <div className="section">
            <div className="shops-directory-head">
              <div><div className="eyebrow">Επαληθευμένη παρουσία</div><h2>Εγκεκριμένες επιχειρήσεις</h2></div>
              <p>Η καταχώριση CLAIM ή PRESENCE δεν σημαίνει ενεργό marketplace checkout.</p>
            </div>
            {filteredPartners.length > 0 ? (
              <div className="shops-grid">
                {filteredPartners.map((business, index) => (
                  <article className="shop-card" key={business.id}>
                    <div className="shop-card-visual" aria-hidden="true">
                      <span className="shop-card-index">ΕΓΚΕΚΡΙΜΕΝΟ · {String(index + 1).padStart(2, "0")}</span>
                      <span className="shop-card-initial">{business.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                    <div className="shop-card-body">
                      <span className="eyebrow">{business.label}</span>
                      <h2>{business.name}</h2>
                      <p className="shop-card-copy">{business.category} · HUB {hub.nameEl}</p>
                      <div className="shop-card-action"><small>Επαληθευμένο δημόσιο προφίλ</small>
                        <Link className="text-link" href={business.href}>Γνώρισε την επιχείρηση →</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : <div className="empty-state"><h2>Δεν υπάρχουν αντίστοιχες εγκεκριμένες παρουσίες.</h2>
              <p>Μπορείς να δεις παρακάτω τις δημόσιες πληροφοριακές καταχωρίσεις ή να προσαρμόσεις τα φίλτρα.</p></div>}
          </div>
        )}

        {status !== "partner" && (
          <div className="section">
            <div className="shops-directory-head">
              <div><div className="eyebrow">Ευρύτερη τοπική αγορά</div><h2>Περισσότερες επιχειρήσεις ανά κατηγορία</h2></div>
              <p>{directoryCount} εγκεκριμένες δημόσιες καταχωρίσεις συνολικά.
                {census.nextAfter ? " Εμφανίζονται τμηματικά για ταχύτητα." : ""}
                {" "}Οι εταιρείες ΓΕΜΗ δεν έχουν απαραίτητα διεκδικήσει τη σελίδα τους.
              </p>
            </div>
            {groups.length ? <div className="shops-grid">
              {groups.map((group) => (
                <details className="shop-card" key={group.code} open={expanded}>
                  <summary className="shop-card-body">
                    <span className="eyebrow">Κατηγορία · {categoryCountMap.get(group.code) ?? group.entries.length} επιχειρήσεις</span>
                    <span style={{ fontFamily: "Georgia, serif", fontSize: "28px", lineHeight: 1.08, margin: "8px 0 10px" }}>{group.label}</span>
                    <span className="shop-card-copy">Επιχειρήσεις από επίσημα στοιχεία δημόσιου μητρώου, χωρίς ισχυρισμό συνεργασίας με το KONTA MOY.</span>
                    <span className="text-link">{expanded ? "Σχετικά αποτελέσματα ↓" : "Άνοιγμα κατηγορίας ↓"}</span>
                  </summary>
                  <div className="shop-card-body">
                    <div className="shop-meta">
                      {group.entries.map((business) => <div className="shop-meta-row" key={business.gemiNumber}>
                        <span>{business.city || business.municipality || hub.nameEl} · ΓΕΜΗ</span>
                        <strong><Link className="text-link" href={hubCensusBusinessPath(business)}>{business.legalName} →</Link></strong>
                      </div>)}
                    </div>
                    <div className="shop-card-action">
                      <small>Μη διεκδικημένες πληροφοριακές καταχωρίσεις</small>
                      <Link className="text-link" href={basePath + "?category=" + encodeURIComponent(group.code) + "&status=research"}>
                        Φίλτρο κατηγορίας →
                      </Link>
                    </div>
                  </div>
                </details>
              ))}
            </div> : <div className="empty-state"><h2>Δεν υπάρχουν δημοσιευμένες καταχωρίσεις με αυτά τα φίλτρα.</h2>
              <p>Οι εισαγωγές που εκκρεμούν έλεγχο δεν προβάλλονται δημόσια.</p></div>}
            {census.nextAfter && <div className="hero-actions" style={{ marginTop: 24 }}>
              <Link className="button button-secondary" href={basePath + "?" + next.toString()}>Επόμενες επιχειρήσεις →</Link>
            </div>}
          </div>
        )}

        {hub.isSpartaLegacy && <p className="shop-card-copy">Για αγορές με πραγματικό checkout, δες το <Link className="text-link" href="/shops">κατάστημα της Σπάρτης</Link> και το <Link className="text-link" href="/shop">marketplace προϊόντων</Link>.</p>}
        <p className="shop-card-copy">Οι μη διεκδικημένες δημόσιες καταχωρίσεις δεν αποτελούν πωλητές, δεν αποκαλύπτουν ερευνητικές επαφές και δεν τοποθετούνται σε χάρτη χωρίς επαληθευμένη ακριβή θέση. <Link className="text-link" href={joinPath}>Διεκδίκησε την καταχώρισή σου ή διάλεξε πρόγραμμα →</Link></p>
      </section>
      <SiteFooter />
    </main>
  );
}
