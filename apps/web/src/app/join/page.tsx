import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { VendorJoinGateway } from "../../components/VendorJoinGateway";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/join", {
    title: "Γίνε συνεργάτης · ΚΟΝΤΑ ΜΟΥ",
    description: "Ξεκίνα με το ΑΦΜ σου. Το ΚΟΝΤΑ ΜΟΥ επαληθεύει την επιχείρηση μέσω Γ.Ε.ΜΗ., εντοπίζει το σωστό HUB και εμφανίζει μόνο τα προγράμματα που ισχύουν για την περιοχή σου."
  });
}

const principles=[
 ["Μία είσοδος","Δεν χρειάζεται να ξέρεις αν ανήκεις στη Σπάρτη ή σε HUB επέκτασης πριν ξεκινήσεις."],
 ["Γ.Ε.ΜΗ. πρώτα","Η τοποθεσία προκύπτει από επαληθευμένα δημόσια στοιχεία επιχείρησης, όχι από χειροκίνητη επιλογή πόλης."],
 ["Σωστή τιμολόγηση","Τα προγράμματα Σπάρτης και HUB επέκτασης παραμένουν ξεχωριστά και εμφανίζονται μόνο στη σωστή διαδρομή."],
 ["Καμία αυτόματη χρέωση","Η αίτηση είναι αίτημα συνεργασίας. Οι εμπορικοί όροι επιβεβαιώνονται πριν από ενεργοποίηση ή χρέωση."]
] as const;

export default function JoinGatewayPage(){
 return <main>
  <div className="announcement">Μία είσοδος για όλα τα καταστήματα · πρώτα βρίσκουμε τη σωστή αγορά, μετά δείχνουμε το σωστό πρόγραμμα.</div>
  <SiteHeader compact/>
  <section className={styles.gatewayHero}><div className="shell"><div className={styles.gatewayHeroGrid}>
   <div><div className="eyebrow light">KONTA MOY · Vendor Gateway</div><h1>Το κατάστημά σου έχει μία σωστή διαδρομή.</h1><p>Στη Σπάρτη λειτουργεί ήδη το ενεργό HUB με το δικό του εμπορικό μοντέλο. Στις υπόλοιπες περιοχές ισχύει το μοντέλο HUB επέκτασης. Δεν χρειάζεται να διαλέξεις μόνος σου — ξεκίνα με το ΑΦΜ.</p><div className="hero-actions"><a className="button button-light" href="#gateway">Έλεγχος με ΑΦΜ</a><Link className="button content-outline" href="/how-it-works#vendors">Πώς λειτουργεί για καταστήματα</Link></div></div>
   <div className={styles.gatewayCompass} aria-hidden="true"><strong>ΑΦΜ</strong><i>→</i><strong>Γ.Ε.ΜΗ.</strong><i>→</i><strong>HUB</strong><i>→</i><strong>PLAN</strong></div>
  </div></div></section>
  <section className={`shell ${styles.gatewaySection}`} id="gateway"><VendorJoinGateway/></section>
  <section className="shell section"><div className={styles.gatewayPrinciples}>{principles.map(([t,b],i)=><article key={t}><span>{String(i+1).padStart(2,"0")}</span><h3>{t}</h3><p>{b}</p></article>)}</div></section>
  <section className={styles.gatewayBand}><div className="shell"><div className={styles.gatewayBandGrid}><div><div className="eyebrow light">Γιατί το κάνουμε έτσι</div><h2>Η περιοχή αποφασίζει ποια εμπορική πρόταση ισχύει — όχι ένα dropdown.</h2></div><div><p>Η Σπάρτη είναι η ενεργή αρχική αγορά και έχει δικούς της όρους συνεργασίας. Τα νέα HUB έχουν διαφορετική δομή πακέτων. Ο διαχωρισμός γίνεται πριν από την εμφάνιση τιμών ώστε να μη δημιουργείται σύγχυση ή λάθος αίτηση.</p><p>Αν η αυτόματη αντιστοίχιση δεν μπορεί να γίνει με ασφάλεια, δεν μαντεύουμε. Η περίπτωση περνά σε έλεγχο.</p></div></div></div></section>
  <section className="shell content-cta"><div><div className="eyebrow">Χρειάζεσαι βοήθεια;</div><h2>Αν το Γ.Ε.ΜΗ. δεν επιστρέφει σωστά την επιχείρησή σου, μην επιλέξεις αυθαίρετα άλλη περιοχή.</h2></div><div className="hero-actions"><Link className="button" href="/help">Κέντρο βοήθειας</Link><Link className="button button-secondary" href="/join/requirements">Τι χρειάζεται για συνεργασία</Link></div></section>
  <SiteFooter/>
 </main>;
}
