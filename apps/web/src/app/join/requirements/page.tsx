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
    <section className="content-hero content-hero-partner"><div className="shell content-hero-grid"><div><div className="eyebrow light">Merchant readiness</div><h1>Ένας πραγματικός έλεγχος πριν από την αίτηση.</h1><p>Η συμμετοχή δεν ενεργοποιείται με ένα marketing click. Χρειάζεται επαληθεύσιμη επιχείρηση, καθαρός κατάλογος, δικαιώματα περιεχομένου και άνθρωποι που μπορούν να εκτελέσουν τις καθημερινές εργασίες.</p><div className="hero-actions"><Link className="button button-light" href="/join/apply">Συνέχισε στην αίτηση</Link><Link className="button content-outline" href="/join">Δες όλο το onboarding</Link></div></div><div className="partner-stack" aria-hidden="true"><span>KYB</span><span>CATALOG</span><span>READY</span></div></div></section>
    <PartnerReadinessChecklist />
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Τι δεν κάνει το checklist</div><h2>Δεν παρακάμπτει τους ελέγχους ενεργοποίησης.</h2><p>Η αυτοαξιολόγηση μένει στον browser και δεν δημιουργεί vendor account ή δημόσια καταχώριση. Όταν είσαι έτοιμος, η ξεχωριστή επίσημη αίτηση γράφει στην ουρά verification και μετά ακολουθούν catalog onboarding, test-ready evidence και καταγεγραμμένη activation από εξουσιοδοτημένο Admin.</p></div><div className="content-fact-list"><div><strong>Checklist ≠ αίτηση</strong><span>Τα checkbox σε βοηθούν να οργανωθείς και δεν αποστέλλουν επιχειρηματικά δεδομένα.</span></div><div><strong>Αίτηση ≠ έγκριση</strong><span>Η επίσημη αίτηση δημιουργεί μόνο verification-pending record. Κάθε activation gate εξετάζεται ξεχωριστά.</span></div><div><strong>Έγκριση ≠ αυτόματο publish</strong><span>Merchant profile, catalog και media δημοσιεύονται μόνο μετά τα απαιτούμενα approvals.</span></div></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Είσαι έτοιμος;</div><h2>Πέρασε από το checklist στην πραγματική αίτηση.</h2><p>Θα καταχωρίσεις επιχείρηση, υπεύθυνο επικοινωνίας, τοποθεσία, κύρια κατηγορία και ενδιαφέρον πλάνου. Μετά την υποβολή θα πάρεις αριθμό αναφοράς και η αίτηση θα εμφανιστεί στο Admin workspace.</p></div><div className="hero-actions"><Link className="button" href="/join/apply">Υπόβαλε αίτηση συνεργασίας</Link><Link className="button button-secondary" href="/fairness">Η δίκαιη ανάθεση</Link></div></section>
    <SiteFooter />
  </main>;
}