import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVendorCatalogCards } from "../../../lib/catalog-view";
import { getPublicVendorDirectoryEntry, type PublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";
import { SiteHeader } from "../../../components/SiteHeader";
import { CatalogProductCard } from "../../../components/CatalogProductCard";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

function categoriesFor(vendor: PublicVendorDirectoryEntry) {
  const seen = new Set<string>();
  return vendor.categoryCodes.flatMap((code) => {
    const category = storefrontCategoryForCode(code);
    if (seen.has(category.slug)) return [];
    seen.add(category.slug);
    return [category];
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getPublicVendorDirectoryEntry(id);
  return {
    title: vendor ? `${vendor.name} · Τοπικό κατάστημα` : "Κατάστημα",
    description: vendor?.story?.excerpt ?? (vendor ? `Γνώρισε το ${vendor.name}, τα προϊόντα και την τοπική συμβουλή που προσφέρει μέσα από το Buy Local Sparta.` : undefined)
  };
}

export default async function VendorPage({ params }: Props) {
  const { id } = await params;
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor) notFound();
  const products = await getVendorCatalogCards(id);
  const categories = categoriesFor(vendor);
  const location = vendor.location;

  return (
    <main>
      <div className="announcement">Know your vendor · γνώρισε τον άνθρωπο πίσω από την αγορά.</div>
      <SiteHeader />

      <section className="vendor-profile-hero">
        <div className="shell vendor-profile-grid">
          <div>
            <a className="vendor-profile-back" href="/shops">← Όλα τα καταστήματα</a>
            <div className="eyebrow light">{vendor.demo ? "Demo συνεργάτης" : location?.locality ? `Συνεργαζόμενο κατάστημα · ${location.locality}` : "Συνεργαζόμενο τοπικό κατάστημα"}</div>
            <h1>{vendor.name}</h1>
            <p>{vendor.story?.excerpt ?? "Το Buy Local Sparta δίνει χώρο στο κατάστημα, στην τεχνογνωσία του και στους ανθρώπους που μπορούν να σε βοηθήσουν — όχι μόνο σε μια λίστα προϊόντων."}</p>
            <div className="vendor-profile-actions">
              <a className="button button-light" href="/#advice">Ρώτησε {vendor.adviser ?? "το κατάστημα"}</a>
              <a className="button vendor-outline" href="/shop">Δες την αγορά</a>
            </div>
          </div>
          <div className={`merchant-portrait${vendor.mediaId ? " has-media" : ""}`} aria-label={`Επιλεγμένη εικόνα από το ${vendor.name}`}>
            {vendor.mediaId && <img src={`/api/media/${encodeURIComponent(vendor.mediaId)}`} alt={vendor.mediaAlt ?? `Επιλεγμένο προϊόν από το ${vendor.name}`} decoding="async" />}
            <span>{(vendor.adviser ?? vendor.name).slice(0, 1).toUpperCase()}</span>
            <small>{vendor.adviser ?? "Local adviser"}<br />{vendor.mediaId ? "Εγκεκριμένη εικόνα καταλόγου" : vendor.demo ? "Demo profile" : "Local adviser"}</small>
          </div>
        </div>
      </section>

      <section className="shell vendor-profile-summary" aria-label="Στοιχεία καταστήματος">
        <div className="vendor-profile-facts">
          <div className="vendor-fact"><strong>Κατάστημα</strong><span>{vendor.name}</span></div>
          <div className="vendor-fact"><strong>Τοπική συμβουλή</strong><span>{vendor.adviser ?? "Διαθέσιμη μέσω του καταστήματος"}</span></div>
          <div className="vendor-fact"><strong>Δημόσιος κατάλογος</strong><span>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "canonical προϊόν" : "canonical προϊόντα"}</span></div>
          {location && <div className="vendor-fact"><strong>Τοποθεσία</strong><span>{location.addressLine1}{location.addressLine2 ? `, ${location.addressLine2}` : ""}<br />{location.postcode} {location.locality}{location.verified ? " · επαληθευμένο σημείο" : ""}</span></div>}
          {location?.phone && <div className="vendor-fact"><strong>Τηλέφωνο</strong><span><a href={`tel:${location.phone}`}>{location.phone}</a></span></div>}
          {location?.publicEmail && <div className="vendor-fact"><strong>Email</strong><span><a href={`mailto:${location.publicEmail}`}>{location.publicEmail}</a></span></div>}
          {categories.length > 0 && <div className="vendor-fact"><strong>Κατηγορίες</strong><div className="vendor-category-row">{categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}</div></div>}
        </div>

        <article className="vendor-story-card">
          <div className="eyebrow">Η ιστορία του καταστήματος</div>
          {vendor.story ? <>
            <h2>{vendor.story.title}</h2>
            <p>{vendor.story.excerpt}</p>
            <small className="vendor-story-approval">Δημοσιευμένο merchant story με καταγεγραμμένη έγκριση του vendor.</small>
          </> : <>
            <h2>Πραγματικός άνθρωπος, όχι απρόσωπη καταχώριση.</h2>
            <p>{vendor.demo ? "Το demo προφίλ δεν παρουσιάζει επινοημένη ιστορία καταστήματος." : "Δεν έχει δημοσιευθεί ακόμη εγκεκριμένη ιστορία για αυτό το κατάστημα. Η πλατφόρμα δεν συμπληρώνει δημόσιο storytelling χωρίς έγκριση."}</p>
          </>}
        </article>
      </section>

      <section className="shell section">
        <div className="section-heading">
          <div><div className="eyebrow">Η επιλογή του συνεργάτη</div><h2>Προϊόντα που εξυπηρετούνται εδώ τώρα</h2></div>
          <p className="section-note">Η σελίδα δείχνει canonical προϊόντα που το κατάστημα μπορεί να εξυπηρετήσει, χωρίς να δημιουργεί Fair Vendor Exposure γεγονότα ή να αποκαλύπτει κρυφές τιμές προμηθευτή.</p>
        </div>
        {products.length ? <div className="product-grid">{products.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={{ name: vendor.name, adviser: vendor.adviser }} key={product.id} />)}</div> : <div className="empty-state"><h2>Δεν υπάρχουν διαθέσιμα canonical προϊόντα για αυτό το προφίλ.</h2><p>Το κατάστημα μπορεί να παραμένει δημόσια ορατό χωρίς να εμφανίζονται ανενεργές ή μη διαθέσιμες προσφορές προϊόντων.</p><a className="button" href="/shop">Δες όλα τα προϊόντα</a></div>}
      </section>
    </main>
  );
}
