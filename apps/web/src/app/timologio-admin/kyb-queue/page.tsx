import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {fiscalAdminActor} from "../../../lib/fiscal-auth";
import {fiscalMfaEnforced,isFiscalMfaSatisfied} from "../../../lib/fiscal-operator-mfa";
import {fiscalPool} from "../../../lib/fiscal-runtime";
import {
 FISCAL_KYB_REVIEW_QUEUE_SQL,parseFiscalKybReviewCursor,
 summarizeFiscalKybReviewPage
} from "../../../lib/fiscal-kyb-review-queue";

export const dynamic="force-dynamic";
type Raw=Readonly<{id:string;legal_name:string;status:string;created_at_key:string;
 check_type:string|null;outcome:string|null}>;
const priorityLabel={
 follow_up:"Απαιτείται διερεύνηση",
 evidence_pending:"Ελλιπή στοιχεία",
 unstarted:"Δεν υπάρχουν καταχωρίσεις",
 recorded_for_review:"Αναφορές προς αξιολόγηση"
} as const;
const stateLabel={pending_review:"Αναμονή εξέτασης",under_review:"Σε εξέταση"} as const;

export default async function FiscalKybQueuePage({
 searchParams
}:{searchParams:Promise<{after?:string|string[]}>}){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 if(fiscalMfaEnforced()&&!(await isFiscalMfaSatisfied(actor)))
  redirect("/timologio-admin/mfa");
 const {after}=await searchParams;
 let cursor:ReturnType<typeof parseFiscalKybReviewCursor>;
 try{cursor=parseFiscalKybReviewCursor(after);}catch{notFound();}
 const data=await fiscalPool().query<Raw>(FISCAL_KYB_REVIEW_QUEUE_SQL,
   [cursor?.createdAt??null,cursor?.id??null])
  .then(r=>({page:summarizeFiscalKybReviewPage(r.rows),failed:false as const}))
  .catch(()=>({page:null,failed:true as const}));
 const page=data.page;
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · KYB</span></Link>
   <nav><Link href="/timologio-admin">Control Centre</Link>
    <Link href="/timologio-admin/release-readiness">Ετοιμότητα</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">M30 · Private operator case triage · Read-only</div>
   <h1>Εκκρεμότητες ελέγχου επιχειρήσεων</h1>
   <p>Πλοήγηση σε όλες τις ανοικτές υποθέσεις, 40 ανά σελίδα, με σταθερή σειρά
      δημιουργίας. Η προτεραιοποίηση ισχύει μέσα σε κάθε σελίδα και δεν αποτελεί
      αυτόματη απόφαση ελέγχου.</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <p className="fiscal-alert" role="status"><strong>Μόνο διαχείριση εκκρεμοτήτων.</strong>
      {" "}Δεν επιβεβαιώνεται αυτόματα ΑΦΜ, εταιρική ταυτότητα ή εκπροσώπηση,
      ούτε δίνεται έγκριση ή δικαίωμα έκδοσης.</p>
   {data.failed?<p className="fiscal-alert" role="alert">Η ανεξάρτητη βάση FISCAL δεν είναι διαθέσιμη για έλεγχο. Καμία κατάσταση υπόθεσης δεν μπορεί να επιβεβαιωθεί.</p>:
    !page||!page.cases.length?<p className="fiscal-muted">Δεν βρέθηκαν άλλες ανοικτές υποθέσεις από αυτό το σημείο πλοήγησης.</p>:
    <>
     <div className="fiscal-grid">
      {(["follow_up","evidence_pending","unstarted","recorded_for_review"] as const).map(priority=><article key={priority} className="fiscal-card">
       <small>{priorityLabel[priority]}</small>
       <div className="fiscal-stat">{page.cases.filter(c=>c.priority===priority).length}</div>
      </article>)}
     </div>
     <div style={{overflowX:"auto",marginTop:24}}>
      <table className="fiscal-table">
       <caption style={{textAlign:"left",padding:12}}>Έως 40 υποθέσεις της τρέχουσας σελίδας. Η σειρά προτεραιότητας αφορά μόνο αυτές τις υποθέσεις. Οι μετρήσεις δεν αποτελούν ποσοστό πραγματικής επαλήθευσης.</caption>
       <thead><tr><th scope="col">Επιχείρηση</th><th scope="col">Κατάσταση</th><th scope="col">Προτεραιότητα</th><th scope="col">Καταχωρίσεις</th><th scope="col">Εκκρεμότητες</th><th scope="col">Εσωτερικός φάκελος</th></tr></thead>
       <tbody>{page.cases.map(item=><tr key={item.id}>
        <th scope="row">{item.legalName}</th>
        <td>{stateLabel[item.status]}</td><td>{priorityLabel[item.priority]}</td>
        <td>{item.progress.recordedCount} / {item.progress.rows.length}</td>
        <td>{item.progress.outstandingCount}{item.progress.followUpCount?" · "+item.progress.followUpCount+" προς επανεξέταση":""}</td>
        <td><Link href={"/timologio-admin/accounts/"+item.id}>Άνοιγμα υπόθεσης</Link></td>
       </tr>)}</tbody>
      </table>
     </div>
    </>}
   <nav className="fiscal-actions" aria-label="Σελίδες υποθέσεων">
    {cursor?<Link className="fiscal-button secondary" style={{color:"#10323c"}}
      href="/timologio-admin/kyb-queue">Πρώτη σελίδα</Link>:null}
    {page?.hasNext&&page.nextCursor?<Link className="fiscal-button"
      href={"/timologio-admin/kyb-queue?after="+encodeURIComponent(page.nextCursor)}>
      Επόμενες 40 υποθέσεις →</Link>:null}
   </nav>
   <p className="fiscal-muted" style={{marginTop:20}}>Ο δείκτης επόμενης σελίδας δεν περιέχει στοιχεία τεκμηρίωσης. Οι πραγματικές πηγές, έγγραφα και εσωτερικές σημειώσεις παραμένουν στον προστατευμένο φάκελο χειριστή. Αν μια υπόθεση κλείσει στο μεταξύ, η επόμενη σελίδα ανακτά μόνο τις τότε ανοικτές υποθέσεις.</p>
   <p className="fiscal-alert"><strong>Νόμιμη έκδοση: OFF.</strong> Η ταξινόμηση υποθέσεων δεν μεταβάλλει φορολογικές άδειες, KYB αποφάσεις, πληρωμές ή διαβίβαση στην ΑΑΔΕ.</p>
  </section>
 </div></main>;
}
