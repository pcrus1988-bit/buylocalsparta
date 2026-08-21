import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "../../components/CookieSettingsButton";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { COOKIE_REGISTRY, LEGAL_LAST_UPDATED } from "../../lib/legal-transparency";

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
    <section className="content-hero content-hero-privacy"><div className="shell content-hero-grid"><div><div className="eyebrow light">Cookies & tracking</div><h1>Πολιτική Cookies</h1><p>Τα απαραίτητα χρησιμοποιούνται μόνο για λειτουργία και ασφάλεια. Analytics, προσωποποίηση και marketing δεν πρέπει να ενεργοποιούνται πριν από την αντίστοιχη επιλογή σου.</p><div className="hero-actions"><CookieSettingsButton className="button button-light" label="Άνοιξε ρυθμίσεις cookies" /><Link className="button content-outline" href="/privacy">Πολιτική Απορρήτου</Link></div></div><div className="legal-stamp" aria-hidden="true"><span>COOKIE</span><strong>CHOICE</strong><i>CONTROL</i></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Η βασική αρχή</div><h2>Καμία προαιρετική παρακολούθηση πριν από επιλογή</h2><p>Σύμφωνα με το άρθρο 4 παρ. 5 του ν. 3471/2006, αποθήκευση ή πρόσβαση σε πληροφορίες στη συσκευή απαιτεί προηγούμενη ενημέρωση και συγκατάθεση, εκτός όταν είναι απολύτως αναγκαία για τη μετάδοση επικοινωνίας ή για υπηρεσία που ζήτησε ρητά ο χρήστης. Για αυτό το ΚΟΝΤΑ ΜΟΥ διαχωρίζει τα απαραίτητα identifiers από το Analytics identifier.</p><div className="legal-choice-grid"><article><strong>Απαραίτητα</strong><p>Πάντα ενεργά μόνο όπου χρειάζονται για login, ασφάλεια, checkout, service continuity και καταγραφή της επιλογής cookies.</p></article><article><strong>Προσωποποίηση</strong><p>Απενεργοποιημένη από προεπιλογή στο consent layer. Χρησιμοποιείται μόνο για προαιρετικές saved/recent/recommendation λειτουργίες όταν επιλεγεί.</p></article><article><strong>Analytics</strong><p>Απενεργοποιημένο από προεπιλογή. Το ξεχωριστό analytics identifier δημιουργείται μόνο μετά από αποδοχή και διαγράφεται σε ανάκληση.</p></article><article><strong>Marketing</strong><p>Απενεργοποιημένο από προεπιλογή. Η πλατφόρμα δεν πρέπει να ενεργοποιεί advertising/remarketing trackers χωρίς ρητή επιλογή.</p></article></div></section>

    <section className="shell legal-section" aria-labelledby="registry"><div className="eyebrow">Τρέχον first-party registry</div><h2 id="registry">Ποια cookies χρησιμοποιεί η εφαρμογή</h2><div className="legal-table-wrap"><table className="legal-table legal-cookie-table"><thead><tr><th>Όνομα</th><th>Κατηγορία</th><th>Σκοπός</th><th>Διάρκεια</th><th>Πότε τίθεται</th><th>Consent</th></tr></thead><tbody>{COOKIE_REGISTRY.map((cookie)=><tr key={cookie.name}><th scope="row"><code>{cookie.name}</code></th><td>{categoryLabel[cookie.category]}</td><td>{cookie.purpose}</td><td>{cookie.duration}</td><td>{cookie.whenSet}</td><td>{cookie.consentRequired ? "Απαιτείται" : "Όχι, εφόσον παραμένει αυστηρά απαραίτητο"}</td></tr>)}</tbody></table></div><p className="legal-updated">Τελευταία ενημέρωση μητρώου: {LEGAL_LAST_UPDATED}</p></section>

    <section className="content-band"><div className="shell legal-section legal-section-on-dark"><div className="eyebrow light">Ανάκληση</div><h2>Άλλαξε γνώμη οποιαδήποτε στιγμή</h2><p>Η απόρριψη προαιρετικών επιλογών παραμένει διαθέσιμη και μετά την πρώτη επίσκεψη. Όταν ανακαλείται Analytics consent, το <code>bls_analytics</code> διαγράφεται και το analytics endpoint απορρίπτει νέα events χωρίς έγκυρη συγκατάθεση.</p><div className="hero-actions"><CookieSettingsButton className="button button-light" label="Ρυθμίσεις cookies" /></div></div></section>

    <section className="shell legal-section"><div className="eyebrow">Άλλες τεχνολογίες</div><h2>Δεν κοιτάμε μόνο το όνομα «cookie»</h2><p>Οι ίδιοι κανόνες αξιολόγησης εφαρμόζονται και σε localStorage, browser storage, pixels, SDKs, device identifiers, fingerprinting ή embeds που μπορούν να αποθηκεύουν ή να ανακτούν πληροφορίες από τη συσκευή. Η προσθήκη νέου tracker πρέπει να περνά από το ίδιο consent registry πριν ενεργοποιηθεί.</p><p>Η πολιτική αυτή περιγράφει την τρέχουσα first-party υλοποίηση. Αν προστεθεί νέος πάροχος analytics/marketing, το μητρώο και το consent layer πρέπει να ενημερωθούν πριν ενεργοποιηθεί σε production.</p></section>

    <section className="shell content-cta"><div><div className="eyebrow">Περισσότερος έλεγχος</div><h2>Cookies, privacy settings και δικαιώματα σε ξεχωριστές αλλά συνδεδεμένες διαδρομές.</h2></div><div className="hero-actions"><Link className="button" href="/privacy-controls">Privacy controls</Link><Link className="button button-secondary" href="/privacy">Πολιτική Απορρήτου</Link></div></section>
    <SiteFooter />
  </main>;
}
