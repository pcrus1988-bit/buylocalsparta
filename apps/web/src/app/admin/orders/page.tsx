import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceFilterBar, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

type PageSearchParams = Promise<{ q?: string | string[]; status?: string | string[]; view?: string | string[] }>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const terminalOrder = new Set(["cancelled", "completed", "fulfilled", "refunded"]);
const terminalReturn = new Set(["rejected", "refunded", "closed"]);

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrdersReturnsWorkspace(principal); } catch { redirect("/admin"); }

  const params = await searchParams;
  const query = one(params.q).trim();
  const status = one(params.status) || "all";
  const view = one(params.view) || "all";
  const needle = query.toLocaleLowerCase("el");
  const openOrders = data.orders.filter((order) => !terminalOrder.has(order.status)).length;
  const activeReturns = data.returns.filter((item) => !terminalReturn.has(item.status)).length;
  const refundReady = data.returns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund").length;
  const statuses = [...new Set([...data.orders.map((item) => item.status), ...data.returns.map((item) => item.status)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "el"));

  const filteredOrders = data.orders
    .filter((order) => {
      if (view === "returns") return false;
      if (status !== "all" && order.status !== status) return false;
      if (!needle) return true;
      return [order.id, order.status, order.fulfilmentMode, order.customerId, ...order.lines.flatMap((line) => [line.id, line.title, line.vendorId, line.status])]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => Number(terminalOrder.has(a.status)) - Number(terminalOrder.has(b.status)) || a.id.localeCompare(b.id));

  const filteredReturns = data.returns
    .filter((item) => {
      if (view === "orders") return false;
      if (status !== "all" && item.status !== status) return false;
      if (!needle) return true;
      return [item.id, item.orderId, item.vendorId, item.status, item.reason, item.requestedRemedy, item.eligibility.state]
        .filter(Boolean).join(" ").toLocaleLowerCase("el").includes(needle);
    })
    .sort((a, b) => Number(terminalReturn.has(a.status)) - Number(terminalReturn.has(b.status)) || Number(b.status === "remedy_approved") - Number(a.status === "remedy_approved") || a.id.localeCompare(b.id));

  const visibleCount = filteredOrders.length + filteredReturns.length;
  const sourceCount = (view === "orders" ? data.orders.length : view === "returns" ? data.returns.length : data.orders.length + data.returns.length);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Customer operations</div><h1>Orders & returns</h1><p className="lead">Δες πρώτα ανοιχτές εξαιρέσεις και return cases που χρειάζονται απόφαση.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Orders", value: data.orders.length },
      { label: "Open", value: openOrders, tone: openOrders ? "attention" : "default" },
      { label: "Return cases", value: data.returns.length },
      { label: "Refund ready", value: refundReady, tone: refundReady ? "attention" : activeReturns ? "default" : "positive", hint: activeReturns ? `${activeReturns} active return workflows` : "no active return work" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Operations queue" title="Παραγγελίες & after-sales" note="Φίλτραρε ανά workflow και κατάσταση. Τα ανοιχτά records εμφανίζονται πριν από τα ολοκληρωμένα." />
      <WorkspaceFilterBar
        action="/admin/orders"
        query={query}
        queryPlaceholder="Order ID, πελάτης, vendor, προϊόν, reason…"
        filters={[
          { name: "view", label: "Workflow", value: view, options: [{ value: "all", label: "Orders & returns" }, { value: "orders", label: "Μόνο orders" }, { value: "returns", label: "Μόνο returns" }] },
          { name: "status", label: "Κατάσταση", value: status, options: [{ value: "all", label: "Όλες" }, ...statuses.map((value) => ({ value, label: value.replaceAll("_", " ") }))] }
        ]}
        resultLabel={`${visibleCount} από ${sourceCount} records`}
        resetHref="/admin/orders"
      />

      {view !== "returns" && <div className="workspace-queue-subsection">
        <WorkspaceSectionHeading eyebrow="Orders" title="Παραγγελίες" note={`${filteredOrders.length} εμφανίζονται`} />
        {data.orders.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη παραγγελίες." /> : filteredOrders.length === 0 ? <WorkspaceEmptyState eyebrow="Χωρίς αποτελέσματα" title="Δεν υπάρχουν orders με αυτά τα φίλτρα." /> : <div className="workspace-queue-list">{filteredOrders.map((order) => <article className="workspace-queue-card" key={order.id}>
          <div className="workspace-queue-head"><div><strong>{order.id}</strong><small>{order.fulfilmentMode} · {order.customerId ?? "guest"}</small></div><WorkspaceStatusBadge status={order.status} /></div>
          <div className="workspace-queue-primary"><span>{order.lines.length} lines</span><span>{order.total}</span><span>{order.returns.length} return cases</span></div>
          <WorkspaceRecordDetails label="Γραμμές παραγγελίας & vendor assignments">
            <div className="workspace-compact-list">{order.lines.map((line) => <div className="workspace-compact-row" key={line.id}><strong>{line.quantity}× {line.title}</strong><span>{line.vendorId}</span><small>{line.status}</small></div>)}</div>
          </WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Order status: <strong>{order.status}</strong></span><div className="workspace-action-buttons">{!terminalOrder.has(order.status) && <AdminActionButton label="Cancel order" endpoint="/api/admin/orders/action" csrfToken={data.csrfToken} body={{ orderId: order.id, action: "cancel" }} reasonPrompt="Platform cancellation reason" danger />}</div></div>
        </article>)}</div>}
      </div>}

      {view !== "orders" && <div className="workspace-queue-subsection">
        <WorkspaceSectionHeading eyebrow="After-sales" title="Return cases" note={`${filteredReturns.length} εμφανίζονται`} />
        {data.returns.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν return cases." /> : filteredReturns.length === 0 ? <WorkspaceEmptyState eyebrow="Χωρίς αποτελέσματα" title="Δεν υπάρχουν return cases με αυτά τα φίλτρα." /> : <div className="workspace-queue-list">{filteredReturns.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {item.orderId} · {item.vendorId}</small></div><WorkspaceStatusBadge status={item.status} /></div>
          <div className="workspace-queue-primary"><span>{item.quantity} unit(s)</span><span>{item.requestedRemedy}</span><span>{item.eligibility.state}</span></div>
          <WorkspaceRecordDetails label="Αιτία & workflow στοιχεία"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Reason</strong><span>{item.reason}</span></div><div className="workspace-compact-row"><strong>Requested remedy</strong><span>{item.requestedRemedy}</span><small>{item.eligibility.state}</small></div></div></WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Τρέχον στάδιο: <strong>{item.status}</strong></span><div className="workspace-action-buttons">
            {item.status === "requested" && <AdminActionButton label="Approve" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve" }} />}
            {["approved", "inspection_required"].includes(item.status) && !item.authorization && <AdminActionButton label="Issue RMA" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "authorize" }} />}
            {["approved", "inspection_required", "in_transit"].includes(item.status) && <AdminActionButton label="Receive" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "receive" }} />}
            {item.status === "received" && <><AdminActionButton label="Inspect sellable" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_sellable" }} /><AdminActionButton label="Inspect blocked" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "inspect_blocked" }} /></>}
            {item.status === "inspected" && <AdminActionButton label="Approve refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "approve_refund" }} />}
            {item.status === "remedy_approved" && item.approvedRemedy === "refund" && <AdminActionButton label="Execute refund" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "refund" }} danger />}
            {["requested", "inspected"].includes(item.status) && <AdminActionButton label="Reject" endpoint="/api/admin/returns/action" csrfToken={data.csrfToken} body={{ returnId: item.id, action: "reject" }} reasonPrompt="Rejection reason" danger />}
          </div></div>
        </article>)}</div>}
      </div>}
    </section>
  </main>;
}
