import Link from "next/link";
import {fiscalMerchantReadiness} from "../lib/fiscal-merchant-readiness";
import type {FiscalReadinessAccount} from "../lib/fiscal-merchant-readiness";

const stepStateLabel={
 complete:"Καταχωρίστηκε",
 pending:"Σε εκκρεμότητα",
 restricted:"Περιορισμένη πρόσβαση",
 unavailable:"Δεν είναι διαθέσιμο"
} as const;

const roleLabel:Record<string,string>={
 owner:"Ιδιοκτήτης",accountant:"Λογιστής",viewer:"Προβολή"
};

export function FiscalMerchantReadiness({
 accounts,emailVerified,emailVerificationEnabled
}:{
 accounts:readonly FiscalReadinessAccount[];
 emailVerified:boolean;
 emailVerificationEnabled:boolean;
}){
 if(!accounts.length)return <section className="fiscal-panel fiscal-section" aria-labelledby="fiscal-onboarding-title">
  <h2 id="fiscal-onboarding-title">Πρώτα βήματα</h2>
  <p>Δεν υπάρχει συνδεδεμένη επιχείρηση στον λογαριασμό σας. Οι νέες επιχειρήσεις εισάγονται μέσω ελεγχόμενης πρόσκλησης και ανθρώπινου ελέγχου, όχι μέσω ανοικτής αυτοέγκρισης.</p>
  <p className="fiscal-muted">Το εργαστήριο συνθετικών πιστώσεων είναι διαθέσιμο ακόμη και χωρίς ενεργή επιχείρηση. Δεν δημιουργεί επίσημα φορολογικά παραστατικά.</p>
  <p><Link className="fiscal-button" href="/timologio/credit-lab">Δοκιμή εργαστηρίου πιστώσεων</Link></p>
 </section>;
 return <section className="fiscal-panel fiscal-section" aria-labelledby="fiscal-onboarding-title">
   <h2 id="fiscal-onboarding-title">Οι επιχειρήσεις μου · κατάσταση ενεργειών</h2>
   <p className="fiscal-muted">Τα παρακάτω στοιχεία προέρχονται μόνο από τη δική σας πρόσβαση και την καταγεγραμμένη κατάσταση ελέγχου. Δεν αποτελούν επιβεβαίωση ΑΦΜ ή άδεια έκδοσης.</p>
   <div className="fiscal-readiness-list">
   {accounts.map(account=>{
    const ready=fiscalMerchantReadiness(account,{
      verified:emailVerified,verificationEnabled:emailVerificationEnabled
    });
    return <article key={account.id} className="fiscal-readiness-card" aria-labelledby={"fiscal-org-"+account.id}>
     <div className="fiscal-readiness-head">
      <div>
       <small className="fiscal-muted">ΑΦΜ · {account.vat_number} · {roleLabel[account.role]??"Περιορισμένος ρόλος"}</small>
       <h3 id={"fiscal-org-"+account.id}>{account.legal_name}</h3>
      </div>
      <span className="fiscal-readiness-pill">{ready.organizationStatus}</span>
     </div>
     <p className="fiscal-muted">{ready.organizationDetail}</p>
     <ol className="fiscal-readiness-steps" aria-label={"Βήματα ελέγχου "+account.legal_name}>
      {ready.steps.map(step=><li key={step.id} className={"fiscal-readiness-step fiscal-readiness-"+step.state}>
       <div className="fiscal-readiness-step-head">
        <strong>{step.label}</strong>
        <span>{stepStateLabel[step.state]}</span>
       </div>
       <p>{step.detail}</p>
      </li>)}
     </ol>
     <div className="fiscal-actions">
      {ready.testDraftWritesAllowed
       ?<Link className="fiscal-button" href={"/timologio/drafts?organizationId="+encodeURIComponent(account.id)}>Δοκιμαστικά drafts</Link>
       :<Link className="fiscal-button secondary" style={{color:"#10323c"}} href={"/timologio/drafts?organizationId="+encodeURIComponent(account.id)}>Προβολή δοκιμαστικών εγγραφών</Link>}
      {ready.testJournalWritesAllowed
       ?<Link className="fiscal-button secondary" style={{color:"#10323c"}} href={"/timologio/journal?organizationId="+encodeURIComponent(account.id)}>Δοκιμαστικό ημερολόγιο</Link>
       :null}
      <Link className="fiscal-button secondary" style={{color:"#10323c"}} href="/timologio/credit-lab">Εργαστήριο πιστώσεων</Link>
     </div>
    </article>;
   })}
   </div>
   <p className="fiscal-alert"><strong>Η έκδοση παραμένει κλειδωμένη.</strong> Δεν είναι ενεργή η νόμιμη έκδοση, διαβίβαση myDATA/ΑΑΔΕ, η αναγνώριση επίσημων λογιστικών εγγραφών ή η εκτέλεση επιστροφών.</p>
 </section>;
}
