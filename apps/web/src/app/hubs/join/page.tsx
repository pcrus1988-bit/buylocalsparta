import type { Metadata } from "next";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { EXPANSION_HUBS } from "../../../lib/expansion-hubs";
import { HUB_EXPANSION_PLANS } from "../../../lib/hub-expansion-plans";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/hubs/join", {
    title: "Συμμετοχή στα νέα HUB του ΚΟΝΤΑ ΜΟΥ",
    description: "Δήλωσε την επιχείρησή σου για ένα από τα νέα τοπικά HUB του ΚΟΝΤΑ ΜΟΥ. CLAIM, PRESENCE, SHOP, GROWTH και PRO για την επόμενη πόλη."
  });
}

const expansionHubs = EXPANSION_HUBS
  .filter((hub) => !hub.isSpartaLegacy)
  .slice()
  .sort((a, b) => a.nameEl.localeCompare(b.nameEl, "el"));

const steps = [
  ["01", "Επίλεξε HUB", "Διάλεξε την πόλη/περιοχή στην οποία βρίσκεται η επιχείρησή σου."],
  ["02", "Δήλωσε ενδιαφέρον", "Επίλεξε πρόγραμμα και υπέβαλε τα πραγματικά στοιχεία της επιχείρησης."],
  ["03", "Έλεγχος", "Η ομάδα μας ελέγχει την επιχείρηση και τη σχέση της με το συγκεκριμένο HUB."],
  ["04", "Ενεργοποίηση όταν είναι έτοιμο", "Η αίτηση δεν ενεργοποιεί αυτόματα πωλήσεις ή χρέωση. Προχωράμε μαζί όταν το HUB και η επιχείρηση είναι έτοιμα."]
] as const;

