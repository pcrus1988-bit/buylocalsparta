import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getPublicVendorDirectory } from "../../lib/public-vendor-directory";
import { PUBLIC_VENDOR_CATEGORIES } from "../../lib/public-vendor-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";

type Props = Readonly<{ searchParams: Promise<{ q?: string; category?: string; subcategory?: string; status?: string }> }>;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Καταστήματα & άνθρωποι",
  description: "Χαρτογραφημένες τοπικές επιχειρήσεις και ενεργοί συνεργάτες του Buy Local Sparta, οργανωμένοι ανά κατηγορία και υποκατηγορία με σαφή διάκριση του σταδίου συνεργασίας."
};

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
            <h1>Γνώρισε την αγορά της Σπάρτης.</h1>
            <p>Περιηγήσου στις χαρτογραφημένες επιχειρήσεις ανά κατηγορία και υποκατηγορία. Κάθε δημόσια καταχώριση δείχνει καθαρά αν πρόκειται για ενεργό συνεργάτη ή για επιχείρηση που έχει εντοπιστεί από δημόσιες πηγές και έχει προσκληθεί στο δίκτυο.</p>
            <div className="hero-actions">
              <a className="button" href="/shops/map">Δες τα στον χάρτη</a>
              <a className="button button-secondary" href="/shop">Δες τα ενεργά προϊόντα</a>
              <a className="button button-secondary" href="/ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="shops-hero-art" aria-hidden="true">
            <div className="shops-orbit"><span className="shops-orbit-mark">LOCAL<br />PEOPLE</span></div>
            <span className="shops-orbit-note shops-orbit-note-a">Σπάρτη · πραγματικές επιχειρήσεις</span>
            <span className="shops-orbit-note shops-orbit-note-b">Κατηγορία · υποκατηγορία · στάδιο</span>
          </div>
        </div>
      </section>

      <div className="shops-principles" aria-label="Merchant directory principles">
        <div><strong>Χαρτογράφηση ≠ συνεργασία</strong><span>Οι ερευνητικές καταχωρίσεις βασίζονται αποκλειστικά σε δημόσια επιχειρηματικά στοιχεία και δεν παρουσιάζονται ως συμβεβλημένοι συνεργάτες.</span></div>
        <div><strong>Δημόσια στοιχεία, όχι εσωτερικές σημειώσεις</strong><span>Διεύθυνση, τηλέφωνο, website και δημόσια κατηγοριοποίηση μπορούν να εμφανίζονται. Internal outreach, scoring και verification intelligence παραμένουν ιδιωτικά. Η παρουσία εδώ δεν αλλάζει τη δίκαιη ανάθεση ούτε αποκαλύπτει κρυφές supplier offers. <a className="text-link" href="/fairness">Δες πώς λειτουργεί →</a></span></div>
        <div><strong>Ιστορίες μόνο με έγκριση</strong><span>Merchant story, σύμβουλος και εγκεκριμένες φωτογραφίες εμφανίζονται μόνο μετά από onboarding και έγκριση του εμπόρου.</span></div>
      </div>

      <section className="shell section" aria-labelledby="shops-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Καταστήματα & άνθρωποι</div><h2 id="shops-title">Η χαρτογραφημένη τοπική αγορά</h2></div>
          <p>{vendors.length} από {allVendors.length} επιχειρήσεις σε αυτή την προβολή · {partnerCount} ενεργοί συνεργάτες · {researchCount} δημόσιες καταχωρίσεις έρευνας/πρόσκλησης. <a className="text-link" href="/shops/map">Άνοιγμα χάρτη →</a></p>
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
          <label><span>Κατάσταση</span><select name="status" defaultValue={requestedStatus}><option value="">Όλες οι επιχειρήσεις</option><option value="partner">Ενεργοί συνεργάτες</option><option value="research">Χαρτογραφημένες / προσκεκλημένες</option></select></label>
          <button className="button" type="submit">Εφαρμογή φίλτρων</button>
          {(query || requestedCategory || requestedSubcategory || requestedStatus) && <a className="shops-filter-reset" href="/shops">Καθαρισμός</a>}
        </form>

        {vendors.length ? (
          <div className="shops-grid">
            {vendors.map((vendor, index) => {
              const location = vendor.location;
              const storyMedia = vendor.story?.mediaUrl;
              const isResearch = vendor.directoryStatus === "research";
              const website = safeHttpUrl(vendor.research?.onlineShopUrl);
              return (
                <article className="shop-card" key={vendor.id}>
                  <div className={`shop-card-visual${storyMedia ? " has-photo" : ""}`} aria-hidden="true">
                    {storyMedia && <img className="shop-card-photo" src={storyMedia} alt="" />}
                    <span className="shop-card-index">SPARTA · {String(index + 1).padStart(2, "0")}</span>
                    {!storyMedia && <span className="shop-card-initial">{vendor.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="shop-card-body">
                    <div className="eyebrow">{vendor.directoryStatus === "partner" ? (location?.locality ? `Ενεργός συνεργάτης · ${location.locality}` : "Ενεργός συνεργάτης") : "Χαρτογραφημένη επιχείρηση · πρόσκληση σε εκκρεμότητα"}</div>
                    <h2>{vendor.name}</h2>
                    <p className="shop-card-copy">{vendor.story?.excerpt ?? (isResearch ? `Δημόσια επιχειρηματική καταχώριση${vendor.taxonomies[0]?.subcategoryLabel ? ` στην υποκατηγορία «${vendor.taxonomies[0].subcategoryLabel}»` : ""}. Η επιχείρηση δεν έχει ακόμη ενεργοποιηθεί ως συνεργάτης του Buy Local Sparta.` : "Δες το δημόσιο προφίλ, τις διαθέσιμες κατηγορίες και ποιος μπορεί να σε συμβουλέψει.")}</p>

                    <div className="shop-meta">
                      {vendor.adviser && <div className="shop-meta-row"><span>Συμβουλή</span><strong>{vendor.adviser}</strong></div>}
                      {location && <div className="shop-meta-row"><span>Τοποθεσία</span><strong>{location.addressLine1}, {location.postcode} {location.locality}{location.verified ? " · επαληθευμένο" : ""}</strong></div>}
                      {location?.phone && <div className="shop-meta-row"><span>Τηλέφωνο</span><strong>{location.phone}</strong></div>}
                      {website && <div className="shop-meta-row"><span>Online shop</span><strong>Διαθέσιμο website</strong></div>}
                      {isResearch ? <div className="shop-meta-row"><span>Κατάσταση</span><strong>INVITED · αναμένει onboarding</strong></div> : <div className="shop-meta-row"><span>Κατάλογος</span><strong>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "προϊόν" : "προϊόντα"}</strong></div>}
                    </div>

                    {vendor.taxonomies.length > 0 && <div className="shop-category-list" aria-label="Κατηγορίες καταστήματος">
                      {vendor.taxonomies.map((taxonomy) => <span className="shop-category-chip" key={`${taxonomy.categorySlug}-${taxonomy.subcategorySlug ?? "all"}`}>{taxonomy.categoryLabel}{taxonomy.subcategoryLabel ? ` · ${taxonomy.subcategoryLabel}` : ""}</span>)}
                    </div>}

                    <div className="shop-card-action">
                      <small>{isResearch ? "Δημόσιο dossier · όχι ακόμη συνεργάτης" : (vendor.story ? "Δημοσιευμένη ιστορία καταστήματος" : "Προϊόντα · συμβουλή · στοιχεία")}</small>
                      <a className="text-link" href={`/vendor/${encodeURIComponent(vendor.id)}`}>{isResearch ? "Δες τα δημόσια στοιχεία →" : "Γνώρισε το κατάστημα →"}</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h2>{allVendors.length ? "Δεν βρέθηκε κατάστημα με αυτά τα φίλτρα." : "Η βάση καταστημάτων ετοιμάζεται."}</h2>
            <p>{allVendors.length ? "Δοκίμασε διαφορετικό όνομα, κατηγορία ή υποκατηγορία." : "Δεν υπάρχουν ακόμη δημοσιεύσιμες καταχωρίσεις στην παραγωγική βάση δεδομένων."}</p>
            <a className="button" href={allVendors.length ? "/shops" : "/shop"}>{allVendors.length ? "Καθαρισμός φίλτρων" : "Πήγαινε στα προϊόντα"}</a>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
