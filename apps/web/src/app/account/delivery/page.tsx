import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerDeliveryWorkspaceClient } from "../../../components/CustomerDeliveryWorkspaceClient";
import styles from "../../../components/DeliveryOperations.module.css";
import { getAccountSession } from "../../../lib/account-session";
import { customerDeliveryWorkspace } from "../../../lib/customer-delivery-view";

export const metadata: Metadata = { title: "Παραδόσεις & επιστροφές", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function AccountDeliveryPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/delivery");
  const workspace = await customerDeliveryWorkspace(principal);

  return <main className={`account-app ${styles.page}`}>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className={`${styles.shell} ${styles.hero}`}>
      <div className="customer-page-heading">
        <div><div className="eyebrow">Οι αγορές μου</div><h1>Παραδόσεις & επιστροφές</h1></div>
        <p>Δες πού βρίσκεται η παραγγελία σου, τα επόμενα βήματα και τον κωδικό παραλαβής όταν είναι διαθέσιμος.</p>
      </div>
      <div className={styles.toolbar}><Link className={styles.buttonSecondary} href="/account/orders">Όλες οι παραγγελίες →</Link></div>
    </section>
    <section className={styles.shell} aria-label="Παραδόσεις του λογαριασμού"><CustomerDeliveryWorkspaceClient initialJobs={workspace.jobs} /></section>
  </main>;
}
