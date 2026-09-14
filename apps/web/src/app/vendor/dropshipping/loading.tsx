export default function VendorDropshippingLoading() {
  return <main className="vendor-app" aria-busy="true" aria-live="polite">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Φόρτωση Dropshipping…</h1>
        <p className="lead">Φορτώνουμε suppliers, pricing, availability και catalogue health χωρίς να μπλοκάρουμε το υπόλοιπο vendor workspace.</p>
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
        <div><div className="eyebrow">Κατάλογος</div><h2>Προετοιμασία supplier workspace</h2></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        {Array.from({ length: 6 }, (_, index) => <article className="workspace-queue-card" key={index}>
          <div className="workspace-queue-head"><div><strong>Φόρτωση προϊόντος…</strong><small>Pricing · availability · publication</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Buying price</strong><span>—</span></div>
            <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>—</span></div>
            <div className="workspace-compact-row"><strong>Supplier stock</strong><span>—</span></div>
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}
