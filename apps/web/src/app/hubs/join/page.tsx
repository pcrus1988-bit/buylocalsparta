import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { HUB_EXPANSION_PLANS } from "../../../lib/hub-expansion-plans";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/hubs/join", {
    title: "Συμμετοχή στα νέα HUB του ΚΟΝΤΑ ΜΟΥ",
    description: "Ξεκίνα με το ΑΦΜ, επαλήθευσε την επιχείρησή σου μέσω Γ.Ε.ΜΗ., άφησε το ΚΟΝΤΑ ΜΟΥ να εντοπίσει αυτόματα το HUB και σύγκρινε CLAIM, PRESENCE, SHOP, GROWTH και PRO."
  });
}

const steps = [
  ["01", "Βάλε ΑΦΜ", "Ξεκινάς μόνο με το ΑΦΜ της επιχείρησης."],
  ["02", "Γ.Ε.ΜΗ. → HUB", "Ανακτούμε τα δημόσια στοιχεία Γ.Ε.ΜΗ. και αντιστοιχίζουμε αυτόματα την επαληθευμένη τοποθεσία στο σωστό HUB."],
  ["03", "Διάλεξε πρόγραμμα", "Συγκρίνεις καθαρά τι περιλαμβάνει κάθε πλάνο και συμπληρώνεις μόνο ό,τι λείπει."],
  ["04", "Έλεγχος & ενεργοποίηση", "Η αίτηση μένει prospect μέχρι να ολοκληρωθούν verification και εμπορικοί όροι. Δεν γίνεται αυτόματη χρέωση ή ενεργοποίηση."]
] as const;

const featureRows = [
  { label: "Επαληθευμένη καταχώριση", plans: ["claim", "presence", "shop", "growth", "pro"] },
  { label: "Βασικό προφίλ επιχείρησης", plans: ["claim", "presence", "shop", "growth", "pro"] },
  { label: "Πλούσιο προφίλ & media", plans: ["presence", "shop", "growth", "pro"] },
  { label: "Αιτήματα πελατών", plans: ["presence", "shop", "growth", "pro"] },
  { label: "Προϊόντα στο marketplace", plans: ["shop", "growth", "pro"] },
  { label: "Vendor workspace", plans: ["shop", "growth", "pro"] },
  { label: "Παραγγελίες & fulfilment", plans: ["shop", "growth", "pro"] },
  { label: "Ενισχυμένο catalogue onboarding", plans: ["growth", "pro"] },
  { label: "Ενισχυμένη εμπορική υποστήριξη", plans: ["growth", "pro"] },
  { label: "Priority support", plans: ["pro"] }
] as const;

