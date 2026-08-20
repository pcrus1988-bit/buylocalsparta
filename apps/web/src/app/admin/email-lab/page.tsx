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
  const deliveryConfigured = emailLabDeliveryConfigured();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Content · Communications</div>
        <h1>Email Templates & Delivery</h1>
        <p className="lead">Versioned automatic email content, preview/test sending και delivery readiness χωρίς να παρακάμπτεται το κεντρικό KONTA MOY brand shell ή το πραγματικό notification workflow.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/content">Content operations</Link><Link className="button button-secondary" href="/admin/notifications">SLA & Escalations</Link></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-callout"><strong>Delivery readiness</strong><span>{deliveryConfigured ? "Transactional email delivery is configured. Test sends remain rate-limited and explicit." : "Transactional email delivery is not configured. Templates can still be reviewed and versioned without sending."}</span></div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Automatic email templates" title="Event catalogue & test environment" note="Νέα email events καταγράφονται αυτόματα όταν εμφανιστούν για πρώτη φορά. Οι αποθηκευμένες Admin εκδόσεις εφαρμόζονται στις επόμενες πραγματικές αποστολές." />
      <EmailLabClient csrfToken={principal.csrfToken} initialTemplates={templates} deliveryConfigured={deliveryConfigured} />
    </section>
  </main>;
}
