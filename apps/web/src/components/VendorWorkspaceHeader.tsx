export function VendorWorkspaceHeader() {
  return <header className="vendor-app-header shell">
    <a className="brand" href="/"><span className="brand-mark">BLS</span><span>Buy Local Sparta</span></a>
    <nav aria-label="Vendor workspace">
      <a href="/vendor">Παραγγελίες & Stock</a>
      <a href="/vendor/catalog">Κατάλογος</a>
      <a href="/vendor/trust">Media & Compliance</a>
      <a href="/vendor/advice">Advice</a>
      <a href="/vendor/finance">Finance</a>
      <a href="/vendor/analytics">Analytics</a>
      <a href="/vendor/returns">Returns</a>
      <a href="/vendor/shipping">Shipping</a>
    </nav>
  </header>;
}
