import Link from "next/link";
import {redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalMfaEnforced,isFiscalMfaSatisfied} from "../../../lib/fiscal-operator-mfa";
import {fiscalPool} from "../../../lib/fiscal-runtime";
import {FISCAL_KYB_REVIEW_QUEUE_SQL,summarizeFiscalKybReviewQueue} from "../../../lib/fiscal-kyb-review-queue";

export const dynamic="force-dynamic";
type Raw=Readonly<{id:string;legal_name:string;status:string;check_type:string|null;outcome:string|null}>;
const priorityLabel={
 follow_up:"Απαιτείται διερεύνηση",
 evidence_pending:"Ελλιπή στοιχεία",
 unstarted:"Δεν υπάρχουν καταχωρίσεις",
 recorded_for_review:"Αναφορές προς αξιολόγηση"
} as const;
const stateLabel={pending_review:"Αναμονή εξέτασης",under_review:"Σε εξέταση"} as const;

export default async function FiscalKybQueuePage(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 if(fiscalMfaEnforced()&&!(await isFiscalMfaSatisfied(actor)))
  redirect("/timologio-admin/mfa");
 const data=await fiscalPool().query<Raw>(FISCAL_KYB_REVIEW_QUEUE_SQL)
  .then(r=>({rows:summarizeFiscalKybReviewQueue(r.rows),failed:false as const}))
  .catch(()=>({rows:[] as ReturnType<typeof summarizeFiscalKybReviewQueue>,failed:true as const}));
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · KYB</span></Link>
   <nav><Link href="/timologio-admin">Control Centre</Link><Link href="/timologio-admin/release-readiness">Ετοιμότητα</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">M28 · Private operator case triage · Read-only</div>
   <h1>Εκκρεμότητες ελέγχου επιχειρήσεων</h1>
   <p>Οργάνωση των εσωτερικών υποθέσεων με βάση τις καταχωρισμένες ενδείξεις.
      Προβάλλονται έως 40 παλαιότερες ανοικτές υποθέσεις ανά ανανέωση.</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <p className="fiscal-alert" role="status"><strong>Μόνο διαχείριση εκκρεμοτήτων.</strong>
      {" "}Δεν επιβεβαιώνεται αυτόματα ΑΦΜ, εταιρική ταυτότητα ή εκπροσώπηση,
      ούτε δίνεται έγκριση ή δικαίωμα έκδοσης.</p>
   {data.failed?<p className="fiscal-alert" role="alert">Η ανεξάρτητη βάση FISCAL δεν είναι διαθέσιμη για έλεγχο. Καμία κατάσταση υπόθεσης δεν μπορεί να επιβεβαιωθεί.</p>:
    !data.rows.length?<p className="fiscal-muted">Δεν υπάρχουν υποθέσεις σε εκκρεμότητα ή σε εξέταση στο τρέχον περιορισμένο δείγμα.</p>:
    <>
     <div className="fiscal-grid">
      {(["follow_up","evidence_pending","unstarted","recorded_for_review"] as const).map(priority=><article key={priority} className="fiscal-card">
       <small>{priorityLabel[priority]}</small>
       <div className="fiscal-stat">{data.rows.filter(c=>c.priority===priority).length}</div>
      </article>)}
     </div>
     <div style={{overflowX:"auto",marginTop:24}}>
      <table className="fiscal-table">
       <caption style={{textAlign:"left",padding:12}}>Εσωτερική ταξινόμηση έως 40 υποθέσεων. Οι μετρήσεις δεν αποτελούν ποσοστό πραγματικής επαλήθευσης.</caption>
       <thead><tr><th scope="col">Επιχείρηση</th><th scope="col">Κατάσταση</th><th scope="col">Προτεραιότητα</th><th scope="col">Καταχωρίσεις</th><th scope="col">Εκκρεμότητες</th><th scope="col">Εσωτερικός φάκελος</th></tr></thead>
       <tbody>{data.rows.map(item=><tr key={item.id}>
        <th scope="row">{item.legalName}</th>
        <td>{stateLabel[item.status]}</td><td>{priorityLabel[item.priority]}</td>
        <td>{item.progress.recordedCount} / {item.progress.rows.length}</td>
        <td>{item.progress.outstandingCount}{item.progress.followUpCount?" · "+item.progress.followUpCount+" προς επανεξέταση":""}</td>
        <td><Link href={"/timologio-admin/accounts/"+item.id}>Άνοιγμα υπόθεσης</Link></td>
       </tr>)}</tbody>
      </table>
     </div>
    </>}
   <p className="fiscal-muted" style={{marginTop:20}}>Η προτεραιότητα προκύπτει μόνο από την τελευταία καταχώριση ανά βήμα. Οι πραγματικές πηγές, έγγραφα και εσωτερικές σημειώσεις παραμένουν στον προστατευμένο φάκελο χειριστή. Δεν πραγματοποιείται αποστολή μηνυμάτων ή ενημέρωση κατάστασης.</p>
   <p className="fiscal-alert"><strong>Νόμιμη έκδοση: OFF.</strong> Η ταξινόμηση υποθέσεων δεν μεταβάλλει φορολογικές άδειες, KYB αποφάσεις, πληρωμές ή διαβίβαση στην ΑΑΔΕ.</p>
  </section>
 </div></main>;
}