export default function HubExpansionJoinPage() {
  return <main>
    <div className={styles.announcement}>Για επιχειρήσεις εκτός του ενεργού HUB Σπάρτης · 130 περιοχές επέκτασης</div>
    <SiteHeader compact />

    <section className={`shell page-hero ${styles.hero}`}>
      <div className="eyebrow">KONTA MOY · HUB expansion</div>
      <h1>Άνοιξε τον επόμενο τοπικό HUB μαζί μας.</h1>
      <p className="lead">Η ΚΟΝΤΑ ΜΟΥ επεκτείνεται πόλη-πόλη. Δήλωσε από τώρα την επιχείρησή σου για το HUB της περιοχής σου, κατοχύρωσε την παρουσία σου ή προετοιμάσου για πωλήσεις όταν το HUB ενεργοποιηθεί.</p>
      <div className={styles.heroActions}>
        <a className="button" href="#hub-selector">Βρες το HUB σου</a>
        <a className="button button-secondary" href="#plans">Δες τα προγράμματα</a>
      </div>
      <p className="section-note">Έχεις κατάστημα στη Σπάρτη ή στην ενεργή περιοχή της; <a href="/join">Χρησιμοποίησε την υπάρχουσα αίτηση συνεργασίας Σπάρτης →</a></p>
    </section>

    <section className={`shell section ${styles.selectorSection}`} id="hub-selector" aria-labelledby="hub-title">
      <div className={styles.selectorCopy}>
        <div className="eyebrow">130 HUB επέκτασης</div>
        <h2 id="hub-title">Πρώτα, πες μας πού ανήκει η επιχείρησή σου.</h2>
        <p>Η επιλογή HUB αποθηκεύεται μαζί με την αίτησή σου. Δεν μεταφέρει προϊόντα, παραγγελίες ή δεδομένα στη Σπάρτη και δεν κάνει το HUB δημόσιο πριν την επίσημη ενεργοποίησή του.</p>
      </div>
      <form className={styles.hubForm} action="/hubs/join/apply" method="get">
        <input type="hidden" name="plan" value="claim" />
        <label htmlFor="hub">Πόλη / HUB</label>
        <select id="hub" name="hub" required defaultValue="">
          <option value="" disabled>Επίλεξε περιοχή…</option>
          {expansionHubs.map((hub) => <option key={hub.id} value={hub.slug}>{hub.nameEl} · {hub.regionEl}</option>)}
        </select>
        <button className="button" type="submit">Συνέχισε με δωρεάν CLAIM</button>
        <span>Μπορείς να αλλάξεις πρόγραμμα στην επόμενη οθόνη.</span>
      </form>
    </section>

    <section className={styles.planBand} id="plans" aria-labelledby="plans-title">
      <div className="shell section">
        <div className={styles.planIntro}>
          <div><div className="eyebrow">Προγράμματα επέκτασης</div><h2 id="plans-title">Από δωρεάν παρουσία μέχρι πλήρες local commerce.</h2></div>
          <p>Η επιλογή εδώ είναι δήλωση ενδιαφέροντος. Δεν γίνεται online χρέωση κατά την αίτηση και δεν δημιουργείται αυτόματα ενεργός vendor λογαριασμός.</p>
        </div>
        <div className={styles.planGrid}>
          {HUB_EXPANSION_PLANS.map((plan) => <article className={`${styles.planCard} ${plan.featured ? styles.featured : ""}`} key={plan.code}>
            <div className={styles.planTop}><span>{plan.eyebrow}</span>{plan.featured && <b>Πλήρες marketplace</b>}</div>
            <h3>{plan.name}</h3>
            <p className={styles.planSummary}>{plan.summary}</p>
            <div className={styles.metrics}>
              <div><span>Ένταξη</span><strong>{plan.setupLabel}</strong></div>
              <div><span>Συνδρομή</span><strong>{plan.recurringLabel}</strong></div>
              <div><span>Προμήθεια</span><strong>{plan.commissionLabel}</strong></div>
            </div>
            <p className={styles.bestFor}>{plan.bestFor}</p>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <a className={`button ${styles.planButton}`} href={`/hubs/join/apply?plan=${plan.code}`}>{plan.code === "claim" ? "Κατοχύρωσε δωρεάν παρουσία" : `Επίλεξε ${plan.name}`}</a>
          </article>)}
        </div>
        <p className={styles.footnote}>Οι αναγραφόμενες τιμές είναι προ ΦΠΑ όπου εφαρμόζεται. Τα εμπορικά προγράμματα οριστικοποιούνται πριν την ενεργοποίηση. Το CLAIM δεν απαιτεί πληρωμή. Η τιμή προγράμματος δεν αγοράζει προνομιακή κατάταξη: η συμμετοχή στην ανακάλυψη και η ανάθεση πωλήσεων διέπονται από τους κανόνες Fair Vendor Exposure και επιλεξιμότητας.</p>
      </div>
    </section>

    <section className="shell section">
      <div className={styles.stepsHeader}><div className="eyebrow">Πώς λειτουργεί</div><h2>Prospect τώρα. Ενεργός vendor μόνο όταν εγκριθεί.</h2></div>
      <div className={styles.steps}>{steps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className={styles.trustBand}>
      <div className={`shell ${styles.trustGrid}`}>
        <div><div className="eyebrow light">Μία Ελλάδα, τοπικά HUB</div><h2>Η επέκταση δεν πρέπει να μπερδέψει τις τοπικές αγορές.</h2></div>
        <div className={styles.trustPoints}>
          <p><strong>Ξεχωριστή τοπική ταυτότητα.</strong> Η αίτησή σου συνδέεται με το συγκεκριμένο HUB και όχι με το ενεργό marketplace Σπάρτης.</p>
          <p><strong>Καμία αυτόματη ενεργοποίηση.</strong> Prospect, verification και εμπορική ενεργοποίηση είναι ξεχωριστά στάδια.</p>
          <p><strong>Δίκαιη συμμετοχή.</strong> Τα υψηλότερα πακέτα μειώνουν κόστος/προμήθεια και αυξάνουν υπηρεσίες — δεν αγοράζουν την πρώτη θέση.</p>
        </div>
      </div>
    </section>

    <section className={`shell section ${styles.faq}`}>
      <div><div className="eyebrow">Συχνές ερωτήσεις</div><h2>Πριν υποβάλεις αίτηση.</h2></div>
      <div className={styles.faqItems}>
        <details><summary>Το HUB της πόλης μου είναι ήδη ενεργό;</summary><p>Η συγκεκριμένη σελίδα αφορά HUB επέκτασης. Η αίτηση καταγράφει ενδιαφέρον και προετοιμάζει την επιχείρησή σου· δεν σημαίνει ότι η αγορά της πόλης είναι ήδη διαθέσιμη στους πελάτες.</p></details>
        <details><summary>Πληρώνω κατά την αίτηση;</summary><p>Όχι. Δεν συλλέγουμε πληρωμή στο prospect form. Το CLAIM παραμένει χωρίς χρέωση. Για τα εμπορικά προγράμματα, οι όροι επιβεβαιώνονται ξεχωριστά πριν από οποιαδήποτε ενεργοποίηση ή χρέωση.</p></details>
        <details><summary>Τι γίνεται αν έχω επιχείρηση στη Σπάρτη;</summary><p>Η Σπάρτη είναι το ενεργό legacy pilot και έχει ανεξάρτητη διαδικασία onboarding. Χρησιμοποίησε τη σελίδα /join.</p></details>
        <details><summary>Μπορώ να αλλάξω πρόγραμμα αργότερα;</summary><p>Ναι. Η αρχική επιλογή αποθηκεύεται ως requested plan για την επικοινωνία μας και μπορεί να αλλάξει πριν την τελική εμπορική ενεργοποίηση.</p></details>
      </div>
    </section>

    <section className={`shell section ${styles.finalCta}`}>
      <div><div className="eyebrow">Η πόλη σου, η αγορά της</div><h2>Κατοχύρωσε την επιχείρησή σου στο επόμενο HUB.</h2><p>Ξεκίνα δωρεάν με CLAIM ή διάλεξε από τώρα το επίπεδο συνεργασίας που σε ενδιαφέρει.</p></div>
      <a className="button" href="#hub-selector">Επίλεξε HUB</a>
    </section>

    <SiteFooter />
  </main>;
}
