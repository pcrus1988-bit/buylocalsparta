import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "../../components/SiteHeader";
import { AskLocalClient } from "../../components/AskLocalClient";
import { AskLocalCustomerActions } from "../../components/AskLocalCustomerActions";
import { getAccountSession } from "../../lib/account-session";
import { customerAskLocalBrowserRequests } from "../../lib/customer-ask-local-browser-view";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

type Props = Readonly<{ searchParams: Promise<{ need?: string; product?: string; vendor?: string; source?: string }> }>;

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/ask-local", {
    title: "Ask Local · Ρώτησε την τοπική αγορά",
    description: "Δεν ξέρεις πώς λέγεται ή πού θα το βρεις; Γράψε, μίλησε, φωτογράφισε ή σκάναρε barcode και άφησε το ΚΟΝΤΑ ΜΟΥ να δρομολογήσει ιδιωτικά το αίτημά σου σε κατάλληλο τοπικό κατάστημα."
  });
}

const examples = [
  ["📷", "«Χρειάζομαι αυτό το εξάρτημα»", "Βγάλε φωτογραφία ακόμη κι αν δεν ξέρεις όνομα, μάρκα ή κωδικό."],
  ["🎁", "«Θέλω δώρο για παιδί 8 ετών»", "Πες περίσταση, ηλικία και budget. Άφησε το κατάστημα να προτείνει."],
  ["🔎", "«Το βρίσκω online — υπάρχει κοντά μου;»", "Στείλε προϊόν, link ή barcode και ρώτησε την τοπική αγορά."],
  ["🛠", "«Δεν ξέρω ποιο ανταλλακτικό ταιριάζει»", "Περιέγραψε το πρόβλημα και δώσε όσα στοιχεία έχεις. Δεν χρειάζεται να ξέρεις τον σωστό όρο."]
] as const;

const flow = [
  ["01", "Πες ή δείξε τι χρειάζεσαι", "Κείμενο, φωνή, φωτογραφία, barcode ή link. Χρησιμοποίησε ό,τι είναι πιο εύκολο."],
  ["02", "Το ΚΟΝΤΑ ΜΟΥ το δρομολογεί", "Το αίτημα παραμένει ιδιωτικό και πηγαίνει εκεί όπου υπάρχει πραγματική πιθανότητα να βοηθηθείς."],
  ["03", "Το κατάστημα απαντά", "Μπορεί να ζητήσει διευκρίνιση, να προτείνει λύση ή να σου στείλει ιδιωτική προσφορά."],
  ["04", "Εσύ αποφασίζεις", "Αποδέχεσαι, απορρίπτεις ή συνεχίζεις τη συζήτηση. Όταν η προσφορά είναι έτοιμη για online αγορά, συνεχίζεις στο checkout."]
] as const;

