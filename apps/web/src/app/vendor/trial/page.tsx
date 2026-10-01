import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorStorefrontBuilder } from "../../../components/VendorStorefrontBuilder";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import styles from "../../../components/VendorTrial.module.css";
import { vendorStorefrontWorkspace } from "../../../lib/vendor-storefront-settings";
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

  const storefront = await vendorStorefrontWorkspace(principal);
  const brandDone = trial.brandConfigured;
  const storefrontDone = trial.storefrontConfigured;
  const productsDone = trial.productCount > 0;
  const completed = [brandDone, storefrontDone, productsDone].filter(Boolean).length;
  const progress = Math.round((completed / 3) * 100);
  const remainingMs = Math.max(0, trial.trialExpiresAt - Date.now());
  const remainingHours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  const remainingLabel = remainingHours >= 24
    ? `${Math.ceil(remainingHours / 24)} ημέρες`
    : `${remainingHours} ώρες`;

  const profileDone = brandDone && storefrontDone;
  const steps = [
    {
      number: 1,
      title: "Προφίλ καταστήματος",
      text: "Συμπλήρωσε την περιγραφή, την εμφάνιση, το λογότυπο και τις βασικές εικόνες.",
      href: "#storefront-builder",
      status: profileDone ? "done" : "todo"
    },
    {
      number: 2,
      title: "Πρώτα προϊόντα",
      text: trial.productCount ? `${trial.productCount} προϊόντα έχουν ήδη προστεθεί.` : "Πρόσθεσε τα πρώτα πραγματικά προϊόντα σου.",
      href: "/vendor/catalog",
      status: productsDone ? "done" : "todo"
    },
    {
      number: 3,
      title: "Προεπισκόπηση",
      text: "Δες το κατάστημά σου όπως θα παρουσιαστεί στον πελάτη.",
      href: "/vendor/preview",
      status: "explore"
    },
    {
      number: 4,
      title: "Τι ακολουθεί",
      text: "Δες τα τελευταία βήματα πριν από την ενεργοποίηση.",
      href: "#activation",
      status: "explore"
    }
  ] as const;

  const recommendedStepNumber = !profileDone ? 1 : !productsDone ? 2 : 3;
  const recommendedStep = steps.find((step) => step.number === recommendedStepNumber) ?? steps[0];

  const tour = [
    {
      eyebrow: "Παραγγελίες",
      title: "Διαχείριση παραγγελιών",
      text: "Όταν ξεκινήσουν οι πωλήσεις, εδώ θα βλέπεις τι χρειάζεται αποδοχή, προετοιμασία ή παράδοση.",
      href: "/vendor/orders",
      action: "Δες τις παραγγελίες"
    },
    {
      eyebrow: "Καθημερινά",
      title: "KONTA MOY Daily",
      text: "Η γρήγορη επιφάνεια για τις καθημερινές ενέργειες της ομάδας σου.",
      href: "/daily",
      action: "Άνοιξε το Daily"
    },
    {
      eyebrow: "Οικονομικά",
      title: "Πληρωμές & παραστατικά",
      text: "Δες πώς οργανώνονται τα παραστατικά και οι πληρωμές μετά την ενεργοποίηση.",
      href: "/vendor/finance",
      action: "Δες τα οικονομικά"
    },
    {
      eyebrow: "Απόδοση",
      title: "Στατιστικά",
      text: "Παρακολούθησε πωλήσεις και απόδοση όταν υπάρχει πραγματική εμπορική δραστηριότητα.",
      href: "/vendor/analytics",
      action: "Δες τα στατιστικά"
    }
  ] as const;

  return <>
    <VendorWorkspaceHeader />
    <main className="vendor-app"><div className={styles.trialShell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.trialBadge}>✦ 3ήμερη δοκιμή</span>
            <h1>Στήσε το κατάστημά σου σε λίγα βήματα.</h1>
            <p>Ξεκίνα μόνο από τα βασικά. Ό,τι αποθηκεύεις εδώ παραμένει στο κατάστημά σου. Οι πραγματικές πωλήσεις και πληρωμές μένουν κλειδωμένες μέχρι την ενεργοποίηση.</p>
          </div>
          <div className={styles.countdown}>
            <small>Χρόνος δοκιμής που απομένει</small>
            <strong>{remainingLabel}</strong>
            <small>Λήξη {new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(trial.trialExpiresAt))}</small>
          </div>
        </div>
        <div className={styles.progressTrack} aria-label={`Πρόοδος προετοιμασίας ${progress}%`}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        <div className={styles.metricRow}>
          <div className={styles.metric}><small>Βασικές ρυθμίσεις</small><strong>{completed}/3</strong></div>
          <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
          <div className={styles.metric}><small>Αρχεία</small><strong>{trial.mediaCount}</strong></div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href={recommendedStep.href}>Συνέχισε το βήμα {recommendedStep.number} →</Link>
          {recommendedStep.number !== 3 && <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/preview">Προεπισκόπηση</Link>}
        </div>
      </section>

      <section className={styles.nextStep} aria-labelledby="trial-next-step-title">
        <div>
          <span className={styles.nextStepEyebrow}>Συνέχισε από εδώ · Βήμα {recommendedStep.number} από 4</span>
          <h2 id="trial-next-step-title">{recommendedStep.title}</h2>
          <p>{recommendedStep.text}</p>
        </div>
        <Link className={styles.nextStepAction} href={recommendedStep.href}>Συνέχισε →</Link>
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

      <section id="trial-safety" className={styles.safetyGrid} aria-label="Τι επιτρέπεται στη δοκιμή">
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μπορείς τώρα</span>
          <h2>Να προετοιμάσεις το κατάστημά σου</h2>
          <p>Η περιγραφή, η εμφάνιση, τα προϊόντα και η προεπισκόπηση αποθηκεύονται και παραμένουν διαθέσιμα.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Παραμένει κλειδωμένο</span>
          <h2>Πωλήσεις πριν την ενεργοποίηση</h2>
          <p>Δημόσιες πωλήσεις, πραγματικές πληρωμές και εκκαθαρίσεις δεν ενεργοποιούνται από τη δοκιμή.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μετά τη δοκιμή</span>
          <h2>Η δουλειά σου δεν διαγράφεται</h2>
          <p>Οι ρυθμίσεις μένουν αποθηκευμένες όσο συνεχίζεται ο έλεγχος της αίτησης και μπορούν να ενεργοποιηθούν όταν ολοκληρωθούν οι απαραίτητοι έλεγχοι.</p>
        </article>
      </section>

      <details className={styles.guideTour}>
        <summary className={styles.tourDisclosureSummary}>
          <span>
            <span className={styles.nextStepEyebrow}>Προαιρετικά</span>
            <strong>Δες και τις υπόλοιπες ενότητες</strong>
          </span>
          <small>Δεν χρειάζονται για να ολοκληρώσεις την αρχική προετοιμασία.</small>
        </summary>
        <div className={styles.tourGrid}>
          {tour.map((item) => <article className={styles.tourCard} key={item.title}>
            <span className={styles.tourBadge}>{item.eyebrow}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <Link href={item.href}>{item.action} →</Link>
          </article>)}
        </div>
      </details>

      <section id="storefront-builder" className={styles.builderSection}>
        <div className={styles.tourHeading}>
          <div>
            <span className={styles.nextStepEyebrow}>Βασική προετοιμασία</span>
            <h2>Προφίλ & εμφάνιση καταστήματος</h2>
          </div>
          <p>Αποθήκευσε τις αλλαγές σου εδώ. Η πρόοδος ενημερώνεται αυτόματα.</p>
        </div>
        <VendorStorefrontBuilder initial={storefront} csrfToken={principal.csrfToken} productCount={trial.productCount} />
      </section>

      <section id="activation" className={styles.activationPanel}>
        <div>
          <span className={styles.nextStepEyebrow}>Επόμενα βήματα</span>
          <h2>Τι συμβαίνει όταν τελειώσει η δοκιμή</h2>
          <p>Η δοκιμή δεν αποτελεί τελική ενεργοποίηση. Η αίτησή σου συνεχίζει στον απαραίτητο έλεγχο και ό,τι έχεις ετοιμάσει παραμένει αποθηκευμένο.</p>
        </div>
        <div className={styles.activationSteps}>
          <div><strong>1</strong><span><b>Επιβεβαίωση επιχείρησης</b><small>Έλεγχος εκπροσώπησης και στοιχείων επικοινωνίας.</small></span></div>
          <div><strong>2</strong><span><b>Έλεγχος καταλόγου</b><small>Έλεγχος προϊόντων, τιμών, αποθέματος και απαραίτητων εικόνων.</small></span></div>
          <div><strong>3</strong><span><b>Λειτουργικός έλεγχος</b><small>Έλεγχος των απαραίτητων ρυθμίσεων για παραγγελίες και παράδοση.</small></span></div>
          <div><strong>4</strong><span><b>Ενεργοποίηση</b><small>Τότε ανοίγουν η δημόσια εμφάνιση και η πραγματική εμπορική λειτουργία.</small></span></div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href="/vendor">Αρχική συνεργάτη →</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/preview">Προεπισκόπηση</Link>
        </div>
      </section>

      <Link className={styles.floatingPreview} href="/vendor/preview">◫ Προεπισκόπηση</Link>
    </div></main>
  </>;
}
