import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { AccountTryOnSetupClient } from "../../../components/AccountTryOnSetupClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";

export const metadata: Metadata = {
  title: "Try On Me · Ο λογαριασμός μου",
  robots: { index: false, follow: false }
};

export default async function AccountTryOnPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/try-on");

  return (
    <main className="account-app">
      <div className="announcement">Try On Me: μία φωτογραφία στη συσκευή σου, συμβατά ρούχα πάνω σου, έως 50 δημιουργίες τον μήνα.</div>
      <SiteHeader compact />
      <AccountSectionNavigation />
      <AccountTryOnSetupClient variant="page" />
    </main>
  );
}
