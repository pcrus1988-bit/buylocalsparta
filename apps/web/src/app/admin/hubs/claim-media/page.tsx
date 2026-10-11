import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminHubClaimMediaReview } from "../../../../components/AdminHubClaimMediaReview";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { pendingHubClaimMedia } from "../../../../lib/hub-claim-media-runtime";

export const metadata: Metadata = { title: "Admin · CLAIM image approvals", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminHubClaimMediaPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!principal.roles.includes("super_admin") && !hasAdminPermission(principal, "vendor.manage")) redirect("/admin");
  const items = await pendingHubClaimMedia();
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="CLAIM media" />
    <section className="shell vendor-hero vendor-hero-compact">
      <div className="eyebrow">HUB CLAIM · Εγκρίσεις εικόνων</div>
      <h1>Αναμονή δημοσίευσης ({items.length})</h1>
      <p className="lead">Έλεγχος λογοτύπων, φωτογραφιών καταστημάτων και συλλογών πριν από τη δημόσια προβολή.</p>
    </section>
    <AdminHubClaimMediaReview items={items} csrfToken={principal.csrfToken} />
  </main>;
}
