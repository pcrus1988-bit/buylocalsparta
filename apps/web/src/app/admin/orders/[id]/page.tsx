import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminActionButton } from "../../../../components/AdminActionButton";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminOrdersReturnsWorkspace } from "../../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { marketplaceReferenceMap } from "../../../../lib/public-reference-service";

export const metadata: Metadata = { title: "Admin · Order record", robots: { index: false, follow: false } };

type Props = Readonly<{ params: Promise<{ id: string }> }>;
const terminalOrderStatuses = new Set(["cancelled", "completed", "fulfilled", "refunded"]);
const physicalHandoverStatuses = new Set(["handed_over", "shipped", "delivered"]);

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "medium", timeZone: "Europe/Athens" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_payment: "Αναμονή πληρωμής",
    confirmed: "Επιβεβαιωμένη",
    requires_customer_action: "Χρειάζεται ενέργεια πελάτη",
    partially_fulfilled: "Μερικώς ολοκληρωμένη",
    fulfilled: "Ολοκληρωμένη",
    completed: "Ολοκληρωμένη",
    cancelled: "Ακυρωμένη",
    refunded: "Refunded",
    partially_refunded: "Μερικό refund"
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

export default async function Page({ params }: Props) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminOrdersReturnsWorkspace(principal); } catch { redirect("/admin"); }
  const { id } = await params;
  const requestedId = id.trim();
  const orderReferences = await marketplaceReferenceMap("order", data.orders.map((order) => order.id));
  const order = data.orders.find((item) => item.id === requestedId || orderReferences.get(item.id)?.toLocaleUpperCase("el-GR") === requestedId.toLocaleUpperCase("el-GR"));
  if (!order) notFound();

  const reference = orderReferences.get(order.id) ?? order.id;
  const orderReturns = data.returns.filter((item) => item.orderId === order.id);
  const returnReferences = await marketplaceReferenceMap("return", orderReturns.map((item) => item.id));
  const physicalHandoverStarted = order.fulfilments.some((item) => physicalHandoverStatuses.has(item.status));
  const hasFulfilledQuantity = order.lines.some((line) => line.fulfilledQuantity > line.refundedQuantity || line.status === "fulfilled");
  const canCancel = !terminalOrderStatuses.has(order.status) && !physicalHandoverStarted && !hasFulfilledQuantity;
  const partnerIds = [...new Set([...order.lines.map((line) => line.vendorId), ...order.fulfilments.map((item) => item.vendorId)])];
  const openReturns = orderReturns.filter((item) => !["rejected", "refunded", "closed"].includes(item.status)).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero dashboard-hero-refined admin-order-record-hero">
      <div>
        <Link className="text-link" href="/admin/orders">← Order directory</Link>
        <div className="eyebrow">Operations · order record</div>
        <h1>{reference}</h1>
        <p className="lead">{statusLabel(order.status)} · {order.fulfilmentMode} · τοποθετήθηκε {formatDateTime(order.createdAt)}. Το δημόσιο order number είναι η κύρια ταυτότητα για operator, customer και partner επικοινωνία.</p>
        <div className="admin-order-record-meta"><span className="status-pill">{order.status}</span><span>Technical ID <code>{order.id}</code></span></div>
      </div>
      <aside className="admin-order-primary-action">
        <span>Τρέχουσα κατάσταση</span>
        <strong>{statusLabel(order.status)}</strong>
        <p>{openReturns ? `${openReturns} ενεργό return workflow` : physicalHandoverStarted ? "Η φυσική παράδοση/παραλαβή έχει ξεκινήσει." : "Δεν υπάρχει ενεργό return exception."}</p>
        {canCancel ? <AdminActionButton label="Cancel order" endpoint="/api/admin/orders/action" csrfToken={data.csrfToken} body={{ orderId: order.id, action: "cancel" }} reasonPrompt="Platform cancellation reason" danger /> : <small>Η ακύρωση δεν είναι διαθέσιμη σε αυτό το στάδιο. Χρησιμοποίησε return/refund workflow όπου απαιτείται.</small>}
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Status", value: statusLabel(order.status), tone: terminalOrderStatuses.has(order.status) ? "default" : "attention" },
      { label: "Total", value: order.total },
      { label: "Items", value: order.lines.reduce((sum, line) => sum + line.quantity, 0), hint: `${order.lines.length} order lines` },
      { label: "Returns", value: orderReturns.length, tone: openReturns ? "attention" : "default", hint: openReturns ? `${openReturns} active` : "no active exceptions" }
    ]} />

    <section className="shell vendor-section admin-order-record-grid">
      <article className="admin-order-record-card">
        <WorkspaceSectionHeading eyebrow="Order" title="Βασικά στοιχεία" note="Customer-facing identity first; technical identifiers remain secondary." />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Order number</strong><span>{reference}</span></div>
          <div className="workspace-compact-row"><strong>Placed</strong><span>{formatDateTime(order.createdAt)}</span></div>
          <div className="workspace-compact-row"><strong>Fulfilment</strong><span>{order.fulfilmentMode}</span></div>
          <div className="workspace-compact-row"><strong>Customer</strong><span>{order.customerId ? <Link className="text-link" href={`/admin/customers/${encodeURIComponent(order.customerId)}`}>Open Customer 360 →</Link> : "Guest checkout"}</span></div>
        </div>
        <WorkspaceRecordDetails label="Internal metadata"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Internal order ID</strong><code>{order.id}</code></div><div className="workspace-compact-row"><strong>Source status</strong><code>{order.status}</code></div></div></WorkspaceRecordDetails>
      </article>

      <article className="admin-order-record-card">
        <WorkspaceSectionHeading eyebrow="Partners" title="Fulfilment ownership" note="Από εδώ ανοίγει το ενιαίο Partner record· δεν αντιγράφονται partner controls μέσα στην παραγγελία." />
        <div className="workspace-compact-list">{partnerIds.map((partnerId) => <div className="workspace-compact-row" key={partnerId}><strong>{partnerId}</strong><span><Link className="text-link" href={`/admin/partners/${encodeURIComponent(partnerId)}`}>Open Partner record →</Link></span></div>)}</div>
      </article>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Items" title="Order lines" note="Quantity, fulfilment and refund progress ανά προϊόν και συνεργάτη." />
      {order.lines.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν order lines." /> : <div className="admin-order-line-table" role="table" aria-label={`Order lines for ${reference}`}>
        <div className="admin-order-line-head" role="row"><span>Item</span><span>Partner</span><span>Quantity</span><span>Progress</span><span>Status</span></div>
        {order.lines.map((line) => <div className="admin-order-line-row" role="row" key={line.id}>
          <div><strong>{line.title}</strong><small>line <code>{line.id}</code></small></div>
          <Link className="text-link" href={`/admin/partners/${encodeURIComponent(line.vendorId)}`}>{line.vendorId}</Link>
          <span>{line.quantity}</span>
          <span><strong>{line.fulfilledQuantity} fulfilled</strong><small>{line.refundedQuantity} refunded</small></span>
          <span className="status-pill">{line.status}</span>
        </div>)}
      </div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Fulfilment" title="Partner fulfilments" note="Operational fulfilment IDs are secondary; partner and status are the primary operator cues." />
      {order.fulfilments.length === 0 ? <WorkspaceEmptyState title="Δεν έχουν δημιουργηθεί fulfilments." /> : <div className="admin-order-fulfilment-grid">{order.fulfilments.map((item) => <article className="admin-order-fulfilment-card" key={item.id}><div><Link className="text-link" href={`/admin/partners/${encodeURIComponent(item.vendorId)}`}>{item.vendorId}</Link><span className="status-pill">{item.status}</span></div><strong>{item.lineIds.length} line(s)</strong><WorkspaceRecordDetails label="Internal fulfilment metadata"><code>{item.id}</code></WorkspaceRecordDetails></article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Exceptions" title="Returns & refunds" note="Το record δείχνει το context. Οι staged decisions παραμένουν στην governed exception queue ώστε να υπάρχει ένα μόνο action surface." action={orderReturns.length ? <Link className="button button-secondary" href={`/admin/orders?view=returns&order=${encodeURIComponent(order.id)}`}>Open return workflow</Link> : undefined} />
      {orderReturns.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει return case για αυτή την παραγγελία." /> : <div className="admin-order-return-grid">{orderReturns.map((item) => <article className="admin-order-return-card" key={item.id}><div><strong>{returnReferences.get(item.id) ?? item.id}</strong><span className="status-pill">{item.status}</span></div><p>{item.quantity} unit(s) · {item.reason} · {item.requestedRemedy ?? "no remedy selected"}</p><small>{item.eligibility.state}{item.approvedRemedy ? ` · approved ${item.approvedRemedy}` : ""}</small></article>)}</div>}
    </div></section>
  </main>;
}
