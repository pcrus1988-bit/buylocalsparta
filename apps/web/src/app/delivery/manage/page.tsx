import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { DeliveryManagerNavigation } from "../../../components/DeliveryManagerNavigation";
import { DeliveryManagerStatisticsPanel } from "../../../components/DeliveryManagerStatisticsPanel";
import { DeliveryManagerWorkspaceClient } from "../../../components/DeliveryManagerWorkspaceClient";
import styles from "../../../components/DeliveryOperations.module.css";
import { deliveryManagerControlWorkspace } from "../../../lib/delivery-control-runtime";
import { getDeliveryManagerSession } from "../../../lib/delivery-manager-session";

export const metadata: Metadata = { title: "Delivery Manager · KONTA MOY", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function DeliveryManagerPage() {
  const principal = await getDeliveryManagerSession();
  if (!principal) redirect("/login?next=/delivery/manage");
  const workspace = await deliveryManagerControlWorkspace(principal);
  return <main className={`${styles.page} ${styles.managerPage}`}>
    <div className={styles.managerSiteHeader}><SiteHeader compact /></div>
    <DeliveryManagerNavigation />
    <section className={`${styles.shell} ${styles.hero} ${styles.managerHero}`}>
      <div className={styles.eyebrow}>KONTA MOY · Delivery Manager</div>
      <h1>Fleet Operations</h1>
      <p className={styles.lead}>Ένα operational cockpit για live στόλο, autonomous dispatch, fairness, exceptions, forecasts, στατιστικά και PDF reporting.</p>
      <div className={styles.managerHeroChips}><span>Live fleet</span><span>Payment-safe dispatch</span><span>QR / GPS evidence</span><span>PDF reporting</span></div>
    </section>
    <section className={styles.shell}><DeliveryManagerWorkspaceClient initial={workspace} csrfToken={principal.csrfToken} /></section>
    <section className={styles.shell}><DeliveryManagerStatisticsPanel /></section>
  </main>;
}
