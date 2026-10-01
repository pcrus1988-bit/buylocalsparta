import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { adminMailWorkspace } from "../../../lib/admin-mail";
import { getAdminSession } from "../../../lib/admin-session";
import { AdminMailClient } from "./AdminMailClient";

export const metadata: Metadata = {
  title: "Mail · KONTA MOY Admin",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

export default async function AdminMailPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "notifications.manage")) redirect("/admin");

  const initialWorkspace = await adminMailWorkspace(principal, { folder: "inbox", limit: 60 });
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Mail" />
    <AdminMailClient csrfToken={principal.csrfToken} initialWorkspace={initialWorkspace} />
  </main>;
}
