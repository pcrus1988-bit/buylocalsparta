import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorStorefrontBuilder } from "../../../components/VendorStorefrontBuilder";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import styles from "../../../components/VendorTrial.module.css";
import { vendorStorefrontWorkspace } from "../../../lib/vendor-storefront-settings";
import { getVendorSession } from "../../../lib/vendor-session";
import { getVendorTrialSnapshot, isVendorTrialPrincipal } from "../../../lib/vendor-trial-runtime";

export const metadata: Metadata = { title: "3ήμερο Vendor Trial", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VendorTrialPage() {
  const principal = await getVendorSession();
  const trial = await getVendorTrialSnapshot();
  if (!trial) redirect("/vendor/login");
  if (!trial.active) redirect("/vendor/trial-expired");
  if (!principal || !isVendorTrialPrincipal(principal)) redirect("/vendor");

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

  const steps = [
    {
      number: 1,
      title: "Welcome & safety",
      text: "Τι μπορείς να κάνεις στο trial και τι παραμένει κλειδωμένο πριν την ενεργοποίηση.",
      href: "#trial-safety",
      status: "done"
    },
    {
      number: 2,
      title: "Business profile",
      text: "Ιστορία, σύντομη περιγραφή και ταυτότητα του καταστήματός σου.",
      href: "#storefront-builder",
      status: brandDone ? "done" : "todo"
    },
    {
      number: 3,
      title: "Storefront design",
      text: "Χρώμα, hero, ενότητες, logo και εικόνες.",
      href: "/vendor/storefront",
      status: storefrontDone ? "done" : "todo"
    },
    {
      number: 4,
      title: "Products",
      text: trial.productCount ? `${trial.productCount} προϊόντα ήδη στο ιδιωτικό workspace.` : "Πρόσθεσε τα πρώτα πραγματικά προϊόντα σου.",
      href: "/vendor/catalog",
      status: productsDone ? "done" : "todo"
    },
    {
      number: 5,
      title: "Orders",
      text: "Δες πώς εμφανίζεται μία παραγγελία και ποια είναι τα επόμενα operational βήματα.",
      href: "/vendor/orders",
      status: "explore"
    },
    {
      number: 6,
      title: "Pickup & delivery",
      text: "Γνώρισε αποστολές, παραλαβές, handover και επιστροφές.",
      href: "/vendor/shipping",
      status: "explore"
    },
    {
      number: 7,
      title: "KONTA MOY Daily",
      text: "Το γρήγορο καθημερινό εργαλείο για την ομάδα του καταστήματος.",
      href: "/daily",
      status: "explore"
    },
    {
      number: 8,
      title: "Payments & finance",
      text: "Κατανόησε παραστατικά, settlements και την εμπορική ροή χωρίς πραγματικές χρεώσεις στο trial.",
      href: "/vendor/finance",
      status: "explore"
    },
    {
      number: 9,
      title: "Private preview",
      text: "Δες το κατάστημά σου όπως θα παρουσιαστεί στον πελάτη, χωρίς δημόσια δημοσίευση.",
      href: "/vendor/preview",
      status: "explore"
    },
    {
      number: 10,
      title: "Activation path",
      text: "Δες τι ακολουθεί μετά το trial και ποια gates ολοκληρώνονται πριν το go-live.",
      href: "#activation",
      status: "explore"
    }
  ] as const;

  const recommendedStepNumber = !brandDone ? 2 : !storefrontDone ? 3 : !productsDone ? 4 : 7;
  const recommendedStep = steps.find((step) => step.number === recommendedStepNumber) ?? steps[0];

  const tour = [
    {
      eyebrow: "Orders",
      title: "Από νέα παραγγελία σε ολοκλήρωση",
      text: "Το workspace συγκεντρώνει αποδοχή, picking, προετοιμασία και επόμενη ενέργεια. Στο trial το βλέπεις χωρίς να δημιουργούνται πραγματικές εμπορικές υποχρεώσεις.",
      href: "/vendor/orders",
      action: "Άνοιξε Orders"
    },
    {
      eyebrow: "Pickup & delivery",
      title: "Πώς φεύγει ή παραδίδεται μία παραγγελία",
      text: "Δες shipping, handover, pickup scan και returns. Οι πραγματικές αποστολές παραμένουν κλειδωμένες έως την ενεργοποίηση.",
      href: "/vendor/shipping",
      action: "Εξερεύνησε Delivery"
    },
    {
      eyebrow: "Daily",
      title: "Το εργαλείο της καθημερινής βάρδιας",
      text: "Το KONTA MOY Daily είναι η γρήγορη επιφάνεια για ό,τι χρειάζεται άμεση ενέργεια μέσα στη μέρα.",
      href: "/daily",
      action: "Άνοιξε Daily"
    },
    {
      eyebrow: "Customers",
      title: "Συμβουλή και επικοινωνία",
      text: "Γνώρισε το inbox για αιτήματα, Ask Local και υποστήριξη πριν την αγορά.",
      href: "/vendor/advice",
      action: "Δες Customer tools"
    },
    {
      eyebrow: "Finance",
      title: "Πώς θα λειτουργούν τα χρήματα μετά το go-live",
      text: "Δες τον κύκλο παραστατικού, ελέγχου και settlement. Το trial δεν μετακινεί χρήματα και δεν ενεργοποιεί πραγματική χρέωση.",
      href: "/vendor/finance",
      action: "Άνοιξε Finance"
    },
    {
      eyebrow: "Analytics",
      title: "Τι θα μπορείς να μετράς",
      text: "Η περιοχή Analytics δείχνει την απόδοση του δικού σου vendor scope όταν αρχίσει να υπάρχει πραγματική εμπορική δραστηριότητα.",
      href: "/vendor/analytics",
      action: "Δες Analytics"
    }
  ] as const;

  return <>
    <VendorWorkspaceHeader />
    <main className={styles.trialShell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.trialBadge}>✦ Full Vendor Trial · 3 ημέρες</span>
            <h1>Χτίσε το πραγματικό μελλοντικό κατάστημά σου και μάθε το workspace καθώς το χρησιμοποιείς.</h1>
            <p>Το Wizard είναι ταυτόχρονα setup και walkthrough: οι αλλαγές σου αποθηκεύονται πραγματικά στο vendor workspace, ενώ οι επεξηγηματικές στάσεις σου δείχνουν τι κάνει κάθε εργαλείο. Το trial παραμένει ιδιωτικό και δεν μπορεί να δεχτεί πραγματικές παραγγελίες ή πληρωμές πριν ολοκληρωθεί η ενεργοποίηση.</p>
          </div>
          <div className={styles.countdown}>
            <small>Χρόνος trial που απομένει</small>
            <strong>{remainingLabel}</strong>
            <small>Λήξη {new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(trial.trialExpiresAt))}</small>
          </div>
        </div>
        <div className={styles.progressTrack} aria-label={`Πρόοδος setup ${progress}%`}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        <div className={styles.metricRow}>
          <div className={styles.metric}><small>Real setup goals</small><strong>{completed}/3</strong></div>
          <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
          <div className={styles.metric}><small>Storefront media</small><strong>{trial.mediaCount}</strong></div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href="/vendor/preview">Preview Storefront →</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/catalog">Πρόσθεσε προϊόντα</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor">Άνοιξε Dashboard</Link>
        </div>
      </section>

      <section id="trial-safety" className={styles.safetyGrid} aria-label="Τι επιτρέπεται στο trial">
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μπορείς τώρα</span>
          <h2>Να χτίσεις πραγματικά το workspace</h2>
          <p>Storefront, περιγραφή, προϊόντα και ιδιωτικό preview αποθηκεύονται. Δεν είναι demo clicks που χάνονται όταν τελειώσει το trial.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Παραμένει κλειδωμένο</span>
          <h2>Commerce πριν την ενεργοποίηση</h2>
          <p>Δημόσια πώληση, πραγματικές πληρωμές, order assignment και payouts δεν ενεργοποιούνται από το trial.</p>
        </article>
        <article className={styles.safetyCard}>
          <span className={styles.tourBadge}>Μετά το trial</span>
          <h2>Η δουλειά σου δεν διαγράφεται</h2>
          <p>Το setup μένει αποθηκευμένο όσο συνεχίζεται ο έλεγχος της αίτησης και μπορεί να γίνει live όταν ολοκληρωθούν τα activation gates.</p>
        </article>
      </section>

      <section className={styles.nextStep} aria-labelledby="trial-next-step-title">
        <div>
          <span className={styles.nextStepEyebrow}>Συνέχισε από εδώ · Βήμα {recommendedStep.number} από 10</span>
          <h2 id="trial-next-step-title">{recommendedStep.title}</h2>
          <p>{recommendedStep.text}</p>
        </div>
        <Link className={styles.nextStepAction} href={recommendedStep.href}>Συνέχισε →</Link>
      </section>

      <nav className={styles.steps} aria-label="Trial setup wizard">
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

      <section className={styles.guideTour} aria-labelledby="trial-tour-title">
        <div className={styles.tourHeading}>
          <div>
            <span className={styles.nextStepEyebrow}>Guided walkthrough</span>
            <h2 id="trial-tour-title">Μάθε τα εργαλεία χρησιμοποιώντας τα</h2>
          </div>
          <p>Οι παρακάτω στάσεις είναι explanatory: σε πηγαίνουν στην πραγματική περιοχή του Vendor Workspace και εξηγούν τι θα κάνεις εκεί όταν το κατάστημα ενεργοποιηθεί.</p>
        </div>
        <div className={styles.tourGrid}>
          {tour.map((item) => <article className={styles.tourCard} key={item.title}>
            <span className={styles.tourBadge}>{item.eyebrow}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <Link href={item.href}>{item.action} →</Link>
          </article>)}
        </div>
      </section>

      <section id="storefront-builder" className={styles.builderSection}>
        <div className={styles.tourHeading}>
          <div>
            <span className={styles.nextStepEyebrow}>Hands-on setup</span>
            <h2>Business profile & storefront</h2>
          </div>
          <p>Αποθήκευσε αλλαγές εδώ και το setup progress ενημερώνεται από τα πραγματικά persisted δεδομένα του vendor σου.</p>
        </div>
        <VendorStorefrontBuilder initial={storefront} csrfToken={principal.csrfToken} productCount={trial.productCount} />
      </section>

      <section id="activation" className={styles.activationPanel}>
        <div>
          <span className={styles.nextStepEyebrow}>Activation path</span>
          <h2>Τι συμβαίνει όταν τελειώσει το trial</h2>
          <p>Το trial δεν είναι το approval. Η αίτηση συνεχίζει στη governed διαδικασία ενεργοποίησης και το setup που έκανες παραμένει αποθηκευμένο.</p>
        </div>
        <div className={styles.activationSteps}>
          <div><strong>1</strong><span><b>Ownership & contact verification</b><small>Επιβεβαίωση εκπροσώπησης και στοιχείων επικοινωνίας.</small></span></div>
          <div><strong>2</strong><span><b>Catalogue readiness</b><small>Έλεγχος προϊόντων, ταυτότητας, τιμών, stock και απαιτούμενων media.</small></span></div>
          <div><strong>3</strong><span><b>Operational readiness</b><small>Έλεγχος flows παραγγελιών, fulfilment και υποχρεωτικών ρυθμίσεων.</small></span></div>
          <div><strong>4</strong><span><b>Admin activation</b><small>Μόνο τότε ανοίγουν δημόσια εμφάνιση και πραγματική εμπορική λειτουργία.</small></span></div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href="/vendor">Vendor Dashboard →</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/preview">Private Preview</Link>
        </div>
      </section>

      <Link className={styles.floatingPreview} href="/vendor/preview">◫ Preview Storefront</Link>
    </main>
  </>;
}
