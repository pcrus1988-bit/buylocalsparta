import type { Metadata } from "next";
import "../admin-information-architecture.css";
import "../admin-domain-workspaces.css";
import "../admin-dashboard-customizer.css";
import "../admin-directory-search.css";
import "../admin-orders-directory.css";
import "../admin-order-record.css";
import "../admin-status-semantics.css";
import "../admin-local-tabs.css";
import "../admin-partner-record.css";
import "../admin-matching-split.css";
import "../admin-commercial-finance.css";
import "../admin-nav-icons.css";
import "../admin-queue-split.css";
import "../admin-insights.css";
import "../admin-tax-documents.css";
import "../admin-operational-ux.css";
import "../admin-operational-dashboard.css";
import "../admin-seo-operational.css";
import "../admin-partners-operational.css";
import "../admin-catalogue-operational.css";
import "../admin-customers-operational.css";
import "../admin-finance-operational.css";
import "../admin-trust-operational.css";
import "../admin-analytics-operational.css";
import "../admin-content-operational.css";
import "../admin-platform-operational.css";
import "../admin-launchcontrol.css";
import "../admin-assistant.css";
import { AdminAssistantShell } from "../../components/AdminAssistantShell";
import { ScopedPwaInstallClient } from "../../components/ScopedPwaInstallClient";
import { adminAssistantEnabled } from "../../lib/admin-assistant/config";
import { getAdminSession } from "../../lib/admin-session";

// Deployment sync: production schema 168 is live; keep this layout behavior unchanged.
export const metadata: Metadata = {
  applicationName: "KONTA MOY Admin",
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "KONTA MOY Admin",
    statusBarStyle: "default"
  },
  formatDetection: { telephone: false }
};

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const principal = await getAdminSession();
  const workspace = principal && adminAssistantEnabled()
    ? <AdminAssistantShell csrfToken={principal.csrfToken}>{children}</AdminAssistantShell>
    : children;
  return <>
    {workspace}
    <ScopedPwaInstallClient appName="Admin" serviceWorkerPath="/admin-sw.js" scope="/admin" />
  </>;
}
