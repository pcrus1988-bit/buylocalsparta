import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorDailyAccessClient } from "../../../components/VendorDailyAccessClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { listDailyAccess } from "../../../lib/daily-runtime";

export const metadata: Metadata = { title: "KONTA MOY Daily · Πρόσβαση" };

export default async function VendorDailyAccessPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!principal.roles.includes("vendor_owner")) redirect("/vendor");

  const accesses = await listDailyAccess(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Ρυθμίσεις · Daily</div>
        <h1>Πρόσβαση στο KONTA MOY Daily</h1>
        <p className="lead">Διαχειρίσου ποιος μπορεί να χρησιμοποιεί την καθημερινή λειτουργία. Δεν υπάρχουν επιμέρους ρόλοι Daily: κάθε ενεργή πρόσβαση έχει το ίδιο περιορισμένο operational scope.</p>
      </div>
    </section>
    <section className="shell vendor-section" style={{ maxWidth: 920 }}>
      <VendorDailyAccessClient initial={accesses} csrfToken={principal.csrfToken} />
    </section>
  </main>;
}
