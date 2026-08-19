import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminAskLocalRouteForm } from "../../../components/AdminAskLocalRouteForm";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminAskLocalWorkspace } from "../../../lib/ask-local-service";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Ask Local", robots: { index: false, follow: false } };

const when = (value?: number) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default async function AdminAskLocalPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminAskLocalWorkspace(principal);
  const adminOwned = data.requests.filter((request) => request.routingOwner === "admin").length;
  const vendorOwned = data.requests.filter((request) => request.routingOwner === "vendor").length;
  const withoutCategory = data.requests.filter((request) => request.routingOwner === "admin" && !request.category).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Lossless customer routing</div><h1>Ask Local · Κέντρο διανομής</h1><p className="lead">Κάθε ανοικτό αίτημα ανήκει πάντα είτε στην πλατφόρμα είτε σε έναν ενεργό vendor. Ελεύθερες αναζητήσεις και fallback περιπτώσεις μένουν εδώ μέχρι να γίνει ασφαλής ανάθεση.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Admin queue", value: adminOwned, tone: adminOwned ? "attention" : "default", hint: "απαιτούν platform απόφαση" },
      { label: "Σε vendors", value: vendorOwned, tone: vendorOwned ? "positive" : "default" },
      { label: "Θέλουν ταξινόμηση", value: withoutCategory, tone: withoutCategory ? "attention" : "default" },
      { label: "Ενεργοί advisers", value: data.vendors.length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Admin-owned queue" title="Αιτήματα που χρειάζονται διανομή" note="Τα search queries μπαίνουν εδώ πρώτα. Αν vendor επιστρέψει αίτημα ή λήξει το SLA του, το αίτημα επιστρέφει αυτόματα εδώ αντί να χάνεται." />
      {adminOwned === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν αιτήματα στην ουρά Admin." body="Όλα τα ανοικτά Ask Local αιτήματα έχουν αυτή τη στιγμή υπεύθυνο vendor." /> : <div className="workspace-queue-list">
        {data.requests.filter((request) => request.routingOwner === "admin").map((request) => <article className="workspace-queue-card" key={request.id}>
          <div className="workspace-queue-head"><div><strong>{request.need}</strong><small>{request.id} · {when(request.createdAt)} · ΤΚ {request.postcode}</small></div><span className="status-pill">Admin · {request.status}</span></div>
          <div className="workspace-queue-primary"><span>{request.entryMode}</span><span>{request.category ?? "Χωρίς κατηγορία"}</span><span>{request.quantity} τεμ.</span></div>
          <WorkspaceRecordDetails label="Routing context & safety state">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Routing reason</strong><span>{request.routingReason ?? "admin_review_required"}</span></div>
              {request.canonicalVariantId && <div className="workspace-compact-row"><strong>Product</strong><span>{request.canonicalVariantId}</span></div>}
              <div className="workspace-compact-row"><strong>Eligible now</strong><span>{request.eligibleVendors.length} system-matched active advisers</span></div>
            </div>
          </WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Ταξινόμησε την κατηγορία και επίλεξε μόνο ενεργό κατάλληλο vendor.</span><AdminAskLocalRouteForm requestId={request.id} csrfToken={data.csrfToken} vendors={data.vendors} initialCategory={request.category} /></div>
        </article>)}
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Vendor-owned" title="Αιτήματα που έχουν ανατεθεί" note="Παραμένουν ορατά στο Admin μέχρι ολοκλήρωση. Το response deadline λειτουργεί ως safety net και επιστρέφει ληγμένες αναθέσεις στην Admin queue." />
      {vendorOwned === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργές αναθέσεις σε vendors." /> : <div className="workspace-queue-list">
        {data.requests.filter((request) => request.routingOwner === "vendor").map((request) => <article className="workspace-queue-card" key={request.id}>
          <div className="workspace-queue-head"><div><strong>{request.need}</strong><small>{request.id} · {request.category ?? "γενικό"}</small></div><span className="status-pill">{request.status}</span></div>
          <div className="workspace-queue-primary"><span>{request.assignedAdviser ?? "Vendor adviser"}</span><span>{request.assignedVendorName ?? request.assignedVendorId}</span><span>Απάντηση έως {when(request.responseDueAt)}</span></div>
          <div className="workspace-action-bar"><span>Χρειάζεται αλλαγή vendor; Η νέα ανάθεση αντικαθιστά με ασφάλεια την τρέχουσα.</span><AdminAskLocalRouteForm requestId={request.id} csrfToken={data.csrfToken} vendors={data.vendors} initialCategory={request.category} /></div>
        </article>)}
      </div>}
    </div></section>
  </main>;
}
