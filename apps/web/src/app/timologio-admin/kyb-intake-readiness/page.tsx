import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalMfaEnforced,isFiscalMfaSatisfied} from "../../../lib/fiscal-operator-mfa";
import {getFiscalKybIntakeReadiness} from "../../../lib/fiscal-kyb-intake-security";
import {getFiscalVaultLiveReadiness} from "../../../lib/fiscal-kyb-vault-live-readiness";

export const dynamic="force-dynamic";

/**
 * Internal diagnostic only: no evidence, object store, merchant identifiers,
 * incoming request body, storage configuration or secrets are accessed.
 */
export default async function FiscalKybIntakeReadiness(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const enforced=fiscalMfaEnforced();
 if(enforced&&!(await isFiscalMfaSatisfied(actor)))
  redirect("/timologio-admin/mfa");
 const vault=await getFiscalVaultLiveReadiness();
 const rawUploadFlag=process.env.FISCAL_KYB_UPLOADS_ENABLED?.trim().toLowerCase();
 const status=getFiscalKybIntakeReadiness({
  operatorMfaEnforced:enforced,
  dangerousUploadFlagDetected:Boolean(rawUploadFlag&&rawUploadFlag!=="false")
 });
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link className="fiscal-brand" href="/timologio-admin">KONTA MOY <span>FISCAL · KYB</span></Link>
   <nav><Link href="/timologio-admin">Control Centre</Link>
    <Link href="/timologio-admin/kyb-queue">Υποθέσεις KYB</Link>
    <Link href="/timologio-admin/release-readiness">Έλεγχοι λειτουργίας</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">M34 · Live storage inspection · No document intake</div>
   <h1>Ετοιμότητα ασφαλούς υποβολής δικαιολογητικών</h1>
   <p>Έλεγχος προϋποθέσεων για μελλοντική υποβολή ευαίσθητων στοιχείων
      επιχείρησης. Καμία ένδειξη παρακάτω δεν αποτελεί αυτόματη έγκριση.</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <p role="status" className="fiscal-alert">
    <strong>Η παραλαβή εγγράφων παραμένει ΑΝΕΝΕΡΓΗ.</strong>
    {" "}Δεν υφίσταται σε αυτή τη λειτουργία φόρμα αρχείων, διαδρομή upload,
    προσωρινός σύνδεσμος, αποθήκευση τεκμηρίων ή δυνατότητα ανάγνωσής τους.
    Μην αποστέλλετε ταυτότητες, φορολογικά αποδεικτικά ή άλλες ευαίσθητες
    πληροφορίες με email ή ανεπίσημα κανάλια.</p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Ανεξάρτητα επαληθευμένες προϋποθέσεις</small>
     <div className="fiscal-stat">0 / {status.controls.length}</div>
     <p>Η σελίδα δεν λαμβάνει επιβεβαιώσεις τρίτων και δεν υποθέτει ότι έγιναν έλεγχοι.</p>
    </article>
    <article className="fiscal-card">
     <small>Εκκρεμείς προϋποθέσεις</small>
     <div className="fiscal-stat">{status.unverifiedCount}</div>
     <p>Καθεμία απαιτεί έλεγχο και ανεξάρτητα τεκμήρια πριν την ενεργοποίηση.</p>
    </article>
    <article className="fiscal-card">
     <small>Υποχρεωτικό MFA χειριστών</small>
     <div className="fiscal-stat">{status.operatorMfaEnforced?"ΡΥΘΜΙΣΜΕΝΟ":"ΕΚΚΡΕΜΕΙ"}</div>
     <p>Η παρουσία του flag δεν πιστοποιεί κάθε χειριστή ή τις διαδικασίες ανάκτησης.</p>
    </article>
    <article className="fiscal-card">
     <small>Παραλαβή αρχείων</small>
     <div className="fiscal-stat">OFF</div>
     <p>Δεν εκδίδονται άδειες upload, ακόμη και αν όλοι οι έλεγχοι γίνουν στο μέλλον.</p>
    </article>
   </div>
   {status.dangerousUploadFlagDetected?
    <p className="fiscal-alert" role="alert"><strong>Μη ασφαλής απόπειρα ενεργοποίησης.</strong>
     {" "}Εντοπίστηκε τιμή στο FISCAL_KYB_UPLOADS_ENABLED που ζητά ενεργοποίηση.
     Η εφαρμογή συνεχίζει να απαγορεύει κάθε υποβολή και απαιτεί χειροκίνητο έλεγχο ρύθμισης.</p>:
    <p className="fiscal-muted">Δεν εντοπίστηκε προσπάθεια ενεργοποίησης από την ελεγχόμενη
     ρύθμιση. Αυτό δεν πιστοποιεί την πραγματική κατάσταση αποθήκευσης.</p>}
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:22}}>
   <h2>M34 · Πραγματικός έλεγχος υποδομής αποθήκευσης</h2>
   <p className="fiscal-muted">
    Τα αποτελέσματα προέρχονται από ερωτήματα μόνο ανάγνωσης στη χωριστή
    βάση FISCAL. Δεν εκτελείται δημιουργία bucket, αποθήκευση ή ανάγνωση
    πραγματικών δικαιολογητικών. Ακόμη και σωστές ρυθμίσεις δεν αποτελούν
    ανεξάρτητο έλεγχο ασφάλειας ή νομική έγκριση.
   </p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Κατάσταση αποθετηρίου</small>
     <h3>{vault.status==="not_provisioned"?"Δεν δημιουργήθηκε":
       vault.status==="unavailable"?"Δεν επαληθεύεται":
       vault.status==="unsafe_configuration"?"Μη ασφαλής ρύθμιση":
       "Ρυθμίσεις εντοπίστηκαν"}</h3>
     <p>Η παρουσία αποθετηρίου δεν σημαίνει δικαίωμα παραλαβής εγγράφων.</p>
    </article>
    <article className="fiscal-card">
     <small>Ιδιωτικό bucket και προστασία RLS</small>
     <h3>{vault.bucketExists&&vault.privateBucket&&vault.objectRlsEnabled?
       "Εντοπίστηκαν":"Εκκρεμεί"}</h3>
     <p>Η πραγματική απομόνωση ρόλων και χειριστών απαιτεί ανεξάρτητες δοκιμές.</p>
    </article>
    <article className="fiscal-card">
     <small>Πολιτικές πρόσβασης και κενό αποθετήριο</small>
     <h3>{vault.zeroAccessiblePolicies&&vault.quarantineEmpty?
       "Σύμφωνα με τον έλεγχο":"Δεν επαληθεύεται"}</h3>
     <p>Ο έλεγχος απαιτεί μηδενικές πολιτικές αντικειμένων και μηδενικά αντικείμενα.</p>
    </article>
    <article className="fiscal-card">
     <small>Προτεινόμενο όριο κρυπτογραφημένων δεδομένων</small>
     <h3>{vault.exactMimeAllowlist&&vault.boundedCiphertextSize?
       "Ρύθμιση εντοπίστηκε":"Εκκρεμεί"}</h3>
     <p>Μόνο application/octet-stream έως 12 MiB στον μελλοντικό χώρο καραντίνας.</p>
    </article>
   </div>
   <p className="fiscal-alert" style={{marginTop:18}}>
    <strong>Παραλαβή: OFF · Αποδέσμευση: OFF.</strong>
    {" "}Καμία πολιτική, δοκιμή ή παρουσία bucket δεν ενεργοποιεί αυτόματα
    δικαιολογητικά, KMS, πραγματική σάρωση malware, WORM logs,
    διαγραφή ή έκδοση παραστατικών.
   </p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:22}}>
   <h2>M32 · Πυρήνας ασφαλούς καραντίνας (μόνο εργαστηριακός)</h2>
   <p className="fiscal-muted">
    Έχουν προστεθεί κρυπτογραφικές δομικές μονάδες στον κώδικα, που
    δοκιμάζονται αποκλειστικά με συνθετικά δεδομένα. Δεν υφίσταται πραγματικό
    αποθετήριο αρχείων, κανάλι αποστολής, διαχειριστής κλειδιών ή σαρωτής malware.
   </p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Κρυπτογραφία σε μνήμη</small>
     <h3>AES-256-GCM</h3>
     <p>Τυχαίο nonce, έλεγχος αυθεντικότητας και σύνδεση της σφραγίδας
       με ακριβή επιχείρηση και εγγραφή KYB. Χωρίς αποθήκευση.</p>
    </article>
    <article className="fiscal-card">
     <small>Έλεγχος υποψηφίου αρχείου</small>
     <h3>PDF · PNG · JPEG</h3>
     <p>Έως 5 MiB, έλεγχος υπογραφής τύπου και SHA-256.
       Δεν υποκαθιστά σαρωτή κακόβουλου περιεχομένου.</p>
    </article>
    <article className="fiscal-card">
     <small>Κατάσταση καραντίνας</small>
     <h3>Μη ελεγμένο</h3>
     <p>Κανένα έγγραφο δεν χαρακτηρίζεται καθαρό,
       δεν αποδεσμεύεται και δεν γίνεται διαθέσιμο για λήψη.</p>
    </article>
    <article className="fiscal-card">
     <small>Ασφαλής κύκλος ζωής</small>
     <h3>Μόνο σχέδιο</h3>
     <p>Οι προτεινόμενες μεταβάσεις απαιτούν ανεξάρτητη σάρωση,
       χειριστή και επιβεβαίωση διαγραφής. Καμία μετάβαση δεν εκτελείται.</p>
    </article>
   </div>
   <p className="fiscal-alert" role="note" style={{marginTop:18}}>
    <strong>Όχι παραγωγικό Vault:</strong> 0 ενεργές συνδέσεις με αντικειμενοθήκη,
    KMS ή scanner. Κανένα πραγματικό δικαιολογητικό δεν συλλέγεται
    ούτε ανοίγεται από τη νέα υποδομή.
   </p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:22}}>
   <h2>M33 · Υπογεγραμμένοι έλεγχοι και ίχνος ασφάλειας</h2>
   <p className="fiscal-muted">
    Έχει υλοποιηθεί ο εσωτερικός, ανεξάρτητος από πάροχο μηχανισμός
    επαλήθευσης ψηφιακά υπογεγραμμένων αποτελεσμάτων σάρωσης και
    αλυσίδας συμβάντων. Εκτελείται μόνο με συνθετικές δοκιμές.
    Δεν έχει συνδεθεί πραγματικός σαρωτής, πάροχος αποθήκευσης, KMS
    ή υπηρεσία αμετάβλητης αρχειοθέτησης.
   </p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Υπογραφές σαρωτή</small><h3>Ed25519</h3>
     <p>Έλεγχος υπογραφής, χρόνου, επιχειρηματικού φακέλου,
        κωδικού εγγράφου και αποτυπώματος κρυπτογραφημένου φακέλου.</p>
    </article>
    <article className="fiscal-card">
     <small>Απομόνωση αντικειμένων</small><h3>Τυχαία κλειδιά χώρου</h3>
     <p>Προβλεπόμενη δομή αποθήκευσης ανά επιχείρηση και τεκμήριο,
        χωρίς δημόσια URL και χωρίς ονόματα αρχείων στα κλειδιά.</p>
    </article>
    <article className="fiscal-card">
     <small>Ιχνηλασιμότητα</small><h3>SHA-256 αλυσίδα</h3>
     <p>Επαλήθευση αλλοίωσης σε συνθετικό αρχείο συμβάντων.
        Δεν αποτελεί ανεξάρτητα αγκυρωμένο, αμετάβλητο audit log.</p>
    </article>
    <article className="fiscal-card">
     <small>Προϋποθέσεις ενεργοποίησης</small><h3>Κλειδωμένες</h3>
     <p>Απαιτούνται πραγματικές, ελεγμένες υπογραφές σαρωτή,
       ιδιωτική αποθήκευση ΕΕ, KMS, WORM audit, διαγραφή και νομική αξιολόγηση.</p>
    </article>
   </div>
   <p className="fiscal-alert" style={{marginTop:18}}>
    <strong>Καμία πραγματική λειτουργία Vault:</strong>
    {" "}Δεν αποθηκεύονται ή σαρώνονται έγγραφα, δεν ενεργοποιούνται υποβολές
    και ακόμη και έγκυρη υπογεγραμμένη σάρωση δεν επιτρέπει ανάγνωση,
    έγκριση KYB ή νόμιμη έκδοση παραστατικών.
   </p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:22}}>
   <h2>Εννέα ανεξάρτητες πύλες ασφαλείας</h2>
   <p className="fiscal-muted">Όλες θεωρούνται μη επαληθευμένες ώσπου να προστεθεί
      ξεχωριστό, ελεγχόμενο σύστημα αποδεικτικών και εγκρίσεων. Η ρύθμιση ενός
      διακόπτη δεν μετατρέπει την κατάσταση σε «έτοιμο».</p>
   <div className="fiscal-grid">
    {status.controls.map((control,index)=><article className="fiscal-card" key={control.id}>
     <small>Προϋπόθεση {index+1} · Μη επαληθευμένη</small>
     <h3>{control.label}</h3><p>{control.detail}</p>
    </article>)}
   </div>
   <p className="fiscal-alert" style={{marginTop:20}}>
    <strong>Καμία νόμιμη φορολογική έκδοση.</strong> Η εξασφάλιση διαχείρισης
    δικαιολογητικών δεν θα ενεργοποιούσε από μόνη της φορολογικά παραστατικά,
    αποστολή myDATA/ΑΑΔΕ ή πιστοποίηση παρόχου.</p>
   <div className="fiscal-actions">
    <Link className="fiscal-button secondary" style={{color:"#10323c"}}
      href="/timologio-admin/kyb-queue">Πίσω στις υποθέσεις KYB</Link>
   </div>
  </section>
 </div></main>;
}
