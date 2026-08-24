import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminQuickAddWorkbench } from "../../../components/AdminQuickAddWorkbench";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminQuickAddWorkspace } from "../../../lib/admin-quickadd-service";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Quick Add", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "catalog.write")) redirect("/admin");
  const data = await adminQuickAddWorkspace(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Quick Add" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · fast product operations</div>
        <h1>Admin Quick Add</h1>
        <p className="lead">Σκάναρε barcode ή αναζήτησε προϊόν, έλεγξε πρώτα το canonical catalogue και πρόσθεσέ το άμεσα στο επιλεγμένο κατάστημα. Αν δεν υπάρχει, δημιούργησε canonical και vendor offer σε μία ασφαλή ενέργεια.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Identity safety</span>
        <strong>Search → reuse → create</strong>
        <p>Το ακριβές GTIN επαναχρησιμοποιεί πάντα το υπάρχον canonical ώστε να μη δημιουργούνται διπλότυπα.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Vendor shops", value: data.vendors.length },
      { label: "Assignable categories", value: data.categories.length },
      { label: "Input", value: "Barcode · Search" },
      { label: "Result", value: "Canonical + Offer" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="One workbench" title="Έρευνα, δημιουργία, ανάθεση και stock" note="Επίλεξε πρώτα κατάστημα. Τα inactive ή demo καταστήματα μπορούν να προετοιμαστούν χωρίς να εμφανιστούν δημόσια μέχρι να ενεργοποιηθούν." />
      <AdminQuickAddWorkbench vendors={data.vendors} categories={data.categories} csrfToken={data.csrfToken} />
    </section>
  </main>;
}
