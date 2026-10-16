import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader";
import { AccountDashboardClient } from "../../components/AccountDashboardClient";
import { AccountSectionNavigation } from "../../components/AccountSectionNavigation";
import { CustomerAccountSetupChecklist } from "../../components/CustomerAccountSetupChecklist";
import styles from "../../components/CustomerAccountExperience.module.css";
import contrastStyles from "./account-contrast.module.css";
import { accountHomeDashboard } from "../../lib/account-home-view";
import { customerAccountSetup } from "../../lib/customer-account-onboarding";
import { getAccountSession } from "../../lib/account-session";

export const metadata: Metadata = { title: "Ο λογαριασμός μου", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account");
  const [dashboard, setup] = await Promise.all([accountHomeDashboard(principal), customerAccountSetup(principal)]);

  return <main className={`account-app ${contrastStyles.accountPage}`}>
    <div className="announcement">Οι αγορές και οι τοπικές υπηρεσίες σου, σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />

    <section className={`shell ${styles.compactDashboardIntro}`}>
      <div className="eyebrow">Ο προσωπικός σου χώρος</div>
      <h1>Ο λογαριασμός μου</h1>
      <p>Οι παραγγελίες, τα αγαπημένα και όλες οι υπηρεσίες του ΚΟΝΤΑ ΜΟΥ, τακτοποιημένα για εσένα.</p>
    </section>

    <CustomerAccountSetupChecklist setup={setup} />
    <AccountDashboardClient initial={dashboard} />
  </main>;
}
