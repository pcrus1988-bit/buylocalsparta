import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../../components/SiteFooter";
import { SiteHeader } from "../../../../../components/SiteHeader";
import {
  VendorMapDirectory, type VendorMapEntry, type VendorMapFacet
} from "../../../../../components/VendorMapDirectory";
import { getExpansionHubBySlug } from "../../../../../lib/expansion-hubs";
import { hubCensusBusinessPath, listPublicHubCensus } from "../../../../../lib/hub-gemi-directory";
import { listPublicHubClaimsByHub } from "../../../../../lib/hub-claim-runtime";
import { listVerifiedHubPartnersByHub } from "../../../../../lib/hub-verified-partners";
import { hubClaimPublicPath } from "../../../../../lib/hub-claim-public-url";

type Props = Readonly<{
  params: Promise<{ hubSlug: string }>;
  searchParams: Promise<{ vendor?: string }>;
}>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) return { title: "HUB δεν βρέθηκε · KONTA MOY", robots: { index: false, follow: false } };
  return {
    title: "Χάρτης επιχειρήσεων " + hub.nameEl + " · KONTA MOY",
    description: "Εξερεύνησε επαληθευμένες επιχειρήσεις και δημόσιες πληροφοριακές καταχωρίσεις στο HUB " + hub.nameEl + ".",
    alternates: { canonical: "/hubs/" + hub.slug + "/business" },
    robots: { index: false, follow: true }
  };
}

export default async function HubBusinessesMapPage({ params, searchParams }: Props) {
  const { hubSlug } = await params;
  const hub = getExpansionHubBySlug(hubSlug);
  if (!hub) notFound();
  const query = await searchParams;
  const [claims, partners, census] = await Promise.all([
    listPublicHubClaimsByHub(hub.slug, 100),
    listVerifiedHubPartnersByHub(hub.slug, 100),
    listPublicHubCensus(hub.slug, { limit: 48 })
  ]);

  // Only public, approved records. CLAIM/plan addresses are publicly accepted
  // but no pin exists until independently geocoded and reviewed; GEMI municipality
  // matches never inherit the HUB centroid as a fabricated premises location.
  const vendors: VendorMapEntry[] = [
    ...partners.map((entry): VendorMapEntry => ({
      id: "partner:" + entry.id, name: entry.businessName, href: entry.publicPath,
      status: "partner", locality: entry.hubCity,
      facets: [{ key: "category:approved", label: "Εγκεκριμένες παρουσίες", kind: "category" }]
    })),
    ...claims.map((entry): VendorMapEntry => ({
      id: "claim:" + entry.id, name: entry.businessName, href: hubClaimPublicPath(entry),
      status: "partner", locality: entry.hubCity, postcode: entry.postcode,
      address: entry.address || undefined,
      facets: [{ key: "category:approved", label: "Εγκεκριμένες παρουσίες", kind: "category" }]
    })),
    ...census.items.map((entry): VendorMapEntry => ({
      id: "gemi:" + entry.gemiNumber, name: entry.legalName,
      href: hubCensusBusinessPath(entry), status: "research",
      locality: entry.city || entry.municipality || hub.nameEl, postcode: entry.postcode,
      coordinates: entry.coordinates,
      researchDistanceKm: entry.coordinates ? entry.distanceKm : undefined,
      facets: [{ key: "category:" + entry.sectorCode, label: entry.category, kind: "category" }]
    }))
  ];

  const facetMap = new Map<string, VendorMapFacet>();
  for (const vendor of vendors) for (const facet of vendor.facets) facetMap.set(facet.key, facet);
  const facets = [...facetMap.values()].sort((a, b) => a.label.localeCompare(b.label, "el"));
  const selected = typeof query.vendor === "string" ? query.vendor.slice(0, 128) : "";
  const initialVendorId = vendors.some((item) => item.id === selected) ? selected : undefined;
  const pinned = vendors.filter((item) => item.coordinates).length;
  const directoryPath = "/hubs/" + hub.slug + "/business";

  return (
    <main>
      <div className="announcement">Χάρτης τοπικής αγοράς · HUB {hub.nameEl}</div>
      <SiteHeader />
      <section className="page-hero">
        <div className="shell">
          <div className="eyebrow">Explore {hub.nameEl} locally</div>
          <h1>Η αγορά του HUB {hub.nameEl}, πάνω στον χάρτη.</h1>
          <p className="lead compact">Αναζήτησε επιχείρηση, φιλτράρισε ανά κατηγορία ή στάδιο,
            χρησιμοποίησε προαιρετικά τη θέση σου και άνοιξε απευθείας το δημόσιο προφίλ.
            Οι εγγραφές ΓΕΜΗ χωρίς ανεξάρτητα επαληθευμένες συντεταγμένες παραμένουν στη λίστα —
            δεν εμφανίζονται ως πλασματικά pins στο κέντρο του δήμου.</p>
          <div className="hero-actions">
            <a className="button" href="#hub-vendor-map">Άνοιξε τον χάρτη</a>
            <Link className="button button-secondary" href={directoryPath}>Προβολή ως λίστα</Link>
          </div>
          <div className="hero-proof">
            <span><strong>{pinned}</strong> επιχειρήσεις με ελεγμένο ακριβές σημείο</span>
            <span><strong>{claims.length + partners.length}</strong> εγκεκριμένες παρουσίες</span>
            <span><strong>{vendors.length}</strong> εμφανιζόμενες δημόσιες καταχωρίσεις</span>
          </div>
        </div>
      </section>
      <section className="shell section" id="hub-vendor-map" aria-labelledby="hub-vendor-map-title">
        <div className="section-heading">
          <div><div className="eyebrow">Nearby businesses</div>
            <h2 id="hub-vendor-map-title">Διάλεξε επιχείρηση από τον χάρτη ή τη λίστα</h2>
          </div>
          <p className="section-note">Ο εντοπισμός θέσης ενεργοποιείται μόνο με δική σου επιλογή.
            Η δημόσια καταχώριση ΓΕΜΗ δεν σημαίνει ενεργό συνεργάτη ή διαθέσιμο checkout.
            Εμφανίζεται ένα περιορισμένο σύνολο· για περισσότερες επιχειρήσεις χρησιμοποίησε
            την <Link className="text-link" href={directoryPath}>πλήρη σελιδοποιημένη λίστα</Link>.</p>
        </div>
        {vendors.length ? <VendorMapDirectory
          vendors={vendors} facets={facets} initialVendorId={initialVendorId}
          centerLatitude={hub.latitude} centerLongitude={hub.longitude}
          partnerLabel="Εγκεκριμένη παρουσία"
          researchLabel="ΓΕΜΗ · Μη διεκδικημένη"
        /> : <div className="empty-state">
          <h2>Οι πρώτες δημόσιες επιχειρήσεις έρχονται σύντομα.</h2>
          <p>Δεν υπάρχουν ακόμη δημοσιευμένες επαληθευμένες επιχειρήσεις σε αυτό το HUB.</p>
          <Link className="button" href={directoryPath}>Προβολή καταλόγου</Link>
        </div>}
      </section>
      <SiteFooter />
    </main>
  );
}
