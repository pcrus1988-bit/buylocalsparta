import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../lib/storefront-taxonomy";

export const metadata: Metadata = {
  title: "Καταστήματα & άνθρωποι",
  description: "Γνώρισε τα συνεργαζόμενα καταστήματα της Σπάρτης, τους ανθρώπους τους και τις κατηγορίες που γνωρίζουν πραγματικά."
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

export default async function ShopsPage() {
  const vendors = await getPublicVendorDirectory();

  return (
    <main>
      <div className="announcement">Η τοπική αγορά δεν είναι μόνο προϊόντα — είναι άνθρωποι που γνωρίζουν τι πουλάνε.</div>
      <SiteHeader />

      <section className="shops-hero">
        <div className="shell shops-hero-grid">
          <div>
            <div className="eyebrow">Know your vendor</div>
            <h1>Γνώρισε την αγορά της Σπάρτης.</h1>
            <p>Ανακάλυψε τα συνεργαζόμενα καταστήματα, δες τι γνωρίζει καλύτερα το καθένα και βρες τον άνθρωπο που μπορεί να σε βοηθήσει πριν αγοράσεις.</p>
            <div className="hero-actions">
              <a className="button" href="/shop">Δες όλα τα προϊόντα</a>
              <a className="button button-secondary" href="/#ask-local">Ρώτησε τοπικά</a>
            </div>
          </div>
          <div className="shops-hero-art" aria-hidden="true">
            <div className="shops-orbit"><span className="shops-orbit-mark">LOCAL<br />PEOPLE</span></div>
            <span className="shops-orbit-note shops-orbit-note-a">Σπάρτη · πραγματικά καταστήματα</span>
            <span className="shops-orbit-note shops-orbit-note-b">Συμβουλή πριν την αγορά</span>
          </div>
        </div>
      </section>

      <div className="shops-principles" aria-label="Merchant directory principles">
        <div><strong>Πρόσωπο πίσω από το προϊόν</strong><span>Το προφίλ αναδεικνύει το κατάστημα και τον άνθρωπο που μπορεί να συμβουλέψει.</span></div>
        <div><strong>Χωρίς δημόσιο πόλεμο τιμών</strong><span>Τα κρυφά supplier offers δεν εμφανίζονται στον κατάλογο καταστημάτων ή στις δημόσιες σελίδες.</span></div>
        <div><strong>Ιστορίες μόνο με έγκριση</strong><span>Merchant story και φωτογραφία εμφανίζονται δημόσια μόνο όταν έχουν εγκριθεί και περάσει τους ελέγχους της πλατφόρμας.</span></div>
      </div>

      <section className="shell section" aria-labelledby="shops-title">
        <div className="shops-directory-head">
          <div><div className="eyebrow">Καταστήματα & άνθρωποι</div><h2 id="shops-title">Οι τοπικοί συνεργάτες</h2></div>
          <p>{vendors.length} {vendors.length === 1 ? "κατάστημα" : "καταστήματα"} διαθέσιμα σε αυτή την προβολή. Η παρουσία εδώ δεν αλλάζει τη δίκαιη ανάθεση ίδιων προϊόντων.</p>
        </div>

        {vendors.length ? (
          <div className="shops-grid">
            {vendors.map((vendor, index) => {
              const categories = categoriesFor(vendor);
              const location = vendor.location;
              const storyMedia = vendor.story?.mediaUrl;
              return (
                <article className="shop-card" key={vendor.id}>
                  <div className={`shop-card-visual${storyMedia ? " has-photo" : ""}`} aria-hidden="true">
                    {storyMedia && <img className="shop-card-photo" src={storyMedia} alt="" />}
                    <span className="shop-card-index">SPARTA · {String(index + 1).padStart(2, "0")}</span>
                    {!storyMedia && <span className="shop-card-initial">{vendor.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="shop-card-body">
                    <div className="eyebrow">{vendor.demo ? "Demo συνεργάτης" : location?.locality ? `Τοπικό κατάστημα · ${location.locality}` : "Συνεργαζόμενο κατάστημα"}</div>
                    <h2>{vendor.name}</h2>
                    <p className="shop-card-copy">{vendor.story?.excerpt ?? "Δες το δημόσιο προφίλ, τις διαθέσιμες κατηγορίες και ποιος μπορεί να σε συμβουλέψει."}</p>

                    <div className="shop-meta">
                      {vendor.adviser && <div className="shop-meta-row"><span>Συμβουλή</span><strong>{vendor.adviser}</strong></div>}
                      {location && <div className="shop-meta-row"><span>Τοποθεσία</span><strong>{location.addressLine1}, {location.postcode} {location.locality}</strong></div>}
                      <div className="shop-meta-row"><span>Κατάλογος</span><strong>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "προϊόν" : "προϊόντα"}</strong></div>
                    </div>

                    {categories.length > 0 && <div className="shop-category-list" aria-label="Κατηγορίες καταστήματος">
                      {categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}
                    </div>}

                    <div className="shop-card-action">
                      <small>{vendor.story ? "Δημοσιευμένη ιστορία καταστήματος" : "Προϊόντα · συμβουλή · στοιχεία"}</small>
                      <a className="text-link" href={`/vendor/${vendor.id}`}>Γνώρισε το κατάστημα →</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Τα προφίλ ετοιμάζονται.</h2>
            <p>Μόλις ενεργοποιηθούν συνεργαζόμενα καταστήματα θα εμφανιστούν εδώ χωρίς να δημοσιεύονται μη εγκεκριμένες πληροφορίες.</p>
            <a className="button" href="/shop">Πήγαινε στα προϊόντα</a>
          </div>
        )}
      </section>
    </main>
  );
}
