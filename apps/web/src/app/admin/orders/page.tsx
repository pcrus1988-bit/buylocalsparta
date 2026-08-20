import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../lib/public-reference-service";

const terminalOrderStatuses = new Set(["cancelled", "completed", "fulfilled", "refunded"]);

export default async function Page({ searchParams }: { searchParams: Promise<{ customer?: string; order?: string; q?: string; status?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrdersReturnsWorkspace(principal); } catch { redirect("/admin"); }
  const params = await searchParams;
  const customerFilter = params.customer?.trim();
  const orderFilter = params.order?.trim();
  const query = params.q?.trim().toLocaleLowerCase("el-GR");
  const statusFilter = params.status?.trim();
  const [orderReferences, returnReferences] = await Promise.all([
    marketplaceReferenceMap("order", [...data.orders.map((order) => order.id), ...data.returns.map((item) => item.orderId)]),
    marketplaceReferenceMap("return", data.returns.map((item) => item.id))
  ]);
  const matchesQuery = (order: (typeof data.orders)[number]) => !query || [order.id, orderReferences.get(order.id), order.customerId, order.status, order.fulfilmentMode, ...order.lines.flatMap((line) => [line.title, line.vendorId])].some((value) => String(value ?? "").toLocaleLowerCase("el-GR").includes(query));
  const orders = data.orders
    .filter((order) => (!customerFilter || order.customerId === customerFilter) && (!orderFilter || order.id === orderFilter || orderReferences.get(order.id) === orderFilter) && (!statusFilter || order.status === statusFilter) && matchesQuery(order))
    .sort((a, b) => Number(terminalOrderStatuses.has(a.status)) - Number(terminalOrderStatuses.has(b.status)));
  const orderIds = new Set(orders.map((order) => order.id));
  const returns = data.returns.filter((item) => (!customerFilter && !orderFilter && !query && !statusFilter) || orderIds.has(item.orderId));
  const filtered = Boolean(customerFilter || orderFilter || query || statusFilter);
  const statuses = [...new Set(data.orders.map((order) => order.status))].sort();
  const openOrders = orders.filter((order) => !terminalOrderStatuses.has(order.status)).length;
  const activeReturns = returns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status)).length;
  const refundReady = returns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Operations · orders</div><h1>Παραγγελίες</h1><p className="lead">Directory-first εικόνα για τις παραγγελίες. Returns και refunds παραμένουν ξεχωριστή exception queue με governed actions.</p></div></section>
    <WorkspaceMetricStrip items={[
      { label: filtered ? "Matching orders" : "Orders", value: orders.length },
      { label: "Open", value: openOrders, tone: openOrders ? "attention" : "default" },
      { label: "Return cases", value: returns.length },
      { label: "Refund ready", value: refundReady, tone: refundReady ? "attention" : activeReturns ? "default" : "positive", hint: activeReturns ? `${activeReturns} active return workflows` : "no active return work" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Directory" title="Order directory" note="Αναζήτηση με public order number, customer, vendor, item ή status. Οι ενεργές παραγγελίες εμφανίζονται πριν από το ολοκληρωμένο ιστορικό." />
      <form method="get" className="admin-directory-filters admin-order-filters"><label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="ORD-…, customer, item, vendor" /></label><label><span>Status</span><select name="status" defaultValue={statusFilter ?? ""}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><div><button className="button button-secondary" type="submit">Filter</button>{filtered && <Link className="text-link" href="/admin/orders">Clear</Link>}</div></form>
      {orders.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν βρέθηκαν παραγγελίες με αυτά τα φίλτρα." : "Δεν υπάρχουν ακόμη παραγγελίες."} /> : <div className="admin-directory-table admin-orders-directory" role="table" aria-label="Orders"><div className="admin-directory-head" role="row"><span>Order</span><span>Customer</span><span>Status</span><span>Items</span><span>Total</span><span>Returns</span><span aria-label="Actions" /></div>{orders.map((order) => <div className="admin-directory-row" role="row" key={order.id}><span className="admin-directory-identity"><strong>{orderReferences.get(order.id) ?? order.id}</strong><small>{order.fulfilmentMode} · internal {order.id}</small></span><span>{order.customerId ? <Link className="text-link" href={`/admin/customers/${encodeURIComponent(order.customerId)}`}>{order.customerId}</Link> : "guest"}</span><span><span className="status-pill">{order.status}</span></span><span><strong>{order.lines.length}</strong><small>{order.lines.slice(0, 2).map((line) => line.title).join(" · ")}{order.lines.length > 2 ? "…" : ""}</small></span><span><strong>{order.total}</strong></span><span><strong>{order.returns.length}</strong></span><details className="admin-row-actions"><summary aria-label={`Actions for ${orderReferences.get(order.id) ?? order.id}`}>•••</summary><div>{order.customerId && <Link className="button button-secondary" href={`/admin/customers/${encodeURIComponent(order.customerId)}`}>Customer 360</Link>}{!terminalOrderStatuses.has(order.status) && <AdminActionButton label="Cancel order" endpoint="/api/admin/orders/action" csrfToken={data.csrfToken} body={{ orderId: order.id, action: "cancel" }} reasonPrompt="Platform cancellation reason" danger />}</div></details></div>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell"><WorkspaceSectionHeading eyebrow="Exceptions" title="Returns & refunds" note="Cards χρησιμοποιούνται εδώ επειδή κάθε case έχει staged decisions, evidence και επιτρεπόμενες actions ανά status." />{returns.length === 0 ? <WorkspaceEmptyState title={filtered ? "Δεν υπάρχουν return cases για τις επιλεγμένες παραγγελίες." : "Δεν υπάρχουν return cases."} /> : <div className="workspace-queue-list">{returns.map((item) => <article className="workspace-queue-card" key={item.id}><div className="workspace-queue-head"><div><strong>{returnReferences.get(item.id) ?? item.id}</strong><small>Order {orderReferences.get(item.orderId) ?? item.orderId} · {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div><div className="workspace-queue-primary"><span>{item.quantity} unit(s)</span><span>{item.requestedRemedy}</span><span>{item.eligibility.state}</span></div><WorkspaceRecordDetails label="Αιτία & workflow στοιχεία"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Reason</strong><span>{item.reason}</span></div><div className="workspace-compact-row"><strong>Requested remedy</strong><span>{item.requestedRemedy}</span><small>{item.eligibility.state}</small></div></div></WorkspaceRecordDetails><div className="workspace-action-bar"><span>Τρέχον στάδιο: <strong>{item.status}</strong></span><div className="workspace-action-buttons">{item.status === "requested" && <AdminActionButton label="Approve" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve" }} />}{["approved", "inspection_required"].includes(item.status) && !item.authorization && <AdminActionButton label="Issue RMA" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "authorize" }} />}{["approved", "inspection_required", "in_transit"].includes(item.status) && <AdminActionButton label="Receive" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "receive" }} />}{item.status === "received" && <><AdminActionButton label="Inspect sellable" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_sellable" }} /><AdminActionButton label="Inspect blocked" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_blocked" }} /></>}{item.status === "inspected" && <AdminActionButton label="Approve refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve_refund" }} />}{item.status === "remedy_approved" && item.approvedRemedy === "refund" && <AdminActionButton label="Execute refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "refund" }} danger />}{["requested", "inspected"].includes(item.status) && <AdminActionButton label="Reject" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "reject" }} reasonPrompt="Rejection reason" danger />}</div></div></article>)}</div>}</div></section>
  </main>;
}
