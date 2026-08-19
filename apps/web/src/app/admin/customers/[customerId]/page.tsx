import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { CustomerEmailApprovalPanel } from "../../../../components/CustomerEmailApprovalPanel";
import { CustomerSupportCaseForm } from "../../../../components/CustomerSupportCaseForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCustomerEmailMessages } from "../../../../lib/admin-customer-email";
import { adminCustomerDetail, type CustomerStatus } from "../../../../lib/admin-customer-management";
import { adminCustomer360, type CustomerSupportPriority, type CustomerSupportStatus } from "../../../../lib/admin-customer-support";
import { getAdminSession } from "../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customer profile", robots: { index: false, follow: false } };

const statusLabel: Record<CustomerStatus, string> = { pending_verification: "Pending verification", active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed" };
const caseStatusLabel: Record<CustomerSupportStatus, string> = { open: "Open", waiting_customer: "Waiting customer", waiting_internal: "Waiting internal", resolved: "Resolved", closed: "Closed" };
const priorityLabel: Record<CustomerSupportPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
function money(minor: number, currency = "EUR") { try { return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100); } catch { return `${(minor / 100).toFixed(2)} ${currency}`; } }
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function customerName(customer: { firstName?: string; lastName?: string; email?: string; id: string }) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || customer.id; }
function stateJson(value: Record<string, unknown>) { const entries = Object.entries(value); return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(" · ") : "—"; }

