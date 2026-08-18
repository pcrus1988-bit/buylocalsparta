import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVendorCatalogCards } from "../../../lib/catalog-view";
import { getPublicVendorDirectoryEntry, type PublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";
import { SiteHeader } from "../../../components/SiteHeader";
import { CatalogProductCard } from "../../../components/CatalogProductCard";
import { publicOrigin } from "../../../lib/public-origin";
import { SiteFooter } from "../../../components/SiteFooter";

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
  const isResearch = vendor?.directoryStatus === "research";
  return {
    title: vendor ? `${vendor.name} · ${isResearch ? "Δημόσιο dossier" : "Τοπικό κατάστημα"}` : "Κατάστημα",
    description: vendor?.story?.excerpt ?? (vendor ? (isResearch ? `Δημόσιο dossier χαρτογραφημένης τοπικής επιχείρησης ${vendor.name} στο Buy Local Sparta. Η επιχείρηση δεν παρουσιάζεται ως ενεργός συνεργάτης.` : `Γνώρισε το ${vendor.name}, τα προϊόντα και την τοπική συμβουλή που προσφέρει μέσα από το Buy Local Sparta.`) : undefined),
    alternates: vendor ? { canonical: `/vendor/${encodeURIComponent(vendor.id)}` } : undefined,
    openGraph: vendor ? { title: vendor.name, description: vendor.story?.excerpt ?? (isResearch ? "Χαρτογραφημένη τοπική επιχείρηση στο δημόσιο directory του Buy Local Sparta." : "Τοπικό κατάστημα στη Σπάρτη μέσα από το Buy Local Sparta."), url: `/vendor/${encodeURIComponent(vendor.id)}`, images: vendor.mediaId ? [`/api/media/${encodeURIComponent(vendor.mediaId)}`] : undefined, type: "website" } : undefined
  };
}

