import type { Metadata } from "next";
import Link from "next/link";
import { CookieControlCenter } from "../../components/CookieControlCenter";
import { CookieSettingsButton } from "../../components/CookieSettingsButton";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import { COOKIE_REGISTRY, LEGAL_LAST_UPDATED, TRACKER_REGISTRY } from "../../lib/legal-transparency";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/cookies", {
    title: "Cookies & επιλογές απορρήτου",
    description: "Με απλά λόγια: ποια cookies χρησιμοποιεί το ΚΟΝΤΑ ΜΟΥ, ποια είναι απαραίτητα, ποια Analytics είναι προαιρετικά και πώς τα ενεργοποιείς ή τα απενεργοποιείς πραγματικά."
  });
}

const categoryLabel = {
  necessary: "Απαραίτητα",
  personalisation: "Προσωποποίηση",
  analytics: "Analytics",
  marketing: "Marketing"
} as const;

const simpleChoices = [
  ["Απαραίτητα", "Χρειάζονται για να δουλεύουν login, checkout, ασφάλεια, marketplace continuity και η αποθήκευση της επιλογής σου. Δεν χρησιμοποιούνται ως διαφημιστικό profile."],
  ["Analytics", "Είναι προαιρετικά. Περιλαμβάνουν first-party product analytics, Vercel Analytics, Speed Insights και Google Analytics 4. Ξεκινούν μόνο μετά από δική σου, server-verified επιλογή."],
  ["Προσωποποίηση", "Δεν υπάρχει ξεχωριστός browser tracker προσωποποίησης. Saved, recent και recommendations είναι account controls και όχι γενική άδεια tracking."],
  ["Marketing", "Δεν υπάρχει ενεργό Meta Pixel, Google Ads remarketing, TikTok Pixel ή άλλος advertising tracker. Δεν ζητάμε συγκατάθεση προκαταβολικά για κάτι που δεν χρησιμοποιούμε."]
] as const;

