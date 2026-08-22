import type { Metadata } from "next";
import { ConfirmEmailChangeForm } from "../../components/ConfirmEmailChangeForm";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Επιβεβαίωση νέου email",
  robots: { index: false, follow: false }
};

type ConfirmEmailChangePageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

export default async function ConfirmEmailChangePage({ searchParams }: ConfirmEmailChangePageProps) {
  const params = await searchParams;
  const tokenValue = params.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] ?? "" : tokenValue ?? "";
  return <main>
    <div className="announcement">Ασφαλής επιβεβαίωση νέου email σύνδεσης.</div>
    <SiteHeader compact />
    <section className="shell login-layout">
      <div className="login-copy">
        <div className="eyebrow">Αλλαγή email</div>
        <h1>Επιβεβαίωσε τη νέα διεύθυνση.</h1>
        <p className="lead compact">Ο σύνδεσμος είναι μιας χρήσης και λήγει μετά από 24 ώρες. Το παλιό email παραμένει το email σύνδεσης μέχρι να ολοκληρώσεις αυτή την επιβεβαίωση.</p>
      </div>
      <div className="login-panel">
        <h2>Επιβεβαίωση</h2>
        {token ? <ConfirmEmailChangeForm token={token} /> : <div className="account-gate"><strong>Λείπει ο σύνδεσμος επιβεβαίωσης.</strong><p>Άνοιξε τον πλήρη σύνδεσμο που έλαβες στο νέο email.</p><a className="text-link" href="/login">Επιστροφή στη σύνδεση →</a></div>}
      </div>
    </section>
    <SiteFooter />
  </main>;
}
