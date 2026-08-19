import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCustomerDetail, type CustomerStatus } from "../../../../lib/admin-customer-management";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customer profile", robots: { index: false, follow: false } };

const statusLabel: Record<CustomerStatus, string> = { pending_verification: "Pending verification", active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed" };
function money(minor: number, currency = "EUR") { try { return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100); } catch { return `${(minor / 100).toFixed(2)} ${currency}`; } }
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function customerName(customer: { firstName?: string; lastName?: string; email?: string; id: string }) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || customer.id; }
function stateJson(value: Record<string, unknown>) { const entries = Object.entries(value); return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(" · ") : "—"; }

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { customerId } = await params;
  let result;
  try { result = await adminCustomerDetail(principal, decodeURIComponent(customerId)); } catch { redirect("/admin/customers"); }
  if (!result) notFound();
  const { customer, addresses, orders, audit } = result.detail;
  const canManage = hasAdminPermission(principal, "customer.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={result.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Customer profile · {customer.id}</div>
        <h1>{customerName(customer)}</h1>
        <p className="lead">{customer.email ?? "No email"}{customer.phone ? ` · ${customer.phone}` : ""} · {statusLabel[customer.status]}</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/customers">← Customers</Link><Link className="text-link" href="/admin/privacy">Privacy workflows →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: statusLabel[customer.status], tone: customer.status === "active" ? "positive" : customer.status === "pending_verification" ? "attention" : "default" },
      { label: "Orders", value: customer.orderCount },
      { label: "Gross order value", value: money(customer.grossOrderValueMinor) },
      { label: "Addresses", value: customer.addressCount },
      { label: "Active sessions", value: customer.activeSessionCount, hint: `Last seen ${dateTime(customer.lastSeenAt)}` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Account control" title="Identity, access & recovery" note="Account-state changes and support actions require a reason and are written to the audit trail. GDPR anonymisation/deletion remains in Privacy." />
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{customerName(customer)}</strong><small>{customer.id}</small></div><span className="status-pill">{statusLabel[customer.status]}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Email</strong><span>{customer.email ?? "—"}</span><small>{customer.emailVerified ? "Verified" : "Not verified"}</small></div>
          <div className="workspace-compact-row"><strong>Phone</strong><span>{customer.phone ?? "—"}</span><small>Locale {customer.preferredLocale}</small></div>
          <div className="workspace-compact-row"><strong>Created</strong><span>{dateTime(customer.createdAt)}</span><small>Updated {dateTime(customer.updatedAt)}</small></div>
          <div className="workspace-compact-row"><strong>Consent</strong><span>Marketing {customer.marketingConsent ? "ON" : "OFF"}</span><small>Recommendations {customer.recommendationsEnabled ? "ON" : "OFF"} · Recently viewed {customer.recentlyViewedEnabled ? "ON" : "OFF"}</small></div>
          {customer.closedAt && <div className="workspace-compact-row"><strong>Closed</strong><span>{dateTime(customer.closedAt)}</span><small>{customer.anonymizedAt ? `Anonymized ${dateTime(customer.anonymizedAt)}` : "Not anonymized"}</small></div>}
        </div>
        {canManage && customer.status !== "closed" && <>
          <div className="workspace-action-bar"><span>Account state</span><div className="workspace-action-buttons">
            {customer.status !== "active" && customer.emailVerified && <AdminActionButton label="Set active" endpoint="/api/admin/customers/status" csrfToken={result.csrfToken} body={{ customerId: customer.id, status: "active" }} reasonPrompt="Reason for activating this verified customer account" />}
            {customer.status !== "restricted" && <AdminActionButton label="Restrict" endpoint="/api/admin/customers/status" csrfToken={result.csrfToken} body={{ customerId: customer.id, status: "restricted" }} reasonPrompt="Reason for restricting this customer account; existing sessions will be revoked" danger />}
            {customer.status !== "suspended" && <AdminActionButton label="Suspend" endpoint="/api/admin/customers/status" csrfToken={result.csrfToken} body={{ customerId: customer.id, status: "suspended" }} reasonPrompt="Reason for suspending this customer account; existing sessions will be revoked" danger />}
            <AdminActionButton label="Close account" endpoint="/api/admin/customers/status" csrfToken={result.csrfToken} body={{ customerId: customer.id, status: "closed" }} reasonPrompt="Reason for closing this account. This cannot be reopened from Customer Management." danger />
          </div></div>
          <div className="workspace-action-bar"><span>Security & recovery</span><div className="workspace-action-buttons">
            {customer.status === "pending_verification" && !customer.emailVerified && customer.email && <AdminActionButton label="Resend verification email" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "resend_verification" }} reasonPrompt="Reason for resending the customer verification email" />}
            {customer.emailVerified && ["active", "restricted"].includes(customer.status) && customer.email && <AdminActionButton label="Send password reset" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "send_password_reset" }} reasonPrompt="Reason for sending a password reset link to this customer" />}
            {customer.activeSessionCount > 0 && <AdminActionButton label="Revoke all sessions" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "revoke_sessions" }} reasonPrompt="Reason for signing this customer out of every active session" danger />}
          </div></div>
          {!customer.emailVerified && <div className="workspace-inline-note">Activation is blocked until the customer verifies the email address. Use “Resend verification email” instead of manually bypassing verification.</div>}
        </>}
      </article>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Commerce" title="Recent orders" note="Τα τελευταία 50 customer orders, χωρίς να εκτίθεται vendor-private operational data." />
      {orders.length === 0 ? <WorkspaceEmptyState title="No orders for this customer." /> : <div className="workspace-queue-list">{orders.map((order) => <article className="workspace-queue-card" key={order.id}>
        <div className="workspace-queue-head"><div><strong>{order.orderNumber}</strong><small>{order.id} · {dateTime(order.createdAt)}</small></div><span className="status-pill">{order.status}</span></div>
        <div className="workspace-queue-primary"><span>{money(order.totalMinor, order.currency)}</span><span>{order.fulfilmentPreference}</span><span>{order.confirmedAt ? `Confirmed ${dateTime(order.confirmedAt)}` : "Not confirmed"}</span></div>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Fulfilment profile" title="Saved addresses" note="Contact and delivery data is visible only to authorised Customer Management roles and remains separate from privacy-erasure workflows." />
      {addresses.length === 0 ? <WorkspaceEmptyState title="No saved addresses." /> : <div className="workspace-queue-list">{addresses.map((address) => <article className="workspace-queue-card" key={address.id}>
        <div className="workspace-queue-head"><div><strong>{address.label ?? address.recipientName ?? "Address"}</strong><small>{address.id}</small></div><span className="status-pill">{address.countryCode}</span></div>
        <p className="workspace-queue-summary">{address.recipientName ?? ""}{address.companyName ? ` · ${address.companyName}` : ""}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.postcode} {address.locality}{address.region ? `, ${address.region}` : ""}</p>
        {address.phone && <small>{address.phone}</small>}
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Governance" title="Customer audit history" note="Account-state, session and recovery actions made from this dashboard appear here with actor, reason and before/after state." />
      {audit.length === 0 ? <WorkspaceEmptyState title="No customer-management audit events yet." /> : <div className="workspace-queue-list">{audit.map((event) => <article className="workspace-queue-card" key={event.id}>
        <div className="workspace-queue-head"><div><strong>{event.action}</strong><small>{event.actor} · {dateTime(event.createdAt)}</small></div></div>
        {event.reason && <p className="workspace-queue-summary">{event.reason}</p>}
        <WorkspaceRecordDetails label="Before / after"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Before</strong><span>{stateJson(event.beforeState)}</span></div><div className="workspace-compact-row"><strong>After</strong><span>{stateJson(event.afterState)}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>
  </main>;
}
