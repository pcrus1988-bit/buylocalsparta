import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "../../../components/SiteHeader";
import { CustomerDeliveryWorkspaceClient } from "../../../components/CustomerDeliveryWorkspaceClient";
import styles from "../../../components/DeliveryOperations.module.css";
import { getAccountSession } from "../../../lib/account-session";
import { deliveryCustomerWorkspace } from "../../../lib/delivery-driver-runtime";
export const metadata: Metadata={title:"Παραδόσεις & επιστροφές",robots:{index:false,follow:false,nocache:true}};export const dynamic="force-dynamic";
export default async function AccountDeliveryPage(){const principal=await getAccountSession();if(!principal)redirect("/login?next=/account/delivery");const workspace=await deliveryCustomerWorkspace(principal);return <main className={styles.page}><SiteHeader compact/><section className={`${styles.shell} ${styles.hero}`}><div className={styles.eyebrow}>Ο λογαριασμός μου · Tracking</div><h1>Παραδόσεις & επιστροφές</h1><p className={styles.lead}>Παρακολούθησε κάθε επιμέρους παραλαβή με timestamp, δες live θέση όταν ο οδηγός την ενεργοποιήσει και παρουσίασε το σωστό QR στην τελική παράδοση.</p><Link className={styles.buttonSecondary} href="/account">← Λογαριασμός</Link></section><section className={styles.shell}><CustomerDeliveryWorkspaceClient initialJobs={workspace.jobs}/></section></main>;}
