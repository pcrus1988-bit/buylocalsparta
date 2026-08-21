import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { CustomerProfileEditForm } from "../../../../../components/CustomerProfileEditForm";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../../components/WorkspacePagePrimitives";
import { adminCustomerDetail } from "../../../../../lib/admin-customer-management";
import { adminCustomerRecoverySummary } from "../../../../../lib/admin-customer-profile";
import { getAdminSession } from "../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customer profile corrections", robots: { index:false, follow:false } };

function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function name(customer: { firstName?: string; lastName?: string; email?: string; id:string }) { return [customer.firstName,customer.lastName].filter(Boolean).join(" ") || customer.email || customer.id; }

export default async function Page({ params }: { params: Promise<{ customerId:string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { customerId } = await params;
  const id = decodeURIComponent(customerId);
  const result = await adminCustomerDetail(principal,id).catch(() => undefined);
  if (!result) notFound();
  const recovery = await adminCustomerRecoverySummary(principal,id);
  const customer = result.detail.customer;
  const canManage = hasAdminPermission(principal,"customer.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={result.csrfToken} entityLabel={name(customer)} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Customer profile & recovery · {customer.id}</div>
      <h1>{name(customer)}</h1>
      <p className="lead">Audited profile corrections and privacy-minimised account recovery signals.</p>
      <div className="hero-actions"><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customer.id)}`}>← Customer 360</Link><Link className="text-link" href="/admin/customers">Customer directory →</Link></div>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label:"Email", value:customer.emailVerified ? "Verified" : "Unverified", tone:customer.emailVerified ? "positive" : "attention", hint:dateTime(recovery.emailVerifiedAt) },
      { label:"Verification links", value:recovery.verificationTokens, hint:`${recovery.activeVerificationTokens} currently active` },
      { label:"Password recovery", value:recovery.resetTokens, hint:`${recovery.activeResetTokens} active reset link(s)` },
      { label:"Sessions", value:customer.activeSessionCount, hint:`Last seen ${dateTime(customer.lastSeenAt)}` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Profile correction" title="Name, phone & language" note="Every correction requires an admin reason and is written to the customer audit trail. Email is intentionally excluded and cannot be silently replaced." />
      <article className="workspace-queue-card">
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Name</strong><span>{name(customer)}</span><small>{customer.id}</small></div>
          <div className="workspace-compact-row"><strong>Email</strong><span>{customer.email ?? "—"}</span><small>{customer.emailVerified ? "Verified" : "Not verified"}</small></div>
          <div className="workspace-compact-row"><strong>Phone</strong><span>{customer.phone ?? "—"}</span><small>Editable with audit reason</small></div>
          <div className="workspace-compact-row"><strong>Language</strong><span>{customer.preferredLocale}</span><small>Greek / English customer experience</small></div>
        </div>
        {canManage && customer.status !== "closed" && !customer.anonymizedAt ? <CustomerProfileEditForm customer={{ id:customer.id, firstName:customer.firstName, lastName:customer.lastName, phone:customer.phone, preferredLocale:customer.preferredLocale }} csrfToken={result.csrfToken} /> : <div className="workspace-inline-note">This role or account state does not allow profile corrections.</div>}
      </article>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Recovery history" title="Verification & password recovery signals" note="Only token issuance/state is shown. Raw tokens, passwords, IP addresses and device fingerprints are never exposed to Admin." />
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Email verified</strong><span>{dateTime(recovery.emailVerifiedAt)}</span><small>{customer.emailVerified ? "Verified identity" : "Verification still required"}</small></div>
        <div className="workspace-compact-row"><strong>Last verification link</strong><span>{dateTime(recovery.lastVerificationIssuedAt)}</span><small>{recovery.activeVerificationTokens} unexpired unused link(s)</small></div>
        <div className="workspace-compact-row"><strong>Last password reset link</strong><span>{dateTime(recovery.lastResetIssuedAt)}</span><small>{recovery.activeResetTokens} unexpired unused link(s)</small></div>
        <div className="workspace-compact-row"><strong>Active browser sessions</strong><span>{customer.activeSessionCount}</span><small>Last seen {dateTime(customer.lastSeenAt)}</small></div>
      </div>
    </div></section>
  </main>;
}
