import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVendorCatalogCards } from "../../../lib/catalog-view";
import { getPublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { SiteHeader } from "../../../components/SiteHeader";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { publicOrigin } from "../../../lib/public-origin";
import { SiteFooter } from "../../../components/SiteFooter";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function checkedDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor) return { title: "Κατάστημα" };
  const isResearch = vendor.directoryStatus === "research";
  const category = vendor.taxonomies[0];
  const description = vendor.story?.excerpt ?? (isResearch
    ? `Δημόσια καταχώριση για το ${vendor.name}${category?.subcategoryLabel ? ` · ${category.subcategoryLabel}` : ""} στη χαρτογραφημένη αγορά της Σπάρτης.`
    : `Γνώρισε το ${vendor.name}, τα προϊόντα και την τοπική συμβουλή που προσφέρει μέσα από το Buy Local Sparta.`);
  return {
    title: `${vendor.name} · ${isResearch ? "Τοπική επιχείρηση" : "Τοπικό κατάστημα"}`,
    description,
    alternates: { canonical: `/vendor/${encodeURIComponent(vendor.id)}` },
    openGraph: { title: vendor.name, description, url: `/vendor/${encodeURIComponent(vendor.id)}`, images: vendor.mediaId ? [`/api/media/${encodeURIComponent(vendor.mediaId)}`] : undefined, type: "website" }
  };
}

