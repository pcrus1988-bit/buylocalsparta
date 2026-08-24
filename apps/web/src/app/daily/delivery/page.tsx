import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorDeliveryWorkspaceClient } from "../../../components/VendorDeliveryWorkspaceClient";
import styles from "../../../components/DeliveryOperations.module.css";
import { getDailySession } from "../../../lib/daily-session";
import { deliveryVendorWorkspace } from "../../../lib/delivery-driver-runtime";
export const metadata: Metadata={title:"Daily · Delivery",robots:{index:false,follow:false,nocache:true}};export const dynamic="force-dynamic";
export default async function DailyDeliveryPage(){const principal=await getDailySession();if(!principal)redirect("/daily/login");const workspace=await deliveryVendorWorkspace(principal);return <main className={styles.page}><section className={`${styles.shell} ${styles.hero}`}><div className={styles.eyebrow}>Daily · Delivery handovers</div><h1>Παραλαβές & επιστροφές οδηγού</h1><p className={styles.lead}>Επιβεβαίωσε παραλαβές του συνεργαζόμενου delivery και παρουσίασε QR όταν παραλαμβάνεις επιστροφή.</p><Link className={styles.buttonSecondary} href="/daily">← Daily</Link></section><section className={styles.shell}><VendorDeliveryWorkspaceClient jobs={workspace.jobs} csrfToken={principal.csrfToken}/></section></main>;}
