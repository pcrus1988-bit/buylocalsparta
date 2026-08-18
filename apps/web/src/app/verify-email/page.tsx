import type { Metadata } from "next";
import { VerifyEmailForm } from "../../components/VerifyEmailForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Επιβεβαίωση email",
  robots: { index: false, follow: false }
};

type VerifyEmailPageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const tokenValue = params.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] ?? "" : tokenValue ?? "";

  return <main>
    <div className="announcement">Ασφαλής ενεργοποίηση λογαριασμού Buy Local Sparta.</div>
    <SiteHeader compact />
    <section className="shell login-layout">
      <div className="login-copy">
        <div className="eyebrow">Email verification</div>
        <h1>Επιβεβαίωσε ότι το email είναι δικό σου.</h1>
        <p className="lead compact">Ο σύνδεσμος είναι μιας χρήσης και λήγει μετά από 24 ώρες. Η επιβεβαίωση ενεργοποιεί τον λογαριασμό, αλλά δεν σε συνδέει αυτόματα.</p>
      </div>
      <div className="login-panel">
        <h2>Επιβεβαίωση</h2>
        {token ? <VerifyEmailForm token={token} /> : <div className="account-gate"><strong>Λείπει ο σύνδεσμος επιβεβαίωσης.</strong><p>Άνοιξε τον πλήρη σύνδεσμο που έλαβες στο email σου.</p><a className="text-link" href="/register">Επιστροφή στην εγγραφή →</a></div>}
      </div>
    </section>
    <SiteFooter />
  </main>;
}
