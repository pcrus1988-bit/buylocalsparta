import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { CONTROLLER, DATA_ACCESS_EXAMPLES, DATA_RECIPIENTS, LEGAL_LAST_UPDATED } from "../../lib/legal-transparency";

export const metadata: Metadata = {
  title: "Πολιτική Απορρήτου",
  description: "Πώς το ΚΟΝΤΑ ΜΟΥ συλλέγει, χρησιμοποιεί, διαβιβάζει, προστατεύει και διατηρεί προσωπικά δεδομένα.",
  alternates: { canonical: "/privacy" }
};

const processing = [
  ["Λογαριασμός & ταυτοποίηση", "Email, στοιχεία προφίλ, στοιχεία σύνδεσης και ασφάλειας", "Εκτέλεση σύμβασης / λήψη μέτρων κατόπιν αιτήματος και ασφάλεια υπηρεσίας"],
  ["Καλάθι, checkout & παραγγελία", "Προϊόντα, ποσά, στοιχεία παραλήπτη, διεύθυνση/locker, order history", "Εκτέλεση σύμβασης"],
  ["Πληρωμές & refunds", "Στοιχεία επικοινωνίας, ποσό, αναφορές payment/order/provider", "Εκτέλεση σύμβασης και, όπου απαιτείται, νομική υποχρέωση"],
  ["Παράδοση & παραλαβή", "Στοιχεία παραλήπτη και fulfilment που είναι αναγκαία για τον συγκεκριμένο τρόπο παράδοσης", "Εκτέλεση σύμβασης"],
  ["AADE / φορολογικά", "Στοιχεία συναλλαγής και φορολογικά στοιχεία που απαιτεί η νομοθεσία", "Νομική υποχρέωση"],
  ["Υποστήριξη, Ask Local, advice, returns", "Περιεχόμενο αιτήματος/επικοινωνίας και συναφή στοιχεία λογαριασμού ή παραγγελίας", "Εκτέλεση σύμβασης ή έννομο συμφέρον, ανάλογα με το αίτημα"],
  ["Ασφάλεια & πρόληψη κατάχρησης", "Ψευδωνυμικά αναγνωριστικά, security events, rate-limit signals και audit evidence", "Έννομο συμφέρον για ασφάλεια, ακεραιότητα και αποτροπή κατάχρησης"],
  ["Προσωποποίηση", "Saved/recent signals και προτιμήσεις", "Συγκατάθεση όπου απαιτείται και λειτουργικές επιλογές του χρήστη"],
  ["Analytics", "Ψευδωνυμικά page-view, engagement και conversion/product events", "Συγκατάθεση"],
  ["Marketing", "Μόνο δεδομένα/trackers που αντιστοιχούν σε ρητή επιλογή marketing", "Συγκατάθεση"]
] as const;

