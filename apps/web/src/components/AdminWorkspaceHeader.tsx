import Link from "next/link";
import { adminDomainAttentionBadges } from "../lib/admin-attention-projection";
import { adminNavigationForPrincipal } from "../lib/admin-navigation";
import { getAdminSession } from "../lib/admin-session";
import { AdminWorkspaceHeaderClient } from "./AdminWorkspaceHeaderClient";

// Server wrapper keeps navigation visibility aligned with the same RBAC enforced by every Admin route.
// Attention counts are a fail-soft read-only projection: navigation must stay available even if a
// dashboard aggregate cannot be read. The canonical Admin IA keeps /admin/activation exposed as the
// Launch Readiness / Activation evidence workspace even though the route is resolved through navigation data.
export async function AdminWorkspaceHeader({ csrfToken, entityLabel }: { csrfToken: string; entityLabel?: string }) {
  const principal = await getAdminSession();
  if (!principal) return null;
  const attentionBadges = await adminDomainAttentionBadges(principal).catch(() => ({}));
  return <>
    <AdminWorkspaceHeaderClient csrfToken={csrfToken} groups={adminNavigationForPrincipal(principal, attentionBadges)} entityLabel={entityLabel} />
    {entityLabel === "Supplier PIM Intake" && <div className="shell workspace-action-bar">
      <span>Unmapped supplier attributes can be resolved once and reused on future imports.</span>
      <Link className="button button-secondary" href="/admin/catalogue-intake/attributes">Map attributes</Link>
    </div>}
  </>;
}