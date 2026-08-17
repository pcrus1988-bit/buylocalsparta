import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "../../../components/AdminLoginForm";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };
export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";
  const runtimeEnabled = process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME === "true";
  return <main><div className="announcement">Platform administration · privileged access only.</div><SiteHeader compact/><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Admin Command Centre</div><h1>Govern the marketplace without bypassing its rules.</h1><p className="lead compact">Vendor verification, Product Matching, trust/compliance, finance maker-checker, fairness governance and operational health are permission-scoped platform workflows.</p></div><div className="login-panel"><h2>Platform sign in</h2>{runtimeEnabled ? <AdminLoginForm demoEnabled={demoEnabled}/> : <div className="account-gate"><strong>Production admin persistence gate</strong><p>The production Admin surface is present, but ephemeral platform identity/governance state is disabled until PostgreSQL-backed staff sessions, audit and governance persistence are active.</p></div>}</div></section></main>;
}
