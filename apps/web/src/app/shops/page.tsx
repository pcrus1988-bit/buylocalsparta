import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../lib/public-vendor-directory";
import { STOREFRONT_CATEGORIES, storefrontCategoryForCode } from "../../lib/storefront-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";

type Props = Readonly<{ searchParams: Promise<{ q?: string; category?: string }> }>;

export const metadata: Metadata = {
  title: "Καταστήματα & άνθρωποι",
  description: "Χαρτογραφημένες τοπικές επιχειρήσεις και ενεργοί συνεργάτες του Buy Local Sparta, με σαφή διάκριση του σταδίου συνεργασίας."
};

function categoriesFor(vendor: PublicVendorDirectoryEntry) {
  const seen = new Set<string>();
  return vendor.categoryCodes.flatMap((code) => {
    const category = storefrontCategoryForCode(code);
    if (seen.has(category.slug)) return [];
    seen.add(category.slug);
    return [category];
  });
}

function normalizedSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el");
}

export default async function ShopsPage({ searchParams }: Props) {
  const allVendors = await getPublicVendorDirectory();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const requestedCategory = STOREFRONT_CATEGORIES.some((category) => category.slug === params.category) ? params.category ?? "" : "";
  const needle = normalizedSearch(query);
  const vendors = allVendors.filter((vendor) => {
    const categories = categoriesFor(vendor);
    if (requestedCategory && !categories.some((category) => category.slug === requestedCategory)) return false;
    if (!needle) return true;
    return normalizedSearch([vendor.name, vendor.adviser, vendor.location?.locality, vendor.location?.addressLine1, vendor.story?.title, vendor.researchCategory].filter(Boolean).join(" ")).includes(needle);
  });
  const partnerCount = allVendors.filter((vendor) => vendor.directoryStatus === "partner").length;
  const researchCount = allVendors.filter((vendor) => vendor.directoryStatus === "research").length;

  return (
    <main>
      <div className="announcement">Η τοπική αγορά δεν είναι μόνο προϊόντα — είναι άνθρωποι που γνωρίζουν τι πουλάνε.</div>
      <SiteHeader />

      <section className="shops-hero">
        <div className="shell shops-hero-grid">
          <div>
            <div className="eyebrow">Know your vendor</div>
            <h1>Γνώρισε την αγορά της Σπάρτης.</h1>
            <p>Δες τις επιχειρήσεις που έχουμε χαρτογραφήσει και ξεχώρισε καθαρά ποια καταστήματα έχουν ήδη ενεργοποιηθεί ως συνεργάτες του Buy Local Sparta.</p>
            <div className="hero-actions">
              <a className="button" href="/shop">Δες τα ενεργά προϊόντα</a>
              <a className="button button-secondary" href="/ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="shops-hero-art" aria-hidden="true">
            <div className="shops-orbit"><span className="shops-orbit-mark">LOCAL<br />PEOPLE</span></div>
            <span className="shops-orbit-note shops-orbit-note-a">Σπάρτη · πραγματικές επιχειρήσεις</span>
            <span className="shops-orbit-note shops-orbit-note-b">Σαφές στάδιο συνεργασίας</span>
          </div>
        </div>
      </section>

      <div className="shops-principles" aria-label="Merchant directory principles">
        <div><strong>Χαρτογράφηση ≠ συνεργασία</strong><span>Οι καταχωρίσεις έρευνας βασίζονται σε δημόσιες πηγές και δεν παρουσιάζονται ως συμβεβλημένοι συνεργάτες.</span></div>
        <div><strong>Χωρίς δημόσιο πόλεμο τιμών</strong><span>Τα κρυφά supplier offers δεν εμφανίζονται στον κατάλογο. <a className="text-link" href="/fairness">Δες πώς λειτουργεί →</a></span></div>
        <div><strong>Ιστορίες μόνο με έγκριση</strong><span>Merchant story, σύμβουλος και φωτογραφία εμφανίζονται μόνο μετά από έγκριση και τους ελέγχους της πλατφόρμας.</span></div>
      </div>

      <section className="shell section" aria-labelledby="shops-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Καταστήματα & άνθρωποι</div><h2 id="shops-title">Η χαρτογραφημένη τοπική αγορά</h2></div>
          <p>{vendors.length} από {allVendors.length} επιχειρήσεις σε αυτή την προβολή · {partnerCount} ενεργοί συνεργάτες · {researchCount} καταχωρίσεις έρευνας/πρόσκλησης.</p>
        </div>

        <form className="shops-filter" action="/shops" method="get" role="search">
          <label><span>Αναζήτηση καταστήματος</span><input type="search" name="q" defaultValue={query} placeholder="Όνομα, κατηγορία ή περιοχή" maxLength={80} /></label>
          <label><span>Κατηγορία ενεργού καταλόγου</span><select name="category" defaultValue={requestedCategory}><option value="">Όλες οι κατηγορίες</option>{STOREFRONT_CATEGORIES.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
          <button className="button" type="submit">Βρες κατάστημα</button>
          {(query || requestedCategory) && <a className="shops-filter-reset" href="/shops">Καθαρισμός</a>}
        </form>

        {vendors.length ? (
          <div className="shops-grid">
            {vendors.map((vendor, index) => {
              const categories = categoriesFor(vendor);
              const location = vendor.location;
              const storyMedia = vendor.story?.mediaUrl;
              const isResearch = vendor.directoryStatus === "research";
              return (
                <article className="shop-card" key={vendor.id}>
                  <div className={`shop-card-visual${storyMedia ? " has-photo" : ""}`} aria-hidden="true">
                    {storyMedia && <img className="shop-card-photo" src={storyMedia} alt="" />}
                    <span className="shop-card-index">SPARTA · {String(index + 1).padStart(2, "0")}</span>
                    {!storyMedia && <span className="shop-card-initial">{vendor.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="shop-card-body">
                    <div className="eyebrow">{vendor.directoryStatus === "partner" ? (location?.locality ? `Ενεργός συνεργάτης · ${location.locality}` : "Ενεργός συνεργάτης") : vendor.directoryStatus === "research" ? "Χαρτογραφημένη επιχείρηση · δεν είναι ακόμη συνεργάτης" : "Demo συνεργάτης"}</div>
                    <h2>{vendor.name}</h2>
                    <p className="shop-card-copy">{vendor.story?.excerpt ?? (isResearch ? "Καταχώριση από την ερευνητική βάση του Buy Local Sparta. Τα στοιχεία συνεργασίας, συμβουλής και προϊόντων δεν έχουν ακόμη ενεργοποιηθεί από τον έμπορο." : "Δες το δημόσιο προφίλ, τις διαθέσιμες κατηγορίες και ποιος μπορεί να σε συμβουλέψει.")}</p>

                    <div className="shop-meta">
                      {vendor.adviser && <div className="shop-meta-row"><span>Συμβουλή</span><strong>{vendor.adviser}</strong></div>}
                      {location && <div className="shop-meta-row"><span>Τοποθεσία</span><strong>{location.addressLine1}, {location.postcode} {location.locality}{location.verified ? " · επαληθευμένο" : ""}</strong></div>}
                      {isResearch ? <div className="shop-meta-row"><span>Κατάσταση</span><strong>INVITED · αναμένει onboarding</strong></div> : <div className="shop-meta-row"><span>Κατάλογος</span><strong>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "προϊόν" : "προϊόντα"}</strong></div>}
                    </div>

                    {categories.length > 0 && <div className="shop-category-list" aria-label="Κατηγορίες καταστήματος">
                      {categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}
                    </div>}
                    {isResearch && vendor.researchCategory && <div className="shop-category-list" aria-label="Κατηγορία έρευνας"><span className="shop-category-chip">{vendor.researchCategory}</span></div>}

                    <div className="shop-card-action">
                      {isResearch ? <small>Δημόσια ερευνητική καταχώριση · όχι συμβεβλημένος συνεργάτης</small> : <><small>{vendor.story ? "Δημοσιευμένη ιστορία καταστήματος" : "Προϊόντα · συμβουλή · στοιχεία"}</small><a className="text-link" href={`/vendor/${vendor.id}`}>Γνώρισε το κατάστημα →</a></>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h2>{allVendors.length ? "Δεν βρέθηκε κατάστημα με αυτά τα φίλτρα." : "Η βάση καταστημάτων ετοιμάζεται."}</h2>
            <p>{allVendors.length ? "Δοκίμασε διαφορετικό όνομα ή επίλεξε άλλη κατηγορία." : "Δεν εμφανίζουμε demo επιχειρήσεις όταν η παραγωγική βάση δεδομένων είναι ενεργή."}</p>
            <a className="button" href={allVendors.length ? "/shops" : "/shop"}>{allVendors.length ? "Καθαρισμός φίλτρων" : "Πήγαινε στα προϊόντα"}</a>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
