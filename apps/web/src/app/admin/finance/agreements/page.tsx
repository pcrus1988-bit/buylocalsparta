import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminCommercialAgreementsClient } from "../../../../components/AdminCommercialAgreementsClient";
import { commercialAgreementWorkspace } from "../../../../lib/admin-commercial-agreements";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendor Agreements", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ vendorId?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let workspace;
  try { workspace = await commercialAgreementWorkspace(); } catch { redirect("/admin/finance"); }
  const query = await searchParams;
  const requestedVendorId = typeof query.vendorId === "string" ? query.vendorId : undefined;
  const initialVendorId = requestedVendorId && workspace.vendors.some((vendor) => vendor.id === requestedVendorId) ? requestedVendorId : undefined;
  const active = workspace.agreements.filter((agreement) => agreement.status === "active").length;
  const drafts = workspace.agreements.filter((agreement) => agreement.status === "draft").length;
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Commercial governance</div><h1>Vendor agreements & commissions</h1><p className="lead">Κάθε vendor έχει τη δική του εμπορική συμφωνία. Η τιμή προϊόντος παραμένει η τελική τιμή του vendor και η προμήθεια Buy Local υπολογίζεται ξεχωριστά στη συναλλαγή.</p></div>
    </section>
    <section className="shell workspace-metric-strip" aria-label="Agreement metrics">
      <div className="workspace-metric"><span>Vendors</span><strong>{workspace.vendors.length}</strong></div>
      <div className="workspace-metric"><span>Agreements</span><strong>{workspace.agreements.length}</strong></div>
      <div className="workspace-metric"><span>Active</span><strong>{active}</strong></div>
      <div className="workspace-metric"><span>Draft</span><strong>{drafts}</strong></div>
    </section>
    <AdminCommercialAgreementsClient initial={workspace} csrfToken={principal.csrfToken} initialVendorId={initialVendorId} />
  </main>;
}
