import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "../../../components/VendorTrial.module.css";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { getVendorTrialSnapshot, getVendorTrialSnapshotForPrincipal, isVendorTrialPrincipal } from "../../../lib/vendor-trial-runtime";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Η δοκιμή συνεργάτη ολοκληρώθηκε", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function applicationStatusLabel(status: string): string {
  const labels: Record<string, string> = { onboarding: "Σε προετοιμασία", pending: "Σε αναμονή", submitted: "Υποβλήθηκε", approved: "Εγκεκριμένη", rejected: "Χρειάζεται επικοινωνία" };
  return labels[status.toLowerCase()] ?? status;
}

export default async function VendorTrialExpiredPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login?next=/vendor/trial");
  const trial = isVendorTrialPrincipal(principal)
    ? await getVendorTrialSnapshot()
    : await getVendorTrialSnapshotForPrincipal(principal);
  if (!trial) redirect("/vendor");
  if (trial.active) redirect("/vendor/trial");

  return <><VendorWorkspaceHeader /><main className="vendor-app"><div className={styles.trialShell}>
    <section className={styles.expired}>
      <div className="eyebrow">KONTA MOY · Δοκιμή συνεργάτη</div>
      <h1>Η δοκιμή ολοκληρώθηκε. Η δουλειά σου έχει αποθηκευτεί.</h1>
      <p className="lead">Δεν διαγράψαμε το δημόσιο προφίλ, τα προϊόντα ή τις ρυθμίσεις που δημιούργησες. Ο χώρος συνεργάτη παραμένει αποθηκευμένος ενώ η αίτησή σου συνεχίζει τη διαδικασία ενεργοποίησης.</p>
      <div className={styles.metricRow}>
        <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
        <div className={styles.metric}><small>Αρχεία</small><strong>{trial.mediaCount}</strong></div>
        <div className={styles.metric}><small>Αίτηση</small><strong>{applicationStatusLabel(trial.applicationStatus)}</strong></div>
      </div>
      <div className={styles.heroActions}>
        <Link className={styles.heroAction} href="/vendor/preview">Δες την αποθηκευμένη προεπισκόπηση →</Link>
        <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/join">Πληροφορίες συνεργασίας</Link>
      </div>
      <p className={styles.miniNote}>Η πραγματική δημόσια πώληση παραμένει κλειδωμένη μέχρι να ολοκληρωθούν οι έλεγχοι και η ενεργοποίηση συνεργάτη.</p>
    </section>
  </div></main></>;
}
