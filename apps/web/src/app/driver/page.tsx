import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeliveryDriverWorkspaceClient } from "../../components/DeliveryDriverWorkspaceClient";
import styles from "../../components/DeliveryOperations.module.css";
import { deliveryDriverDispatchWorkspace } from "../../lib/delivery-dispatch-runtime";
import { getDeliveryDriverSession } from "../../lib/delivery-driver-session";

export const metadata: Metadata = { title: "Driver · KONTA MOY", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const principal = await getDeliveryDriverSession();
  if (!principal) redirect("/driver/login");
  const workspace = await deliveryDriverDispatchWorkspace(principal);
  return <main className={styles.page}>
    <section className={`${styles.shell} ${styles.hero}`}>
      <div className={styles.eyebrow}>KONTA MOY · Delivery Driver</div>
      <h1>Γεια σου, {principal.displayName}</h1>
      <p className={styles.lead}>{principal.partnerName} · αυτόματες αναθέσεις, παραλαβές, παραδόσεις, επιστροφές και live tracking.</p>
      <form method="post" action="/api/driver/logout"><button className={styles.buttonSecondary} type="submit">Αποσύνδεση</button></form>
    </section>
    <section className={styles.shell}><DeliveryDriverWorkspaceClient initial={workspace}/></section>
  </main>;
}
