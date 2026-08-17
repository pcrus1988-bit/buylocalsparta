import type { Metadata } from "next";
import Link from "next/link";
import { PartnerReadinessChecklist } from "../../../components/PartnerReadinessChecklist";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Προϋποθέσεις συνεργάτη",
  description: "Διαδραστικός έλεγχος επιχειρησιακής ετοιμότητας για καταστήματα που θέλουν να συμμετέχουν στο Buy Local Sparta.",
  alternates: { canonical: "/join/requirements" }
};

export default function PartnerRequirementsPage() {
  return <main>
    <div className="announcement">Πριν το onboarding: έλεγξε στοιχεία επιχείρησης, κατάλογο, δικαιώματα και λειτουργική ετοιμότητα.</div>
    <SiteHeader compact />
    <section className="content-hero content-hero-partner"><div className="shell content-hero-grid"><div><div className="eyebrow light">Merchant readiness</div><h1>Ένας πραγματικός έλεγχος πριν από την αίτηση.</h1><p>Η συμμετοχή δεν ενεργοποιείται με ένα marketing click. Χρειάζεται επαληθεύσιμη επιχείρηση, καθαρός κατάλογος, δικαιώματα περιεχομένου και άνθρωποι που μπορούν να εκτελέσουν τις καθημερινές εργασίες.</p><div className="hero-actions"><Link className="button button-light" href="/join">Δες όλο το onboarding</Link><Link className="button content-outline" href="/fairness">Κατανόησε την ανάθεση</Link></div></div><div className="partner-stack" aria-hidden="true"><span>KYB</span><span>CATALOG</span><span>READY</span></div></div></section>
    <PartnerReadinessChecklist />
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Τι δεν κάνει το checklist</div><h2>Δεν παρακάμπτει τους ελέγχους ενεργοποίησης.</h2><p>Η αυτοαξιολόγηση μένει στον browser και δεν δημιουργεί vendor account ή δημόσια καταχώριση. Η επίσημη ροή απαιτεί verification, catalog onboarding, test-ready evidence και καταγεγραμμένη activation από εξουσιοδοτημένο ρόλο.</p></div><div className="content-fact-list"><div><strong>Δεν είναι αίτηση</strong><span>Τα checkbox σε βοηθούν να οργανωθείς και δεν αποστέλλουν επιχειρηματικά δεδομένα.</span></div><div><strong>Δεν είναι έγκριση</strong><span>Κάθε activation gate εξετάζεται και καταγράφεται ξεχωριστά.</span></div><div><strong>Δεν είναι δημόσια καταχώριση</strong><span>Merchant profile και media δημοσιεύονται μόνο μετά τα απαιτούμενα approvals.</span></div></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Επόμενη ουσιαστική διαδρομή</div><h2>Κατανόησε τι θα διαχειρίζεσαι μετά την ενεργοποίηση.</h2><p>Ο vendor χώρος διαχωρίζει παραγγελίες, stock, advice, shipping, returns, trust, finance και analytics.</p></div><div className="hero-actions"><Link className="button" href="/how-it-works">Η εμπειρία πελάτη</Link><Link className="button button-secondary" href="/delivery-pickup">Η ροή εκπλήρωσης</Link></div></section>
    <SiteFooter />
  </main>;
}
