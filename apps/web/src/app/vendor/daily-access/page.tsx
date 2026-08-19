import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorDailyAccessClient } from "../../../components/VendorDailyAccessClient";
import { getVendorSession } from "../../../lib/vendor-session";
import { listDailyAccess } from "../../../lib/daily-runtime";

export const metadata: Metadata = { title: "KONTA MOY Daily · Πρόσβαση" };

export default async function VendorDailyAccessPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!principal.roles.includes("vendor_owner")) redirect("/vendor");
  const accesses = await listDailyAccess(principal);
  return <main className="vendor-app">
    <section className="shell vendor-section" style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 22 }}>
        <div><div className="eyebrow">Vendor backoffice</div><h1 style={{ margin: "4px 0 8px" }}>KONTA MOY Daily</h1><p style={{ margin: 0, maxWidth: 700 }}>Διαχειρίσου μόνο ποιος μπορεί να χρησιμοποιεί την καθημερινή λειτουργία. Δεν υπάρχουν επιμέρους ρόλοι Daily: κάθε ενεργή πρόσβαση έχει το ίδιο περιορισμένο operational scope.</p></div>
        <Link className="button button-secondary" href="/vendor">Πίσω</Link>
      </div>
      <VendorDailyAccessClient initial={accesses} csrfToken={principal.csrfToken} />
    </section>
  </main>;
}
