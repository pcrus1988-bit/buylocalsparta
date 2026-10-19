import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminActionButton } from "../../../../../components/AdminActionButton";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../../lib/admin-session";
import { adminClaimProfiles } from "../../../../../lib/admin-claim-profiles";

export const metadata: Metadata = { title: "Admin · CLAIM vendor profile", robots: { index: false, follow: false } };

export default async function ClaimVendorAdmin({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { id } = await params;
  const claims = await adminClaimProfiles(principal);
  const claim = claims.find(row => row.id === id);
  if (!claim) notFound();
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={claim.tradingName} />
    <section className="shell vendor-hero vendor-hero-compact"><div>
      <div className="eyebrow">Vendors · CLAIM · listing-only</div>
      <h1>{claim.tradingName}</h1>
      <p className="lead">{claim.legalName} · HUB {claim.hubCity} · {claim.id}</p>
      <Link className="text-link" href="/admin/vendors">← Back to Vendors</Link>
    </div></section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Account" title="CLAIM vendor profile" note="Verified claimant ownership and listing management are distinct from commercial vendor activation." />
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Subscription</strong><span>CLAIM · free · no checkout</span></div>
        <div className="workspace-compact-row"><strong>Application</strong><span>{claim.id} · {claim.status}</span></div>
        <div className="workspace-compact-row"><strong>Owner account</strong><span>{claim.contactEmail}</span><small>{claim.ownerVerified ? "Verified" : "Requires account verification"}</small></div>
        <div className="workspace-compact-row"><strong>Commerce vendor record</strong><span>{claim.vendorId ?? "Not provisioned"}</span></div>
      </div>
      <div className="workspace-action-bar"><span>Security · Passwords are never disclosed to Admin. A reset link is single-use and expires in 30 minutes.</span>
        <div className="workspace-action-buttons">
          <AdminActionButton label="Send password reset" endpoint={`/api/admin/vendor-claims/${encodeURIComponent(claim.id)}/password-reset`} csrfToken={principal.csrfToken} reasonPrompt="Reason for resetting the claimant's account access" />
          <Link className="button button-secondary" href={`/hubs/${encodeURIComponent(claim.hubSlug)}/business/${encodeURIComponent(claim.id)}`} target="_blank">Public CLAIM profile ↗</Link>
        </div>
      </div>
      <div className="workspace-inline-note">CLAIM currently relies on the verified owner's existing account login. Dedicated vendor-only credentials must be separated before restricting consumer sign-in; this action resets the existing account password, not an independent vendor password.</div>
    </section>
  </main>;
}
