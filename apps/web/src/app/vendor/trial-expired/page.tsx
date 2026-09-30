import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "../../../components/VendorTrial.module.css";
import { getVendorTrialSnapshot } from "../../../lib/vendor-trial-runtime";

export const metadata: Metadata = { title: "Vendor Trial ολοκληρώθηκε", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VendorTrialExpiredPage() {
  const trial = await getVendorTrialSnapshot();
  if (!trial) redirect("/vendor/login");
  if (trial.active) redirect("/vendor/trial");

  return <main className={styles.trialShell}>
    <section className={styles.expired}>
      <div className="eyebrow">KONTA MOY · Vendor Trial</div>
      <h1>Το trial ολοκληρώθηκε. Η δουλειά σου έμεινε.</h1>
      <p className="lead">Δεν διαγράψαμε το storefront, τα προϊόντα ή τις ρυθμίσεις που δημιούργησες. Το workspace παραμένει αποθηκευμένο ενώ η αίτησή σου συνεχίζει τη διαδικασία ενεργοποίησης.</p>
      <div className={styles.metricRow}>
        <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
        <div className={styles.metric}><small>Media</small><strong>{trial.mediaCount}</strong></div>
        <div className={styles.metric}><small>Αίτηση</small><strong>{trial.applicationStatus}</strong></div>
      </div>
      <div className={styles.heroActions}>
        <Link className={styles.heroAction} href="/vendor/preview">Δες το αποθηκευμένο storefront →</Link>
        <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/join">Πληροφορίες συνεργασίας</Link>
      </div>
      <p className={styles.miniNote}>Η πραγματική δημόσια πώληση παραμένει κλειδωμένη μέχρι να ολοκληρωθούν οι έλεγχοι και η ενεργοποίηση συνεργάτη.</p>
    </section>
  </main>;
}
