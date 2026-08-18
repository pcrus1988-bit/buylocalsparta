import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountSession } from "../../lib/account-session";
import { LoginForm } from "../../components/LoginForm";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const metadata: Metadata = { title: "Σύνδεση", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getAccountSession()) redirect("/account");
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true";
  // Keep DATABASE_URL explicit here as a release invariant while productionDatabaseConfigured()
  // also accepts the platform-provided PostgreSQL alias used by hosted deployments.
  const runtimeEnabled = Boolean(process.env.DATABASE_URL?.trim()) || productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME === "true";
  return <main><div className="announcement">Ο λογαριασμός σου · παραγγελίες, αποθηκευμένα και τοπικές ειδοποιήσεις σε ένα σημείο.</div><SiteHeader compact /><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Λογαριασμός πελάτη</div><h1>Καλώς ήρθες ξανά.</h1><p className="lead compact">Συνδέσου για να συνεχίσεις τις αγορές σου, να παρακολουθείς παραγγελίες, να βρίσκεις αποθηκευμένα προϊόντα και να διαχειρίζεσαι τα ιδιωτικά σου αιτήματα Ask Local.</p><a className="text-link" href="/help">Τι μπορώ να κάνω από τον λογαριασμό; →</a></div><div className="login-panel"><h2>Σύνδεση</h2>{runtimeEnabled ? <LoginForm demoEnabled={demoEnabled} /> : <div className="account-gate"><strong>Η σύνδεση δεν είναι προσωρινά διαθέσιμη.</strong><p>Η υπηρεσία λογαριασμών δεν είναι έτοιμη αυτή τη στιγμή. Δοκίμασε ξανά αργότερα ή χρησιμοποίησε το Κέντρο βοήθειας.</p></div>}</div></section><SiteFooter /></main>;
}
