import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AskLocalWorkflowPanel } from "../../../components/AskLocalWorkflowPanel";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminAskLocalQueue } from "../../../lib/admin-ask-local";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Ask Local", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "customer.read")) redirect("/admin");
  const queue = await adminAskLocalQueue(principal);
  const adminOwned = queue.requests.filter((request) => request.workflowOwnerKind === "admin").length;
  const vendorOwned = queue.requests.filter((request) => request.workflowOwnerKind === "vendor").length;
  const overdue = queue.requests.filter((request) => request.responseDueAt && request.responseDueAt < Date.now()).length;
  const canManage = hasAdminPermission(principal, "customer.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={queue.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Admin · Ask Local workflow</div>
        <h1>Ask Local requests</h1>
        <p className="lead">Every open request has explicit Admin or vendor ownership. Automatic product matching uses the fairness assignment engine; direct shop requests are accepted only for eligible public vendors; everything else remains in Admin triage.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Open", value: queue.requests.length, tone: queue.requests.length ? "attention" : "positive" },
      { label: "Admin-owned", value: adminOwned, tone: adminOwned ? "attention" : "positive", hint: "Requires platform triage" },
      { label: "Vendor-owned", value: vendorOwned, hint: "Waiting on assigned local shop" },
      { label: "Overdue", value: overdue, tone: overdue ? "attention" : "positive", hint: "Vendor response deadline passed" },
      { label: "Eligible vendors", value: queue.vendors.length, hint: "Active + public + active location" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Operational queue" title="Ownership, assignment & follow-up" note="Admin reassignment requires a reason and is audited. Vendor assignments receive an in-app notification and a fresh 24-hour response window." />
      <AskLocalWorkflowPanel requests={queue.requests} vendors={queue.vendors} csrfToken={queue.csrfToken} canManage={canManage} />
    </section>
  </main>;
}
