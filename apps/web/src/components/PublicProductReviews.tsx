import type { PublicProductReviewSummary } from "../lib/public-reviews-runtime";

const stars = (rating: number) => `${"★".repeat(Math.max(0, Math.min(5, Math.round(rating))))}${"☆".repeat(Math.max(0, 5-Math.round(rating)))}`;
const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeZone: "Europe/Athens" }).format(new Date(value));

export function PublicProductReviews({ summary }: { summary: PublicProductReviewSummary }) {
  return <section className="shell vendor-section" id="reviews" aria-labelledby="verified-reviews-title">
    <div className="customer-page-heading">
      <div><div className="eyebrow">Επαληθευμένες αξιολογήσεις</div><h2 id="verified-reviews-title">Τι είπαν πελάτες μετά από πραγματική εμπειρία</h2></div>
      <p>Δημοσιεύουμε μόνο αξιολογήσεις που συνδέονται με παραδομένη αγορά ή ολοκληρωμένη, αμφίδρομη συμβουλή. Δεν εμφανίζουμε προσωπικά στοιχεία του πελάτη.</p>
    </div>
    {summary.count === 0 ? <div className="empty-state"><h3>Δεν υπάρχουν ακόμη δημοσιευμένες επαληθευμένες αξιολογήσεις.</h3><p>Η απουσία αξιολογήσεων δεν αλλάζει τη δίκαιη ανάθεση καταστημάτων.</p></div> : <>
      <div className="customer-account-stats" style={{ marginBottom: 18 }}>
        <article><span>Μέση βαθμολογία</span><strong>{summary.average.toFixed(1)} / 5</strong></article>
        <article><span>Αξιολογήσεις</span><strong>{summary.count}</strong></article>
        <article><span>Πηγή</span><strong>100% verified</strong></article>
      </div>
      <div className="workspace-queue-list">{summary.reviews.map((review) => <article className="workspace-queue-card" key={review.id}>
        <div className="workspace-queue-head"><div><strong aria-label={`${review.rating} από 5 αστέρια`} style={{ letterSpacing: ".08em" }}>{stars(review.rating)}</strong><small>{review.interactionType === "verified_order" ? "Επαληθευμένη αγορά" : "Επαληθευμένη συμβουλή"} · {when(review.createdAt)}</small></div><span className="vendor-merchant-status">Verified</span></div>
        {review.body ? <p className="workspace-queue-summary">{review.body}</p> : <p className="workspace-queue-summary">Ο πελάτης άφησε μόνο βαθμολογία.</p>}
        {review.vendorResponse && <div className="workspace-inline-note"><strong>Απάντηση από {review.vendorName}</strong><br />{review.vendorResponse}</div>}
      </article>)}</div>
    </>}
  </section>;
}
