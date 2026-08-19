import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { VendorLoginForm } from "../../../components/VendorLoginForm";
import { getVendorSession } from "../../../lib/vendor-session";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "Σύνδεση συνεργάτη", robots: { index: false, follow: false } };

export default async function VendorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const requestedNext = typeof params.next === "string" ? params.next.trim() : "";
  const redirectTo = requestedNext.startsWith("/vendor") && !requestedNext.startsWith("//") ? requestedNext : "/vendor";
  if (await getVendorSession()) redirect(redirectTo);
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true";
  const runtimeEnabled = productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME === "true";
  return <main><div className="announcement">Χώρος συνεργάτη · ασφαλής πρόσβαση μόνο στο δικό σου κατάστημα.</div><SiteHeader compact /><section className="shell login-layout"><div className="login-copy"><div className="eyebrow">Backoffice συνεργάτη</div><h1>Η καθημερινή λειτουργία του καταστήματός σου.</h1><p className="lead compact">Συνδέσου για να διαχειριστείς τον κατάλογο και το stock σου, τις παραγγελίες που έχουν ανατεθεί στο κατάστημά σου, αποστολές, επιστροφές και ιδιωτικά αιτήματα πελατών.</p><a className="text-link" href="/join">Δεν είσαι ακόμη συνεργάτης; Δες πώς λειτουργεί →</a></div><div className="login-panel"><h2>Σύνδεση καταστήματος</h2>{runtimeEnabled ? <VendorLoginForm demoEnabled={demoEnabled} redirectTo={redirectTo} /> : <div className="account-gate"><strong>Η πρόσβαση συνεργάτη δεν είναι προσωρινά διαθέσιμη.</strong><p>Η υπηρεσία backoffice δεν είναι έτοιμη αυτή τη στιγμή. Επικοινώνησε με την ομάδα Buy Local Sparta αν χρειάζεσαι άμεση βοήθεια.</p></div>}</div></section><SiteFooter /></main>;
}
