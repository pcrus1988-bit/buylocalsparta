import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getCanonicalProductSummary } from "../../lib/catalog-view";
import { getPublicVendorDirectory } from "../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../lib/storefront-taxonomy";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { SiteFooter } from "../../components/SiteFooter";

type Props = Readonly<{ searchParams: Promise<{ product?: string; vendor?: string }> }>;

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/advice", { title: "Πραγματική τοπική συμβουλή", description: "Βρες τον κατάλληλο επαγγελματία της Σπάρτης και ζήτησε συμβουλή πριν αγοράσεις." });
}

export default async function AdvicePage({ searchParams }: Props) {
  const params = await searchParams;
  const vendors = await getPublicVendorDirectory();
  const requestedVendor = typeof params.vendor === "string" ? vendors.find((vendor) => vendor.id === params.vendor) : undefined;
  const product = typeof params.product === "string" && params.product.trim() ? await getCanonicalProductSummary(params.product).catch(() => undefined) : undefined;
  const advisers = vendors.filter((vendor) => vendor.adviser);
  return <main>
    <div className="announcement">Get Real Advice · πριν την αγορά, μίλα με άνθρωπο που γνωρίζει.</div><SiteHeader />
    <section className="advice-hub-hero"><div className="shell advice-hub-hero-grid"><div><div className="eyebrow light">Human commerce</div><h1>{product ? `Συμβουλή για: ${product.title}` : requestedVendor ? `Μίλα με το ${requestedVendor.name}` : "Η online αγορά ξαναγίνεται ανθρώπινη."}</h1><p>{requestedVendor?.adviser ? `Ο/Η ${requestedVendor.adviser} μπορεί να σε βοηθήσει μέσα από το δημόσιο προφίλ του καταστήματος.` : "Βρες το κατάστημα που γνωρίζει την κατηγορία και ζήτησε βοήθεια χωρίς να δημοσιεύεται η ερώτησή σου σε δημόσιο bidding."}</p><div className="hero-actions">{requestedVendor ? <><a className="button button-light" href={`/account/appointments?vendor=${encodeURIComponent(requestedVendor.id)}`}>Κλείσε ραντεβού</a><a className="button vendor-outline" href={`/vendor/${requestedVendor.id}`}>Προφίλ καταστήματος</a></> : <a className="button button-light" href="#advisers">Βρες σύμβουλο</a>}<a className="button vendor-outline" href="/ask-local">Ask Local</a></div></div><div className="advice-hub-signal" aria-hidden="true"><span>ASK</span><span>LISTEN</span><span>CHOOSE</span></div></div></section>
    <section className="shell advice-path" aria-label="Πώς λειτουργεί η συμβουλή"><article><span>01</span><h2>Πες τι χρειάζεσαι</h2><p>Ξεκίνα από προϊόν, κατηγορία ή συγκεκριμένο κατάστημα.</p></article><article><span>02</span><h2>Ιδιωτική καθοδήγηση</h2><p>Η ερώτηση απευθύνεται στον κατάλληλο επαγγελματία, όχι σε δημόσιο bidding.</p></article><article><span>03</span><h2>Αγόρασε όταν είσαι έτοιμος</h2><p>Η αγορά παραμένει στο ενιαίο checkout του ΚΟΝΤΑ ΜΟΥ Σπάρτη.</p></article></section>
    <div className="shell advice-more-links"><a className="text-link" href="/how-it-works">Ολόκληρη η διαδρομή αγοράς →</a><a className="text-link" href="/fairness">Πώς προστατεύεται η δίκαιη ανάθεση →</a></div>
    <section className="shell section" id="advisers" aria-labelledby="advisers-title"><div className="section-heading"><div><div className="eyebrow">Άνθρωποι της τοπικής αγοράς</div><h2 id="advisers-title">Βρες ποιος μπορεί να βοηθήσει</h2></div><p className="section-note">Μόνο ενεργά καταστήματα και δημόσια διαθέσιμα adviser profiles.</p></div>
      {advisers.length ? <div className="adviser-grid">{advisers.map((vendor) => { const categories = [...new Map(vendor.categoryCodes.map((code) => { const category = storefrontCategoryForCode(code); return [category.slug, category] as const; })).values()]; return <article className="adviser-card" key={vendor.id}><div className="adviser-card-mark" aria-hidden="true">{vendor.adviser?.slice(0, 1).toUpperCase()}</div><div className="eyebrow">{vendor.location?.locality ?? "Σπάρτη"}</div><h2>{vendor.adviser}</h2><p>από <strong>{vendor.name}</strong></p>{categories.length > 0 && <div className="shop-category-list">{categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}</div>}<div className="hero-actions"><a className="button" href={`/account/appointments?vendor=${encodeURIComponent(vendor.id)}`}>Κλείσε ραντεβού</a><a className="text-link" href={`/vendor/${vendor.id}`}>Δες προφίλ & στοιχεία →</a></div></article>; })}</div> : <div className="empty-state"><h2>Τα adviser profiles ετοιμάζονται.</h2><p>Μπορείς ήδη να περιγράψεις αυτό που ψάχνεις μέσω Ask Local.</p><a className="button" href="/ask-local">Ask Local</a></div>}
    </section>
    <SiteFooter />
  </main>;
}
