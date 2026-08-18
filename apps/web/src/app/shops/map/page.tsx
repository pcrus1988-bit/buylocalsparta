import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorMapDirectory, type VendorMapCategory, type VendorMapEntry } from "../../../components/VendorMapDirectory";
import { getPublicVendorDirectory, type PublicVendorDirectoryEntry } from "../../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";

type Props = Readonly<{ searchParams: Promise<{ vendor?: string }> }>;

export const metadata: Metadata = {
  title: "Χάρτης καταστημάτων",
  description: "Βρες τοπικά καταστήματα στη Σπάρτη πάνω στον χάρτη, φιλτράρισε ανά κατηγορία και απόσταση και άνοιξε απευθείας το δημόσιο dossier κάθε επιχείρησης."
};

function categoryKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("el").replace(/[^a-z0-9\u0370-\u03ff]+/gi, "-").replace(/^-|-$/g, "");
}

function categoriesFor(vendor: PublicVendorDirectoryEntry): readonly VendorMapCategory[] {
  if (vendor.directoryStatus === "research") return vendor.researchCategory ? [{ key: `research:${categoryKey(vendor.researchCategory)}`, label: vendor.researchCategory }] : [];
  const seen = new Set<string>();
  return vendor.categoryCodes.flatMap((code) => {
    const category = storefrontCategoryForCode(code);
    if (seen.has(category.slug)) return [];
    seen.add(category.slug);
    return [{ key: category.slug, label: category.label }];
  });
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
    canonicalCount: vendor.canonicalCount,
    address: vendor.location?.addressLine1,
    locality: vendor.location?.locality,
    postcode: vendor.location?.postcode,
    coordinates: vendor.location?.coordinates,
    categories: categoriesFor(vendor)
  }));
  const requestedVendor = typeof params.vendor === "string" ? params.vendor.slice(0, 160) : "";
  const initialVendorId = vendors.some((vendor) => vendor.id === requestedVendor) ? requestedVendor : undefined;
  const categoryMap = new Map<string, VendorMapCategory>();
  for (const vendor of vendors) for (const category of vendor.categories) categoryMap.set(category.key, category);
  const categories = [...categoryMap.values()].sort((a, b) => {
    const aResearch = a.key.startsWith("research:");
    const bResearch = b.key.startsWith("research:");
    if (aResearch !== bResearch) return aResearch ? 1 : -1;
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
          <p className="lead compact">Αναζήτησε επιχείρηση, φιλτράρισε ανά κατηγορία ή στάδιο συνεργασίας, χρησιμοποίησε προαιρετικά την τοποθεσία σου και επίλεξε απευθείας ένα σημείο για να ανοίξεις το δημόσιο dossier του καταστήματος.</p>
          <div className="hero-actions"><a className="button" href="#vendor-map">Άνοιξε τον χάρτη</a><a className="button button-secondary" href="/shops">Προβολή ως λίστα</a></div>
          <div className="hero-proof"><span><strong>{mappedCount}</strong> επιχειρήσεις με διαθέσιμο σημείο</span><span><strong>{partnerCount}</strong> ενεργοί συνεργάτες</span><span><strong>{vendors.length}</strong> δημόσιες καταχωρίσεις συνολικά</span></div>
        </div>
      </section>
      <section className="shell section" id="vendor-map" aria-labelledby="vendor-map-title">
        <div className="section-heading">
          <div><div className="eyebrow">Nearby vendors</div><h2 id="vendor-map-title">Διάλεξε κατάστημα από τον χάρτη</h2></div>
          <p className="section-note">Η θέση σου ζητείται μόνο όταν πατήσεις «Χρησιμοποίησε τη θέση μου» και χρησιμοποιείται στον browser για ταξινόμηση/φιλτράρισμα απόστασης. Καταχωρίσεις χωρίς αποθηκευμένες συντεταγμένες παραμένουν διαθέσιμες στη λίστα.</p>
        </div>
        {vendors.length ? <VendorMapDirectory vendors={vendors} categories={categories} initialVendorId={initialVendorId} /> : <div className="empty-state"><h2>Η βάση καταστημάτων ετοιμάζεται.</h2><p>Δεν υπάρχουν ακόμη δημόσιες καταχωρίσεις στην παραγωγική βάση δεδομένων.</p><a className="button" href="/shops">Πίσω στα καταστήματα</a></div>}
      </section>
      <SiteFooter />
    </main>
  );
}