export default async function AskLocalPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  const params = await searchParams;
  const context = {
    need: typeof params.need === "string" ? params.need.slice(0, 2000) : undefined,
    canonicalVariantId: typeof params.product === "string" ? params.product : undefined,
    preferredVendorId: typeof params.vendor === "string" ? params.vendor : undefined,
    sourceUrl: typeof params.source === "string" ? params.source : undefined
  };
  const nextParams = new URLSearchParams();
  if (context.need) nextParams.set("need", context.need);
  if (context.canonicalVariantId) nextParams.set("product", context.canonicalVariantId);
  if (context.preferredVendorId) nextParams.set("vendor", context.preferredVendorId);
  if (context.sourceUrl) nextParams.set("source", context.sourceUrl);
  const next = `/ask-local${nextParams.size ? `?${nextParams.toString()}` : ""}`;
  const requests = principal ? await customerAskLocalBrowserRequests(principal) : [];

  return <main className="ask-local-page">
    <div className="announcement">Ask Local · όταν τα φίλτρα δεν αρκούν, ρώτησε έναν πραγματικό επαγγελματία.</div>
    <SiteHeader />

    <section className="ask-local-premium-hero">
      <div className="shell ask-local-premium-hero-grid">
        <div className="ask-local-premium-copy">
          <div className="eyebrow light">Ask Local by KONTA MOY</div>
          <h1>Δεν ξέρεις πώς λέγεται;<br /><em>Δείξ’ το.</em></h1>
          <p>Δεν ξέρεις πού θα το βρεις; Ρώτησε την τοπική αγορά. Γράψε, μίλησε, ανέβασε φωτογραφία ή σκάναρε barcode — και άφησε το σωστό κατάστημα να σε βοηθήσει.</p>
          <div className="hero-actions">
            <a className="button button-light" href="#ask-local-start">Ρώτησε τώρα</a>
            <a className="button content-outline" href="#ask-local-how">Πώς λειτουργεί</a>
          </div>
          <div className="ask-local-hero-trust">
            <span>Ιδιωτικό αίτημα</span><i>•</i><span>Όχι δημόσιο bidding</span><i>•</i><span>Πραγματικά καταστήματα</span>
          </div>
        </div>
        <div className="ask-local-visual" aria-hidden="true">
          <div className="ask-local-visual-orbit orbit-one"></div>
          <div className="ask-local-visual-orbit orbit-two"></div>
          <div className="ask-local-visual-center"><span>?</span><strong>ASK<br />LOCAL</strong></div>
          <div className="ask-local-visual-chip chip-photo">📷 Φωτογραφία</div>
          <div className="ask-local-visual-chip chip-voice">🎤 Φωνή</div>
          <div className="ask-local-visual-chip chip-barcode">▥ Barcode</div>
          <div className="ask-local-visual-chip chip-text">Aa Περιγραφή</div>
        </div>
      </div>
    </section>

    <section className="shell ask-local-examples">
      <div className="ask-local-section-intro">
        <div><div className="eyebrow">Ιδέες, όχι απλώς φίλτρα</div><h2>Το Ask Local είναι για τις ερωτήσεις που δεν χωράνε σε search box.</h2></div>
        <p>Δεν χρειάζεται να γνωρίζεις ακριβή ονομασία, SKU ή κατηγορία. Δώσε το πρόβλημα όπως το ξέρεις.</p>
      </div>
      <div className="ask-local-example-grid">
        {examples.map(([icon,title,body]) => <article key={title}><span>{icon}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>

    <section className="ask-local-flow-band" id="ask-local-how">
      <div className="shell">
        <div className="ask-local-section-intro is-dark">
          <div><div className="eyebrow light">Από την απορία στη λύση</div><h2>Τέσσερα απλά βήματα.</h2></div>
          <p>Το δύσκολο μέρος είναι να εξηγήσεις τι χρειάζεσαι. Τα υπόλοιπα τα οργανώνει η ροή.</p>
        </div>
        <div className="ask-local-flow-grid">
          {flow.map(([number,title,body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></article>)}
        </div>
      </div>
    </section>

    <div id="ask-local-start">
      {principal ? <>
        <AskLocalCustomerActions csrfToken={principal.csrfToken} initial={requests} />
        <AskLocalClient csrfToken={principal.csrfToken} initial={requests} context={context} />
      </> : <section className="shell ask-local-login premium">
        <div>
          <div className="eyebrow">Έτοιμος να ρωτήσεις;</div>
          <h2>Συνδέσου για να στείλεις το αίτημα και να βλέπεις κάθε απάντηση σε ένα σημείο.</h2>
          <p>Η περιγραφή, η ανάθεση, οι διευκρινίσεις και οι ιδιωτικές προσφορές μένουν στον λογαριασμό σου — όχι σε δημόσιο feed.</p>
          <div className="ask-local-login-points"><span>✓ Ιδιωτική συνομιλία</span><span>✓ Ιστορικό αιτήματος</span><span>✓ Ιδιωτικές προσφορές</span><span>✓ Checkout όταν είσαι έτοιμος</span></div>
        </div>
        <div className="ask-local-login-action"><a className="button" href={`/login?next=${encodeURIComponent(next)}`}>Σύνδεση πελάτη</a><Link className="text-link" href="/register">Δεν έχεις λογαριασμό; Εγγραφή →</Link></div>
      </section>}
    </div>

    <section className="ask-local-trust-band">
      <div className="shell ask-local-trust-grid">
        <div><div className="eyebrow light">Γιατί είναι διαφορετικό</div><h2>Δεν δημοσιεύουμε το αίτημά σου σε έναν ανοιχτό πλειστηριασμό καταστημάτων.</h2></div>
        <div>
          <p><strong>Ιδιωτική δρομολόγηση.</strong> Το αίτημα πηγαίνει εκεί όπου πρέπει να εξεταστεί.</p>
          <p><strong>Δίκαιη ανάθεση.</strong> Όταν υπάρχει συνδεδεμένο προϊόν, χρησιμοποιείται η υπάρχουσα λογική δίκαιης ανάθεσης.</p>
          <p><strong>Εσύ κρατάς τον έλεγχο.</strong> Προσφορές και διευκρινίσεις εμφανίζονται ιδιωτικά στον λογαριασμό σου.</p>
          <Link className="text-link light-link" href="/fairness">Πώς λειτουργεί η δίκαιη ανάθεση →</Link>
        </div>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
