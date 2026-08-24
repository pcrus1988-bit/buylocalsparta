import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDeliveryWorkspaceClient } from "../../../components/AdminDeliveryWorkspaceClient";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import styles from "../../../components/DeliveryOperations.module.css";
import { deliveryAdminControlWorkspace } from "../../../lib/delivery-control-runtime";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Delivery", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "fulfilment.write")) redirect("/admin");
  const workspace = await deliveryAdminControlWorkspace(principal);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Delivery" />
    <section className={`${styles.shell} ${styles.hero}`}>
      <div className={styles.eyebrow}>Operations · Autonomous Local Delivery</div>
      <h1>Delivery Control Centre</h1>
      <p className={styles.lead}>Live fleet state, algorithmic dispatch decisions, fairness, forecasts, Delivery Managers, Red Mode, QR custody and route oversight.</p>
    </section>
    <section className={styles.shell}><AdminDeliveryWorkspaceClient initial={workspace} csrfToken={principal.csrfToken} /></section>
  </main>;
}
