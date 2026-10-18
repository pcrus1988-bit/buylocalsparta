import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalMfaEnforced,isFiscalMfaSatisfied} from "../../../lib/fiscal-operator-mfa";
import {getFiscalKybIntakeReadiness} from "../../../lib/fiscal-kyb-intake-security";

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
   <div className="fiscal-kicker">M31 · Sensitive evidence · Internal design review</div>
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
