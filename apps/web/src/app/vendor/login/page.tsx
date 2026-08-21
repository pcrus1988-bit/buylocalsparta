import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "../../../components/SiteFooter";
import { VendorLoginForm } from "../../../components/VendorLoginForm";
import { getVendorSession } from "../../../lib/vendor-session";
import { productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const metadata: Metadata = { title: "Σύνδεση συνεργάτη", robots: { index: false, follow: false } };

export default async function VendorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const requestedNext = typeof params.next === "string" ? params.next.trim() : "";
  const validNext = (requestedNext.startsWith("/vendor") || requestedNext.startsWith("/daily")) && !requestedNext.startsWith("//");
  const redirectTo = validNext ? requestedNext : "/vendor";
  if (await getVendorSession()) redirect(redirectTo);
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.BLS_ENABLE_DEMO_ACCOUNTS === "true";
  const runtimeEnabled = productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME === "true";

  return <>
    <main className="vendor-login-page">
      <header className="vendor-login-brandbar">
        <Link className="vendor-login-brand" href="/">
          <img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ Sparta" width={92} height={62} />
          <span><strong>Χώρος συνεργάτη</strong><small>ΚΟΝΤΑ ΜΟΥ Sparta</small></span>
        </Link>
        <Link className="text-link" href="/">Επιστροφή στο δημόσιο site →</Link>
      </header>

      <section className="vendor-login-layout">
        <div className="vendor-login-copy">
          <div className="eyebrow">Καθημερινή λειτουργία καταστήματος</div>
          <h1>Όλα όσα χρειάζεσαι για να εξυπηρετείς το ΚΟΝΤΑ ΜΟΥ.</h1>
          <p className="lead compact">Μετά τη σύνδεση βλέπεις πρώτα ό,τι χρειάζεται ενέργεια: παραγγελίες, προθεσμίες, απόθεμα, πελάτες και πληρωμές.</p>
          <div className="workspace-compact-list" style={{ marginTop: 20 }}>
            <div className="workspace-compact-row"><strong>Παραγγελίες</strong><span>ξεκάθαρο επόμενο βήμα</span></div>
            <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>τιμή, απόθεμα και δημόσια εμφάνιση</span></div>
            <div className="workspace-compact-row"><strong>Daily</strong><span>γρήγορη λειτουργία από κινητό</span></div>
          </div>
          <Link className="text-link" href="/join">Δεν είσαι ακόμη συνεργάτης; Δες πώς λειτουργεί →</Link>
        </div>

        <div className="vendor-login-panel">
          <div className="eyebrow">Ασφαλής πρόσβαση</div>
          <h2>Σύνδεση καταστήματος</h2>
          <p>Χρησιμοποίησε το email και τον κωδικό του λογαριασμού συνεργάτη.</p>
          {runtimeEnabled ? <VendorLoginForm demoEnabled={demoEnabled} redirectTo={redirectTo} /> : <div className="account-gate"><strong>Η πρόσβαση συνεργάτη δεν είναι προσωρινά διαθέσιμη.</strong><p>Η υπηρεσία δεν είναι έτοιμη αυτή τη στιγμή. Επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ αν χρειάζεσαι άμεση βοήθεια.</p></div>}
          <p className="vendor-login-help"><strong>Δεν θυμάσαι τον κωδικό;</strong> Για την ώρα η επαναφορά γίνεται μέσω της ομάδας ΚΟΝΤΑ ΜΟΥ ώστε να επιβεβαιωθεί με ασφάλεια ο λογαριασμός του καταστήματος.</p>
        </div>
      </section>

      <footer className="vendor-login-footer">Ιδιωτικός χώρος συνεργάτη · η πρόσβαση περιορίζεται στο συνδεδεμένο κατάστημα.</footer>
    </main>
    <SiteFooter />
  </>;
}
