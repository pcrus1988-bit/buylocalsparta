"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminWorkspaceHeader({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }
  return <header className="vendor-app-header shell admin-header">
    <a className="brand" href="/admin"><span className="brand-mark">BLS</span><span>Admin Command Centre</span></a>
    <nav aria-label="Admin workspace">
      <a href="/admin">Overview</a>
      <a href="/admin/vendors">Vendors</a>
      <a href="/admin/matching">Matching</a>
      <a href="/admin/trust">Trust</a>
      <a href="/admin/finance">Finance</a>
      <a href="/admin/tax">Tax/myDATA</a>
      <a href="/admin/shipping">Shipping</a>
      <a href="/admin/fairness">Fairness</a>
      <a href="/admin/orders">Orders</a>
      <a href="/admin/reviews">Reviews</a>
      <a href="/admin/privacy">Privacy</a>
      <a href="/admin/categories">Categories</a>
      <a href="/admin/content">CMS</a>
      <a href="/admin/recalls">Recalls</a>
      <a href="/admin/analytics">Analytics</a>
      <a href="/admin/maintenance">Jobs</a>
      <a href="/admin/operations">Operations</a>
      <a href="/admin/activation">Activation</a>
    </nav>
    <button className="button button-secondary admin-logout" onClick={logout} disabled={busy}>{busy ? "…" : "Logout"}</button>
  </header>;
}
