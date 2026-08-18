import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "../../../components/AdminLoginForm";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "Admin login", robots: { index: false, follow: false } };
export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true";
  const runtimeEnabled = productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME === "true";
  return <main><div className="announcement">Platform administration · privileged access only.</div><SiteHeader compact/><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Admin Command Centre</div><h1>Διαχείριση της αγοράς με καθαρούς κανόνες.</h1><p className="lead compact">Σύνδεση για vendor verification, product matching, παραγγελίες, trust & compliance, finance controls, fairness governance και operational health. Κάθε ενέργεια παραμένει permission-scoped και auditable.</p></div><div className="login-panel"><h2>Admin sign in</h2>{runtimeEnabled ? <AdminLoginForm demoEnabled={demoEnabled}/> : <div className="account-gate"><strong>Η διαχείριση δεν είναι προσωρινά διαθέσιμη.</strong><p>Το production admin persistence δεν είναι έτοιμο αυτή τη στιγμή. Δεν χρησιμοποιείται προσωρινό platform state στην παραγωγή.</p></div>}</div></section><SiteFooter /></main>;
}
