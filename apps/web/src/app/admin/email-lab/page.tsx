import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { emailLabDeliveryConfigured, emailTemplateLabCatalog } from "../../../lib/email-template-lab";
import { EmailLabClient } from "./EmailLabClient";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "notifications.manage")) redirect("/admin");
  const templates = await emailTemplateLabCatalog();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">System · Email governance</div>
        <h1>Automatic Email Lab</h1>
        <p className="lead">Δοκιμή, έλεγχος και versioned επεξεργασία όλων των automatic emails χωρίς να παρακάμπτεται το κεντρικό KONTA MOY brand shell.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/notifications">Notification Centre</Link></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Automatic email templates" title="Event catalogue & test environment" note="Νέα email events καταγράφονται αυτόματα όταν εμφανιστούν για πρώτη φορά. Οι αποθηκευμένες Admin εκδόσεις εφαρμόζονται στις επόμενες πραγματικές αποστολές." />
      <EmailLabClient csrfToken={principal.csrfToken} initialTemplates={templates} deliveryConfigured={emailLabDeliveryConfigured()} />
    </section>
  </main>;
}
