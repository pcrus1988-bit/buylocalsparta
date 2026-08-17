"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const groups = [
  { label: "Operations", links: [["Overview", "/admin"], ["Orders", "/admin/orders"], ["Shipping", "/admin/shipping"], ["Jobs", "/admin/maintenance"], ["Activation", "/admin/activation"]] },
  { label: "Commerce", links: [["Vendors", "/admin/vendors"], ["Matching", "/admin/matching"], ["Categories", "/admin/categories"], ["CMS", "/admin/content"]] },
  { label: "Trust", links: [["Trust", "/admin/trust"], ["Reviews", "/admin/reviews"], ["Recalls", "/admin/recalls"], ["Privacy", "/admin/privacy"]] },
  { label: "Intelligence", links: [["Finance", "/admin/finance"], ["Tax", "/admin/tax"], ["Fairness", "/admin/fairness"], ["Analytics", "/admin/analytics"], ["System", "/admin/operations"]] }
] as const;

export function AdminWorkspaceHeader({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }
  return <header className="workspace-header shell admin-header">
    <Link className="brand workspace-identity" href="/admin"><span className="brand-mark">BLS</span><span><strong>Command Centre</strong><small>Governed operations</small></span></Link>
    <nav className="workspace-nav workspace-nav-admin" aria-label="Admin workspace">
      {groups.map((group) => <div className="workspace-nav-group" key={group.label}><span className="workspace-nav-label">{group.label}</span><div>{group.links.map(([label, href]) => {
        const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
        return <Link href={href} key={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
      })}</div></div>)}
    </nav>
    <button className="button button-secondary admin-logout" onClick={logout} disabled={busy}>{busy ? "…" : "Logout"}</button>
  </header>;
}
