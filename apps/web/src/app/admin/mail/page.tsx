import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminMailClient } from "../../../components/AdminMailClient";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { adminMailStorageReadiness } from "../../../lib/admin-mail-store";
import { sesMailConfigured } from "../../../lib/admin-mail-ses";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Mail",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AdminMailPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "notifications.manage")) redirect("/admin");

  const [storage, outboundReady] = await Promise.all([
    adminMailStorageReadiness(),
    Promise.resolve(sesMailConfigured())
  ]);

  return <main className="vendor-app admin-app admin-mail-page">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Mail" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined admin-mail-hero">
      <div className="admin-mail-hero-grid">
        <div>
          <div className="eyebrow">Content & Visibility · communications</div>
          <h1>Mail</h1>
          <p className="lead">One operational mailbox for incoming SES mail stored in S3 and outgoing KONTA MOY mail sent through SES. Read, search, reply, forward, organize and download attachments directly from Admin.</p>
        </div>
        <div className="admin-mail-health" aria-label="Mail service status">
          <span className={storage.ok ? "" : "is-bad"}>{storage.ok ? "S3 inbox connected" : "S3 inbox unavailable"}</span>
          <span className={outboundReady ? "" : "is-bad"}>{outboundReady ? "SES outbound ready" : "SES outbound unavailable"}</span>
          <small>{storage.bucket} · {process.env.BLS_MAIL_AWS_REGION?.trim() || process.env.AWS_REGION?.trim() || "region not configured"}</small>
        </div>
      </div>
    </section>

    {!storage.ok && <section className="shell" style={{ paddingTop: 0, paddingBottom: 14 }}>
      <div className="workspace-inline-note"><strong>Mailbox storage check:</strong> {storage.message}</div>
    </section>}

    <AdminMailClient
      csrfToken={principal.csrfToken}
      outboundReady={outboundReady}
      storageReady={storage.ok}
    />
  </main>;
}
