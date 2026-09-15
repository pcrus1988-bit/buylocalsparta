export default function VendorDropshippingLoading() {
  return <main className="vendor-app" aria-busy="true" aria-live="polite">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Φόρτωση Dropshipping…</h1>
        <p className="lead">Φορτώνουμε μόνο τη σύνοψη suppliers, pricing και catalogue health. Ο πλήρης κατάλογος προϊόντων δεν φορτώνεται σε αυτό το dashboard.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-metric-strip" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => <div className="workspace-metric-card" key={index}>
          <small>Φόρτωση</small>
          <strong>—</strong>
        </div>)}
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-section-heading">
        <div>
          <div className="eyebrow">Προμηθευτές</div>
          <h2>Προετοιμασία Dropshipping dashboard</h2>
          <p>Δεν γίνεται αυτόματη φόρτωση product cards. Τα προϊόντα ανοίγουν μόνο όταν επιλέξεις συγκεκριμένο supplier ή στοχευμένο operational queue.</p>
        </div>
      </div>
      <article className="workspace-queue-card" aria-hidden="true">
        <div className="workspace-queue-head">
          <div><strong>Φόρτωση σύνοψης supplier…</strong><small>Feed health · availability · pricing status</small></div>
        </div>
      </article>
    </section>
  </main>;
}
