import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "../../components/ForgotPasswordForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { getAccountSession } from "../../lib/account-session";
import { customerPasswordResetReadiness } from "../../lib/customer-password-reset-runtime";

export const metadata: Metadata = { title: "Επαναφορά κωδικού", robots: { index: false, follow: false } };

export default async function ForgotPasswordPage() {
  if (await getAccountSession()) redirect("/account");
  const readiness = customerPasswordResetReadiness();
  return <main>
    <div className="announcement">Ασφαλής ανάκτηση λογαριασμού · ο σύνδεσμος επαναφοράς λήγει σε 30 λεπτά.</div>
    <SiteHeader compact />
    <section className="shell login-layout">
      <div className="login-copy">
        <div className="eyebrow">Ανάκτηση λογαριασμού</div>
        <h1>Ξέχασες τον κωδικό σου;</h1>
        <p className="lead compact">Συμπλήρωσε το email του λογαριασμού σου. Αν υπάρχει ενεργός λογαριασμός, θα λάβεις έναν ασφαλή σύνδεσμο μίας χρήσης.</p>
        <div className="fairness-note"><strong>Ασφάλεια</strong><p>Δεν αποκαλύπτουμε αν ένα email είναι καταχωρημένο. Με την αλλαγή κωδικού ακυρώνονται όλες οι υπάρχουσες συνδέσεις.</p></div>
      </div>
      <div className="login-panel">
        <h2>Επαναφορά κωδικού</h2>
        {readiness.ready ? <ForgotPasswordForm /> : <div className="account-gate"><strong>Η ανάκτηση δεν είναι προσωρινά διαθέσιμη.</strong><p>{readiness.message}</p><a className="text-link" href="/login">Επιστροφή στη σύνδεση →</a></div>}
      </div>
    </section>
    <SiteFooter />
  </main>;
}
