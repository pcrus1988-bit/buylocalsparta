import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {fiscalMerchantAccounts,getFiscalActor} from "../../../lib/fiscal-auth";
import {loadFiscalMerchantKybProgress} from "../../../lib/fiscal-merchant-kyb-store";
import {FiscalKybPreparationChecklist} from "../../../components/FiscalKybPreparationChecklist";

export const dynamic="force-dynamic";

export default async function FiscalMerchantOnboarding({
 searchParams
}:{searchParams:Promise<{organizationId?:string}>}){
 const actor=await getFiscalActor();
 if(!actor)redirect("/timologio/login");
 if(actor.role!=="merchant")redirect("/timologio-admin");
 const [{organizationId},accounts]=await Promise.all([searchParams,fiscalMerchantAccounts(actor)]);
 // Do not expose operator evidence to viewers, strangers, or revoked members.
 const account=accounts.find(x=>x.id===organizationId &&
   (x.role==="owner"||x.role==="accountant"));
 if(!account)notFound();
 const active=["pending_review","under_review","approved"].includes(account.status);
 const summary=active
  ?await loadFiscalMerchantKybProgress(actor,account.id).catch(()=>null)
  :null;
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio" className="fiscal-brand">KONTA MOY <span>FISCAL</span></Link>
   <nav><Link href="/timologio/dashboard">Οι επιχειρήσεις μου</Link>
    <Link href="/timologio/credit-lab">Εργαστήριο πιστώσεων</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">Merchant KYB · Private progress view</div>
   <h1>Πρόοδος ελέγχου επιχείρησης</h1>
   <p>{account.legal_name} · ΑΦΜ {account.vat_number}</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <h2>Εσωτερική καταγραφή επτά βημάτων</h2>
   <p className="fiscal-alert" role="status"><strong>Δεν αποτελεί πιστοποίηση ή έγκριση.</strong>
    {" "}Οι καταστάσεις δείχνουν μόνο όσα έχει καταχωρίσει χειριστής για εσωτερική εξέταση.
    Η καταχώριση στοιχείου δεν αποδεικνύει την εγκυρότητά του, την πραγματική ιδιοκτησία, τη νόμιμη εκπροσώπηση ή την ετοιμότητα έκδοσης.</p>
   {!active?<p className="fiscal-alert">Η επιχείρηση είναι σε περιορισμένη κατάσταση.
     Το ιστορικό εσωτερικού ελέγχου δεν εμφανίζεται. Επικοινωνήστε με την εξουσιοδοτημένη υποστήριξη για τυχόν επανεξέταση.</p>:
    !summary?<p className="fiscal-alert" role="alert">Η κατάσταση του ελέγχου δεν μπορεί να επαληθευτεί αυτή τη στιγμή. Δεν παρουσιάζεται προεπιλεγμένη πρόοδος. Δοκιμάστε ξανά.</p>:
    <>
     <p><strong>{summary.recordedCount} από {summary.rows.length}</strong> βήματα διαθέτουν καταχωρισμένη αναφορά τεκμηρίωσης,
      {" "}<strong>{summary.outstandingCount}</strong> δεν έχουν τέτοια καταχώριση,
      {" "}<strong>{summary.followUpCount}</strong> απαιτούν επανεξέταση.
      Οι μετρήσεις δεν είναι ποσοστό επαλήθευσης ή έγκρισης.</p>
     <div className="fiscal-grid">
      {summary.rows.map(row=><article key={row.checkType} className="fiscal-card">
       <small>{row.stageLabel}</small>
       <h3>{row.label}</h3>
       <p>{row.description}</p>
      </article>)}
     </div>
    </>}
   <p className="fiscal-muted" style={{marginTop:18}}>Προβάλλονται μόνο συνοπτικές καταστάσεις της επιλεγμένης επιχείρησης. Δεν εμφανίζονται έγγραφα, παραπομπές, εσωτερικές σημειώσεις, πληροφορίες πραγματικών δικαιούχων ή στοιχεία άλλων επιχειρήσεων.</p>
   <p className="fiscal-alert"><strong>Επίσημη φορολογική έκδοση: ΑΝΕΝΕΡΓΗ.</strong>
    {" "}Ούτε η ολοκλήρωση επτά καταχωρίσεων ούτε η εσωτερική κατάσταση λογαριασμού επιτρέπουν έκδοση παραστατικού ή υποβολή στην ΑΑΔΕ.</p>
   <div className="fiscal-actions"><Link className="fiscal-button secondary" style={{color:"#10323c"}}
    href="/timologio/dashboard">Επιστροφή στον λογαριασμό</Link></div>
  </section>
  {active&&summary?<FiscalKybPreparationChecklist progressRows={summary.rows}/>:null}
 </div></main>;
}
