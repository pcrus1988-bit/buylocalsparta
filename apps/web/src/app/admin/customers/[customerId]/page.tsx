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
import { marketplaceReferenceMap } from "../../../../lib/public-reference-service";

export const metadata: Metadata = { title: "Admin · Customer profile", robots: { index: false, follow: false } };

const statusLabel: Record<CustomerStatus, string> = { pending_verification: "Pending verification", active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed" };
const caseStatusLabel: Record<CustomerSupportStatus, string> = { open: "Open", waiting_customer: "Waiting customer", waiting_internal: "Waiting internal", resolved: "Resolved", closed: "Closed" };
const priorityLabel: Record<CustomerSupportPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
function money(minor: number, currency = "EUR") { try { return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100); } catch { return `${(minor / 100).toFixed(2)} ${currency}`; } }
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function customerName(customer: { firstName?: string; lastName?: string; email?: string; id: string }) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || "Customer"; }
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
  const [supportReferences, privacyReferences] = await Promise.all([
    marketplaceReferenceMap("support", supportCases.map((item) => item.id)),
    marketplaceReferenceMap("privacy", privacyRequests.map((item) => item.id))
  ]);
  const recentOrders = orders.slice(0, 5);
  const recentSupport = supportCases.slice(0, 5);
  const recentPrivacy = privacyRequests.slice(0, 5);

  return <main className="vendor-app admin-app admin-customer-360">
    <AdminWorkspaceHeader csrfToken={result.csrfToken} entityLabel={customerName(customer)} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Customer 360</div>
        <h1>{customerName(customer)}</h1>
        <p className="lead">Account context, service signals και hand-offs. Orders, Support και Privacy εκτελούνται στα δικά τους workspaces αντί να αντιγράφονται μέσα στο customer record.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/customers">← Customer Directory</Link></div>
      </div>
      <aside className="dashboard-health-card">
        <span>Account state</span>
        <strong>{statusLabel[customer.status]}</strong>
        <p>{customer.emailVerified ? "Email verified" : "Email verification pending"} · {customer.activeSessionCount} active session(s) · last seen {dateTime(customer.lastSeenAt)}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: statusLabel[customer.status], tone: customer.status === "active" ? "positive" : customer.status === "pending_verification" ? "attention" : "default" },
      { label: "Orders", value: customer.orderCount, hint: money(customer.grossOrderValueMinor) },
      { label: "Open support", value: engagement.openSupportCases, tone: engagement.openSupportCases ? "attention" : "positive", hint: `${engagement.supportCases} total cases` },
      { label: "Open privacy", value: engagement.openPrivacyRequests, tone: engagement.openPrivacyRequests ? "attention" : "positive", hint: `${engagement.privacyRequests} total requests` },
      { label: "Active sessions", value: customer.activeSessionCount, hint: `Last seen ${dateTime(customer.lastSeenAt)}` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Workspaces" title="Open the system that owns the task" note="Customer 360 keeps identity and context. Operational execution stays with the specialist queue." />
      <div className="customer-handoff-grid">
        <Link className="customer-handoff-card" href={`/admin/customers/${encodeURIComponent(customer.id)}/manage`}>
          <span>Account</span><strong>Profile & recovery</strong><p>Audited profile corrections and recovery-state signals.</p><i>Open account tools →</i>
        </Link>
        <Link className="customer-handoff-card" href={`/admin/customers/support?case=${encodeURIComponent(recentSupport[0]?.id ?? "")}`}>
          <span>Service</span><strong>Support Queue</strong><p>{engagement.openSupportCases} open case(s) · ownership, replies and resolution.</p><i>Open support →</i>
        </Link>
        <Link className="customer-handoff-card" href={`/admin/orders?customer=${encodeURIComponent(customer.id)}`}>
          <span>Commerce</span><strong>Orders</strong><p>{customer.orderCount} order(s) · fulfilment and payment execution stays in Orders.</p><i>Open customer orders →</i>
        </Link>
        <Link className="customer-handoff-card" href={`/admin/privacy?customer=${encodeURIComponent(customer.id)}`}>
          <span>Governance</span><strong>Privacy</strong><p>{engagement.openPrivacyRequests} open GDPR request(s) · processing stays in Privacy.</p><i>Open privacy queue →</i>
        </Link>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Account control" title="Identity, access & recovery" note="Account-state changes remain in Customer Management. Profile corrections live in the Profile & recovery drill-down; GDPR anonymisation/deletion remains in Privacy." />
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{customerName(customer)}</strong><small>{customer.email ?? "No email"}{customer.phone ? ` · ${customer.phone}` : ""}</small></div><span className="status-pill">{statusLabel[customer.status]}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Email</strong><span>{customer.email ?? "—"}</span><small>{customer.emailVerified ? "Verified" : "Not verified"}</small></div>
          <div className="workspace-compact-row"><strong>Phone / locale</strong><span>{customer.phone ?? "—"}</span><small>{customer.preferredLocale}</small></div>
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
          <div className="workspace-action-bar"><span>Recovery</span><div className="workspace-action-buttons">
            {customer.status === "pending_verification" && !customer.emailVerified && customer.email && <AdminActionButton label="Resend verification" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "resend_verification" }} reasonPrompt="Reason for resending the customer verification email" />}
            {customer.emailVerified && ["active", "restricted"].includes(customer.status) && customer.email && <AdminActionButton label="Send password reset" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "send_password_reset" }} reasonPrompt="Reason for sending a password reset link to this customer" />}
            {customer.activeSessionCount > 0 && <AdminActionButton label="Revoke all sessions" endpoint="/api/admin/customers/action" csrfToken={result.csrfToken} body={{ customerId: customer.id, action: "revoke_sessions" }} reasonPrompt="Reason for signing this customer out of every active session" danger />}
          </div></div>
          {!customer.emailVerified && <div className="workspace-inline-note">Activation remains blocked until email verification. Resend verification instead of bypassing the identity gate.</div>}
        </>}
      </article>
    </section>

    <section className="shell vendor-section customer-360-stack">
      <details className="customer-360-disclosure">
        <summary><span><strong>Customer communication</strong><small>Manual operational email · draft → approve wording → send</small></span><span>{customerEmailMessages.length} message(s)</span></summary>
        <div className="customer-disclosure-body">
          {canManage && customer.email ? <CustomerEmailApprovalPanel customerId={customer.id} customerEmail={customer.email} csrfToken={result.csrfToken} messages={customerEmailMessages} /> : <div className="workspace-inline-note">Operational email requires customer.manage permission and a customer email address.</div>}
        </div>
      </details>

      <details className="customer-360-disclosure">
        <summary><span><strong>Engagement context</strong><small>Carts, saved items, advice, reviews and notifications</small></span><span>{engagement.conversations} conversation(s)</span></summary>
        <div className="customer-disclosure-body"><div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Cart</strong><span>{engagement.cartItems} item(s)</span><small>{engagement.activeCarts} active cart(s)</small></div>
          <div className="workspace-compact-row"><strong>Saved</strong><span>{engagement.savedProducts} products · {engagement.savedVendors} shops</span><small>{engagement.savedSearches} saved searches</small></div>
          <div className="workspace-compact-row"><strong>Advice / messages</strong><span>{engagement.conversations} conversations · {engagement.messages} messages</span><small>Last conversation {dateTime(engagement.lastConversationAt)}</small></div>
          <div className="workspace-compact-row"><strong>Reviews</strong><span>{engagement.reviews}</span><small>Customer-authored review records</small></div>
          <div className="workspace-compact-row"><strong>Notifications</strong><span>{engagement.notifications} total</span><small>{engagement.notificationFailures} failed · last {dateTime(engagement.lastNotificationAt)}</small></div>
        </div></div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Support context" title="Cases for this customer" note="Create a case from the customer context when needed. Ownership, notes, replies, status, priority and follow-up are operated in the Support Queue." />
      {canManage && <details className="customer-360-disclosure" style={{ marginBottom: 12 }}><summary><span><strong>Create support case</strong><small>Start a new case attached to this customer</small></span><span>+</span></summary><div className="customer-disclosure-body"><CustomerSupportCaseForm customerId={customer.id} csrfToken={result.csrfToken} /></div></details>}
      {recentSupport.length === 0 ? <WorkspaceEmptyState title="No support cases for this customer." /> : <div className="workspace-queue-list">{recentSupport.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.subject}</strong><small>{supportReferences.get(item.id) ?? item.id} · {item.category} · opened {dateTime(item.createdAt)}</small></div><span className="status-pill">{caseStatusLabel[item.status]}</span></div>
        <div className="workspace-queue-primary"><span>Priority: {priorityLabel[item.priority]}</span><span>Owner: {item.assignedTo ?? "Unassigned"}</span><span>Follow-up: {dateTime(item.followUpAt)}</span></div>
        <div className="workspace-action-bar"><span>Case execution belongs to Support.</span><Link className="button button-secondary" href={`/admin/customers/support?case=${encodeURIComponent(item.id)}`}>Open in Support</Link></div>
      </article>)}</div>}
      {supportCases.length > recentSupport.length && <div className="workspace-action-bar"><span>{supportCases.length - recentSupport.length} older case(s) not shown here.</span><Link className="button button-secondary" href="/admin/customers/support">Open Support Queue</Link></div>}
    </div></section>

    <section className="shell vendor-section customer-360-stack">
      <details className="customer-360-disclosure">
        <summary><span><strong>Recent orders</strong><small>Context only · fulfilment and payment actions stay in Orders</small></span><span>{orders.length}</span></summary>
        <div className="customer-disclosure-body">
          {recentOrders.length === 0 ? <WorkspaceEmptyState title="No orders for this customer." /> : <div className="workspace-queue-list">{recentOrders.map((order) => <article className="workspace-queue-card" key={order.id}>
            <div className="workspace-queue-head"><div><strong>{order.orderNumber}</strong><small>{dateTime(order.createdAt)}</small></div><span className="status-pill">{order.status}</span></div>
            <div className="workspace-queue-primary"><span>{money(order.totalMinor, order.currency)}</span><span>{order.fulfilmentPreference}</span><span>{order.confirmedAt ? `Confirmed ${dateTime(order.confirmedAt)}` : "Not confirmed"}</span></div>
            <div className="workspace-action-bar"><span>Order context</span><Link className="button button-secondary" href={`/admin/orders?customer=${encodeURIComponent(customer.id)}&order=${encodeURIComponent(order.id)}`}>Open in Orders</Link></div>
          </article>)}</div>}
          <div className="workspace-action-bar"><span>Showing up to 5 recent orders.</span><Link className="button button-secondary" href={`/admin/orders?customer=${encodeURIComponent(customer.id)}`}>All customer orders</Link></div>
        </div>
      </details>

      <details className="customer-360-disclosure">
        <summary><span><strong>Privacy requests</strong><small>Status and deadline context only · processing stays in Privacy</small></span><span>{privacyRequests.length}</span></summary>
        <div className="customer-disclosure-body">
          {recentPrivacy.length === 0 ? <WorkspaceEmptyState title="No privacy requests for this customer." /> : <div className="workspace-queue-list">{recentPrivacy.map((request) => <article className="workspace-queue-card" key={request.id}>
            <div className="workspace-queue-head"><div><strong>{request.type}</strong><small>{privacyReferences.get(request.id) ?? request.id} · created {dateTime(request.createdAt)}</small></div><span className="status-pill">{request.status}</span></div>
            <div className="workspace-queue-primary"><span>Due {dateTime(request.dueAt)}</span><span>{request.completedAt ? `Completed ${dateTime(request.completedAt)}` : "Not completed"}</span></div>
          </article>)}</div>}
          <div className="workspace-action-bar"><span>GDPR execution remains separated from Customer Support.</span><Link className="button button-secondary" href={`/admin/privacy?customer=${encodeURIComponent(customer.id)}`}>Open Privacy queue</Link></div>
        </div>
      </details>

      <details className="customer-360-disclosure">
        <summary><span><strong>Saved addresses</strong><small>Fulfilment context · authorised Customer Management view</small></span><span>{addresses.length}</span></summary>
        <div className="customer-disclosure-body">
          {addresses.length === 0 ? <WorkspaceEmptyState title="No saved addresses." /> : <div className="workspace-queue-list">{addresses.map((address) => <article className="workspace-queue-card" key={address.id}>
            <div className="workspace-queue-head"><div><strong>{address.label ?? address.recipientName ?? "Address"}</strong><small>{address.locality} · {address.postcode}</small></div><span className="status-pill">{address.countryCode}</span></div>
            <p className="workspace-queue-summary">{address.recipientName ?? ""}{address.companyName ? ` · ${address.companyName}` : ""}<br />{address.line1}{address.line2 ? `, ${address.line2}` : ""}<br />{address.postcode} {address.locality}{address.region ? `, ${address.region}` : ""}</p>
            {address.phone && <small>{address.phone}</small>}
          </article>)}</div>}
        </div>
      </details>

      <details className="customer-360-disclosure">
        <summary><span><strong>Customer audit history</strong><small>Account-state, session and recovery actions</small></span><span>{audit.length}</span></summary>
        <div className="customer-disclosure-body">
          {audit.length === 0 ? <WorkspaceEmptyState title="No customer-management audit events yet." /> : <div className="workspace-queue-list">{audit.map((event) => <article className="workspace-queue-card" key={event.id}>
            <div className="workspace-queue-head"><div><strong>{event.action}</strong><small>{event.actor} · {dateTime(event.createdAt)}</small></div></div>
            {event.reason && <p className="workspace-queue-summary">{event.reason}</p>}
            <WorkspaceRecordDetails label="Before / after"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Before</strong><span>{stateJson(event.beforeState)}</span></div><div className="workspace-compact-row"><strong>After</strong><span>{stateJson(event.afterState)}</span></div></div></WorkspaceRecordDetails>
          </article>)}</div>}
        </div>
      </details>
    </section>
  </main>;
}
