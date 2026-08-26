import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/delivery-pickup", {
  title: "Παράδοση & παραλαβή",
  description: "Πώς λειτουργούν η τοπική παραλαβή, η αποστολή και η παρακολούθηση παραγγελιών στο ΚΟΝΤΑ ΜΟΥ Σπάρτη."
  });
}

export default function DeliveryPickupPage() {
  return <main>
    <div className="announcement">Τοπική παραλαβή όταν γίνεται · αποστολή όταν χρειάζεται · μία συνολική εικόνα παραγγελίας.</div>
    <SiteHeader />
    <section className="content-hero content-hero-delivery"><div className="shell content-hero-grid"><div><div className="eyebrow light">Fulfilment χωρίς σύγχυση</div><h1>Από το κατάστημα μέχρι εσένα.</h1><p>Ο διαθέσιμος τρόπος παραλαβής εξαρτάται από το προϊόν, το κατάστημα εκπλήρωσης, τον προορισμό και τις ενεργές συνδέσεις μεταφοράς.</p><div className="hero-actions"><a className="button button-light" href="/shop">Βρες διαθέσιμα προϊόντα</a><a className="button content-outline" href="/help">Βοήθεια με παραγγελία</a></div></div><div className="delivery-route" aria-hidden="true"><span>SHOP</span><i>→</i><span>SPARTA</span><i>→</i><span>YOU</span></div></div></section>
    <section className="shell content-section"><div className="content-heading"><div><div className="eyebrow">Τρόποι εκπλήρωσης</div><h2>Η σωστή επιλογή εμφανίζεται στο checkout.</h2></div><p>Δεν υποσχόμαστε έναν τρόπο που δεν υποστηρίζεται από το συγκεκριμένο καλάθι. Η τελική διαθεσιμότητα υπολογίζεται πριν την πληρωμή.</p></div><div className="mode-grid"><article><span>01</span><h3>Παραλαβή από κατάστημα</h3><p>Για επιλέξιμες τοπικές παραγγελίες. Περιμένεις επιβεβαίωση ετοιμότητας και χρησιμοποιείς τον ασφαλή κωδικό ή QR κατά την παραλαβή.</p><strong>Μην μεταβείς πριν την επιβεβαίωση.</strong></article><article><span>02</span><h3>Locker / συνεργαζόμενη μεταφορά</h3><p>Όταν το προϊόν και ο προορισμός καλύπτονται, επιλέγεις διαθέσιμο σημείο ή τρόπο παράδοσης στο checkout και λαμβάνεις στοιχεία παρακολούθησης.</p><strong>Η επιλογή locker επικυρώνεται πριν τη δημιουργία αποστολής.</strong></article><article><span>03</span><h3>Περισσότερα καταστήματα</h3><p>Η αγορά παραμένει μία, αλλά μπορεί να έχει περισσότερα fulfilments. Κάθε μέρος προχωρά με τη δική του κατάσταση, χωρίς ξεχωριστή νέα παραγγελία.</p><strong>Ο λογαριασμός συγκεντρώνει τη συνολική εικόνα.</strong></article></div></section>
    <section className="content-band"><div className="shell content-split"><div><div className="eyebrow light">Μετά την αγορά</div><h2>Παρακολούθησε την πραγματική κατάσταση.</h2><p>Η σελίδα παραγγελίας εμφανίζει γραμμές προϊόντων, συνεργάτες εκπλήρωσης και τις διαθέσιμες ενέργειες. Οι ενημερώσεις μεταφορέα εφαρμόζονται με idempotent γεγονότα ώστε ένα διπλό webhook να μην διπλασιάζει αλλαγές.</p><a className="button button-light" href="/account">Άνοιξε τον λογαριασμό σου</a></div><div className="content-fact-list"><div><strong>Πριν την πληρωμή</strong><span>Βεβαιώσου ότι τα στοιχεία επικοινωνίας και ο τρόπος παραλαβής είναι σωστά.</span></div><div><strong>Μετά την πληρωμή</strong><span>Ακολούθησε τις επιβεβαιωμένες καταστάσεις και όχι μια εκτίμηση της αρχικής σελίδας.</span></div><div><strong>Αλλαγή ή πρόβλημα</strong><span>Ξεκίνα από τη συγκεκριμένη παραγγελία ώστε η υποστήριξη να έχει το σωστό πλαίσιο.</span></div></div></div></section>
    <section className="shell content-cta"><div><div className="eyebrow">Έτοιμος να συνεχίσεις;</div><h2>Το καλάθι συγκεντρώνει τις επιλογές σου.</h2><p>Δες τι έχεις προσθέσει και προχώρησε στο checkout μόνο όταν είσαι έτοιμος.</p></div><div className="hero-actions"><a className="button" href="/cart">Άνοιξε το καλάθι</a><a className="button button-secondary" href="/how-it-works">Όλη η διαδρομή αγοράς</a></div></section>
    <SiteFooter />
  </main>;
}
