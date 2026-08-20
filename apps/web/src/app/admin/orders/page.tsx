import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminStatusStack, type AdminRecordStateTone, type AdminAttentionSeverity } from "../../../components/AdminRecordStatus";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../lib/public-reference-service";

const terminalOrderStatuses = new Set(["cancelled", "completed", "fulfilled", "refunded"]);
const ORDER_VIEWS = ["all", "open", "returns", "completed"] as const;
type OrderView = (typeof ORDER_VIEWS)[number];

function orderView(value?: string): OrderView {
  return ORDER_VIEWS.includes(value as OrderView) ? value as OrderView : "all";
}
function orderStateTone(status: string): AdminRecordStateTone {
  if (["fulfilled", "completed"].includes(status)) return "positive";
  if (["partially_fulfilled", "partially_refunded"].includes(status)) return "caution";
  return "neutral";
}
function orderAttention(order: { returns: ReadonlyArray<unknown> }): { label: string; severity: AdminAttentionSeverity } | undefined {
  return order.returns.length ? { label: `${order.returns.length} return ${order.returns.length === 1 ? "case" : "cases"}`, severity: "attention" } : undefined;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string; order?: string; q?: string; status?: string; view?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrdersReturnsWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const customerFilter = params.customer?.trim();
  const orderFilter = params.order?.trim();
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const statusFilter = params.status?.trim();
  const view = orderView(params.view);
  const [orderReferences, returnReferences] = await Promise.all([
    marketplaceReferenceMap("order", [...data.orders.map((order) => order.id), ...data.returns.map((item) => item.orderId)]),
    marketplaceReferenceMap("return", data.returns.map((item) => item.id))
  ]);
  const matchesQuery = (order: (typeof data.orders)[number]) => !query || [order.id, orderReferences.get(order.id), order.customerId, order.status, order.fulfilmentMode, ...order.lines.flatMap((line) => [line.title, line.vendorId])].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query));
  const matchesView = (order: (typeof data.orders)[number]) => view === "all"
    || (view === "open" && !terminalOrderStatuses.has(order.status))
    || (view === "returns" && order.returns.length > 0)
    || (view === "completed" && terminalOrderStatuses.has(order.status));
  const orders = data.orders
    .filter((order) => matchesView(order) && (!customerFilter || order.customerId === customerFilter) && (!orderFilter || order.id === orderFilter || orderReferences.get(order.id) === orderFilter) && (!statusFilter || order.status === statusFilter) && matchesQuery(order))
    .sort((a, b) => Number(terminalOrderStatuses.has(a.status)) - Number(terminalOrderStatuses.has(b.status)));
  const orderIds = new Set(orders.map((order) => order.id));
  const hasAdHocFilters = Boolean(customerFilter || orderFilter || query || statusFilter);
  const filtered = hasAdHocFilters || view !== "all";
  const returns = data.returns.filter((item) => !filtered || orderIds.has(item.orderId));
  const statuses = [...new Set(data.orders.map((order) => order.status))].sort();
  const openOrders = orders.filter((order) => !terminalOrderStatuses.has(order.status)).length;
  const activeReturns = returns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status)).length;
  const refundReady = returns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund").length;
  const clearHref = view === "all" ? "/admin/orders" : `/admin/orders?view=${encodeURIComponent(view)}`;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Operations · orders</div><h1>Παραγγελίες</h1><p className="lead">Directory-first εικόνα για τις παραγγελίες. Saved operational views μειώνουν το επαναλαμβανόμενο filtering, ενώ κάθε public order number ανοίγει το ενιαίο order record.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: filtered ? "Matching orders" : "Orders", value: orders.length },
      { label: "Open", value: openOrders, tone: openOrders ? "attention" : "default" },
      { label: "Return cases", value: returns.length },
      { label: "Refund ready", value: refundReady, tone: refundReady ? "attention" : activeReturns ? "default" : "positive", hint: activeReturns ? `${activeReturns} active return workflows` : "no active return work" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Order directory" note="State δείχνει πού βρίσκεται η παραγγελία στον lifecycle. Attention εμφανίζεται ξεχωριστά μόνο όταν υπάρχει operator exception, όπως ενεργό return case." />
      <nav className="admin-local-tabs" aria-label="Order saved views">
        <Link href="/admin/orders" aria-current={view === "all" ? "page" : undefined}>All</Link>
        <Link href="/admin/orders?view=open" aria-current={view === "open" ? "page" : undefined}>Open</Link>
        <Link href="/admin/orders?view=returns" aria-current={view === "returns" ? "page" : undefined}>With returns</Link>
        <Link href="/admin/orders?view=completed" aria-current={view === "completed" ? "page" : undefined}>Completed</Link>
      </nav>
      <form method="get" className="admin-directory-filters admin-order-filters">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="ORD-…, customer, item, vendor" /></label>
        <label><span>Status</span><select name="status" defaultValue={statusFilter ?? ""}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{hasAdHocFilters && <Link className="text-link" href={clearHref}>Clear filters</Link>}</div>
      </form>
      {orders.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν παραγγελίες σε αυτό το view / φίλτρο." : "Δεν υπάρχουν ακόμη παραγγελίες."} /> : <div className="admin-directory-table admin-orders-directory" role="table" aria-label="Orders">
        <div className="admin-directory-head" role="row"><span>Order</span><span>Customer</span><span>State / attention</span><span>Items</span><span>Total</span><span>Returns</span><span aria-label="Actions" /></div>
        {orders.map((order) => {
          const reference = orderReferences.get(order.id) ?? order.id;
          const recordHref = `/admin/orders/${encodeURIComponent(reference)}`;
          const attention = orderAttention(order);
          return <div className="admin-directory-row" role="row" key={order.id}>
            <Link className="admin-directory-identity" href={recordHref}><strong>{reference}</strong><small>{order.fulfilmentMode} · internal {order.id}</small></Link>
            <span>{order.customerId ? <Link className="text-link" href={`/admin/customers/${encodeURIComponent(order.customerId)}`}>{order.customerId}</Link> : "guest"}</span>
            <span><AdminStatusStack state={order.status} stateTone={orderStateTone(order.status)} attention={attention?.label} attentionSeverity={attention?.severity} /></span>
            <span><strong>{order.lines.length}</strong><small>{order.lines.slice(0, 2).map((line) => line.title).join(" · ")}{order.lines.length > 2 ? "…" : ""}</small></span>
            <span><strong>{order.total}</strong></span>
            <span><strong>{order.returns.length}</strong></span>
            <details className="admin-row-actions"><summary aria-label={`Actions for ${reference}`}>•••</summary><div><Link className="button button-secondary" href={recordHref}>Open order</Link>{order.customerId && <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(order.customerId)}`}>Customer 360</Link>}</div></details>
          </div>;
        })}
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Exceptions" title="Returns & refunds" note="Cards χρησιμοποιούνται εδώ επειδή κάθε case έχει staged decisions, evidence και επιτρεπόμενες actions ανά status." />
      {returns.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν υπάρχουν return cases για τις επιλεγμένες παραγγελίες." : "Δεν υπάρχουν return cases."} /> : <div className="workspace-queue-list">{returns.map((item) => {
        const orderReference = orderReferences.get(item.orderId) ?? item.orderId;
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong>{returnReferences.get(item.id) ?? item.id}</strong><small>Order <Link className="text-link" href={`/admin/orders/${encodeURIComponent(orderReference)}`}>{orderReference}</Link> · {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div>
          <div className="workspace-queue-primary"><span>{item.quantity} unit(s)</span><span>{item.requestedRemedy}</span><span>{item.eligibility.state}</span></div>
          <WorkspaceRecordDetails label="Αιτία & workflow στοιχεία"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Reason</strong><span>{item.reason}</span></div><div className="workspace-compact-row"><strong>Requested remedy</strong><span>{item.requestedRemedy}</span><small>{item.eligibility.state}</small></div></div></WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Τρέχον στάδιο: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "requested" && <AdminActionButton label="Approve" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve" }} />}{["approved", "inspection_required"].includes(item.status) && !item.authorization && <AdminActionButton label="Issue RMA" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "authorize" }} />}{["approved", "inspection_required", "in_transit"].includes(item.status) && <AdminActionButton label="Receive" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "receive" }} />}{item.status === "received" && <><AdminActionButton label="Inspect sellable" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_sellable" }} /><AdminActionButton label="Inspect blocked" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_blocked" }} /></>}{item.status === "inspected" && <AdminActionButton label="Approve refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve_refund" }} />}{item.status === "remedy_approved" && item.approvedRemedy === "refund" && <AdminActionButton label="Execute refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "refund" }} danger />}{["requested", "inspected"].includes(item.status) && <AdminActionButton label="Reject" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "reject" }} reasonPrompt="Rejection reason" danger />}</div></div>
        </article>;
      })}</div>}
    </div></section>
  </main>;
}
