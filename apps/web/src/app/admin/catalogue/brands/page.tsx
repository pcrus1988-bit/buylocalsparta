import { redirect } from "next/navigation";
import { AdminBrandManagement } from "../../../../components/AdminBrandManagement";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminBrandWorkspace } from "../../../../lib/admin-brand-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  let data;
  try { data = await adminBrandWorkspace(principal); } catch { redirect("/admin/catalogue"); }

  const withLogo = data.brands.filter((brand) => Boolean(brand.logoObjectKey)).length;
  const missingLogo = data.brands.length - withLogo;
  const coverage = data.brands.length ? Math.round((withLogo / data.brands.length) * 1000) / 10 : 0;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · canonical brand governance</div>
        <h1>Brands &amp; Logos</h1>
        <p className="lead">Ελαφριά διαχείριση των canonical brands που χρησιμοποιούνται σήμερα στον ενεργό κατάλογο. Logo, official website και provenance μένουν πάνω στο υπάρχον <code>brands</code> record — χωρίς δεύτερο brand model.</p>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Used brands", value: data.brands.length },
      { label: "With logo", value: withLogo, tone: withLogo === data.brands.length ? "positive" : "default" },
      { label: "Missing logo", value: missingLogo, tone: missingLogo ? "attention" : "positive" },
      { label: "Coverage", value: `${coverage}%` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Brand management" title="Λογότυπα και επίσημες πηγές" note="Οι αλλαγές είναι admin-only, CSRF-protected και αφορούν μόνο το canonical brand record. Έλλειψη logo δεν μπλοκάρει ποτέ προϊόν ή publication." />
      <AdminBrandManagement brands={data.brands} csrfToken={data.csrfToken} />
    </section>
  </main>;
}
