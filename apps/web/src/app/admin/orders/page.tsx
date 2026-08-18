import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrdersReturnsWorkspace(principal); } catch { redirect("/admin"); }

  const openOrders = data.orders.filter((order) => !["cancelled", "completed", "fulfilled", "refunded"].includes(order.status)).length;
  const activeReturns = data.returns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status)).length;
  const refundReady = data.returns.filter((item) => item.status === "remedy_approved" && item.approvedRemedy === "refund").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Customer operations</div><h1>Orders & returns</h1><p className="lead">Παρακολούθησε εξαιρέσεις και επόμενες ενέργειες χωρίς να χάνεται η μία ενιαία customer order.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Orders", value: data.orders.length },
      { label: "Open", value: openOrders, tone: openOrders ? "attention" : "default" },
      { label: "Return cases", value: data.returns.length },
      { label: "Refund ready", value: refundReady, tone: refundReady ? "attention" : activeReturns ? "default" : "positive", hint: activeReturns ? `${activeReturns} active return workflows` : "no active return work" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Orders" title="Παραγγελίες" note="Οι vendor fulfilments παραμένουν ιδιωτικά scoped, ενώ εδώ βλέπεις την customer-level εικόνα." />
      {data.orders.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη παραγγελίες." /> : <div className="workspace-queue-list">{data.orders.map((order) => <article className="workspace-queue-card" key={order.id}>
        <div className="workspace-queue-head"><div><strong>{order.id}</strong><small>{order.fulfilmentMode} · {order.customerId ?? "guest"}</small></div><span className="status-pill">{order.status}</span></div>
        <div className="workspace-queue-primary"><span>{order.lines.length} lines</span><span>{order.total}</span><span>{order.returns.length} return cases</span></div>
        <WorkspaceRecordDetails label="Γραμμές παραγγελίας & vendor assignments">
          <div className="workspace-compact-list">{order.lines.map((line) => <div className="workspace-compact-row" key={line.id}><strong>{line.quantity}× {line.title}</strong><span>{line.vendorId}</span><small>{line.status}</small></div>)}</div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Order status: <strong>{order.status}</strong></span><div className="workspace-action-buttons">{!["cancelled", "completed", "fulfilled", "refunded"].includes(order.status) && <AdminActionButton label="Cancel order" endpoint="/api/admin/orders/action" csrfToken={data.csrfToken} body={{ orderId: order.id, action: "cancel" }} reasonPrompt="Platform cancellation reason" danger />}</div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="After-sales" title="Return cases" note="Εμφανίζονται μόνο οι ενέργειες που είναι νόμιμες για το τρέχον στάδιο του return workflow." />
      {data.returns.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν return cases." /> : <div className="workspace-queue-list">{data.returns.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>{item.id}</strong><small>Order {item.orderId} · {item.vendorId}</small></div><span className="status-pill">{item.status}</span></div>
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
    </div></section>
  </main>;
}
