import type { ReportBuilderOptions } from "../lib/reporting-engine";

export function ReportBuilderFields({ admin, options }: { admin: boolean; options: ReportBuilderOptions }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${today}T12:00:00Z`); start.setUTCDate(start.getUTCDate() - 29);
  const from = start.toISOString().slice(0, 10);
  return <>
    <div className="workspace-dual-grid" style={{ marginTop: 12 }}>
      <label className="workspace-queue-card"><small>Τίτλος αναφοράς</small><input name="title" placeholder="π.χ. Μηνιαία απόδοση καταστήματος" style={{ width: "100%" }} /></label>
      <label className="workspace-queue-card"><small>Τύπος αναφοράς</small><select name="preset" defaultValue="full" style={{ width: "100%" }}>
        <option value="full">Πλήρης επιχειρηματική αναφορά</option>
        <option value="sales_commissions">Πωλήσεις, προμήθειες & επιστροφές</option>
        <option value="inventory">Απόθεμα & κινήσεις stock</option>
        <option value="performance">Απόδοση προϊόντων & funnel</option>
        <option value="custom">Προσαρμοσμένη αναφορά</option>
      </select></label>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <label><small>Τι θέλεις να εξετάσει η αναφορά; — προαιρετικό</small><textarea name="prompt" rows={3} placeholder="π.χ. Βρες προϊόντα με πολλές προβολές αλλά λίγες αγορές και έλεγξε αν έχουν χαμηλό απόθεμα." style={{ width: "100%", resize: "vertical" }} /></label>
      <small style={{ display: "block", marginTop: 8, opacity: .72 }}>{admin ? "Ο planner μετατρέπει το αίτημα σε ελεγχόμενο ReportSpec και δεν εκτελεί αυθαίρετο SQL." : "Το ΚΟΝΤΑ ΜΟΥ χρησιμοποιεί την περιγραφή μόνο για να επιλέξει σχετικά δεδομένα μέσα στο ασφαλές scope του καταστήματός σου."}</small>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>Περίοδος</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 10 }}>
        <label><small>Από</small><input type="date" name="fromDate" defaultValue={from} style={{ width: "100%" }} /></label>
        <label><small>Έως</small><input type="date" name="toDate" defaultValue={today} style={{ width: "100%" }} /></label>
        <label style={{ alignSelf: "end" }}><input type="checkbox" name="comparePrevious" /> Σύγκριση με προηγούμενη ίση περίοδο</label>
        <label style={{ alignSelf: "end" }}><input type="checkbox" name="includeDetails" defaultChecked /> Αναλυτικοί πίνακες στο PDF</label>
      </div>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>{admin ? "Δεδομένα που θα συμπεριληφθούν" : "Τι να συμπεριλάβει"}</strong>
      <p style={{ margin: "5px 0 10px", opacity: .72 }}>{admin ? "Αν δεν επιλέξεις χειροκίνητα domain, χρησιμοποιείται το preset. Το ελεύθερο αίτημα μπορεί να προσθέσει σχετικά domains." : "Άφησέ τα κενά για να χρησιμοποιηθεί αυτόματα ο τύπος αναφοράς που επέλεξες ή διάλεξε μόνο όσα σε ενδιαφέρουν."}</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label><input type="checkbox" name="domains" value="sales" /> Πωλήσεις</label>
        <label><input type="checkbox" name="domains" value="commissions" /> Προμήθειες</label>
        <label><input type="checkbox" name="domains" value="returns" /> Επιστροφές</label>
        <label><input type="checkbox" name="domains" value="inventory" /> Απόθεμα</label>
        <label><input type="checkbox" name="domains" value="performance" /> Απόδοση προϊόντων</label>
        <label><input type="checkbox" name="domains" value="fairness" /> Δίκαιη προβολή</label>
        {admin ? <label><input type="checkbox" name="domains" value="search" /> Search / zero-results</label> : null}
      </div>
    </div>

    <div className="workspace-queue-card" style={{ marginTop: 12 }}>
      <strong>{admin ? "Scope & filters" : "Περιορισμός αναφοράς"}</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginTop: 10 }}>
        {admin ? <label><small>Vendor</small><select name="vendorId" defaultValue="" style={{ width: "100%" }}><option value="">Ολόκληρο marketplace</option>{options.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.label}</option>)}</select></label> : null}
        <label><small>Κατηγορία</small><select name="categoryId" defaultValue="" style={{ width: "100%" }}><option value="">Όλες οι κατηγορίες</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label><small>Προϊόν</small><select name="productId" defaultValue="" style={{ width: "100%" }}><option value="">Όλα τα προϊόντα</option>{options.products.map((product) => <option key={`${product.vendorId ?? "market"}:${product.id}`} value={product.id}>{product.label}{admin && product.vendorId ? " · vendor scoped" : ""}</option>)}</select></label>
        <label><small>Μάρκα</small><select name="brandId" defaultValue="" style={{ width: "100%" }}><option value="">Όλες οι μάρκες</option>{options.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.label}</option>)}</select></label>
        <label><small>Σημείο / κατάστημα</small><select name="locationId" defaultValue="" style={{ width: "100%" }}><option value="">Όλα τα σημεία</option>{options.locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}</select></label>
      </div>
      <small style={{ display: "block", marginTop: 10, opacity: .72 }}>{admin ? "Τα φίλτρα συνδυάζονται: vendor + category tree + product + brand + location. Η επιλογή parent category περιλαμβάνει όλους τους descendants." : "Η αναφορά περιορίζεται πάντα server-side στο συνδεδεμένο κατάστημά σου. Δεν είναι δυνατό να εμφανιστούν στοιχεία άλλου συνεργάτη."}</small>
    </div>
  </>;
}
