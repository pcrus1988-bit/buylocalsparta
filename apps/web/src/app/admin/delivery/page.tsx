import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDeliveryWorkspaceClient } from "../../../components/AdminDeliveryWorkspaceClient";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import styles from "../../../components/DeliveryOperations.module.css";
import { deliveryAdminWorkspace } from "../../../lib/delivery-driver-runtime";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
export const metadata: Metadata={title:"Admin · Delivery",robots:{index:false,follow:false,nocache:true}};export const dynamic="force-dynamic";
export default async function AdminDeliveryPage(){const principal=await getAdminSession();if(!principal)redirect("/admin/login");if(!hasAdminPermission(principal,"fulfilment.write"))redirect("/admin");const workspace=await deliveryAdminWorkspace(principal);return <main className="vendor-app admin-app"><AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Delivery"/><section className={`${styles.shell} ${styles.hero}`}><div className={styles.eyebrow}>Operations · Local Delivery</div><h1>Delivery Control Centre</h1><p className={styles.lead}>Δημιουργία λογαριασμών οδηγών, dispatch, multi-stop order/return jobs, QR custody proofs και live GPS.</p></section><section className={styles.shell}><AdminDeliveryWorkspaceClient initial={{drivers:workspace.drivers,jobs:workspace.jobs}} csrfToken={principal.csrfToken}/></section></main>;}
