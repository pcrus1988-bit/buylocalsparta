import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorLoginForm } from "../../../components/VendorLoginForm";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Vendor login", robots: { index: false, follow: false } };

export default async function VendorLoginPage() {
  if (await getVendorSession()) redirect("/vendor");
  const demoEnabled = process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true" || process.env.NODE_ENV !== "production";
  const runtimeEnabled = process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME === "true";
  return <main><div className="announcement">Vendor workspace · πρόσβαση μόνο στο δικό σου κατάστημα.</div><SiteHeader compact /><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Merchant backoffice</div><h1>Η καθημερινή λειτουργία του καταστήματός σου.</h1><p className="lead compact">Παραγγελίες που σου έχουν ανατεθεί, stock και supplier-side operational πληροφορία με server-side vendor isolation.</p></div><div className="login-panel"><h2>Σύνδεση καταστήματος</h2>{runtimeEnabled ? <VendorLoginForm demoEnabled={demoEnabled} /> : <div className="account-gate"><strong>Production vendor persistence gate</strong><p>Το production UI είναι έτοιμο, αλλά ο ephemeral vendor session store παραμένει απενεργοποιημένος στην παραγωγή μέχρι το PostgreSQL identity/vendor persistence cutover.</p></div>}</div></section></main>;
}
