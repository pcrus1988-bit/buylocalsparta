import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "../../components/CookieSettingsButton";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { COOKIE_REGISTRY, LEGAL_LAST_UPDATED, TRACKER_REGISTRY } from "../../lib/legal-transparency";

export const metadata: Metadata = {
  title: "Πολιτική Cookies",
  description: "Τα cookies και first-party identifiers του ΚΟΝΤΑ ΜΟΥ, ο σκοπός, η διάρκεια και ο τρόπος διαχείρισης της συγκατάθεσης.",
  alternates: { canonical: "/cookies" }
};

const categoryLabel = {
  necessary: "Απαραίτητα",
  personalisation: "Προσωποποίηση",
  analytics: "Analytics",
  marketing: "Marketing"
} as const;

export default function CookiesPage() {
  return <main className="legal-page">
    <div className="announcement">Προαιρετικό σημαίνει πραγματικά προαιρετικό.</div>
    <SiteHeader compact />
    <section className="content-hero content-hero-privacy"><div className="shell content-hero-grid"><div><div className="eyebrow light">Cookies & tracking</div><h1>Πολιτική Cookies</h1><p>Τα απαραίτητα χρησιμοποιούνται μόνο για λειτουργία και ασφάλεια. Το προαιρετικό first-party Analytics δεν ενεργοποιείται πριν από την επιλογή σου.</p><div className="hero-actions"><CookieSettingsButton className="button button-light" label="Άνοιξε ρυθμίσεις cookies" /><Link className="button content-outline" href="/privacy">Πολιτική Απορρήτου</Link></div></div><div className="legal-stamp" aria-hidden="true"><span>COOKIE</span><strong>CHOICE</strong><i>CONTROL</i></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Η βασική αρχή</div><h2>Καμία προαιρετική παρακολούθηση πριν από επιλογή</h2><p>Σύμφωνα με το άρθρο 4 παρ. 5 του ν. 3471/2006, αποθήκευση ή πρόσβαση σε πληροφορίες στη συσκευή απαιτεί προηγούμενη ενημέρωση και συγκατάθεση, εκτός όταν είναι απολύτως αναγκαία για τη μετάδοση επικοινωνίας ή για υπηρεσία που ζήτησε ρητά ο χρήστης. Για αυτό το ΚΟΝΤΑ ΜΟΥ διαχωρίζει τα απαραίτητα identifiers από το Analytics identifier.</p><div className="legal-choice-grid"><article><strong>Απαραίτητα</strong><p>Πάντα ενεργά μόνο όπου χρειάζονται για login, ασφάλεια, checkout, service continuity και καταγραφή/επαλήθευση της επιλογής cookies.</p></article><article><strong>Προσωποποίηση browser</strong><p>Δεν υπάρχει σήμερα ξεχωριστός browser tracker προσωποποίησης. Οι επιλογές recommendations/recently viewed του λογαριασμού διαχειρίζονται χωριστά στα Privacy controls.</p></article><article><strong>Analytics</strong><p>Απενεργοποιημένο από προεπιλογή. Το ξεχωριστό analytics identifier δημιουργείται μόνο μετά από αποδοχή και διαγράφεται σε ανάκληση.</p></article><article><strong>Marketing</strong><p>Δεν υπάρχει ενεργός advertising/remarketing tracker. Δεν συλλέγουμε γενική συγκατάθεση για υποθετικές μελλοντικές τεχνολογίες.</p></article></div></section>

    <section className="shell legal-section" aria-labelledby="registry"><div className="eyebrow">Τρέχον first-party registry</div><h2 id="registry">Ποια cookies χρησιμοποιεί η εφαρμογή</h2><div className="legal-table-wrap"><table className="legal-table legal-cookie-table"><thead><tr><th>Όνομα</th><th>Κατηγορία</th><th>Σκοπός</th><th>Διάρκεια</th><th>Πότε τίθεται</th><th>Consent</th></tr></thead><tbody>{COOKIE_REGISTRY.map((cookie)=><tr key={cookie.name}><th scope="row"><code>{cookie.name}</code></th><td>{categoryLabel[cookie.category]}</td><td>{cookie.purpose}</td><td>{cookie.duration}</td><td>{cookie.whenSet}</td><td>{cookie.consentRequired ? "Απαιτείται" : "Όχι, εφόσον παραμένει αυστηρά απαραίτητο"}</td></tr>)}</tbody></table></div><p className="legal-updated">Τελευταία ενημέρωση μητρώου: {LEGAL_LAST_UPDATED}</p></section>

    <section className="shell legal-section" aria-labelledby="tracker-registry"><div className="eyebrow">Tracking technologies</div><h2 id="tracker-registry">Μητρώο trackers και event capture</h2><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Τεχνολογία</th><th>Πάροχος</th><th>Κατηγορία</th><th>Σκοπός</th><th>Δεδομένα</th><th>Ενεργοποίηση</th></tr></thead><tbody>{TRACKER_REGISTRY.map((tracker)=><tr key={tracker.name}><th scope="row">{tracker.name}<small>{tracker.technology}</small></th><td>{tracker.provider}</td><td>{categoryLabel[tracker.category]}</td><td>{tracker.purpose}</td><td>{tracker.data}</td><td>{tracker.activation}</td></tr>)}</tbody></table></div><p>Δεν υπάρχουν σήμερα καταχωρισμένα Meta Pixel, Google Ads/Analytics, TikTok Pixel, Hotjar, Clarity ή άλλα third-party marketing/session-replay trackers. Η προσθήκη νέου tracker απαιτεί πρώτα καταχώριση εδώ και τεχνικό consent gate.</p></section>

    <section className="content-band"><div className="shell legal-section legal-section-on-dark"><div className="eyebrow light">Ανάκληση</div><h2>Άλλαξε γνώμη οποιαδήποτε στιγμή</h2><p>Η απόρριψη προαιρετικών επιλογών παραμένει διαθέσιμη και μετά την πρώτη επίσκεψη. Όταν ανακαλείται Analytics consent, το <code>bls_analytics</code> διαγράφεται και το analytics endpoint απορρίπτει νέα events χωρίς έγκυρη, υπογεγραμμένη consent receipt.</p><div className="hero-actions"><CookieSettingsButton className="button button-light" label="Ρυθμίσεις cookies" /></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Απόδειξη επιλογής</div><h2>Το UI cookie δεν είναι η εξουσιοδότηση του server</h2><p>Το <code>bls_consent_v1</code> είναι αναγνώσιμο από τον browser ώστε να εμφανίζονται οι επιλογές σου. Παράλληλα, το <code>bls_consent_receipt</code> είναι HttpOnly και κρυπτογραφικά υπογεγραμμένο. Ο server εμπιστεύεται μόνο τη δεύτερη απόδειξη για προαιρετικό analytics. Η αποδεικτική εγγραφή είναι ψευδωνυμική και δεν αποθηκεύει IP, email, τηλέφωνο, ταχυδρομική διεύθυνση ή device fingerprint.</p></section>

    <section className="shell legal-section"><div className="eyebrow">Άλλες τεχνολογίες</div><h2>Δεν κοιτάμε μόνο το όνομα «cookie»</h2><p>Οι ίδιοι κανόνες αξιολόγησης εφαρμόζονται και σε localStorage, browser storage, pixels, SDKs, device identifiers, fingerprinting ή embeds που μπορούν να αποθηκεύουν ή να ανακτούν πληροφορίες από τη συσκευή. Η προσθήκη νέου tracker πρέπει να περνά από το ίδιο consent registry πριν ενεργοποιηθεί.</p><p>Αν προστεθεί νέος πάροχος analytics/marketing, το μητρώο, το consent layer και οι automated pre-consent checks πρέπει να ενημερωθούν πριν ενεργοποιηθεί σε production.</p></section>

    <section className="shell content-cta"><div><div className="eyebrow">Περισσότερος έλεγχος</div><h2>Cookies, privacy settings και δικαιώματα σε ξεχωριστές αλλά συνδεδεμένες διαδρομές.</h2></div><div className="hero-actions"><Link className="button" href="/privacy-controls">Privacy controls</Link><Link className="button button-secondary" href="/privacy">Πολιτική Απορρήτου</Link></div></section>
    <SiteFooter />
  </main>;
}
