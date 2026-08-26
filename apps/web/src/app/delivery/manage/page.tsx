import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
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
  return <main className={styles.page}>
    <SiteHeader compact />
    <section className={`${styles.shell} ${styles.hero}`}>
      <div className={styles.eyebrow}>KONTA MOY · Delivery Manager</div>
      <h1>Fleet Operations</h1>
      <p className={styles.lead}>Operational oversight of the autonomous dispatcher, fleet state, fairness, forecasts, statistics, PDF reporting and dual-control Red Mode. Customer communication remains an Admin authority.</p>
    </section>
    <section className={styles.shell}><DeliveryManagerWorkspaceClient initial={workspace} csrfToken={principal.csrfToken} /></section>
    <section className={styles.shell}><DeliveryManagerStatisticsPanel /></section>
  </main>;
}
