import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorLoginForm } from "../../../components/VendorLoginForm";
import { getVendorSession } from "../../../lib/vendor-session";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "KONTA MOY Daily · Σύνδεση", robots: { index: false, follow: false } };

export default async function DailyLoginPage() {
  if (await getVendorSession()) redirect("/daily");
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true";
  const runtimeEnabled = productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME === "true";

  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, background: "#f6f4ee" }}>
    <section style={{ width: "min(100%, 460px)", background: "#fff", border: "1px solid rgba(23,25,20,.1)", borderRadius: 24, padding: "clamp(22px,5vw,38px)", boxShadow: "0 24px 70px rgba(23,25,20,.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".14em" }}>KONTA MOY</div>
      <div style={{ fontSize: 30, fontWeight: 850, letterSpacing: "-.04em", marginTop: 2 }}>Daily</div>
      <h1 style={{ margin: "30px 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>Η καθημερινή λειτουργία, απλά.</h1>
      <p style={{ margin: "0 0 26px", opacity: .66, lineHeight: 1.55 }}>Σύνδεση μόνο για παραγγελίες, Ask Local, ειδοποιήσεις και παραλαβές QR. Δεν εμφανίζεται το πλήρες vendor backoffice.</p>
      {runtimeEnabled ? <VendorLoginForm demoEnabled={demoEnabled} redirectTo="/daily" /> : <div className="account-gate"><strong>Η πρόσβαση Daily δεν είναι προσωρινά διαθέσιμη.</strong><p>Επικοινώνησε με την ομάδα KONTA MOY αν χρειάζεσαι άμεση βοήθεια.</p></div>}
    </section>
  </main>;
}
