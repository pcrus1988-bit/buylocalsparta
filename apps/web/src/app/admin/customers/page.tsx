import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCustomersWorkspace, CUSTOMER_STATUSES, type CustomerStatus } from "../../../lib/admin-customer-management";
import { getAdminSession } from "../../../lib/admin-session";
import { hasAdminPermission } from "../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customers", robots: { index: false, follow: false } };

const statusLabel: Record<CustomerStatus, string> = {
  pending_verification: "Pending verification",
  active: "Active",
  restricted: "Restricted",
  suspended: "Suspended",
  closed: "Closed"
};

function euro(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function date(value?: number) { return value ? new Date(value).toLocaleDateString("el-GR") : "—"; }
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function customerName(customer: { firstName?: string; lastName?: string; email?: string; id: string }) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.email || customer.id; }

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  let data;
  try { data = await adminCustomersWorkspace(principal, { query: params.q, status: params.status }); } catch { redirect("/admin"); }
  const canManage = hasAdminPermission(principal, "customer.manage");
  const filtered = Boolean(params.q?.trim() || params.status);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Customer operations · identity → activity → commerce → account state</div>
        <h1>Customer user management</h1>
        <p className="lead">Μία ενιαία εικόνα για λογαριασμούς πελατών, verification, παραγγελίες, αξία, διευθύνσεις, consent και account health.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/orders">Orders & returns</Link><Link className="text-link" href="/admin/privacy">Privacy requests →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Customers", value: data.metrics.total },
      { label: "Active", value: data.metrics.active, tone: data.metrics.active ? "positive" : "default", hint: `${data.metrics.new30d} new in 30 days` },
      { label: "Needs attention", value: data.metrics.pending + data.metrics.restricted + data.metrics.suspended, tone: data.metrics.pending + data.metrics.restricted + data.metrics.suspended ? "attention" : "default", hint: `${data.metrics.pending} pending · ${data.metrics.restricted} restricted · ${data.metrics.suspended} suspended` },
      { label: "Customers with orders", value: data.metrics.customersWithOrders },
      { label: "Gross order value", value: euro(data.metrics.grossOrderValueMinor), hint: "EUR orders excluding cancelled" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Customer accounts" note="Αναζήτησε με όνομα, email, τηλέφωνο ή customer ID. Εμφανίζονται έως 150 από τα πιο πρόσφατα σχετικά records· το search εξετάζει όλη τη βάση." />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· το customer management είναι read-only/unavailable σε database-less preview.</div>}
      <form method="get" className="workspace-tool-panel" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(190px, 240px) auto", gap: 12, alignItems: "end", padding: 16, marginBottom: 18 }}>
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Name, email, phone, customer ID" /></label>
        <label><span>Status</span><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{CUSTOMER_STATUSES.map((status) => <option value={status} key={status}>{statusLabel[status]}</option>)}</select></label>
        <div style={{ display: "flex", gap: 8 }}><button className="button button-secondary" type="submit">Filter</button>{filtered && <Link className="text-link" href="/admin/customers">Clear</Link>}</div>
      </form>

      {data.customers.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν customer accounts με αυτά τα φίλτρα." : "Δεν υπάρχουν ακόμη customer accounts."} body={filtered ? "Δοκίμασε διαφορετικό search ή status." : "Οι νέες εγγραφές πελατών θα εμφανίζονται εδώ από την production βάση."} /> : <div className="workspace-queue-list">{data.customers.map((customer) => <article className="workspace-queue-card" key={customer.id}>
        <div className="workspace-queue-head">
          <div><strong>{customerName(customer)}</strong><small>{customer.email ?? "No email"} · {customer.id}</small></div>
          <span className="status-pill">{statusLabel[customer.status]}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{customer.orderCount} orders</span>
          <span>{euro(customer.grossOrderValueMinor)}</span>
          <span>{customer.addressCount} addresses</span>
          <span>{customer.activeSessionCount} active sessions</span>
        </div>
        <WorkspaceRecordDetails label="Account signals">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Verification</strong><span>{customer.emailVerified ? "Email verified" : "Email not verified"}</span><small>Joined {date(customer.createdAt)}</small></div>
            <div className="workspace-compact-row"><strong>Contact</strong><span>{customer.phone ?? "No phone"}</span><small>{customer.email ?? "No email"}</small></div>
            <div className="workspace-compact-row"><strong>Commerce</strong><span>Last order {dateTime(customer.lastOrderAt)}</span><small>Gross order value {euro(customer.grossOrderValueMinor)}</small></div>
            <div className="workspace-compact-row"><strong>Activity</strong><span>Last seen {dateTime(customer.lastSeenAt)}</span><small>{customer.activeSessionCount} non-expired session(s)</small></div>
            <div className="workspace-compact-row"><strong>Consent</strong><span>Marketing {customer.marketingConsent ? "ON" : "OFF"}</span><small>Recommendations {customer.recommendationsEnabled ? "ON" : "OFF"} · Recently viewed {customer.recentlyViewedEnabled ? "ON" : "OFF"}</small></div>
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Account: <strong>{statusLabel[customer.status]}</strong></span>
          <div className="workspace-action-buttons">
            <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customer.id)}`}>Open profile</Link>
            {canManage && customer.status === "active" && <AdminActionButton label="Restrict" endpoint="/api/admin/customers/status" csrfToken={data.csrfToken} body={{ customerId: customer.id, status: "restricted" }} reasonPrompt="Reason for restricting this customer account; existing sessions will be revoked" danger />}
            {canManage && customer.status === "pending_verification" && !customer.emailVerified && <AdminActionButton label="Resend verification" endpoint="/api/admin/customers/action" csrfToken={data.csrfToken} body={{ customerId: customer.id, action: "resend_verification" }} reasonPrompt="Reason for resending customer email verification" />}
            {canManage && customer.emailVerified && ["pending_verification", "restricted", "suspended"].includes(customer.status) && <AdminActionButton label="Set active" endpoint="/api/admin/customers/status" csrfToken={data.csrfToken} body={{ customerId: customer.id, status: "active" }} reasonPrompt="Reason for activating this verified customer account" />}
          </div>
        </div>
      </article>)}</div>}
    </section>
  </main>;
}