export default async function VendorPage({ params }: Props) {
  const { id } = await params;
  const vendor = await getPublicVendorDirectoryEntry(id);
  if (!vendor) notFound();
  const isResearch = vendor.directoryStatus === "research";
  const products = isResearch ? [] : await getVendorCatalogCards(id);
  const categories = categoriesFor(vendor);
  const location = vendor.location;
  const storyMedia = vendor.story?.mediaUrl;
  const vendorUrl = `${publicOrigin()}/vendor/${encodeURIComponent(vendor.id)}`;
  const structuredData = {
    "@context": "https://schema.org", "@type": "LocalBusiness", "@id": `${vendorUrl}#business`, name: vendor.name, url: vendorUrl,
    description: vendor.story?.excerpt ?? (isResearch ? `Χαρτογραφημένη τοπική επιχείρηση στο Buy Local Sparta. Δεν είναι ακόμη ενεργός συνεργάτης της πλατφόρμας.` : undefined),
    image: storyMedia ? `${publicOrigin()}${storyMedia}` : undefined,
    telephone: location?.phone, email: location?.publicEmail,
    address: location ? { "@type": "PostalAddress", streetAddress: [location.addressLine1, location.addressLine2].filter(Boolean).join(", "), addressLocality: location.locality, postalCode: location.postcode, addressCountry: "GR" } : undefined,
    geo: location?.coordinates ? { "@type": "GeoCoordinates", latitude: location.coordinates.latitude, longitude: location.coordinates.longitude } : undefined
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} />
      <div className="announcement">{isResearch ? "Δημόσιο dossier · χαρτογραφημένη επιχείρηση · δεν είναι ακόμη συνεργάτης." : "Know your vendor · γνώρισε τον άνθρωπο πίσω από την αγορά."}</div>
      <SiteHeader />
      <section className="vendor-profile-hero">
        <div className="shell vendor-profile-grid">
          <div>
            <a className="vendor-profile-back" href="/shops">← Όλα τα καταστήματα</a>
            <div className="eyebrow light">{isResearch ? (location?.locality ? `Χαρτογραφημένη επιχείρηση · ${location.locality}` : "Χαρτογραφημένη τοπική επιχείρηση") : (location?.locality ? `Συνεργαζόμενο κατάστημα · ${location.locality}` : "Συνεργαζόμενο τοπικό κατάστημα")}</div>
            <h1>{vendor.name}</h1>
            <p>{isResearch ? "Αυτή είναι δημόσια καταχώριση από την ερευνητική βάση του Buy Local Sparta. Παρουσιάζουμε μόνο τα διαθέσιμα δημόσια στοιχεία και δεν υπονοούμε ενεργή εμπορική συνεργασία, ενεργό κατάλογο ή έγκριση storytelling από τον έμπορο." : (vendor.story?.excerpt ?? "Το Buy Local Sparta δίνει χώρο στο κατάστημα, στην τεχνογνωσία του και στους ανθρώπους που μπορούν να σε βοηθήσουν — όχι μόνο σε μια λίστα προϊόντων.")}</p>
            <div className="vendor-profile-actions">
              {isResearch ? <><a className="button button-light" href="/shops/map">Βρες το στον χάρτη</a><a className="button vendor-outline" href="/shops">Όλες οι επιχειρήσεις</a></> : <><a className="button button-light" href={`/ask-local?vendor=${encodeURIComponent(vendor.id)}`}>Ρώτησε {vendor.adviser ?? "το κατάστημα"}</a><a className="button vendor-outline" href="/shop">Δες την αγορά</a></>}
            </div>
          </div>
          <div className={`merchant-portrait${storyMedia ? " has-photo" : ""}`} aria-label={`Local business profile for ${vendor.name}`}>
            {storyMedia ? <img src={storyMedia} alt="" aria-hidden="true" /> : <span>{(vendor.adviser ?? vendor.name).slice(0, 1).toUpperCase()}</span>}
            <small>{isResearch ? <>PUBLIC DOSSIER<br />Research listing</> : <>{vendor.adviser ?? "Local adviser"}<br />{storyMedia ? "Approved merchant media" : "Local adviser"}</>}</small>
          </div>
        </div>
      </section>
      <section className="shell vendor-profile-summary" aria-label="Στοιχεία καταστήματος">
        <div className="vendor-profile-facts">
          <div className="vendor-fact"><strong>Κατάστημα</strong><span>{vendor.name}</span></div>
          {isResearch ? <div className="vendor-fact"><strong>Κατάσταση</strong><span>INVITED · χαρτογραφημένη επιχείρηση · όχι ακόμη ενεργός συνεργάτης</span></div> : <><div className="vendor-fact"><strong>Τοπική συμβουλή</strong><span>{vendor.adviser ?? "Διαθέσιμη μέσω του καταστήματος"}</span></div><div className="vendor-fact"><strong>Δημόσιος κατάλογος</strong><span>{vendor.canonicalCount} {vendor.canonicalCount === 1 ? "canonical προϊόν" : "canonical προϊόντα"}</span></div></>}
          {location && <div className="vendor-fact"><strong>Τοποθεσία</strong><span>{location.addressLine1}{location.addressLine2 ? `, ${location.addressLine2}` : ""}<br />{location.postcode} {location.locality}{location.verified ? " · επαληθευμένο σημείο" : ""}</span></div>}
          {location?.coordinates && <div className="vendor-fact"><strong>Χάρτης</strong><span><a href={`/shops/map?vendor=${encodeURIComponent(vendor.id)}`}>Προβολή στον χάρτη →</a></span></div>}
          {location?.phone && <div className="vendor-fact"><strong>Τηλέφωνο</strong><span><a href={`tel:${location.phone}`}>{location.phone}</a></span></div>}{location?.publicEmail && <div className="vendor-fact"><strong>Email</strong><span><a href={`mailto:${location.publicEmail}`}>{location.publicEmail}</a></span></div>}
          {categories.length > 0 && <div className="vendor-fact"><strong>Κατηγορίες</strong><div className="vendor-category-row">{categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}</div></div>}
          {isResearch && vendor.researchCategory && <div className="vendor-fact"><strong>Κατηγορία έρευνας</strong><div className="vendor-category-row"><span className="shop-category-chip">{vendor.researchCategory}</span></div></div>}
        </div>
        <article className="vendor-story-card">
          <div className="eyebrow">{isResearch ? "Public research dossier" : "Η ιστορία του καταστήματος"}</div>
          {isResearch ? <><h2>Δημόσια στοιχεία, με καθαρή ένδειξη προέλευσης.</h2><p>Η επιχείρηση έχει εντοπιστεί στη χαρτογράφηση της τοπικής αγοράς και βρίσκεται στο στάδιο πρόσκλησης/onboarding. Η σελίδα δεν εμφανίζει προϊόντα, συμβουλές, merchant story ή ισχυρισμό συνεργασίας μέχρι να ολοκληρωθεί η ενεργοποίηση από τον έμπορο.</p><small className="vendor-story-approval">Research listing · public directory data · not an active marketplace partner.</small></> : vendor.story ? <><h2>{vendor.story.title}</h2><p>{vendor.story.excerpt}</p><small className="vendor-story-approval">Δημοσιευμένο merchant story με καταγεγραμμένη έγκριση του vendor{storyMedia ? " και εγκεκριμένο οπτικό υλικό." : "."}</small></> : <><h2>Πραγματικός άνθρωπος, όχι απρόσωπη καταχώριση.</h2><p>Δεν έχει δημοσιευθεί ακόμη εγκεκριμένη ιστορία για αυτό το κατάστημα. Η πλατφόρμα δεν συμπληρώνει δημόσιο storytelling χωρίς έγκριση.</p></>}
        </article>
      </section>
      {isResearch ? <section className="shell section"><div className="empty-state"><div className="eyebrow">Onboarding status</div><h2>Ο εμπορικός κατάλογος δεν έχει ενεργοποιηθεί ακόμη.</h2><p>Το dossier παραμένει χρήσιμο για ανακάλυψη και τοπική χαρτογράφηση, χωρίς να εμφανίζει ανενεργά προϊόντα ή να δημιουργεί την εντύπωση ότι η επιχείρηση έχει ήδη συμβληθεί με το Buy Local Sparta.</p><a className="button" href="/shops/map">Συνέχισε στον χάρτη</a></div></section> : <section className="shell section"><div className="section-heading"><div><div className="eyebrow">Η επιλογή του συνεργάτη</div><h2>Προϊόντα που εξυπηρετούνται εδώ τώρα</h2></div><p className="section-note">Η σελίδα δείχνει canonical προϊόντα που το κατάστημα μπορεί να εξυπηρετήσει, χωρίς να δημιουργεί Fair Vendor Exposure γεγονότα ή να αποκαλύπτει κρυφές τιμές προμηθευτή.</p></div>{products.length ? <div className="product-grid">{products.map((product, index) => <CatalogProductCard product={product} index={index} vendorContext={{ name: vendor.name, adviser: vendor.adviser }} key={product.id} />)}</div> : <div className="empty-state"><h2>Δεν υπάρχουν διαθέσιμα canonical προϊόντα για αυτό το προφίλ.</h2><p>Το κατάστημα μπορεί να παραμένει δημόσια ορατό χωρίς να εμφανίζονται ανενεργές ή μη διαθέσιμες προσφορές προϊόντων.</p><a className="button" href="/shop">Δες όλα τα προϊόντα</a></div>}</section>}
      <SiteFooter />
    </main>
  );
}
