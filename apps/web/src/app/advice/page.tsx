import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { getCanonicalProductSummary } from "../../lib/catalog-view";
import { getPublicVendorDirectory } from "../../lib/public-vendor-directory";
import { storefrontCategoryForCode } from "../../lib/storefront-taxonomy";
import { SiteFooter } from "../../components/SiteFooter";

type Props = Readonly<{ searchParams: Promise<{ product?: string; vendor?: string }> }>;

export const metadata: Metadata = {
  title: "Τοπικοί σύμβουλοι · Ask Local",
  description: "Γνώρισε τοπικούς ανθρώπους που μπορούν να σε βοηθήσουν να διαλέξεις προϊόν. Η συμβουλή είναι μέρος του Ask Local.",
  alternates: { canonical: "/advice" }
};

export default async function AdvicePage({ searchParams }: Props) {
  const params = await searchParams;
  const vendors = await getPublicVendorDirectory();
  const requestedVendor = typeof params.vendor === "string" ? vendors.find((vendor) => vendor.id === params.vendor) : undefined;
  const product = typeof params.product === "string" && params.product.trim() ? await getCanonicalProductSummary(params.product).catch(() => undefined) : undefined;
  const advisers = vendors.filter((vendor) => vendor.adviser);

  return <main>
    <div className="announcement">Ask Local · Τοπικοί σύμβουλοι για βοήθεια πριν την αγορά.</div>
    <SiteHeader />

    <section className="advice-hub-hero">
      <div className="shell advice-hub-hero-grid">
        <div>
          <div className="eyebrow light">Μέρος του Ask Local</div>
          <h1>{product ? `Ποιος μπορεί να σε βοηθήσει με: ${product.title}` : requestedVendor ? `Γνώρισε το ${requestedVendor.name}` : "Γνώρισε ανθρώπους που ξέρουν την κατηγορία."}</h1>
          <p>{requestedVendor?.adviser ? `Ο/Η ${requestedVendor.adviser} παρουσιάζεται στο δημόσιο προφίλ του καταστήματος και μπορεί να σε βοηθήσει πριν αγοράσεις.` : "Αυτή είναι η προαιρετική διαδρομή του Ask Local όταν θέλεις πρώτα να δεις ποιοι τοπικοί επαγγελματίες μπορούν να σε συμβουλέψουν. Αν δεν ξέρεις ποιον χρειάζεσαι, απλώς στείλε ένα Ask Local αίτημα και η πλατφόρμα θα σε κατευθύνει."}</p>
          <div className="hero-actions">
            {requestedVendor ? <a className="button button-light" href={`/vendor/${requestedVendor.id}`}>Προφίλ καταστήματος</a> : <a className="button button-light" href="#advisers">Δες τους συμβούλους</a>}
            <a className="button vendor-outline" href="/ask-local">Στείλε αίτημα Ask Local</a>
          </div>
        </div>
        <div className="advice-hub-signal" aria-hidden="true"><span>ASK</span><span>LISTEN</span><span>CHOOSE</span></div>
      </div>
    </section>

    <section className="shell advice-path" aria-label="Πότε χρησιμοποιώ τους τοπικούς συμβούλους">
      <article><span>01</span><h2>Θέλεις να δεις ποιος γνωρίζει το θέμα</h2><p>Περιηγήσου σε ανθρώπους και καταστήματα με διαθέσιμο adviser profile.</p></article>
      <article><span>02</span><h2>Χρειάζεσαι βοήθεια επιλογής</h2><p>Ρώτησε για μέγεθος, συμβατότητα, υλικό, μοντέλο ή τη σωστή επιλογή πριν αγοράσεις.</p></article>
      <article><span>03</span><h2>Δεν ξέρεις ποιον να ρωτήσεις;</h2><p>Δεν χρειάζεται να ψάξεις εδώ. Πήγαινε στο Ask Local και περιέγραψε απλώς την ανάγκη σου.</p></article>
    </section>

    <div className="shell advice-more-links">
      <a className="text-link" href="/ask-local">← Επιστροφή στο Ask Local</a>
      <a className="text-link" href="/fairness">Πώς προστατεύεται η δίκαιη ανάθεση →</a>
    </div>

    <section className="shell section" id="advisers" aria-labelledby="advisers-title">
      <div className="section-heading">
        <div><div className="eyebrow">Άνθρωποι της τοπικής αγοράς</div><h2 id="advisers-title">Τοπικοί σύμβουλοι</h2></div>
        <p className="section-note">Μόνο ενεργά καταστήματα και δημόσια διαθέσιμα adviser profiles.</p>
      </div>
      {advisers.length ? <div className="adviser-grid">{advisers.map((vendor) => {
        const categories = [...new Map(vendor.categoryCodes.map((code) => {
          const category = storefrontCategoryForCode(code);
          return [category.slug, category] as const;
        })).values()];
        return <article className="adviser-card" key={vendor.id}>
          <div className="adviser-card-mark" aria-hidden="true">{vendor.adviser?.slice(0, 1).toUpperCase()}</div>
          <div className="eyebrow">{vendor.location?.locality ?? "Σπάρτη"}</div>
          <h2>{vendor.adviser}</h2>
          <p>από <strong>{vendor.name}</strong></p>
          {categories.length > 0 && <div className="shop-category-list">{categories.map((category) => <span className="shop-category-chip" key={category.slug}>{category.label}</span>)}</div>}
          <a className="text-link" href={`/vendor/${vendor.id}`}>Δες προφίλ & στοιχεία →</a>
        </article>;
      })}</div> : <div className="empty-state">
        <h2>Τα adviser profiles ετοιμάζονται.</h2>
        <p>Δεν χρειάζεται να περιμένεις ή να διαλέξεις κατάστημα μόνος σου. Περιέγραψε αυτό που ψάχνεις στο Ask Local.</p>
        <a className="button" href="/ask-local">Στείλε αίτημα Ask Local</a>
      </div>}
    </section>

    <SiteFooter />
  </main>;
}
