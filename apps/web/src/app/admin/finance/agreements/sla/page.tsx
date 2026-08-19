import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { AdminSlaPoliciesClient } from "../../../../../components/AdminSlaPoliciesClient";
import { getAdminSession } from "../../../../../lib/admin-session";
import { adminSlaPolicyWorkspace } from "../../../../../lib/order-sla";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let workspace;
  try { workspace = await adminSlaPolicyWorkspace(); } catch { redirect("/admin/finance/agreements"); }
  const configured = workspace.agreements.filter((item) => item.configured).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Commercial governance</div><h1>Order SLA policies</h1><p className="lead">Μετατρέπει τους συμφωνημένους λειτουργικούς χρόνους κάθε vendor σε εκτελέσιμες προθεσμίες για orders, reminders και escalation.</p><div className="hero-actions"><Link className="button button-secondary" href="/admin/finance/agreements">Vendor agreements</Link><Link className="button" href="/admin/notifications">Notification Centre</Link></div></div>
    </section>
    <section className="shell workspace-metric-strip" aria-label="SLA policy metrics">
      <div className="workspace-metric"><span>Open agreements</span><strong>{workspace.agreements.length}</strong></div>
      <div className="workspace-metric"><span>Configured</span><strong>{configured}</strong></div>
      <div className="workspace-metric"><span>Using fallback</span><strong>{workspace.agreements.length - configured}</strong></div>
      <div className="workspace-metric"><span>Timezone</span><strong>Europe/Athens</strong></div>
    </section>
    <AdminSlaPoliciesClient initial={workspace} csrfToken={principal.csrfToken} />
  </main>;
}
