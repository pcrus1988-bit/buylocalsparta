import type { Metadata } from "next";
import { can } from "@buy-local-sparta/core";
import { redirect } from "next/navigation";
import { VendorReviewsClient } from "../../../components/VendorReviewsClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorReviewsWorkspace } from "../../../lib/vendor-reviews-runtime";

export const metadata: Metadata = { title: "Αξιολογήσεις πελατών", robots: { index: false, follow: false } };

export default async function VendorReviewsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!principal.roles.some((role) => can(role, "reviews.read"))) redirect("/vendor");
  const reviews = await vendorReviewsWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Trust & service</div><h1>Αξιολογήσεις πελατών</h1><p className="lead">Δες επαληθευμένες αξιολογήσεις για το κατάστημά σου, απάντησε δημόσια όπου επιτρέπεται και στείλε συγκεκριμένη αναφορά στο moderation όταν χρειάζεται.</p></div></section>
    <VendorReviewsClient csrfToken={principal.csrfToken} initial={reviews} />
  </main>;
}
