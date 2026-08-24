import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDeliveryDriverSession } from "../../../lib/delivery-driver-session";
import styles from "../../../components/DeliveryOperations.module.css";
export const metadata: Metadata={title:"Driver Login · KONTA MOY",robots:{index:false,follow:false,nocache:true}};export const dynamic="force-dynamic";
export default async function DriverLoginPage(){const principal=await getDeliveryDriverSession();if(principal)redirect("/driver");return <main className={styles.login}><section className={styles.loginCard}><div className={styles.eyebrow}>KONTA MOY · Local Delivery</div><h1>Είσοδος οδηγού</h1><p className={styles.muted}>Χρησιμοποίησε τον λογαριασμό που δημιούργησε ο διαχειριστής της πλατφόρμας.</p><form method="post" action="/api/driver/login"><input type="email" name="email" placeholder="Email" autoComplete="username" required/><input type="password" name="password" placeholder="Κωδικός" autoComplete="current-password" minLength={10} required/><button className={styles.button} type="submit">Είσοδος</button></form></section></main>;}
