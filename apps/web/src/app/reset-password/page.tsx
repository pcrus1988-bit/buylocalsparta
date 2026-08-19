import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "../../components/ResetPasswordForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { getAccountSession } from "../../lib/account-session";

export const metadata: Metadata = { title: "Νέος κωδικός", robots: { index: false, follow: false } };

export default async function ResetPasswordPage() {
  if (await getAccountSession()) redirect("/account");
  return <main>
    <div className="announcement">Νέος κωδικός · ο σύνδεσμος είναι μίας χρήσης και λήγει αυτόματα.</div>
    <SiteHeader compact />
    <section className="shell login-layout">
      <div className="login-copy">
        <div className="eyebrow">Ασφάλεια λογαριασμού</div>
        <h1>Δημιούργησε νέο κωδικό.</h1>
        <p className="lead compact">Χρησιμοποίησε έναν μοναδικό κωδικό τουλάχιστον 10 χαρακτήρων. Μετά την αλλαγή θα χρειαστεί να συνδεθείς ξανά σε όλες τις συσκευές.</p>
      </div>
      <div className="login-panel"><h2>Νέος κωδικός</h2><ResetPasswordForm /></div>
    </section>
    <SiteFooter />
  </main>;
}
