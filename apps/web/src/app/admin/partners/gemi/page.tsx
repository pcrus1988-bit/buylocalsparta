import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminGemiExporter } from "../../../../components/AdminGemiExporter";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Partners · ΓΕΜΗ",
  robots: { index: false, follow: false }
};

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  return <main className="vendor-app admin-app admin-gemi-export">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Partners · ΓΕΜΗ" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Partners · ΓΕΜΗ</div>
        <h1>ΓΕΜΗ Business Export</h1>
        <p className="lead">Αναζήτησε επιχειρήσεις με ομάδες ΚΑΔ ή συγκεκριμένο ΚΑΔ και γεωγραφικό φίλτρο ΓΕΜΗ, έλεγξε το πλήθος και κατέβασε όλα τα business-level δημόσια στοιχεία σε CSV.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="admin-local-tabs" aria-label="Partner tools">
        <Link href="/admin/partners">Partner operations</Link>
        <Link href="/admin/partners/pipeline">Pipeline</Link>
        <Link className="active" href="/admin/partners/gemi" aria-current="page">ΓΕΜΗ</Link>
      </div>

      <WorkspaceSectionHeading
        eyebrow="Official OpenData"
        title="Ομάδες ΚΑΔ / ΚΑΔ + περιοχή → πλήρες CSV"
        note="Τα φίλτρα και τα αποτελέσματα διαβάζονται live από το επίσημο ΓΕΜΗ OpenData API. Η λειτουργία δεν δημιουργεί αυτόματα vendor ή prospect records."
      />
      <AdminGemiExporter />
    </section>
  </main>;
}