export default function CookiesPage() {
  return <main className="legal-page">
    <div className="announcement">Cookies με πραγματικό έλεγχο · όχι ένα banner που απλώς εξαφανίζεται.</div>
    <SiteHeader compact />

    <section className="content-hero content-hero-privacy">
      <div className="shell content-hero-grid">
        <div>
          <div className="eyebrow light">Cookies & tracking</div>
          <h1>Εσύ αποφασίζεις τι είναι προαιρετικό.</h1>
          <p>Τα απαραίτητα κρατούν την υπηρεσία ασφαλή και λειτουργική. Τα Analytics είναι κλειστά από προεπιλογή και ενεργοποιούνται μόνο μετά από επιλογή που επαληθεύεται από τον server.</p>
          <div className="hero-actions"><CookieSettingsButton className="button button-light" label="Άνοιξε τις ρυθμίσεις" /><Link className="button content-outline" href="/privacy">Πολιτική Απορρήτου</Link></div>
        </div>
        <div className="legal-stamp" aria-hidden="true"><span>COOKIE</span><strong>YOU</strong><i>CONTROL</i></div>
      </div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">Χωρίς νομικά ελληνικά</div>
      <h2>Τέσσερις κατηγορίες. Μόνο μία είναι σήμερα προαιρετικά ενεργοποιήσιμη.</h2>
      <div className="legal-card-grid">{simpleChoices.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div>
    </section>

    <section className="shell legal-section">
      <CookieControlCenter />
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">Τι συμβαίνει τεχνικά</div>
        <h2>Η επιλογή σου δεν είναι απλώς ένα κουμπί στο UI.</h2>
        <div className="legal-card-grid">
          <article><h3>1 · Αποθήκευση επιλογής</h3><p>Το browser-readable <code>bls_consent_v1</code> κρατά την κατάσταση που χρειάζεται το interface για να σου δείχνει την επιλογή.</p></article>
          <article><h3>2 · Υπογεγραμμένη απόδειξη</h3><p>Παράλληλα δημιουργείται HttpOnly <code>bls_consent_receipt</code>. Ο server επαληθεύει την υπογραφή πριν ξεκλειδώσει προαιρετικό analytics.</p></article>
          <article><h3>3 · Analytics identity</h3><p>Το <code>bls_analytics</code> δημιουργείται μόνο όταν έχεις επιτρέψει Analytics. Δεν είναι το ίδιο cookie με το απαραίτητο marketplace/session identity.</p></article>
          <article><h3>4 · Ανάκληση</h3><p>Αν επιλέξεις «Μόνο απαραίτητα», το analytics identity διαγράφεται, GA τίθεται σε denied state, τα GA cookies καθαρίζονται και τα optional analytics components παύουν να είναι ενεργά.</p></article>
        </div>
      </div>
    </section>

    <section className="shell legal-section" aria-labelledby="registry">
      <div className="eyebrow">Cookie registry</div>
      <h2 id="registry">Ποια cookies χρησιμοποιεί σήμερα η εφαρμογή.</h2>
      <p>Ο πίνακας αυτός δημιουργείται από το ίδιο registry που χρησιμοποιούμε για το privacy audit του κώδικα. Αν προστεθεί νέο cookie, πρέπει να καταγραφεί εδώ.</p>
      <div className="legal-table-wrap"><table className="legal-table legal-cookie-table"><thead><tr><th>Όνομα</th><th>Κατηγορία</th><th>Σκοπός</th><th>Διάρκεια</th><th>Πότε τίθεται</th><th>Consent</th></tr></thead><tbody>{COOKIE_REGISTRY.map((cookie)=><tr key={cookie.name}><th scope="row"><code>{cookie.name}</code></th><td>{categoryLabel[cookie.category]}</td><td>{cookie.purpose}</td><td>{cookie.duration}</td><td>{cookie.whenSet}</td><td>{cookie.consentRequired ? "Ναι" : "Όχι — απαραίτητο"}</td></tr>)}</tbody></table></div>
      <p className="legal-updated">Τελευταία ενημέρωση μητρώου: {LEGAL_LAST_UPDATED}</p>
    </section>

    <section className="shell legal-section" aria-labelledby="tracker-registry">
      <div className="eyebrow">Όχι μόνο cookies</div>
      <h2 id="tracker-registry">Μητρώο trackers και event capture.</h2>
      <p>Tracking μπορεί να γίνει και χωρίς cookie. Για αυτό καταγράφουμε χωριστά κάθε analytics τεχνολογία που επιτρέπεται να τρέξει.</p>
      <div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Τεχνολογία</th><th>Πάροχος</th><th>Κατηγορία</th><th>Σκοπός</th><th>Δεδομένα</th><th>Πότε ενεργοποιείται</th></tr></thead><tbody>{TRACKER_REGISTRY.map((tracker)=><tr key={tracker.name}><th scope="row">{tracker.name}<small>{tracker.technology}</small></th><td>{tracker.provider}</td><td>{categoryLabel[tracker.category]}</td><td>{tracker.purpose}</td><td>{tracker.data}</td><td>{tracker.activation}</td></tr>)}</tbody></table></div>
      <p><strong>Δεν χρησιμοποιούνται σήμερα:</strong> Meta Pixel, Google Ads remarketing, TikTok Pixel, Hotjar, Microsoft Clarity ή session-replay tracker. Δεν συλλέγουμε γενική συγκατάθεση για μελλοντικά εργαλεία που δεν έχουν ακόμη εγκατασταθεί.</p>
    </section>

    <section className="content-band">
      <div className="shell legal-section legal-section-on-dark">
        <div className="eyebrow light">Αλλάζεις γνώμη;</div>
        <h2>Μπορείς να ανακαλέσεις Analytics οποιαδήποτε στιγμή.</h2>
        <p>Οι ρυθμίσεις είναι διαθέσιμες από εδώ, από το footer και από το floating μενού πληροφοριών. Η απόρριψη δεν επηρεάζει login, παραγγελίες, checkout, Ask Local, Gift Cards ή υποστήριξη.</p>
        <div className="hero-actions"><CookieSettingsButton className="button button-light" label="Άλλαξε επιλογές cookies" /></div>
      </div>
    </section>

    <section className="shell legal-section">
      <div className="eyebrow">Νομική βάση για αποθήκευση στη συσκευή</div>
      <h2>Απαραίτητα χωρίς consent · προαιρετικά μόνο με προηγούμενη επιλογή.</h2>
      <p>Η αποθήκευση ή πρόσβαση σε πληροφορίες στη συσκευή ακολουθεί τους εφαρμοστέους κανόνες ηλεκτρονικών επικοινωνιών: τα αυστηρά απαραίτητα μπορούν να χρησιμοποιούνται για υπηρεσία που ζήτησε ο χρήστης, ενώ τα προαιρετικά analytics παραμένουν κλειστά μέχρι την επιλογή του.</p>
      <p>Η συγκατάθεση για Analytics είναι ξεχωριστή από τις account ρυθμίσεις προσωποποίησης και από οποιαδήποτε μελλοντική συγκατάθεση marketing.</p>
    </section>

    <section className="shell content-cta">
      <div><div className="eyebrow">Privacy & control</div><h2>Cookies, account privacy και δικαιώματα παραμένουν ξεχωριστά αλλά συνδεδεμένα.</h2></div>
      <div className="hero-actions"><Link className="button" href="/privacy-controls">Privacy controls</Link><Link className="button button-secondary" href="/privacy">Πολιτική Απορρήτου</Link></div>
    </section>

    <SiteFooter />
  </main>;
}
