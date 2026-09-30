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

  const brandDone = Boolean(storefront.shortDescription || storefront.story);
  const storefrontDone = trial.mediaCount > 0
    || storefront.settings.heroTitle.trim() !== trial.vendorName.trim()
    || storefront.settings.accentColor.toLowerCase() !== "#0f766e"
    || storefront.settings.heroStyle !== "split";
  const productsDone = trial.productCount > 0;
  const completed = [brandDone, storefrontDone, productsDone].filter(Boolean).length;
  const progress = Math.round((completed / 3) * 100);
  const remainingMs = Math.max(0, trial.trialExpiresAt - Date.now());
  const remainingHours = Math.max(1, Math.ceil(remainingMs / 3_600_000));
  const remainingLabel = remainingHours >= 24
    ? `${Math.ceil(remainingHours / 24)} ημέρες`
    : `${remainingHours} ώρες`;

  const steps = [
    { number: 1, title: "Brand", text: "Ιστορία, περιγραφή και η ταυτότητα του καταστήματός σου.", href: "#storefront-builder", status: brandDone ? "done" : "todo" },
    { number: 2, title: "Storefront", text: "Χρώμα, hero, ενότητες, logo και εικόνες.", href: "/vendor/storefront", status: storefrontDone ? "done" : "todo" },
    { number: 3, title: "Products", text: trial.productCount ? `${trial.productCount} προϊόντα ήδη στο workspace.` : "Πρόσθεσε τα πρώτα πραγματικά προϊόντα σου.", href: "/vendor/catalog", status: productsDone ? "done" : "todo" },
    { number: 4, title: "Operations", text: "Εξερεύνησε παραγγελίες, stock, pickup, delivery και τα καθημερινά εργαλεία.", href: "/daily", status: "explore" },
    { number: 5, title: "Private Preview", text: "Δες το κατάστημά σου όπως θα το δει ο πελάτης, χωρίς δημόσια δημοσίευση.", href: "/vendor/preview", status: "explore" }
  ] as const;
  const recommendedStepNumber = !brandDone ? 1 : !storefrontDone ? 2 : !productsDone ? 3 : 4;
  const recommendedStep = steps[recommendedStepNumber - 1];

  return <>
    <VendorWorkspaceHeader />
    <main className={styles.trialShell}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div>
            <span className={styles.trialBadge}>✦ Full Vendor Trial · 3 ημέρες</span>
            <h1>Το κατάστημά σου είναι ήδη στα χέρια σου.</h1>
            <p>Χρησιμοποίησε το πραγματικό Vendor Dashboard, στήσε το storefront σου, πρόσθεσε προϊόντα και εξερεύνησε τα εργαλεία. Το trial είναι ιδιωτικό: δεν μπορεί να δεχτεί πραγματικές παραγγελίες ή πληρωμές πριν ολοκληρωθεί η ενεργοποίηση.</p>
          </div>
          <div className={styles.countdown}><small>Χρόνος trial που απομένει</small><strong>{remainingLabel}</strong><small>Λήξη {new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(trial.trialExpiresAt))}</small></div>
        </div>
        <div className={styles.progressTrack} aria-label={`Πρόοδος setup ${progress}%`}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        <div className={styles.metricRow}>
          <div className={styles.metric}><small>Setup</small><strong>{progress}%</strong></div>
          <div className={styles.metric}><small>Προϊόντα</small><strong>{trial.productCount}</strong></div>
          <div className={styles.metric}><small>Storefront media</small><strong>{trial.mediaCount}</strong></div>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.heroAction} href="/vendor/preview">Preview Storefront →</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor/catalog">Πρόσθεσε προϊόντα</Link>
          <Link className={`${styles.heroAction} ${styles.heroActionGhost}`} href="/vendor">Άνοιξε Dashboard</Link>
        </div>
      </section>

      <section className={styles.nextStep} aria-labelledby="trial-next-step-title">
        <div>
          <span className={styles.nextStepEyebrow}>Συνέχισε από εδώ · Βήμα {recommendedStep.number} από 5</span>
          <h2 id="trial-next-step-title">{recommendedStep.title}</h2>
          <p>{recommendedStep.text}</p>
        </div>
        <Link className={styles.nextStepAction} href={recommendedStep.href}>
          {recommendedStep.number <= 3 ? "Συνέχισε το setup" : "Εξερεύνησε το Daily"} →
        </Link>
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

      <div id="storefront-builder">
        <VendorStorefrontBuilder initial={storefront} csrfToken={principal.csrfToken} productCount={trial.productCount} />
      </div>
      <Link className={styles.floatingPreview} href="/vendor/preview">◫ Preview Storefront</Link>
    </main>
  </>;
}
