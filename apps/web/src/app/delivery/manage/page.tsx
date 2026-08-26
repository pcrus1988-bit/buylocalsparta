import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { DeliveryManagerReportingClient } from "../../../components/DeliveryManagerReportingClient";
import { DeliveryManagerWorkspaceClient } from "../../../components/DeliveryManagerWorkspaceClient";
import styles from "../../../components/DeliveryOperations.module.css";
import { deliveryManagerControlWorkspace } from "../../../lib/delivery-control-runtime";
import { getDeliveryManagerSession } from "../../../lib/delivery-manager-session";
import { deliveryManagerReportingSnapshot } from "../../../lib/delivery-operations-reporting";

export const metadata: Metadata = { title: "Delivery Manager · KONTA MOY", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function DeliveryManagerPage() {
  const principal = await getDeliveryManagerSession();
  if (!principal) redirect("/login?next=/delivery/manage");
  const [workspace, reporting] = await Promise.all([
    deliveryManagerControlWorkspace(principal),
    deliveryManagerReportingSnapshot(principal, 30),
  ]);
  return <main className={styles.page}>
    <SiteHeader compact />
    <section className={`${styles.shell} ${styles.hero}`}>
      <div className={styles.eyebrow}>KONTA MOY · Delivery Manager</div>
      <h1>Fleet Operations</h1>
      <p className={styles.lead}>Operational oversight of the autonomous dispatcher, fleet state, fairness, forecasts, timekeeping, reporting and dual-control Red Mode. Customer communication remains an Admin authority.</p>
    </section>
    <section className={styles.shell}><DeliveryManagerWorkspaceClient initial={workspace} csrfToken={principal.csrfToken} /></section>
    <section className={styles.shell}><DeliveryManagerReportingClient initial={reporting} csrfToken={principal.csrfToken} /></section>
  </main>;
}