export default function HubExpansionJoinPage() {
  return <main>
    <div className={styles.announcement}>Για επιχειρήσεις στα 130 HUB επέκτασης · το HUB προκύπτει αυτόματα από Γ.Ε.ΜΗ.</div>
    <SiteHeader compact />

    <section className={`shell page-hero ${styles.hero}`}>
      <div className="eyebrow">KONTA MOY · HUB expansion</div>
      <h1>Τοπική παρουσία με ένα ΑΦΜ.</h1>
      <p className="lead">Δεν χρειάζεται να ξέρεις ποιο HUB να διαλέξεις. Βάζεις το ΑΦΜ, βρίσκουμε την επιχείρησή σου στο Γ.Ε.ΜΗ., διαβάζουμε την επαληθευμένη τοποθεσία και αντιστοιχίζουμε αυτόματα το σωστό KONTA MOY HUB.</p>
      <div className={styles.heroActions}>
        <a className="button" href="/hubs/join/apply?plan=claim#application-form">Ξεκίνα δωρεάν με ΑΦΜ</a>
        <a className="button button-secondary" href="#plans">Σύγκρινε προγράμματα</a>
      </div>
      <p className="section-note">Αν η τοποθεσία Γ.Ε.ΜΗ. ανήκει στο ενεργό HUB Σπάρτης, σε μεταφέρουμε αυτόματα στην υπάρχουσα διαδικασία <a href="/join">/join</a>.</p>
    </section>

    <section className={styles.autoBand} aria-label="Αυτόματη αντιστοίχιση HUB">
      <div className={`shell ${styles.autoGrid}`}>
        <div><span>1</span><strong>ΑΦΜ</strong></div>
        <i aria-hidden="true">→</i>
        <div><span>2</span><strong>Γ.Ε.ΜΗ. ✓</strong></div>
        <i aria-hidden="true">→</i>
        <div><span>3</span><strong>Διεύθυνση + Τ.Κ.</strong></div>
        <i aria-hidden="true">→</i>
        <div><span>4</span><strong>Αυτόματο HUB ✓</strong></div>
      </div>
    </section>

    <section className={styles.planBand} id="plans" aria-labelledby="plans-title">
      <div className="shell section">
        <div className={styles.planIntro}>
          <div><div className="eyebrow">Προγράμματα επέκτασης</div><h2 id="plans-title">Μία ματιά. Όλες οι διαφορές.</h2></div>
          <p>CLAIM για δωρεάν παρουσία ή εμπορικό πλάνο όταν θέλεις περισσότερες λειτουργίες. Μηνιαία ή ετήσια χρέωση επιλέγεται πριν την υποβολή· καμία πληρωμή δεν γίνεται μέσα στην αίτηση.</p>
        </div>

        <div className={styles.tableWrap} tabIndex={0} aria-label="Οριζόντια σύγκριση προγραμμάτων">
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th scope="col">Περιλαμβάνει</th>
                {HUB_EXPANSION_PLANS.map((plan) => <th scope="col" className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                  <span>{plan.eyebrow}</span>
                  <strong>{plan.name}</strong>
                  {plan.featured && <b>Marketplace</b>}
                </th>)}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.priceRow}><th scope="row">Ένταξη</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.setupLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Μηνιαία</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.monthlyLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Ετήσια</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.annualLabel}</strong></td>)}</tr>
              <tr className={styles.priceRow}><th scope="row">Προμήθεια</th>{HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}><strong>{plan.commissionLabel}</strong></td>)}</tr>
              {featureRows.map((row) => <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {HUB_EXPANSION_PLANS.map((plan) => {
                  const included = (row.plans as readonly string[]).includes(plan.code);
                  return <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                    <span className={included ? styles.check : styles.dash} aria-hidden="true">{included ? "✓" : "—"}</span>
                    <span className={styles.srOnly}>{included ? "Περιλαμβάνεται" : "Δεν περιλαμβάνεται"}</span>
                  </td>;
                })}
              </tr>)}
              <tr className={styles.actionRow}>
                <th scope="row"><span className={styles.srOnly}>Επιλογή προγράμματος</span></th>
                {HUB_EXPANSION_PLANS.map((plan) => <td className={plan.featured ? styles.featuredColumn : undefined} key={plan.code}>
                  <a className={`button ${styles.planButton}`} href={`/hubs/join/apply?plan=${plan.code}&billing=annual#application-form`}>{plan.code === "claim" ? "Δωρεάν CLAIM" : `Επίλεξε ${plan.name}`}</a>
                </td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.swipeHint}>Σε κινητό: σύρε οριζόντια για να συγκρίνεις όλα τα πλάνα. Η ετήσια επιλογή αντιστοιχεί περίπου σε δύο μήνες χωρίς συνδρομή σε σχέση με τη μηνιαία.</p>
        <p className={styles.footnote}>Οι τιμές εμφανίζονται προ ΦΠΑ όπου εφαρμόζεται. Το CLAIM δεν απαιτεί πληρωμή. Τα υψηλότερα πλάνα αγοράζουν περισσότερες υπηρεσίες και χαμηλότερη προμήθεια — όχι προνομιακή κατάταξη. Η δίκαιη συμμετοχή παραμένει κοινή για όλους.</p>
      </div>
    </section>

    <section className="shell section">
      <div className={styles.stepsHeader}><div className="eyebrow">Πώς λειτουργεί</div><h2>Ίδια λογική onboarding. Αυτόματο HUB.</h2></div>
      <div className={styles.steps}>{steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.trustBand}>
      <div className={`shell ${styles.trustGrid}`}>
        <div><div className="eyebrow light">Γ.Ε.ΜΗ. verified routing</div><h2>Ο vendor δεν μπορεί να δηλώσει μόνος του άλλη πόλη.</h2></div>
        <div className={styles.trustPoints}>
          <p><strong>Registry first.</strong> Νομική ταυτότητα, διεύθυνση και Τ.Κ. προέρχονται από τα δημόσια στοιχεία Γ.Ε.ΜΗ.</p>
          <p><strong>Server-side επανέλεγχος.</strong> Στην υποβολή επαναλαμβάνεται ΑΦΜ → Γ.Ε.ΜΗ. → τοποθεσία → HUB ώστε το browser να μην μπορεί να αλλάξει την αντιστοίχιση.</p>
          <p><strong>Σπάρτη παραμένει ξεχωριστή.</strong> Αν η επαληθευμένη τοποθεσία ανήκει στο HUB Σπάρτης, η αίτηση συνεχίζει στο υπάρχον /join.</p>
        </div>
      </div>
    </section>

    <section className={`shell section ${styles.faq}`}>
      <div><div className="eyebrow">Συχνές ερωτήσεις</div><h2>Χωρίς περιττές επιλογές.</h2></div>
      <div className={styles.faqItems}>
        <details><summary>Πρέπει να ξέρω ποιο HUB ανήκει το κατάστημά μου;</summary><p>Όχι. Το σύστημα το προσδιορίζει αυτόματα από την επαληθευμένη τοποθεσία και τον ταχυδρομικό κώδικα που επιστρέφει το Γ.Ε.ΜΗ.</p></details>
        <details><summary>Μπορώ να αλλάξω χειροκίνητα το HUB;</summary><p>Όχι. Αν η αντιστοίχιση δεν μπορεί να γίνει με ασφάλεια, η αίτηση δεν καταχωρίζεται σε αυθαίρετο HUB και χρειάζεται έλεγχο.</p></details>
        <details><summary>Πληρώνω κατά την αίτηση;</summary><p>Όχι. Δεν συλλέγουμε πληρωμή στο prospect form. Για εμπορικά πλάνα οι όροι επιβεβαιώνονται πριν από οποιαδήποτε ενεργοποίηση ή χρέωση.</p></details>
        <details><summary>Τι γίνεται αν έχω επιχείρηση στη Σπάρτη;</summary><p>Το σύστημα αναγνωρίζει το ενεργό HUB Σπάρτης και σε μεταφέρει στην υπάρχουσα διαδικασία συνεργασίας /join.</p></details>
      </div>
    </section>

    <section className={`shell section ${styles.finalCta}`}>
      <div><div className="eyebrow">Έτοιμος;</div><h2>Ξεκίνα με το ΑΦΜ.</h2><p>Το CLAIM είναι προεπιλεγμένο και δωρεάν. Μπορείς να αλλάξεις πλάνο και κύκλο χρέωσης πριν την υποβολή.</p></div>
      <a className="button" href="/hubs/join/apply?plan=claim&billing=annual#application-form">Βρες την επιχείρησή μου</a>
    </section>

    <SiteFooter />
  </main>;
}
