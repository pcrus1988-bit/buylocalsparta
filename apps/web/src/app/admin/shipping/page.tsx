import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminShippingClient } from "../../../components/AdminShippingClient";
import { WorkspaceEmptyState } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { adminBoxNowOrigins, boxNowShippingEnabled } from "../../../lib/boxnow-shipping-runtime";
import { assertAdminPermission } from "../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · BOX NOW Integration", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  assertAdminPermission(principal, "fulfilment.write");

  if (!boxNowShippingEnabled()) return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · integration</div><h1>BOX NOW Integration</h1><p className="lead">Ο provider είναι απενεργοποιημένος στο production, επομένως origin mapping και shipping controls παραμένουν κλειστά.</p></div></section>
    <section className="shell vendor-section"><WorkspaceEmptyState eyebrow="Provider unavailable" title="Δεν υπάρχει ενεργή courier configuration." body="Ενεργοποίησε πρώτα τα production credentials και μετά χαρτογράφησε τα Vendor fulfilment origins." action={<Link className="button button-secondary" href="/admin/operations">System Health & Audit</Link>} /></section>
  </main>;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · integration</div><h1>BOX NOW Integration</h1><p className="lead">Χαρτογράφησε κάθε Vendor fulfilment location στο αντίστοιχο Partner API origin ID.</p></div></section>
    <AdminShippingClient csrfToken={principal.csrfToken} rows={await adminBoxNowOrigins(principal)} />
  </main>;
}