export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { customerId } = await params;
  const decodedCustomerId = decodeURIComponent(customerId);
  let result;
  try { result = await adminCustomerDetail(principal, decodedCustomerId); } catch { redirect("/admin/customers"); }
  if (!result) notFound();
  const customer360 = await adminCustomer360(principal, decodedCustomerId);
  const { customer, addresses, orders, audit } = result.detail;
  const { engagement, privacyRequests, supportCases } = customer360;
  const canManage = hasAdminPermission(principal, "customer.manage");
  const customerEmailMessages = canManage && customer.email ? await adminCustomerEmailMessages(principal, customer.id) : [];

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={result.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Customer 360 · {customer.id}</div>
        <h1>{customerName(customer)}</h1>
        <p className="lead">{customer.email ?? "No email"}{customer.phone ? ` · ${customer.phone}` : ""} · {statusLabel[customer.status]}</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/customers">← Customers</Link><Link className="text-link" href={`/admin/orders?customer=${encodeURIComponent(customer.id)}`}>Customer orders →</Link><Link className="text-link" href={`/admin/privacy?customer=${encodeURIComponent(customer.id)}`}>Privacy workflows →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: statusLabel[customer.status], tone: customer.status === "active" ? "positive" : customer.status === "pending_verification" ? "attention" : "default" },
      { label: "Orders", value: customer.orderCount },
      { label: "Gross order value", value: money(customer.grossOrderValueMinor) },
      { label: "Open support", value: engagement.openSupportCases, tone: engagement.openSupportCases ? "attention" : "positive", hint: `${engagement.supportCases} total cases` },
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

    {canManage && customer.email && <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Customer communication" title="Draft → approve wording → send" note="Operational customer emails are manual. Approval does not send anything, and changing approved wording revokes the approval before another send can happen." />
      <CustomerEmailApprovalPanel customerId={customer.id} customerEmail={customer.email} csrfToken={result.csrfToken} messages={customerEmailMessages} />
    </div></section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Customer 360" title="Engagement & service signals" note="Operational counts only. Message contents, raw device/IP data and unnecessary personal data are not surfaced here." />
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Cart</strong><span>{engagement.cartItems} item(s)</span><small>{engagement.activeCarts} active cart(s)</small></div>
        <div className="workspace-compact-row"><strong>Saved</strong><span>{engagement.savedProducts} products · {engagement.savedVendors} shops</span><small>{engagement.savedSearches} saved searches</small></div>
        <div className="workspace-compact-row"><strong>Advice / messages</strong><span>{engagement.conversations} conversations · {engagement.messages} messages</span><small>Last conversation {dateTime(engagement.lastConversationAt)}</small></div>
        <div className="workspace-compact-row"><strong>Reviews</strong><span>{engagement.reviews}</span><small>Customer-authored review records</small></div>
        <div className="workspace-compact-row"><strong>Notifications</strong><span>{engagement.notifications} total</span><small>{engagement.notificationFailures} failed · last {dateTime(engagement.lastNotificationAt)}</small></div>
        <div className="workspace-compact-row"><strong>Privacy</strong><span>{engagement.openPrivacyRequests} open</span><small>{engagement.privacyRequests} total requests</small></div>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Customer support" title="Cases, notes & ownership" note="Support notes are operational records with their own immutable event history; material administrative actions continue to be written to audit_events." />
      {canManage && <CustomerSupportCaseForm customerId={customer.id} csrfToken={result.csrfToken} />}
      {supportCases.length === 0 ? <WorkspaceEmptyState title="No support cases for this customer." body="Create a case when the customer contacts support or an issue needs follow-up." /> : <div className="workspace-queue-list" style={{ marginTop: 18 }}>{supportCases.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.subject}</strong><small>{item.id} · {item.category} · opened {dateTime(item.createdAt)}</small></div><span className="status-pill">{caseStatusLabel[item.status]}</span></div>
        <div className="workspace-queue-primary"><span>Priority: {priorityLabel[item.priority]}</span><span>Owner: {item.assignedTo ?? "Unassigned"}</span><span>Follow-up: {dateTime(item.followUpAt)}</span></div>
        <WorkspaceRecordDetails label={`Case history · ${item.events.length} event(s)`}><div className="workspace-compact-list">{item.events.length === 0 ? <div className="workspace-compact-row"><strong>No events</strong><span>—</span></div> : item.events.map((event) => <div className="workspace-compact-row" key={event.id}><strong>{event.type}</strong><span>{event.note ?? "—"}</span><small>{event.actor} · {dateTime(event.createdAt)}</small></div>)}</div></WorkspaceRecordDetails>
        {canManage && <div className="workspace-action-bar"><span>Manage case</span><div className="workspace-action-buttons">
          <AdminActionButton label="Add note" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"add_note" }} reasonPrompt="Support note" />
          {item.assignedTo !== principal.userId && <AdminActionButton label="Assign to me" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"assign_self" }} reasonPrompt="Reason for taking ownership" />}
          {item.assignedTo && <AdminActionButton label="Unassign" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"clear_assignee" }} reasonPrompt="Reason for clearing case ownership" />}
          {item.status !== "waiting_customer" && <AdminActionButton label="Waiting customer" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_status", status:"waiting_customer" }} reasonPrompt="What are we waiting for from the customer?" />}
          {item.status !== "waiting_internal" && <AdminActionButton label="Waiting internal" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_status", status:"waiting_internal" }} reasonPrompt="What internal action is pending?" />}
          {item.status !== "open" && <AdminActionButton label="Reopen" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_status", status:"open" }} reasonPrompt="Reason for reopening the case" />}
          {item.status !== "resolved" && <AdminActionButton label="Resolve" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_status", status:"resolved" }} reasonPrompt="Resolution summary" />}
          {item.status !== "closed" && <AdminActionButton label="Close" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_status", status:"closed" }} reasonPrompt="Reason for closing this support case" danger />}
          {item.priority !== "high" && <AdminActionButton label="Priority high" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_priority", priority:"high" }} reasonPrompt="Reason for changing priority to high" />}
          {item.priority !== "urgent" && <AdminActionButton label="Priority urgent" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_priority", priority:"urgent" }} reasonPrompt="Reason for changing priority to urgent" danger />}
          {!["normal", "low"].includes(item.priority) && <AdminActionButton label="Priority normal" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_priority", priority:"normal" }} reasonPrompt="Reason for returning priority to normal" />}
          <AdminActionButton label="Set follow-up" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_follow_up" }} reasonPrompt="Why is follow-up needed?" extraPrompt={{ field:"followUpAt", message:"Follow-up date/time (for example 2026-08-21T10:00)" }} />
          {item.followUpAt && <AdminActionButton label="Clear follow-up" endpoint="/api/admin/customers/cases" csrfToken={result.csrfToken} body={{ caseId:item.id, action:"set_follow_up", followUpAt:null }} reasonPrompt="Reason for clearing the follow-up" />}
        </div></div>}
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Commerce" title="Recent orders" note="The latest 50 customer orders. Open the order workspace with this customer and order pre-filtered." />
      {orders.length === 0 ? <WorkspaceEmptyState title="No orders for this customer." /> : <div className="workspace-queue-list">{orders.map((order) => <article className="workspace-queue-card" key={order.id}>
        <div className="workspace-queue-head"><div><strong>{order.orderNumber}</strong><small>{order.id} · {dateTime(order.createdAt)}</small></div><span className="status-pill">{order.status}</span></div>
        <div className="workspace-queue-primary"><span>{money(order.totalMinor, order.currency)}</span><span>{order.fulfilmentPreference}</span><span>{order.confirmedAt ? `Confirmed ${dateTime(order.confirmedAt)}` : "Not confirmed"}</span></div>
        <div className="workspace-action-bar"><span>Order context</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/orders?customer=${encodeURIComponent(customer.id)}&order=${encodeURIComponent(order.id)}`}>Open in Orders</Link></div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Privacy" title="Customer privacy requests" note="The Customer profile shows status and deadlines only. Processing, retention decisions and completion stay in the dedicated Privacy workspace." />
      {privacyRequests.length === 0 ? <WorkspaceEmptyState title="No privacy requests for this customer." /> : <div className="workspace-queue-list">{privacyRequests.map((request) => <article className="workspace-queue-card" key={request.id}>
        <div className="workspace-queue-head"><div><strong>{request.type}</strong><small>{request.id} · created {dateTime(request.createdAt)}</small></div><span className="status-pill">{request.status}</span></div>
        <div className="workspace-queue-primary"><span>Due {dateTime(request.dueAt)}</span><span>{request.completedAt ? `Completed ${dateTime(request.completedAt)}` : "Not completed"}</span></div>
      </article>)}</div>}
      <div className="workspace-action-bar"><span>GDPR operations remain separated from customer support.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/privacy?customer=${encodeURIComponent(customer.id)}`}>Open Privacy queue</Link></div></div>
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