export default function PrivacyPage() {
  const tel = `tel:+30${CONTROLLER.phone}`;
  return <main className="legal-page">
    <div className="announcement">Απόρρητο με σκοπό, ελάχιστη πρόσβαση και καθαρή ενημέρωση.</div>
    <SiteHeader compact />
    <section className="content-hero content-hero-privacy"><div className="shell content-hero-grid"><div><div className="eyebrow light">GDPR · Privacy notice</div><h1>Πολιτική Απορρήτου</h1><p>Εξηγούμε ποια δεδομένα χρησιμοποιούνται, για ποιο σκοπό, ποιος μπορεί να τα δει και πότε διαγράφονται ή διατηρούνται λόγω νόμιμης υποχρέωσης.</p><div className="hero-actions"><Link className="button button-light" href="/privacy-controls">Έλεγχοι ιδιωτικότητας</Link><Link className="button content-outline" href="/cookies">Cookies</Link></div></div><div className="legal-stamp" aria-hidden="true"><span>PRIVACY</span><strong>BY DESIGN</strong><i>GDPR</i></div></div></section>

    <section className="shell legal-section" aria-labelledby="controller"><div className="legal-prose"><div className="eyebrow">Υπεύθυνος επεξεργασίας</div><h2 id="controller">Ποιος είναι υπεύθυνος για τα δεδομένα</h2><p>Υπεύθυνος επεξεργασίας για το ΚΟΝΤΑ ΜΟΥ είναι η <strong>{CONTROLLER.legalName}</strong>.</p><dl className="legal-contact"><div><dt>Έδρα</dt><dd>{CONTROLLER.address}</dd></div><div><dt>ΑΦΜ</dt><dd>{CONTROLLER.taxNumber}</dd></div><div><dt>ΓΕΜΗ</dt><dd>{CONTROLLER.gemiNumber}</dd></div><div><dt>Email</dt><dd><a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a></dd></div><div><dt>Τηλέφωνο</dt><dd><a href={tel}>{CONTROLLER.phone}</a></dd></div></dl><p className="legal-updated">Τελευταία ενημέρωση: {LEGAL_LAST_UPDATED}</p></div></section>

    <section className="shell legal-section" aria-labelledby="processing"><div className="eyebrow">Σκοποί & νομικές βάσεις</div><h2 id="processing">Γιατί χρησιμοποιούμε προσωπικά δεδομένα</h2><div className="legal-table-wrap"><table className="legal-table"><thead><tr><th>Δραστηριότητα</th><th>Τυπικά δεδομένα</th><th>Νομική βάση</th></tr></thead><tbody>{processing.map(([activity,data,basis])=><tr key={activity}><th scope="row">{activity}</th><td>{data}</td><td>{basis}</td></tr>)}</tbody></table></div><p>Δεν ζητάμε «συγκατάθεση» για επεξεργασία που είναι αντικειμενικά αναγκαία για να εκτελέσουμε μια παραγγελία ή να εκπληρώσουμε φορολογική υποχρέωση. Η συγκατάθεση χρησιμοποιείται για πραγματικά προαιρετικούς σκοπούς και μπορεί να ανακληθεί.</p></section>

    <section className="content-band"><div className="shell legal-section legal-section-on-dark"><div className="eyebrow light">Πρόσβαση με σκοπό</div><h2>Ποιος βλέπει τι — και γιατί</h2><div className="legal-card-grid">{DATA_ACCESS_EXAMPLES.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div><p>Οι συνεργάτες δεν αποκτούν αυτομάτως ένα μόνιμο «customer list». Η πρόσβαση πρέπει να περιορίζεται στη συγκεκριμένη παραγγελία ή λειτουργία και να παύει όταν ο σκοπός τελειώσει, με την επιφύλαξη νόμιμων υποχρεώσεων.</p></div></section>

    <section className="shell legal-section" aria-labelledby="recipients"><div className="eyebrow">Αποδέκτες & πάροχοι</div><h2 id="recipients">Πότε διαβιβάζουμε δεδομένα</h2><p>Διαβιβάζουμε μόνο ό,τι χρειάζεται για τον συγκεκριμένο σκοπό. Ενδεικτικά:</p><div className="legal-card-grid">{DATA_RECIPIENTS.map((item)=><article key={item.name}><h3>{item.name}</h3><p><strong>Σκοπός:</strong> {item.purpose}</p><p><strong>Δεδομένα:</strong> {item.data}</p></article>)}</div><p>Ο ακριβής νομικός ρόλος κάθε παρόχου (εκτελών την επεξεργασία, ανεξάρτητος υπεύθυνος ή άλλος αποδέκτης) καθορίζεται από τον σκοπό, την εφαρμοστέα νομοθεσία και τις συμβατικές του υποχρεώσεις. Τυχόν διαβιβάσεις εκτός ΕΟΧ πραγματοποιούνται μόνο με κατάλληλο νόμιμο μηχανισμό.</p></section>

    <section className="shell legal-section" aria-labelledby="retention"><div className="eyebrow">Διατήρηση</div><h2 id="retention">Δεν κρατάμε όλα τα δεδομένα για τον ίδιο χρόνο</h2><p>Εφαρμόζουμε χρόνο διατήρησης ανά σκοπό. Προσωρινά tokens, sessions, abandoned flows, analytics και security logs έχουν διαφορετικούς κύκλους ζωής. Παραγγελίες, παραστατικά και φορολογικά στοιχεία μπορεί να διατηρούνται για μεγαλύτερο διάστημα όταν το απαιτεί η φορολογική ή άλλη νομοθεσία. Όπου είναι δυνατό, δεδομένα διαγράφονται ή ανωνυμοποιούνται όταν λήξει ο σκοπός.</p><p>Η διαγραφή λογαριασμού συνεπώς δεν σημαίνει ότι επιτρέπεται να διαγραφεί φορολογικό παραστατικό που ο νόμος απαιτεί να διατηρηθεί.</p></section>

    <section className="shell legal-section" aria-labelledby="rights"><div className="eyebrow">Τα δικαιώματά σου</div><h2 id="rights">Πρόσβαση, διόρθωση, διαγραφή και έλεγχος</h2><p>Ανάλογα με την περίπτωση μπορείς να ζητήσεις πρόσβαση, διόρθωση, διαγραφή, περιορισμό, φορητότητα, να εναντιωθείς σε επεξεργασία που βασίζεται σε έννομο συμφέρον και να ανακαλέσεις συγκατάθεση χωρίς να θίγεται η νομιμότητα της προηγούμενης επεξεργασίας.</p><p>Μπορείς να ξεκινήσεις από τα <Link href="/privacy-controls">Privacy controls</Link> ή να επικοινωνήσεις στο <a href={`mailto:${CONTROLLER.email}`}>{CONTROLLER.email}</a>. Για την προστασία σου μπορεί να χρειαστεί επιβεβαίωση ταυτότητας πριν δοθούν ή αλλάξουν δεδομένα.</p><p>Έχεις επίσης δικαίωμα να υποβάλεις καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα.</p></section>

    <section className="shell legal-section" aria-labelledby="security"><div className="eyebrow">Ασφάλεια & λογοδοσία</div><h2 id="security">Περιορισμένη πρόσβαση και ίχνος ενεργειών</h2><p>Η πλατφόρμα χρησιμοποιεί role-based permissions, vendor scoping, Row Level Security, session/CSRF controls, audit events και purpose-specific views. Τα production δεδομένα δεν προορίζονται για γενική πρόσβαση προγραμματιστών ή συνεργατών. Ευαίσθητες εξαγωγές και προνομιακές ενέργειες πρέπει να ελέγχονται και να καταγράφονται.</p></section>

    <section className="shell content-cta"><div><div className="eyebrow">Θέλεις πρακτικό έλεγχο;</div><h2>Οι νομικές πληροφορίες συνδέονται με πραγματικές ρυθμίσεις.</h2><p>Ρύθμισε cookies, δες τα privacy controls του λογαριασμού ή επικοινώνησε μαζί μας.</p></div><div className="hero-actions"><Link className="button" href="/privacy-controls">Privacy controls</Link><Link className="button button-secondary" href="/cookies">Πολιτική cookies</Link></div></section>
    <SiteFooter />
  </main>;
}
