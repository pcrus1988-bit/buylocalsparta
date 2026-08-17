import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader";
import { AccountDashboardClient } from "../../components/AccountDashboardClient";
import { accountDashboard } from "../../lib/account-view";
import { getAccountSession } from "../../lib/account-session";

export const metadata: Metadata = { title: "Ο λογαριασμός μου", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account");
  const dashboard = await accountDashboard(principal);
  return <main><div className="announcement">Ο λογαριασμός σου συγκεντρώνει αγορές, αποθηκευμένα και τοπικές ειδοποιήσεις.</div><SiteHeader compact /><section className="shell page-hero account-hero"><div><div className="eyebrow">Customer hub</div><h1>Η τοπική σου αγορά, οργανωμένη γύρω από εσένα.</h1><p className="lead">Παραγγελίες, saved προϊόντα και αναζητήσεις, ειδοποιήσεις και privacy controls σε μία authenticated επιφάνεια.</p></div></section><AccountDashboardClient initial={dashboard} /></main>;
}
