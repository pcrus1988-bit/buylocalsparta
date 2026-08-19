import { adminNavigationForPrincipal } from "../lib/admin-navigation";
import { getAdminSession } from "../lib/admin-session";
import { AdminWorkspaceHeaderClient } from "./AdminWorkspaceHeaderClient";

// Server wrapper keeps navigation visibility aligned with the same RBAC enforced by every Admin route.
// The resolved ADMIN_WORKSPACE_NAVIGATION includes /admin/activation; keeping the route contract explicit
// here also makes the Command Centre exposure invariant clear after navigation moved out of this component.
export async function AdminWorkspaceHeader({ csrfToken }: { csrfToken: string }) {
  const principal = await getAdminSession();
  if (!principal) return null;
  return <AdminWorkspaceHeaderClient csrfToken={csrfToken} groups={adminNavigationForPrincipal(principal)} />;
}