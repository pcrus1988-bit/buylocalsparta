import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {getFiscalOperationalReleaseSummary} from "../../../lib/fiscal-release-probe";
import {getFiscalLiveMigrationReadiness} from "../../../lib/fiscal-live-migration-readiness";

export const dynamic="force-dynamic";

const stateLabel={
 safe:"Επαληθεύτηκε / ασφαλής ρύθμιση",
 pending:"Εκκρεμεί",
 blocked:"Απαιτείται ενέργεια"
} as const;

export default async function FiscalReleaseReadinessPage(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const summary=await getFiscalOperationalReleaseSummary();
 const live=await getFiscalLiveMigrationReadiness();
 const safeCount=summary.gates.filter(g=>g.state==="safe").length;
 const pendingCount=summary.gates.filter(g=>g.state==="pending").length;
 const blockedCount=summary.gates.filter(g=>g.state==="blocked").length;
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio-admin">Control Centre</Link><Link href="/timologio-admin/compliance">Πιστοποίηση</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">M26 · Independent release diagnostics · Read-only</div>
   <h1>Έλεγχοι ετοιμότητας λειτουργίας</h1>
   <p>Εξέταση ασφαλούς παραμετροποίησης, βασικού σχήματος και εκκρεμοτήτων, χωρίς πρόσβαση σε μυστικά, χωρίς αλλαγές συστήματος και χωρίς έγκριση φορολογικής έκδοσης.</p>
  </section>
  <section className="fiscal-panel">
   <h2>Διαγνωστική επισκόπηση</h2>
   <p className="fiscal-alert" role="status"><strong>Νόμιμη έκδοση: ΑΝΕΝΕΡΓΗ.</strong> Καμία κατάσταση σε αυτόν τον πίνακα δεν δημιουργεί άδεια έκδοσης, διαβίβαση ΑΑΔΕ, πιστοποίηση παρόχου ή νομική έγκριση. Η οριστική ενεργοποίηση απαιτεί ανεξάρτητες διαδικασίες και τεκμηρίωση.</p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Ανεξάρτητη λειτουργική βάση</small>
     <div className="fiscal-stat">{summary.foundationOperational?"OK":"ΕΚΚΡΕΜΕΙ"}</div>
     <p>Η παρουσία λειτουργικής βάσης δεν σημαίνει πιστοποίηση.</p>
    </article>
    <article className="fiscal-card">
     <small>Μη ασφαλείς ενεργοποιήσεις</small>
     <div className="fiscal-stat">{summary.configurationHasUnsafeOverrides?"ΕΛΕΓΧΟΣ":"0"}</div>
     <p>{summary.configurationHasUnsafeOverrides?"Απαιτείται άμεση διερεύνηση παραμέτρων.":"Δεν εντοπίστηκαν ασυμβατότητες στις ελεγχόμενες σημαίες."}</p>
    </article>
    <article className="fiscal-card">
     <small>Εσωτερικοί έλεγχοι</small>
     <div className="fiscal-stat">{safeCount} / {summary.gates.length}</div>
     <p>{pendingCount} σε εκκρεμότητα · {blockedCount} απαιτούν ενέργεια (περιλαμβάνει εξωτερική πιστοποίηση).</p>
    </article>
    <article className="fiscal-card">
     <small>Άδεια λειτουργίας παραστατικών</small>
     <div className="fiscal-stat">ΟΧΙ</div>
     <p>Δεν υπάρχει εσωτερική εντολή έκδοσης ή παράκαμψη ελέγχων.</p>
    </article>
   </div>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <div className="fiscal-kicker">M48 · Live production evidence · Read-only</div>
   <h2>Ετοιμότητα βάσης &amp; ανάκτησης</h2>
   <p className="fiscal-muted">Τα στοιχεία προέρχονται από την πραγματική ανεξάρτητη βάση FISCAL και τους καταλόγους PostgreSQL κατά την προβολή. Δεν περιλαμβάνουν προσωπικά δεδομένα, παραστατικά ή μυστικά. Δεν εκτελείται καμία αλλαγή.</p>
   <div className="fiscal-grid">
    <article className="fiscal-card">
     <small>Καταχωρημένες εκδόσεις βάσης</small>
     <div className="fiscal-stat">{live.migrationCount??"—"}</div>
     <p>{live.verified?`Εκκρεμείς γνωστές εγγραφές: ${live.missingKnownMigrations.length}`:"Δεν επαληθεύτηκε η κατάσταση. Η μεταφορά παραμένει αποκλεισμένη."}</p>
    </article>
    <article className="fiscal-card">
     <small>Διαφορά ιστορικού και πραγματικού σχήματος</small>
     <div className="fiscal-stat">{!live.verified?"ΑΓΝΩΣΤΟ":live.fkIndexDrift?"ΑΣΥΜΦΩΝΙΑ":"—"}</div>
     <p>{live.fkIndexDrift?"Υπάρχουν δείκτες χωρίς αντίστοιχη εσωτερική εγγραφή. Απαιτείται ελεγχόμενη συμφωνία.":"Η απουσία γνωστής διαφοράς δεν πιστοποιεί όλα τα αρχεία migration."}</p>
    </article>
    <article className="fiscal-card">
     <small>Προστασία δεδομένων · RLS</small>
     <div className="fiscal-stat">{live.verified?`${live.unprotectedTables} χωρίς RLS`:"ΑΓΝΩΣΤΟ"}</div>
     <p>Σύνολο πινάκων FISCAL και αριθμός χωρίς RLS. Ο έλεγχος δεν πιστοποιεί όλους τους ρόλους.</p>
    </article>
    <article className="fiscal-card">
     <small>Ενεργοί παράγοντες MFA υπερδιαχειριστών</small>
     <div className="fiscal-stat">{live.activeSuperAdminFactors??"—"}</div>
     <p>Για την προτεινόμενη ανάκτηση χρειάζονται δύο άλλοι ανεξάρτητοι εξουσιοδοτημένοι εγκρίνοντες. Ο αριθμός παραγόντων δεν αποδεικνύει διαφορετικά φυσικά πρόσωπα.</p>
    </article>
   </div>
   {live.verified&&live.missingKnownMigrations.length>0&&<p className="fiscal-alert" style={{marginTop:16}}>
    <strong>Ελλείπουσες εγγραφές:</strong> {live.missingKnownMigrations.join(" · ")}. Δεν σημαίνει ότι κάθε αλλαγή λείπει από το πραγματικό σχήμα, ούτε επιτρέπεται αυτόματη επανεκτέλεση.
   </p>}
   <p className="fiscal-alert" style={{marginTop:16}}><strong>Ανάκτηση από αντίγραφο παραγωγής: ΜΗ ΕΠΑΛΗΘΕΥΜΕΝΗ.</strong> Η επιτυχής αποκατάσταση σε απομονωμένη βάση δοκιμών (M47) δεν αποδεικνύει ότι το τρέχον αντίγραφο παραγωγής μπορεί να αποκατασταθεί. Ελέγξτε το πραγματικό αντίγραφο στον <Link href="https://supabase.com/dashboard/project/kcpwxplxqtqdsfwlfsaa/database/backups/scheduled">ιδιωτικό πίνακα αντιγράφων FISCAL</Link> και καταχωρίστε την απόδειξη σε εγκεκριμένο ασφαλές σύστημα. Η φορολογική έκδοση παραμένει απενεργοποιημένη.</p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <h2>Αναλυτικοί έλεγχοι</h2>
   <p className="fiscal-muted">Μόνο ανάγνωση από τη ρύθμιση του ανεξάρτητου FISCAL και μία συγκεντρωτική ερώτηση στα migration markers / system catalogs. Δεν προβάλλονται κωδικοί, email, διευθύνσεις διακομιστή ή εταιρικοί φάκελοι.</p>
   <div className="fiscal-grid">
    {summary.gates.map(gate=><article key={gate.id} className="fiscal-card fiscal-release-gate">
     <small>{stateLabel[gate.state]}</small>
     <h3>{gate.title}</h3>
     <p>{gate.detail}</p>
    </article>)}
   </div>
   <p className="fiscal-alert" style={{marginTop:20}}>Η επάρκεια διαδικασιών KYB, οι πραγματικές παραδόσεις email, οι ανεξάρτητες εγκρίσεις MFA, τα πιστοποιητικά POS, οι προδιαγραφές B2G και οι εγκρίσεις ΑΑΔΕ <strong>δεν μπορούν να πιστοποιηθούν μόνο από αυτόν τον τεχνικό έλεγχο</strong>.</p>
  </section>
 </div></main>;
}
