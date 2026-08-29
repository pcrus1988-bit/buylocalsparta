import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../components/SiteHeader";
import { AccountDashboardClient } from "../../components/AccountDashboardClient";
import { AccountSectionNavigation } from "../../components/AccountSectionNavigation";
import { CustomerAccountSetupChecklist } from "../../components/CustomerAccountSetupChecklist";
import styles from "../../components/CustomerAccountExperience.module.css";
import contrastStyles from "./account-contrast.module.css";
import { accountDashboard } from "../../lib/account-view";
import { customerAccountSetup } from "../../lib/customer-account-onboarding";
import { getAccountSession } from "../../lib/account-session";

export const metadata: Metadata = { title: "Ο λογαριασμός μου", robots: { index: false, follow: false } };

export default async function AccountPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account");
  const [dashboard, setup] = await Promise.all([accountDashboard(principal), customerAccountSetup(principal)]);

  return <main className={`account-app ${contrastStyles.accountPage}`}>
    <div className="announcement">Οι αγορές και οι τοπικές υπηρεσίες σου, σε ένα σημείο.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />

    <section className={`shell ${styles.mainDashboardHero}`}>
      <div>
        <div className="eyebrow">Ο λογαριασμός μου</div>
        <h1 className={styles.heroTitle}>Η τοπική αγορά σου, οργανωμένη απλά.</h1>
        <p className={styles.heroLead}>Παρακολούθησε τις παραγγελίες σου, ζήτησε κάτι που δεν βρίσκεις με Ask Local και διαχειρίσου όσα χρειάζεσαι χωρίς να ψάχνεις σε μενού.</p>
      </div>
      <div className={styles.heroActions} aria-label="Βασικές ενέργειες λογαριασμού">
        <Link className={`${styles.heroAction} ${styles.askLocalHeroAction}`} href="/account/ask-local">
          <span className={styles.heroActionKicker}>Ask Local</span>
          <strong>Δεν το βρίσκεις; Ρώτησε την τοπική αγορά.</strong>
          <small>Στείλε ένα ιδιωτικό αίτημα και άφησε το ΚΟΝΤΑ ΜΟΥ να σε συνδέσει με την κατάλληλη τοπική επιχείρηση.</small>
          <span className={styles.heroActionArrow}>Νέο αίτημα →</span>
        </Link>
        <Link className={`${styles.heroAction} ${styles.orderHeroAction}`} href="/account/orders">
          <span className={styles.heroActionKicker}>Order tracking</span>
          <strong>Δες αμέσως πού βρίσκεται η παραγγελία σου.</strong>
          <small>Κατάσταση, επόμενο βήμα, παραλαβή ή παράδοση σε μία καθαρή διαδρομή.</small>
          <span className={styles.heroActionArrow}>Παρακολούθηση παραγγελιών →</span>
        </Link>
      </div>
    </section>

    <CustomerAccountSetupChecklist setup={setup} />
    <AccountDashboardClient initial={dashboard} />
  </main>;
}
