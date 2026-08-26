import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../lib/public-vendor-directory";
import { PUBLIC_VENDOR_CATEGORIES } from "../../lib/public-vendor-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

type Props = Readonly<{ searchParams: Promise<{ q?: string; category?: string; subcategory?: string; status?: string }> }>;

type ResearchVendorGroup = Readonly<{
  slug: string;
  label: string;
  vendors: readonly PublicVendorDirectoryEntry[];
}>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const base = await governedStaticSeoMetadata("/shops", {
    title: "Καταστήματα & άνθρωποι",
    description: "Οι ενεργοί συνεργάτες του ΚΟΝΤΑ ΜΟΥ Σπάρτη εμφανίζονται πρώτοι, ενώ οι υπόλοιπες χαρτογραφημένες τοπικές επιχειρήσεις οργανώνονται ανά κατηγορία."
  });
  const params = await searchParams;
  const hasQueryState = [params.q, params.category, params.subcategory, params.status].some((value) => typeof value === "string" && value.trim().length > 0);
  return hasQueryState
    ? { ...base, alternates: { canonical: "/shops" }, robots: { index: false, follow: true } }
    : base;
}

function normalizedSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el");
}

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function groupResearchVendors(vendors: readonly PublicVendorDirectoryEntry[], requestedCategory: string): readonly ResearchVendorGroup[] {
  const groups = new Map<string, { label: string; vendors: PublicVendorDirectoryEntry[] }>();

  for (const vendor of vendors) {
    const taxonomy = requestedCategory
      ? vendor.taxonomies.find((entry) => entry.categorySlug === requestedCategory) ?? vendor.taxonomies[0]
      : vendor.taxonomies[0];
    const slug = taxonomy?.categorySlug ?? "other";
    const label = taxonomy?.categoryLabel ?? "Άλλες τοπικές επιχειρήσεις";
    const existing = groups.get(slug);
    if (existing) {
      existing.vendors.push(vendor);
    } else {
      groups.set(slug, { label, vendors: [vendor] });
    }
  }

  const categoryOrder = new Map(PUBLIC_VENDOR_CATEGORIES.map((category, index) => [category.slug, index]));
  return [...groups.entries()]
    .map(([slug, group]) => ({
      slug,
      label: group.label,
      vendors: [...group.vendors].sort((a, b) => a.name.localeCompare(b.name, "el"))
    }))
    .sort((a, b) => (categoryOrder.get(a.slug) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(b.slug) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label, "el"));
}

