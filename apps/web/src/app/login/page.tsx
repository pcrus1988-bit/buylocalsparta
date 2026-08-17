import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccountSession } from "../../lib/account-session";
import { LoginForm } from "../../components/LoginForm";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = { title: "Σύνδεση", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await getAccountSession()) redirect("/account");
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";
  const runtimeEnabled = Boolean(process.env.DATABASE_URL?.trim()) || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME === "true";
  return <main><div className="announcement">Ο λογαριασμός σου · αγορές, αποθηκευμένα, ειδοποιήσεις και συμβουλές.</div><SiteHeader compact /><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Customer account</div><h1>Συνδέσου στο Buy Local Sparta.</h1><p className="lead compact">Η ταυτότητα και οι λογαριασμοί είναι server-side. Το session token αποθηκεύεται σε HttpOnly cookie και οι μεταβολές λογαριασμού προστατεύονται με CSRF token.</p></div><div className="login-panel"><h2>Σύνδεση</h2>{runtimeEnabled ? <LoginForm demoEnabled={demoEnabled} /> : <div className="account-gate"><strong>Production identity gate</strong><p>Η σύνδεση πελατών απαιτεί κοινόχρηστο PostgreSQL state στην παραγωγή. Ρύθμισε DATABASE_URL και BLS_AUTH_SECRET· το ephemeral in-memory session store παραμένει διαθέσιμο μόνο για development/ρητά ενεργοποιημένα previews.</p></div>}</div></section></main>;
}
