import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";

export const metadata: Metadata = {
  title: "Η ιδέα του ΚΟΝΤΑ ΜΟΥ Sparta",
  description: "Γιατί δημιουργείται μια ανθρώπινη ψηφιακή αγορά για τα μη διατροφικά καταστήματα της Σπάρτης και της γύρω περιοχής.",
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return <main>
    <div className="announcement">ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου</div>
    <SiteHeader />
    <section className="content-hero content-hero-about"><div className="shell content-hero-grid"><div><div className="eyebrow light">Η ιδέα πίσω από την πλατφόρμα</div><h1>Η τεχνολογία πρέπει να φέρνει την τοπική αγορά πιο κοντά.</h1><p>Το ΚΟΝΤΑ ΜΟΥ Sparta δημιουργείται ως πιλοτικό μοντέλο για τη Σπάρτη και την ευρύτερη περιοχή: μια κοινή ψηφιακή βιτρίνα που δεν αφαιρεί το πρόσωπο, τη γνώση ή την ταυτότητα του καταστήματος.</p><div className="hero-actions"><a className="button button-light" href="/shops">Γνώρισε την αγορά</a><a className="button content-outline" href="/join">Για τοπικά καταστήματα</a></div></div><div className="about-monogram" aria-hidden="true"><img src="/brand/kontamou-sparta-logo.webp" alt="" width={480} height={320} style={{ display: "block", width: "100%", maxWidth: "480px", height: "auto", objectFit: "contain" }} /></div></div></section>
    <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Η αποστολή</div><h2>Μεγαλύτερη ορατότητα χωρίς απώλεια ταυτότητας.</h2></div><p>Η πλατφόρμα απευθύνεται πρωτίστως στα μη διατροφικά καταστήματα της Σπάρτης και της ακτίνας εξυπηρέτησης, με δυνατότητα προβολής και πωλήσεων ευρύτερα στην Ελλάδα.</p></div><div className="principle-grid principle-grid-three"><article><span>01</span><h3>Ο άνθρωπος παραμένει ορατός</h3><p>Τα προφίλ καταστημάτων, η πραγματική τεχνογνωσία και η συμβουλή αποτελούν μέρος της εμπειρίας αγοράς.</p></article><article><span>02</span><h3>Η πόλη λειτουργεί ως σύνολο</h3><p>Κατηγορίες, προϊόντα και καταστήματα συνδέονται σε μία κοινή αγορά αντί για απομονωμένες δύσχρηστες βιτρίνες.</p></article><article><span>03</span><h3>Η δικαιοσύνη σχεδιάζεται</h3><p>Τα ίδια προϊόντα δεν μετατρέπονται σε δημόσιο πόλεμο τιμών. Η ανάθεση γίνεται με ελέγξιμους κανόνες επιλεξιμότητας και έκθεσης.</p></article></div></section>
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Τι δεν θέλουμε να γίνουμε</div><h2>Όχι άλλη μία απρόσωπη λίστα.</h2><p>Η επιτυχία δεν μετριέται μόνο σε περισσότερα SKU. Μετριέται στο αν ο πελάτης βρίσκει σωστή επιλογή, αν το τοπικό κατάστημα αποκτά βιώσιμη ψηφιακή παρουσία και αν η πόλη κρατά την εμπορική της γνώση ενεργή.</p></div><div className="content-fact-list"><div><strong>Όχι</strong><span>Δημόσια παράθεση ίδιων supplier offers με μοναδικό κριτήριο τη χαμηλότερη τιμή.</span></div><div><strong>Όχι</strong><span>Επινοημένες ιστορίες, μη εγκεκριμένες φωτογραφίες ή στοιχεία καταστήματος χωρίς συναίνεση.</span></div><div><strong>Ναι</strong><span>Ενιαίος κατάλογος, πραγματική συμβουλή και τοπική εκπλήρωση με καθαρή λογοδοσία.</span></div></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Δες την ιδέα σε λειτουργία</div><h2>Ξεκίνα από ανθρώπους ή προϊόντα.</h2><p>Μπες στην αγορά από τον δρόμο που ταιριάζει σε αυτό που χρειάζεσαι σήμερα.</p></div><div className="hero-actions"><a className="button" href="/shop">Ανακάλυψε προϊόντα</a><a className="button button-secondary" href="/how-it-works">Πώς λειτουργεί</a></div></section>
    <SiteFooter />
  </main>;
}
