import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorMapDirectory, type VendorMapEntry, type VendorMapFacet } from "../../../components/VendorMapDirectory";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";

type Props = Readonly<{ searchParams: Promise<{ vendor?: string }> }>;

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/shops/map", {
  title: "Χάρτης καταστημάτων",
  description: "Βρες τοπικά καταστήματα στη Σπάρτη πάνω στον χάρτη, φιλτράρισε ανά κατηγορία, υποκατηγορία και απόσταση και άνοιξε απευθείας το δημόσιο dossier κάθε επιχείρησης."
  });
}

function facetsFor(vendor: PublicVendorDirectoryEntry): readonly VendorMapFacet[] {
  const facets = new Map<string, VendorMapFacet>();
  for (const taxonomy of vendor.taxonomies) {
    const category: VendorMapFacet = { key: `category:${taxonomy.categorySlug}`, label: taxonomy.categoryLabel, kind: "category" };
    facets.set(category.key, category);
    if (taxonomy.subcategorySlug && taxonomy.subcategoryLabel) {
      const subcategory: VendorMapFacet = {
        key: `subcategory:${taxonomy.subcategorySlug}`,
        label: `${taxonomy.categoryLabel} · ${taxonomy.subcategoryLabel}`,
        kind: "subcategory"
      };
      facets.set(subcategory.key, subcategory);
    }
  }
  return [...facets.values()];
}

export default async function ShopsMapPage({ searchParams }: Props) {
  const directory = await getPublicVendorDirectory();
  const params = await searchParams;
  const vendors: readonly VendorMapEntry[] = directory.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    href: `/vendor/${encodeURIComponent(vendor.id)}`,
    status: vendor.directoryStatus,
    adviser: vendor.adviser,
    address: vendor.location?.addressLine1,
    locality: vendor.location?.locality,
    postcode: vendor.location?.postcode,
    coordinates: vendor.location?.coordinates,
    researchDistanceKm: vendor.research?.distanceKm,
    facets: facetsFor(vendor)
  }));
  const requestedVendor = typeof params.vendor === "string" ? params.vendor.slice(0, 160) : "";
  const initialVendorId = vendors.some((vendor) => vendor.id === requestedVendor) ? requestedVendor : undefined;
  const facetMap = new Map<string, VendorMapFacet>();
  for (const vendor of vendors) for (const facet of vendor.facets) facetMap.set(facet.key, facet);
  const facets = [...facetMap.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "category" ? -1 : 1;
    return a.label.localeCompare(b.label, "el");
  });
  const mappedCount = vendors.filter((vendor) => vendor.coordinates).length;
  const partnerCount = vendors.filter((vendor) => vendor.status === "partner").length;

  return (
    <main>
      <div className="announcement">Χάρτης τοπικής αγοράς · βρες το κατάστημα που βρίσκεται κοντά σου.</div>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Explore Sparta locally</div>
          <h1>Η αγορά της Σπάρτης, πάνω στον χάρτη.</h1>
          <p className="lead compact">Αναζήτησε επιχείρηση, φιλτράρισε ανά κατηγορία, υποκατηγορία ή στάδιο συνεργασίας, χρησιμοποίησε προαιρετικά την τοποθεσία σου και επίλεξε ένα pin για να ανοίξεις απευθείας το δημόσιο dossier του καταστήματος.</p>
          <div className="hero-actions">
            <a className="button" href="#vendor-map">Άνοιξε τον χάρτη</a>
            <a className="button button-secondary" href="/shops">Προβολή ως λίστα</a>
          </div>
          <div className="hero-proof">
            <span><strong>{mappedCount}</strong> επιχειρήσεις με αποθηκευμένο σημείο</span>
            <span><strong>{partnerCount}</strong> ενεργοί συνεργάτες</span>
            <span><strong>{vendors.length}</strong> δημόσιες καταχωρίσεις συνολικά</span>
          </div>
        </div>
      </section>

      <section className="shell section" id="vendor-map" aria-labelledby="vendor-map-title">
        <div className="section-heading">
          <div><div className="eyebrow">Nearby vendors</div><h2 id="vendor-map-title">Διάλεξε κατάστημα από τον χάρτη</h2></div>
          <p className="section-note">Η θέση σου ζητείται μόνο όταν πατήσεις «Χρησιμοποίησε τη θέση μου» και χρησιμοποιείται στον browser για ταξινόμηση και φιλτράρισμα απόστασης. Καταχωρίσεις χωρίς αποθηκευμένες συντεταγμένες παραμένουν διαθέσιμες στη λίστα και δεν τοποθετούνται σε ψεύτικο σημείο.</p>
        </div>
        {vendors.length
          ? <VendorMapDirectory vendors={vendors} facets={facets} initialVendorId={initialVendorId} />
          : <div className="empty-state"><h2>Η βάση καταστημάτων ετοιμάζεται.</h2><p>Δεν υπάρχουν ακόμη δημόσιες καταχωρίσεις στην παραγωγική βάση δεδομένων.</p><a className="button" href="/shops">Πίσω στα καταστήματα</a></div>}
      </section>
      <SiteFooter />
    </main>
  );
}
