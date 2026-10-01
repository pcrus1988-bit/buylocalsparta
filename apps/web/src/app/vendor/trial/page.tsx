import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import styles from "../../../components/VendorTrial.module.css";
import { getVendorSession } from "../../../lib/vendor-session";
import { getVendorTrialSnapshot, getVendorTrialSnapshotForPrincipal, isVendorTrialPrincipal } from "../../../lib/vendor-trial-runtime";

export const metadata: Metadata = { title: "3ήμερη δοκιμή συνεργάτη", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VendorTrialPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login?next=/vendor/trial");
  const trial = isVendorTrialPrincipal(principal)
    ? await getVendorTrialSnapshot()
    : await getVendorTrialSnapshotForPrincipal(principal);
  if (!trial) redirect("/vendor");
  if (!trial.active) redirect("/vendor/trial-expired");

  const profileDone = trial.brandConfigured && trial.storefrontConfigured;
  const productsDone = trial.productCount > 0;
  const completed = [profileDone, productsDone].filter(Boolean).length;
  const progress = Math.round((completed / 2) * 100);
  const remainingMs = Math.max(0, trial.trialExpiresAt - Date.now());
  const remainingHours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  const remainingLabel = remainingHours >= 24 ? `${Math.ceil(remainingHours / 24)} ημέρες` : `${remainingHours} ώρες`;

  const steps = [
    {
      number: 1,
      title: "Προφίλ καταστήματος",
      text: profileDone ? "Το βασικό προφίλ είναι έτοιμο." : "Πρόσθεσε περιγραφή, λογότυπο και βασικές εικόνες.",
      href: "/vendor/storefront",
      status: profileDone ? "done" : "todo"
    },
    {
      number: 2,
      title: "Πρώτα προϊόντα",
      text: productsDone ? `${trial.productCount} προϊόντα έχουν ήδη προστεθεί.` : "Πρόσθεσε τα πρώτα πραγματικά προϊόντα σου.",
      href: "/vendor/catalog",
      status: productsDone ? "done" : "todo"
    },
    {
      number: 3,
      title: "Προεπισκόπηση",
      text: "Δες το κατάστημά σου όπως θα παρουσιαστεί στον πελάτη.",
      href: "/vendor/preview",
      status: "explore"
    }
  ] as const;

  const recommendedStepNumber = !profileDone ? 1 : !productsDone ? 2 : 3;
  const recommendedStep = steps.find((step) => step.number === recommendedStepNumber) ?? steps[0];

  return <>
    <VendorWorkspaceHeader />
    <main className="vendor-app"><div className={styles.trialShell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.trialBadge}>✦ 3ήμερη δοκιμή</span>
            <h1>Ετοίμασε το κατάστημά σου σε 3 απλά βήματα.</h1>
            <p>Δεν χρειάζεται να ρυθμίσεις τα πάντα τώρα. Ολοκλήρωσε το προφίλ, πρόσθεσε προϊόντα και έλεγξε την προεπισκόπηση. Ό,τι αποθηκεύεις παραμένει στο κατάστημά σου.</p>
          </div>
          <div className={styles.countdown}>
            <small>Χρόνος δοκιμής που απομένει</small>
            <strong>{remainingLabel}</strong>
            <small>Λήξη {new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(trial.trialExpiresAt))}</small>
          </div>
        </div>

        <div className={styles.progressTrack} aria-label={`Πρόοδος προετοιμασίας ${progress}%`}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        <div className={styles.metricRow}>
          <div className={styles.metric}><small>Βασικά βήματα</small><strong>{completed}/2</strong></div>
          <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
          <div className={styles.metric}><small>Αρχεία</small><strong>{trial.mediaCount}</strong></div>
        </div>

        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href={recommendedStep.href}>Συνέχισε από το επόμενο βήμα →</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/preview">Προεπισκόπηση</Link>
        </div>
      </section>

      <section className={styles.nextStep} aria-labelledby="trial-next-step-title">
        <div>
          <span className={styles.nextStepEyebrow}>Επόμενο · Βήμα {recommendedStep.number} από 3</span>
          <h2 id="trial-next-step-title">{recommendedStep.title}</h2>
          <p>{recommendedStep.text}</p>
        </div>
        <Link className={styles.nextStepAction} href={recommendedStep.href}>Άνοιγμα →</Link>
      </section>

      <nav className={styles.steps} aria-label="Οδηγός προετοιμασίας">
        {steps.map((step) => <Link
          key={step.number}
          href={step.href}
          aria-current={step.number === recommendedStep.number ? "step" : undefined}
          className={`${styles.stepCard} ${step.status === "done" ? styles.stepDone : ""} ${step.number === recommendedStep.number ? styles.stepCurrent : ""}`}
        >
          <span className={styles.stepNumber}>{step.status === "done" ? "✓" : step.status === "explore" ? "↗" : step.number}</span>
          <strong>{step.title}</strong>
          <span>{step.text}</span>
        </Link>)}
      </nav>

      <section id="trial-safety" className={styles.safetyGrid} aria-label="Τι ισχύει στη δοκιμή">
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μπορείς τώρα</span>
          <h2>Να ετοιμάσεις πραγματικά το κατάστημά σου</h2>
          <p>Προφίλ, εικόνες και προϊόντα αποθηκεύονται κανονικά και δεν χρειάζεται να τα ξαναφτιάξεις αργότερα.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Παραμένει κλειδωμένο</span>
          <h2>Πωλήσεις πριν την ενεργοποίηση</h2>
          <p>Δημόσιες πωλήσεις και πραγματικές πληρωμές δεν ενεργοποιούνται κατά τη δοκιμή.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μετά τη δοκιμή</span>
          <h2>Η δουλειά σου παραμένει αποθηκευμένη</h2>
          <p>Η αίτηση συνεχίζει στον απαραίτητο έλεγχο χωρίς να χαθούν οι ρυθμίσεις που έκανες.</p>
        </article>
      </section>

      <details className={styles.optionalTour}>
        <summary>Δες τι άλλο θα έχεις διαθέσιμο μετά την ενεργοποίηση</summary>
        <div className={styles.tourGrid}>
          <article className={styles.tourCard}><span className={styles.tourBadge}>Παραγγελίες</span><h3>Καθημερινή διαχείριση</h3><p>Αποδοχή, προετοιμασία, αποστολή ή παραλαβή από ένα σημείο.</p><Link href="/vendor/orders">Άνοιγμα παραγγελιών →</Link></article>
          <article className={styles.tourCard}><span className={styles.tourBadge}>Daily</span><h3>KONTA MOY Daily</h3><p>Η γρήγορη επιφάνεια για τις καθημερινές ενέργειες της ομάδας σου.</p><Link href="/daily">Άνοιγμα Daily →</Link></article>
          <article className={styles.tourCard}><span className={styles.tourBadge}>Οικονομικά</span><h3>Πληρωμές & παραστατικά</h3><p>Παρακολούθηση παραστατικών, εκκαθαρίσεων και πληρωμών.</p><Link href="/vendor/finance">Άνοιγμα οικονομικών →</Link></article>
        </div>
      </details>

      <section id="activation" className={styles.activationPanel}>
        <div>
          <span className={styles.nextStepEyebrow}>Όταν ολοκληρώσεις</span>
          <h2>Τι συμβαίνει πριν ανοίξουν οι πωλήσεις</h2>
          <p>Το ΚΟΝΤΑ ΜΟΥ ελέγχει τα απαραίτητα στοιχεία επιχείρησης, τον κατάλογο και τις βασικές ρυθμίσεις λειτουργίας. Δεν χρειάζεται να κάνεις κάτι επιπλέον αν δεν σου ζητηθεί.</p>
        </div>
        <div className={styles.activationSteps}>
          <div><strong>1</strong><span><b>Έλεγχος επιχείρησης</b><small>Επιβεβαίωση εκπροσώπησης και στοιχείων επικοινωνίας.</small></span></div>
          <div><strong>2</strong><span><b>Έλεγχος καταλόγου</b><small>Προϊόντα, τιμές, απόθεμα και απαραίτητες εικόνες.</small></span></div>
          <div><strong>3</strong><span><b>Ενεργοποίηση</b><small>Ανοίγουν η δημόσια εμφάνιση και οι πραγματικές πωλήσεις.</small></span></div>
        </div>
      </section>

      <Link className={styles.floatingPreview} href="/vendor/preview">◫ Προεπισκόπηση</Link>
    </div></main>
  </>;
}
