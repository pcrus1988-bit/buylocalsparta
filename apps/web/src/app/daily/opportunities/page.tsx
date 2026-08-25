import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDailySession } from "../../../lib/daily-session";
import { vendorLocalDemandWorkspace } from "../../../lib/local-demand-service";

export const metadata: Metadata = { title: "Daily · Local Opportunities", robots: { index: false, follow: false, nocache: true } };

const confidenceLabel = { qualified: "σταθερό σήμα", strong: "ισχυρό σήμα", very_strong: "πολύ ισχυρό" } as const;

export default async function Page() {
  const principal = await getDailySession();
  if (!principal) redirect("/daily/login");
  const data = await vendorLocalDemandWorkspace(principal);

  return <main className="vendor-app">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Daily · Local opportunities</div>
      <h1>Τι ζητά η τοπική αγορά</h1>
      <p className="lead">Σήματα ζήτησης σχετικά με τις κατηγορίες του καταστήματός σου, μόνο όταν τουλάχιστον {data.minimumActors} διαφορετικοί πελάτες σχηματίζουν το ίδιο μοτίβο. Δεν εμφανίζονται ονόματα, raw αναζητήσεις ή άλλα προσωπικά στοιχεία.</p>
    </div></section>

    <section className="shell vendor-section">
      <div className="workspace-metric-strip">
        <div className="workspace-metric"><span>Ευκαιρίες</span><strong>{data.metrics.qualifiedOpportunities}</strong><small>πάνω από privacy threshold</small></div>
        <div className="workspace-metric"><span>Τοπικά κενά</span><strong>{data.metrics.unmetVariants}</strong><small>ζητούνται χωρίς φρέσκο local stock</small></div>
        <div className="workspace-metric"><span>Ισχυρά σήματα</span><strong>{data.metrics.strongSignals}</strong><small>{data.metrics.activeSources}/5 ενεργές πηγές</small></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading"><div><span className="eyebrow">Opportunity queue</span><h2>Προϊόντα & κατηγορίες που αξίζει να εξετάσεις</h2><p>Τα προϊόντα που ήδη διαθέτεις εξαιρούνται από τις product-level προτάσεις. Οι κατηγορίες περιορίζονται σε τομείς όπου το κατάστημά σου ήδη δραστηριοποιείται.</p></div></div>
      {data.opportunities.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχει ακόμη αρκετά πυκνό σήμα για το κατάστημά σου.</strong><p>Αυτό είναι σκόπιμο: δεν εμφανίζουμε μικρά clusters που θα μπορούσαν να αποκαλύψουν συμπεριφορά συγκεκριμένου πελάτη.</p><Link className="button button-secondary" href="/daily">Πίσω στο Today</Link></div> : <div className="workspace-queue-list">
        {data.opportunities.slice(0, 20).map((item, index) => <article className="workspace-queue-card" key={item.key}>
          <div className="workspace-queue-head"><div><strong>#{index + 1} · {item.title}</strong><small>{item.kind === "variant" ? `Προϊόν · ${item.categoryCode}` : `Κατηγορία · ${item.categoryCode}`}</small></div><span className={`status-pill${item.availableLocal === false ? " needs-attention" : ""}`}>{item.kind === "variant" && item.availableLocal === false ? "κενό στην αγορά" : confidenceLabel[item.confidence]}</span></div>
          <div className="workspace-queue-primary"><span>Demand score {item.score}</span><span>{item.signals.distinctActors}+ διαφορετικοί πελάτες</span></div>
          <p className="workspace-queue-summary">Local Watch {item.signals.localWatch} · Ask Local {item.signals.askLocal} · Zero-result {item.signals.zeroResultSearch} · Saved search {item.signals.savedSearch}</p>
          {item.kind === "variant" && item.canonicalVariantId && <div className="workspace-inline-actions"><Link className="button button-secondary" href="/daily/quickadd">Έλεγχος / προσθήκη στο Quick Add</Link></div>}
        </article>)}
      </div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading"><div><span className="eyebrow">Privacy by design</span><h2>Τι δεν βλέπεις</h2></div></div>
      <p className="workspace-inline-note">Δεν εμφανίζουμε ποιος έκανε αναζήτηση, postcode, email/τηλέφωνο, raw search query, κείμενο Ask Local, φωτογραφία, voice transcript ή barcode. Zero-result search συμμετέχει μόνο ως category-level σήμα μετά από cohort τουλάχιστον {data.minimumActors} διαφορετικών actors. Τα Quick Add misses δεν συμμετέχουν ακόμη επειδή δεν αποθηκεύονται.</p>
    </section>
  </main>;
}