export default async function VendorPage({ params }: Props) {
  const { id } = await params;
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor) notFound();
  const isResearch = vendor.directoryStatus === "research";
  const products = isResearch ? [] : await getVendorCatalogCards(id);
  const location = vendor.location;
  const storyMedia = vendor.story?.mediaUrl;
  const website = safeHttpUrl(vendor.research?.onlineShopUrl);
  const directoryProfile = safeHttpUrl(vendor.research?.directoryProfileUrl);
  const vendorUrl = `${publicOrigin()}/vendor/${encodeURIComponent(vendor.id)}`;
  const mapHref = `/shops/map?vendor=${encodeURIComponent(vendor.id)}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${vendorUrl}#business`,
    name: vendor.name,
    url: vendorUrl,
    description: vendor.story?.excerpt ?? (isResearch ? "Χαρτογραφημένη τοπική επιχείρηση από δημόσιες επιχειρηματικές πηγές." : undefined),
    image: storyMedia ? `${publicOrigin()}${storyMedia}` : undefined,
    telephone: location?.phone,
    email: location?.publicEmail,
    sameAs: [website, directoryProfile].filter(Boolean),
    address: location ? { "@type": "PostalAddress", streetAddress: [location.addressLine1, location.addressLine2].filter(Boolean).join(", "), addressLocality: location.locality, postalCode: location.postcode, addressCountry: "GR" } : undefined,
    geo: location?.coordinates ? { "@type": "GeoCoordinates", latitude: location.coordinates.latitude, longitude: location.coordinates.longitude } : undefined
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
      <div className="announcement">{isResearch ? "Public local-business dossier · δημόσια στοιχεία, καθαρό στάδιο συνεργασίας." : "Know your vendor · γνώρισε τον άνθρωπο πίσω από την αγορά."}</div>
      <SiteHeader />
      <section className="vendor-profile-hero">
        <div className="shell vendor-profile-grid">
          <div>
            <a className="vendor-profile-back" href="/shops">← Όλα τα καταστήματα</a>
            <div className="eyebrow light">{isResearch ? `Χαρτογραφημένη επιχείρηση${location?.locality ? ` · ${location.locality}` : ""}` : (location?.locality ? `Συνεργαζόμενο κατάστημα · ${location.locality}` : "Συνεργαζόμενο τοπικό κατάστημα")}</div>
            <h1>{vendor.name}</h1>
            <p>{isResearch
              ? `Η επιχείρηση έχει εντοπιστεί στη δημόσια χαρτογράφηση της τοπικής αγοράς${vendor.taxonomies[0]?.subcategoryLabel ? ` στην υποκατηγορία «${vendor.taxonomies[0].subcategoryLabel}»` : ""}. Δεν έχει ακόμη ολοκληρώσει onboarding ως συνεργάτης του Buy Local Sparta.`
              : (vendor.story?.excerpt ?? "Το Buy Local Sparta δίνει χώρο στο κατάστημα, στην τεχνογνωσία του και στους ανθρώπους που μπορούν να σε βοηθήσουν — όχι μόνο σε μια λίστα προϊόντων.")}</p>
            <div className="vendor-profile-actions">
              {isResearch ? <>
                {website && <a className="button button-light" href={website} target="_blank" rel="noreferrer">Επίσημο / online website ↗</a>}
                <a className="button vendor-outline" href="/ask-local">Ρώτησε τοπικά</a>
              </> : <>
                <a className="button button-light" href={`/ask-local?vendor=${encodeURIComponent(vendor.id)}`}>Ρώτησε {vendor.adviser ?? "το κατάστημα"}</a>
                <a className="button vendor-outline" href="/shop">Δες την αγορά</a>
              </>}
            </div>
          </div>
          <div className={`merchant-portrait${storyMedia ? " has-photo" : ""}`} aria-label={`Local merchant profile for ${vendor.name}`}>
            {storyMedia ? <img src={storyMedia} alt="" aria-hidden="true" /> : <span>{(vendor.adviser ?? vendor.name).slice(0, 1).toUpperCase()}</span>}
            <small>{isResearch ? "Public business listing" : (vendor.adviser ?? "Local adviser")}<br />{isResearch ? "Invited · onboarding pending" : (storyMedia ? "Approved merchant media" : "Local adviser")}</small>
          </div>
        </div>
      </section>

      <section className="shell vendor-profile-summary" aria-label="Στοιχεία καταστήματος">
        <div className="vendor-profile-facts">
          <div className="vendor-fact"><strong>Επιχείρηση</strong><span>{vendor.name}</span></div>
          <div className="vendor-fact"><strong>Κατάσταση στο Buy Local Sparta</strong><span>{isResearch ? "Χαρτογραφημένη / προσκεκλημένη · όχι ακόμη ενεργός συνεργάτης" : "Ενεργός συνεργάτης"}</span></div>
          {!isResearch && <div className="vendor-fact"><strong>Τοπική συμβουλή</strong><span>{vendor.adviser ?? "Διαθέσιμη μέσω του καταστήματος"}</span></div>}
          {!isResearch && <div className="vendor-fact"><strong>Δημόσιος κατάλογος</strong><span>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "canonical προϊόν" : "canonical προϊόντα"}</span></div>}
          {location && <div className="vendor-fact"><strong>Τοποθεσία</strong><span>{location.addressLine1}{location.addressLine2 ? `, ${location.addressLine2}` : ""}<br />{location.postcode} {location.locality}{location.verified ? " · επαληθευμένο σημείο" : ""}</span></div>}
          {location?.coordinates && <div className="vendor-fact"><strong>Χάρτης</strong><span><a className="text-link" href={mapHref}>Προβολή επιλεγμένου καταστήματος στον χάρτη →</a></span></div>}
          {location?.phone && <div className="vendor-fact"><strong>Τηλέφωνο</strong><span><a href={`tel:${location.phone}`}>{location.phone}</a></span></div>}
          {location?.publicEmail && <div className="vendor-fact"><strong>Email</strong><span><a href={`mailto:${location.publicEmail}`}>{location.publicEmail}</a></span></div>}
          {vendor.taxonomies.length > 0 && <div className="vendor-fact"><strong>Κατηγορία & υποκατηγορία</strong><div className="vendor-category-row">{vendor.taxonomies.map((taxonomy) => <a className="shop-category-chip" href={`/shops?category=${encodeURIComponent(taxonomy.categorySlug)}${taxonomy.subcategorySlug ? `&subcategory=${encodeURIComponent(taxonomy.subcategorySlug)}` : ""}`} key={`${taxonomy.categorySlug}-${taxonomy.subcategorySlug ?? "all"}`}>{taxonomy.categoryLabel}{taxonomy.subcategoryLabel ? ` · ${taxonomy.subcategoryLabel}` : ""}</a>)}</div></div>}
          {isResearch && vendor.research?.directoryCategories && <div className="vendor-fact"><strong>Δημόσια περιγραφή κατηγορίας</strong><span>{vendor.research.directoryCategories}</span></div>}
          {isResearch && website && <div className="vendor-fact"><strong>Website / online shop</strong><span><a className="text-link" href={website} target="_blank" rel="noreferrer">{website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗</a></span></div>}
          {isResearch && checkedDate(vendor.research?.checkedAt) && <div className="vendor-fact"><strong>Τελευταίος δημόσιος έλεγχος</strong><span>{checkedDate(vendor.research?.checkedAt)}</span></div>}
        </div>

        {isResearch ? <article className="vendor-story-card">
          <div className="eyebrow">Δημόσιο business dossier</div>
          <h2>Τι γνωρίζουμε δημόσια.</h2>
          <p>Η σελίδα συγκεντρώνει στοιχεία που έχουν εντοπιστεί σε δημόσιες επιχειρηματικές πηγές: εμπορική ονομασία, τοποθεσία, στοιχεία επικοινωνίας, κατηγορία δραστηριότητας και, όπου έχει εντοπιστεί, website ή online shop.</p>
          <p>Η παρουσία εδώ <strong>δεν σημαίνει συνεργασία, έγκριση προϊόντων ή εμπορική σχέση</strong>. Εσωτερικές σημειώσεις απόκτησης vendor, scoring, πιθανοί εταιρικοί συσχετισμοί και τεχνικές παρατηρήσεις δεν δημοσιεύονται.</p>
          <div className="hero-actions">
            {directoryProfile && <a className="text-link" href={directoryProfile} target="_blank" rel="noreferrer">Δημόσια καταχώριση πηγής ↗</a>}
            {website && <a className="text-link" href={website} target="_blank" rel="noreferrer">Website επιχείρησης ↗</a>}
          </div>
        </article> : <article className="vendor-story-card">
          <div className="eyebrow">Η ιστορία του καταστήματος</div>
          {vendor.story ? <><h2>{vendor.story.title}</h2><p>{vendor.story.excerpt}</p><small className="vendor-story-approval">Δημοσιευμένο merchant story με καταγεγραμμένη έγκριση του vendor{storyMedia ? " και εγκεκριμένο οπτικό υλικό." : "."}</small></> : <><h2>Πραγματικός άνθρωπος, όχι απρόσωπη καταχώριση.</h2><p>Δεν έχει δημοσιευθεί ακόμη εγκεκριμένη ιστορία για αυτό το κατάστημα. Η πλατφόρμα δεν συμπληρώνει δημόσιο storytelling χωρίς έγκριση.</p></>}
        </article>}
      </section>

      {isResearch ? <section className="shell section">
        <div className="section-heading"><div><div className="eyebrow">Ανακάλυψη τοπικής αγοράς</div><h2>Δεν έχει ενεργοποιηθεί ακόμη κατάλογος προϊόντων.</h2></div><p className="section-note">Τα προϊόντα, η συμβουλή, οι προσφορές και η δυνατότητα παραγγελίας εμφανίζονται μόνο μετά από onboarding, verification και τους αντίστοιχους publication gates.</p></div>
        <div className="empty-state"><h2>Θέλεις κάτι από αυτή την κατηγορία;</h2><p>Χρησιμοποίησε το Ask Local για να περιγράψεις τι ψάχνεις. Το αίτημα δρομολογείται μόνο σε κατάλληλους ενεργούς συνεργάτες.</p><a className="button" href="/ask-local">Ρώτησε τοπικά</a></div>
      </section> : <section className="shell section">
        <div className="section-heading"><div><div className="eyebrow">Η επιλογή του συνεργάτη</div><h2>Προϊόντα που εξυπηρετούνται εδώ τώρα</h2></div><p className="section-note">Η σελίδα δείχνει canonical προϊόντα που το κατάστημα μπορεί να εξυπηρετήσει, χωρίς να δημιουργεί Fair Vendor Exposure γεγονότα ή να αποκαλύπτει κρυφές τιμές προμηθευτή.</p></div>
        {products.length ? <div className="product-grid">{products.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={{ name: vendor.name, adviser: vendor.adviser }} key={product.id} />)}</div> : <div className="empty-state"><h2>Δεν υπάρχουν διαθέσιμα canonical προϊόντα για αυτό το προφίλ.</h2><p>Το κατάστημα μπορεί να παραμένει δημόσια ορατό χωρίς να εμφανίζονται ανενεργές ή μη διαθέσιμες προσφορές προϊόντων.</p><a className="button" href="/shop">Δες όλα τα προϊόντα</a></div>}
      </section>}
      <SiteFooter />
    </main>
  );
}
