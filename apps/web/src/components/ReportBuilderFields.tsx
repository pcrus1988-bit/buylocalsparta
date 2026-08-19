import type { ReportBuilderOptions } from "../lib/reporting-engine";

export function ReportBuilderFields({ admin, options }: { admin: boolean; options: ReportBuilderOptions }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${today}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  const from = start.toISOString().slice(0, 10);
  return <>
    <div className="workspace-dual-grid" style={{ marginTop: 12 }}>
      <label className="workspace-queue-card"><small>Τίτλος αναφοράς</small><input name="title" placeholder="π.χ. Μηνιαία εμπορική αναφορά" style={{ width: "100%" }} /></label>
      <label className="workspace-queue-card"><small>Τύπος / preset</small><select name="preset" defaultValue="full" style={{ width: "100%" }}>
        <option value="full">Πλήρης επιχειρηματική αναφορά</option>
        <option value="sales_commissions">Πωλήσεις, προμήθειες & επιστροφές</option>
        <option value="inventory">Απόθεμα & κινήσεις stock</option>
        <option value="performance">Performance, funnel & fairness</option>
        <option value="custom">Custom report</option>
      </select></label>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <label><small>Περιέγραψε τι θέλεις να αναλύσει η αναφορά</small><textarea name="prompt" rows={3} placeholder="π.χ. Εντόπισε προϊόντα με υψηλή προβολή αλλά χαμηλή μετατροπή και έλεγξε αν σχετίζεται με χαμηλό stock. Συμπερίλαβε προμήθειες." style={{ width: "100%", resize: "vertical" }} /></label>
      <small style={{ display: "block", marginTop: 8, opacity: .72 }}>Ο planner αναγνωρίζει εμπορικά domains από το αίτημα, αλλά δεν παράγει ούτε εκτελεί αυθαίρετο SQL. Όλα περνούν από το ασφαλές ReportSpec.</small>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>Περίοδος</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 10 }}>
        <label><small>Από</small><input type="date" name="fromDate" defaultValue={from} style={{ width: "100%" }} /></label>
        <label><small>Έως</small><input type="date" name="toDate" defaultValue={today} style={{ width: "100%" }} /></label>
        <label style={{ alignSelf: "end" }}><input type="checkbox" name="comparePrevious" /> Σύγκριση με προηγούμενη ίση περίοδο</label>
        <label style={{ alignSelf: "end" }}><input type="checkbox" name="includeDetails" defaultChecked /> Αναλυτικά datasets στο PDF</label>
      </div>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>Δεδομένα που θα συμπεριληφθούν</strong>
      <p style={{ margin: "5px 0 10px", opacity: .72 }}>Αν δεν επιλέξεις χειροκίνητα domain, χρησιμοποιείται το preset. Το ελεύθερο αίτημα μπορεί να προσθέσει σχετικά domains.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label><input type="checkbox" name="domains" value="sales" /> Πωλήσεις</label>
        <label><input type="checkbox" name="domains" value="commissions" /> Προμήθειες</label>
        <label><input type="checkbox" name="domains" value="returns" /> Επιστροφές</label>
        <label><input type="checkbox" name="domains" value="inventory" /> Inventory</label>
        <label><input type="checkbox" name="domains" value="performance" /> Performance</label>
        <label><input type="checkbox" name="domains" value="fairness" /> Fairness</label>
        {admin ? <label><input type="checkbox" name="domains" value="search" /> Search / zero-results</label> : null}
      </div>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>Scope & filters</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 10 }}>
        {admin ? <label><small>Vendor</small><select name="vendorId" defaultValue="" style={{ width: "100%" }}><option value="">Ολόκληρο marketplace</option>{options.vendors.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label> : null}
        <label><small>Κατηγορία / κλάδος</small><select name="categoryId" defaultValue="" style={{ width: "100%" }}><option value="">Όλες οι κατηγορίες</option>{options.categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label><small>Προϊόν / variant</small><select name="productId" defaultValue="" style={{ width: "100%" }}><option value="">Όλα τα προϊόντα</option>{options.products.map(p => <option key={`${p.vendorId ?? "market"}:${p.id}`} value={p.id}>{p.label}{admin && p.vendorId ? " · vendor scoped" : ""}</option>)}</select></label>
        <label><small>Brand</small><select name="brandId" defaultValue="" style={{ width: "100%" }}><option value="">Όλα τα brands</option>{options.brands.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
        <label><small>Κατάστημα / location</small><select name="locationId" defaultValue="" style={{ width: "100%" }}><option value="">Όλα τα locations</option>{options.locations.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      </div>
      <small style={{ display: "block", marginTop: 10, opacity: .72 }}>{admin ? "Τα φίλτρα συνδυάζονται: vendor + category tree + product + brand + location. Η επιλογή parent category περιλαμβάνει όλους τους descendants." : "Το vendor scope κλειδώνεται server-side στο συνδεδεμένο κατάστημα. Δεν είναι δυνατό να ζητηθούν στοιχεία άλλου vendor."}</small>
    </div>
  </>;
}
