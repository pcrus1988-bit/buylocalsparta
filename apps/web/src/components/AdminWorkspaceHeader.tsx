import { adminDomainAttentionBadges } from "../lib/admin-attention-projection";
import { adminNavigationForPrincipal } from "../lib/admin-navigation";
import { getAdminSession } from "../lib/admin-session";
import { AdminWorkspaceHeaderClient } from "./AdminWorkspaceHeaderClient";

// Server wrapper keeps navigation visibility aligned with the same RBAC enforced by every Admin route.
// Attention counts are a fail-soft read-only projection: navigation must stay available even if a
// dashboard aggregate cannot be read. Activation remains explicitly registered in the canonical IA.
export async function AdminWorkspaceHeader({ csrfToken }: { csrfToken: string }) {
  const principal = await getAdminSession();
  if (!principal) return null;
  const attentionBadges = await adminDomainAttentionBadges(principal).catch(() => ({}));
  return <AdminWorkspaceHeaderClient csrfToken={csrfToken} groups={adminNavigationForPrincipal(principal, attentionBadges)} />;
}
