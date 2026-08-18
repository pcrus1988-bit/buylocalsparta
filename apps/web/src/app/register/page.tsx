import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "../../components/RegisterForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { getAccountSession } from "../../lib/account-session";
import { customerRegistrationReadiness } from "../../lib/customer-registration-runtime";
import { productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const metadata: Metadata = {
  title: "Δημιουργία λογαριασμού",
  robots: { index: false, follow: false }
};

export default async function RegisterPage() {
  if (await getAccountSession()) redirect("/account");
  const runtimeEnabled = productionDatabaseConfigured() || process.env.NODE_ENV !== "production" || process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME === "true";
  const registration = customerRegistrationReadiness();

  return <main>
    <div className="announcement">Ο λογαριασμός σου · μία ασφαλής ταυτότητα για αγορές, συμβουλές και τοπική παραλαβή.</div>
    <SiteHeader compact />
    <section className="shell login-layout">
      <div className="login-copy">
        <div className="eyebrow">Customer account</div>
        <h1>Δημιούργησε τον λογαριασμό σου.</h1>
        <p className="lead compact">Χρησιμοποίησε ένα πραγματικό email. Θα σου στείλουμε σύνδεσμο επιβεβαίωσης και μόνο μετά την επιβεβαίωση θα μπορείς να συνδεθείς.</p>
        <div className="fairness-note">
          <strong>Τι αποθηκεύεται</strong>
          <p>Ο λογαριασμός και το session αποθηκεύονται server-side στη βάση PostgreSQL. Ο κωδικός αποθηκεύεται μόνο ως salted scrypt hash και το session token σε HttpOnly cookie.</p>
          <a className="text-link" href="/privacy-controls">Privacy controls →</a>
        </div>
      </div>
      <div className="login-panel">
        <h2>Νέος λογαριασμός</h2>
        {!runtimeEnabled ? <div className="account-gate"><strong>Production identity gate</strong><p>Η δημιουργία λογαριασμού απαιτεί την παραγωγική PostgreSQL identity runtime.</p></div>
          : !registration.ready ? <div className="account-gate"><strong>Η εγγραφή δεν είναι ακόμη διαθέσιμη.</strong><p>{registration.message}</p><a className="text-link" href="/login">Έχεις ήδη λογαριασμό; Σύνδεση →</a></div>
          : <RegisterForm />}
      </div>
    </section>
    <SiteFooter />
  </main>;
}