export default async function ShopsPage({ searchParams }: Props) {
  const allVendors = await getPublicVendorDirectory();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const requestedCategory = PUBLIC_VENDOR_CATEGORIES.some((category) => category.slug === params.category) ? params.category ?? "" : "";
  const knownSubcategories = new Map(allVendors.flatMap((vendor) => vendor.taxonomies.flatMap((taxonomy) => taxonomy.subcategorySlug && taxonomy.subcategoryLabel ? [[taxonomy.subcategorySlug, taxonomy.subcategoryLabel] as const] : [])));
  const requestedSubcategory = typeof params.subcategory === "string" && knownSubcategories.has(params.subcategory) ? params.subcategory : "";
  const requestedStatus = params.status === "partner" || params.status === "research" ? params.status : "";
  const needle = normalizedSearch(query);
  const vendors = allVendors.filter((vendor) => {
    if (requestedStatus && vendor.directoryStatus !== requestedStatus) return false;
    if (requestedCategory && !vendor.taxonomies.some((taxonomy) => taxonomy.categorySlug === requestedCategory)) return false;
    if (requestedSubcategory && !vendor.taxonomies.some((taxonomy) => taxonomy.subcategorySlug === requestedSubcategory)) return false;
    if (!needle) return true;
    return normalizedSearch([
      vendor.name,
      vendor.adviser,
      vendor.location?.locality,
      vendor.location?.addressLine1,
      vendor.story?.title,
      vendor.research?.directoryCategories,
      ...vendor.taxonomies.flatMap((taxonomy) => [taxonomy.categoryLabel, taxonomy.subcategoryLabel, taxonomy.categorySourceName, taxonomy.subcategorySourceName])
    ].filter(Boolean).join(" ")).includes(needle);
  });

  const partnerCount = allVendors.filter((vendor) => vendor.directoryStatus === "partner").length;
  const researchCount = allVendors.filter((vendor) => vendor.directoryStatus === "research").length;
  const activeVendors = vendors.filter((vendor) => vendor.directoryStatus === "partner");
  const researchVendors = vendors.filter((vendor) => vendor.directoryStatus === "research");
  const researchGroups = groupResearchVendors(researchVendors, requestedCategory);
  const showPartners = requestedStatus !== "research";
  const showResearch = requestedStatus !== "partner";
  const expandResearchGroups = requestedStatus === "research" || Boolean(query || requestedCategory || requestedSubcategory);
  const hasFilters = Boolean(query || requestedCategory || requestedSubcategory || requestedStatus);
  const categoryCounts = new Map(PUBLIC_VENDOR_CATEGORIES.map((category) => [category.slug, allVendors.filter((vendor) => vendor.taxonomies.some((taxonomy) => taxonomy.categorySlug === category.slug)).length]));
  const subcategoryOptions = [...knownSubcategories.entries()]
    .filter(([slug]) => !requestedCategory || allVendors.some((vendor) => vendor.taxonomies.some((taxonomy) => taxonomy.categorySlug === requestedCategory && taxonomy.subcategorySlug === slug)))
    .sort((a, b) => a[1].localeCompare(b[1], "el"));

  return (
    <main>
      <div className="announcement">Η τοπική αγορά δεν είναι μόνο προϊόντα — είναι άνθρωποι, ειδικότητες και πραγματικά καταστήματα.</div>
      <SiteHeader />

      <section className="shops-hero">
        <div className="shell shops-hero-grid">
          <div>
            <div className="eyebrow">Know your vendor</div>
            <h1>Γνώρισε τα καταστήματα της Σπάρτης.</h1>
            <p>Οι ενεργοί συνεργάτες εμφανίζονται πρώτοι για να βρίσκεις άμεσα καταστήματα από τα οποία μπορείς να αγοράσεις ή να ζητήσεις συμβουλή. Η ευρύτερη τοπική αγορά παραμένει διαθέσιμη πιο κάτω, οργανωμένη ανά κατηγορία χωρίς να γεμίζει τη σελίδα.</p>
            <div className="hero-actions">
              <a className="button" href="/shops/map">Δες τα στον χάρτη</a>
              <a className="button button-secondary" href="/shop">Δες τα ενεργά προϊόντα</a>
              <a className="button button-secondary" href="/ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="shops-hero-art" aria-hidden="true">
            <div className="shops-orbit"><span className="shops-orbit-mark">LOCAL<br />PEOPLE</span></div>
            <span className="shops-orbit-note shops-orbit-note-a">Ενεργοί συνεργάτες πρώτα</span>
            <span className="shops-orbit-note shops-orbit-note-b">Υπόλοιπη αγορά · ανά κατηγορία</span>
          </div>
        </div>
      </section>

      <div className="shops-principles" aria-label="Merchant directory principles">
        <div><strong>Ενεργοί συνεργάτες πρώτα</strong><span>Τα καταστήματα που έχουν ολοκληρώσει την ενεργοποίησή τους παρουσιάζονται ως κύριες κάρτες στην αρχή του καταλόγου.</span></div>
        <div><strong>Η υπόλοιπη αγορά σε τάξη</strong><span>Οι χαρτογραφημένες ή προσκεκλημένες επιχειρήσεις δεν χάνονται, αλλά ομαδοποιούνται ανά κύρια κατηγορία και ανοίγουν μόνο όταν το επιλέξεις.</span></div>
        <div><strong>Καθαρή διάκριση σταδίου</strong><span>Μια δημόσια ερευνητική καταχώριση δεν παρουσιάζεται ως συμβεβλημένος συνεργάτης. <a className="text-link" href="/fairness">Δες πώς λειτουργεί η δίκαιη συμμετοχή →</a></span></div>
      </div>

      <section className="shell section" aria-labelledby="shops-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Καταστήματα & άνθρωποι</div><h2 id="shops-title">Βρες πρώτα ποιος είναι ενεργός τώρα</h2></div>
          <p>{partnerCount} ενεργοί συνεργάτες · {researchCount} επιπλέον χαρτογραφημένες/προσκεκλημένες επιχειρήσεις οργανωμένες ανά κατηγορία. <a className="text-link" href="/shops/map">Άνοιγμα χάρτη →</a></p>
        </div>

        <div className="shop-category-list" aria-label="Κύριες κατηγορίες καταστημάτων">
          {PUBLIC_VENDOR_CATEGORIES.map((category) => {
            const count = categoryCounts.get(category.slug) ?? 0;
            if (!count) return null;
            return <a className="shop-category-chip" href={`/shops?category=${encodeURIComponent(category.slug)}`} key={category.slug}>{category.label} · {count}</a>;
          })}
        </div>

        <form className="shops-filter" action="/shops" method="get" role="search">
          <label><span>Αναζήτηση καταστήματος</span><input type="search" name="q" defaultValue={query} placeholder="Όνομα, ειδικότητα ή περιοχή" maxLength={80} /></label>
          <label><span>Κατηγορία</span><select name="category" defaultValue={requestedCategory}><option value="">Όλες οι κατηγορίες</option>{PUBLIC_VENDOR_CATEGORIES.map((category) => <option value={category.slug} key={category.slug}>{category.label} ({categoryCounts.get(category.slug) ?? 0})</option>)}</select></label>
          <label><span>Υποκατηγορία</span><select name="subcategory" defaultValue={requestedSubcategory}><option value="">Όλες οι υποκατηγορίες</option>{subcategoryOptions.map(([slug, label]) => <option value={slug} key={slug}>{label}</option>)}</select></label>
          <label><span>Προβολή</span><select name="status" defaultValue={requestedStatus}><option value="">Ενεργοί πρώτα + κατάλογος ανά κατηγορία</option><option value="partner">Μόνο ενεργοί συνεργάτες</option><option value="research">Μόνο χαρτογραφημένες / προσκεκλημένες</option></select></label>
          <button className="button" type="submit">Εφαρμογή φίλτρων</button>
          {hasFilters && <a className="shops-filter-reset" href="/shops">Καθαρισμός</a>}
        </form>

        {!vendors.length ? (
          <div className="empty-state">
            <h2>{allVendors.length ? "Δεν βρέθηκε κατάστημα με αυτά τα φίλτρα." : "Η βάση καταστημάτων ετοιμάζεται."}</h2>
            <p>{allVendors.length ? "Δοκίμασε διαφορετικό όνομα, κατηγορία ή υποκατηγορία." : "Δεν υπάρχουν ακόμη δημοσιεύσιμες καταχωρίσεις στην παραγωγική βάση δεδομένων."}</p>
            <a className="button" href={allVendors.length ? "/shops" : "/shop"}>{allVendors.length ? "Καθαρισμός φίλτρων" : "Πήγαινε στα προϊόντα"}</a>
          </div>
        ) : (
          <>
            {showPartners && (
              <div>
                <div className="shops-directory-head">
                  <div><div className="eyebrow">Διαθέσιμοι τώρα</div><h2>Ενεργοί συνεργάτες</h2></div>
                  <p>{activeVendors.length}{hasFilters ? ` ενεργοί συνεργάτες ταιριάζουν στα φίλτρα σου.` : " ενεργοί συνεργάτες εμφανίζονται σε πρώτο πλάνο."}</p>
                </div>

                {activeVendors.length ? (
                  <div className="shops-grid">
                    {activeVendors.map((vendor, index) => {
                      const location = vendor.location;
                      const storyMedia = vendor.story?.mediaUrl;
                      const website = safeHttpUrl(vendor.research?.onlineShopUrl);
                      return (
                        <article className="shop-card" key={vendor.id}>
                          <div className={`shop-card-visual${storyMedia ? " has-photo" : ""}`} aria-hidden="true">
                            {storyMedia && <img className="shop-card-photo" src={storyMedia} alt="" />}
                            <span className="shop-card-index">ACTIVE · {String(index + 1).padStart(2, "0")}</span>
                            {!storyMedia && <span className="shop-card-initial">{vendor.name.slice(0, 1).toUpperCase()}</span>}
                          </div>
                          <div className="shop-card-body">
                            <div className="eyebrow">{location?.locality ? `Ενεργός συνεργάτης · ${location.locality}` : "Ενεργός συνεργάτης"}</div>
                            <h2>{vendor.name}</h2>
                            <p className="shop-card-copy">{vendor.story?.excerpt ?? "Δες το δημόσιο προφίλ, τις διαθέσιμες κατηγορίες, τα προϊόντα και ποιος μπορεί να σε συμβουλέψει."}</p>

                            <div className="shop-meta">
                              {vendor.adviser && <div className="shop-meta-row"><span>Συμβουλή</span><strong>{vendor.adviser}</strong></div>}
                              {location && <div className="shop-meta-row"><span>Τοποθεσία</span><strong>{location.addressLine1}, {location.postcode} {location.locality}{location.verified ? " · επαληθευμένο" : ""}</strong></div>}
                              {location?.phone && <div className="shop-meta-row"><span>Τηλέφωνο</span><strong>{location.phone}</strong></div>}
                              {website && <div className="shop-meta-row"><span>Online shop</span><strong>Διαθέσιμο website</strong></div>}
                              <div className="shop-meta-row"><span>Κατάλογος</span><strong>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "προϊόν" : "προϊόντα"}</strong></div>
                            </div>

                            {vendor.taxonomies.length > 0 && <div className="shop-category-list" aria-label="Κατηγορίες καταστήματος">
                              {vendor.taxonomies.map((taxonomy) => <span className="shop-category-chip" key={`${taxonomy.categorySlug}-${taxonomy.subcategorySlug ?? "all"}`}>{taxonomy.categoryLabel}{taxonomy.subcategoryLabel ? ` · ${taxonomy.subcategoryLabel}` : ""}</span>)}
                            </div>}

                            <div className="shop-card-action">
                              <small>{vendor.story ? "Δημοσιευμένη ιστορία καταστήματος" : "Προϊόντα · συμβουλή · στοιχεία"}</small>
                              <a className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`}>Γνώρισε το κατάστημα →</a>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">
                    <h2>Δεν υπάρχουν ενεργοί συνεργάτες σε αυτή την επιλογή.</h2>
                    <p>Οι υπόλοιπες σχετικές τοπικές επιχειρήσεις παραμένουν διαθέσιμες πιο κάτω ανά κατηγορία.</p>
                  </div>
                )}
              </div>
            )}

            {showResearch && researchVendors.length > 0 && (
              <div className="section">
                <div className="shops-directory-head">
                  <div><div className="eyebrow">Ευρύτερη τοπική αγορά</div><h2>{requestedStatus === "research" ? "Χαρτογραφημένες / προσκεκλημένες επιχειρήσεις" : "Περισσότερα καταστήματα ανά κατηγορία"}</h2></div>
                  <p>{researchVendors.length} επιχειρήσεις σε {researchGroups.length} {researchGroups.length === 1 ? "κατηγορία" : "κατηγορίες"}. {expandResearchGroups ? "Οι σχετικές ομάδες είναι ανοιχτές επειδή χρησιμοποιείς φίλτρο ή αναζήτηση." : "Άνοιξε μόνο την κατηγορία που σε ενδιαφέρει — δεν φορτώνουμε τη σελίδα με εκατοντάδες πλήρεις κάρτες."}</p>
                </div>

                <div className="shops-grid">
                  {researchGroups.map((group) => (
                    <details className="shop-card" key={group.slug} open={expandResearchGroups}>
                      <summary className="shop-card-body">
                        <span className="eyebrow">Κατηγορία · {group.vendors.length} {group.vendors.length === 1 ? "επιχείρηση" : "επιχειρήσεις"}</span>
                        <span style={{ fontFamily: "Georgia, serif", fontSize: "28px", lineHeight: 1.08, margin: "8px 0 10px" }}>{group.label}</span>
                        <span className="shop-card-copy">Χαρτογραφημένες τοπικές επιχειρήσεις που δεν έχουν ακόμη ενεργοποιηθεί ως συνεργάτες.</span>
                        <span className="text-link">{expandResearchGroups ? "Σχετικά αποτελέσματα ↓" : "Άνοιγμα κατηγορίας ↓"}</span>
                      </summary>
                      <div className="shop-card-body">
                        <div className="shop-meta">
                          {group.vendors.map((vendor) => {
                            const taxonomy = vendor.taxonomies.find((entry) => entry.categorySlug === group.slug) ?? vendor.taxonomies[0];
                            const label = taxonomy?.subcategoryLabel ?? vendor.location?.locality ?? "Τοπική επιχείρηση";
                            return (
                              <div className="shop-meta-row" key={vendor.id}>
                                <span>{label}</span>
                                <strong><a className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`}>{vendor.name} →</a></strong>
                              </div>
                            );
                          })}
                        </div>
                        <div className="shop-card-action">
                          <small>Δημόσιες καταχωρίσεις · δεν παρουσιάζονται ως ενεργοί συνεργάτες</small>
                          <a className="text-link" href={`/shops?category=${encodeURIComponent(group.slug)}&status=research`}>Φίλτρο κατηγορίας →</a>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
