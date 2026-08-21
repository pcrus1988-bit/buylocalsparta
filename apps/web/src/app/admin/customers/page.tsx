import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminStatusStack, type AdminRecordStateTone, type AdminAttentionSeverity } from "../../../components/AdminRecordStatus";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCustomersWorkspace, CUSTOMER_STATUSES, type CustomerStatus } from "../../../lib/admin-customer-management";
import { getAdminSession } from "../../../lib/admin-session";
import { hasAdminPermission } from "../../../lib/admin-runtime";

export const metadata: Metadata = { title: "Admin · Customers", robots: { index: false, follow: false } };
const statusLabel: Record<CustomerStatus, string> = { pending_verification: "Pending verification", active: "Active", restricted: "Restricted", suspended: "Suspended", closed: "Closed" };
const CUSTOMER_VIEWS = ["all", "attention", "active", "new", "orders", "unverified"] as const;
type CustomerView = (typeof CUSTOMER_VIEWS)[number];
function euro(minor: number) { return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100); }
function dateTime(value?: number) { return value ? new Date(value).toLocaleString("el-GR") : "—"; }
function maskEmail(value?: string) {
  if (!value) return undefined;
  const [local, domain] = value.split("@", 2);
  if (!domain) return "***";
  return `${local?.slice(0, 1) || "*"}***@${domain}`;
}
function maskPhone(value?: string) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits ? `••••${digits.slice(-4)}` : "••••";
}
function customerName(customer: { firstName?: string; lastName?: string; email?: string; id: string }) { return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || maskEmail(customer.email) || customer.id; }
function customerView(value?: string): CustomerView { return CUSTOMER_VIEWS.includes(value as CustomerView) ? value as CustomerView : "all"; }
function customerStateTone(status: CustomerStatus): AdminRecordStateTone {
  if (status === "active") return "positive";
  if (status === "pending_verification") return "caution";
  if (["restricted", "suspended"].includes(status)) return "critical";
  return "neutral";
}
function customerAttention(customer: { status: CustomerStatus; emailVerified: boolean }): { label: string; severity: AdminAttentionSeverity } | undefined {
  if (customer.status === "suspended") return { label: "Account review", severity: "critical" };
  if (customer.status === "restricted") return { label: "Restriction review", severity: "attention" };
  if (customer.status === "pending_verification") return { label: "Verification pending", severity: "attention" };
  if (!customer.emailVerified) return { label: "Email unverified", severity: "attention" };
  return undefined;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; view?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  let data;
  try { data = await adminCustomersWorkspace(principal, { query: params.q, status: params.status }); } catch { redirect("/admin"); }
  const canManage = hasAdminPermission(principal, "customer.manage");
  const view = customerView(params.view);
  const newCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const matchesView = (customer: (typeof data.customers)[number]) => view === "all"
    || (view === "attention" && ["pending_verification", "restricted", "suspended"].includes(customer.status))
    || (view === "active" && customer.status === "active")
    || (view === "new" && customer.createdAt >= newCutoff)
    || (view === "orders" && customer.orderCount > 0)
    || (view === "unverified" && !customer.emailVerified);
  const customers = data.customers.filter(matchesView);
  const hasAdHocFilters = Boolean(params.q?.trim() || params.status);
  const filtered = hasAdHocFilters || view !== "all";
  const clearHref = view === "all" ? "/admin/customers" : `/admin/customers?view=${encodeURIComponent(view)}`;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Customers</div><h1>Πελάτες</h1><p className="lead">Directory-first διαχείριση λογαριασμών με saved operational views. Το Customer 360 κρατά orders, support, privacy και security details σε επίπεδο πελάτη.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: filtered ? "Matching customers" : "Customers", value: filtered ? customers.length : data.metrics.total },
      { label: "Active", value: data.metrics.active, tone: data.metrics.active ? "positive" : "default", hint: `${data.metrics.new30d} new in 30 days` },
      { label: "Needs attention", value: data.metrics.pending + data.metrics.restricted + data.metrics.suspended, tone: data.metrics.pending + data.metrics.restricted + data.metrics.suspended ? "attention" : "default", hint: `${data.metrics.pending} pending · ${data.metrics.restricted} restricted · ${data.metrics.suspended} suspended` },
      { label: "Customers with orders", value: data.metrics.customersWithOrders },
      { label: "Gross order value", value: euro(data.metrics.grossOrderValueMinor), hint: "EUR orders excluding cancelled" }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Customer accounts" note="Bulk views mask contact data by default. Search can still match email or phone server-side; full contact details are confined to the individually opened, audited Customer 360 view." />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· το customer management είναι read-only/unavailable σε database-less preview.</div>}
      <nav className="admin-local-tabs" aria-label="Customer saved views">
        <Link href="/admin/customers" aria-current={view === "all" ? "page" : undefined}>All</Link>
        <Link href="/admin/customers?view=attention" aria-current={view === "attention" ? "page" : undefined}>Needs attention</Link>
        <Link href="/admin/customers?view=active" aria-current={view === "active" ? "page" : undefined}>Active</Link>
        <Link href="/admin/customers?view=new" aria-current={view === "new" ? "page" : undefined}>New 30d</Link>
        <Link href="/admin/customers?view=orders" aria-current={view === "orders" ? "page" : undefined}>With orders</Link>
        <Link href="/admin/customers?view=unverified" aria-current={view === "unverified" ? "page" : undefined}>Email unverified</Link>
      </nav>
      <form method="get" className="admin-directory-filters">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Name, email, phone, customer ID" /></label>
        <label><span>Status</span><select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{CUSTOMER_STATUSES.map((status) => <option value={status} key={status}>{statusLabel[status]}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{hasAdHocFilters && <Link className="text-link" href={clearHref}>Clear filters</Link>}</div>
      </form>
      {customers.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν customer accounts σε αυτό το view / φίλτρο." : "Δεν υπάρχουν ακόμη customer accounts."} body={filtered ? "Δοκίμασε διαφορετικό saved view, search ή status." : "Οι νέες εγγραφές πελατών θα εμφανίζονται εδώ από την production βάση."} /> : <div className="admin-directory-table" role="table" aria-label="Customer accounts"><div className="admin-directory-head" role="row"><span>Πελάτης</span><span>State / attention</span><span>Orders</span><span>Value</span><span>Last seen</span><span aria-label="Actions" /></div>{customers.map((customer) => {
        const attention = customerAttention(customer);
        const maskedEmail = maskEmail(customer.email);
        const maskedPhone = maskPhone(customer.phone);
        return <div className="admin-directory-row" role="row" key={customer.id}><Link className="admin-directory-identity" href={`/admin/customers/${encodeURIComponent(customer.id)}`}><strong>{customerName(customer)}</strong><small>{maskedEmail ?? "No email"}{maskedPhone ? ` · ${maskedPhone}` : ""}</small></Link><span><AdminStatusStack state={statusLabel[customer.status]} stateTone={customerStateTone(customer.status)} attention={attention?.label} attentionSeverity={attention?.severity} /></span><span><strong>{customer.orderCount}</strong><small>{customer.addressCount} addresses</small></span><span><strong>{euro(customer.grossOrderValueMinor)}</strong><small>{customer.emailVerified ? "verified" : "email unverified"}</small></span><span><strong>{dateTime(customer.lastSeenAt)}</strong><small>{customer.activeSessionCount} active sessions</small></span><details className="admin-row-actions"><summary aria-label={`Actions for ${customerName(customer)}`}>•••</summary><div><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customer.id)}`}>Customer 360</Link><Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(customer.id)}/manage`}>Profile & security</Link>{canManage && customer.status === "active" && <AdminActionButton label="Restrict" endpoint="/api/admin/customers/status" csrfToken={data.csrfToken} body={{ customerId: customer.id, status: "restricted" }} reasonPrompt="Reason for restricting this customer account; existing sessions will be revoked" danger />}{canManage && customer.status === "pending_verification" && !customer.emailVerified && <AdminActionButton label="Resend verification" endpoint="/api/admin/customers/action" csrfToken={data.csrfToken} body={{ customerId: customer.id, action: "resend_verification" }} reasonPrompt="Reason for resending customer email verification" />}{canManage && customer.emailVerified && ["pending_verification", "restricted", "suspended"].includes(customer.status) && <AdminActionButton label="Set active" endpoint="/api/admin/customers/status" csrfToken={data.csrfToken} body={{ customerId: customer.id, status: "active" }} reasonPrompt="Reason for activating this verified customer account" />}</div></details></div>;
      })}</div>}
    </section>
  </main>;
}
