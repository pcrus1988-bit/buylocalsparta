"use client";
import {useEffect,useState} from "react";

type CaseItem={id:string;state:string;evidenceRef:string;requestedAt:string;expiresAt:string;
 approvals:number;targetKind?:string;alreadyApproved?:boolean};
type Inventory={enabled:boolean;mine:CaseItem[];approvable:CaseItem[];requiresTwoOtherSuperAdmins:boolean};
export function FiscalRecoveryWorkbench({csrfToken}:{csrfToken:string}){
 const [inventory,setInventory]=useState<Inventory|null>(null);
 const [requestRef,setRequestRef]=useState("REC-");
 const [approvalRef,setApprovalRef]=useState("");
 const [attested,setAttested]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function refresh(){
  const response=await fetch("/timologio-admin/api/mfa/recovery",{cache:"no-store",credentials:"same-origin"});
  const result=await response.json() as Inventory&{error?:string};
  if(!response.ok)throw new Error(result.error??"RECOVERY_READ_FAILED");
  setInventory(result);
 }
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:"RECOVERY_READ_FAILED"));},[]);
 async function post(body:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/timologio-admin/api/mfa/recovery",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify(body)
   });
   const result=await response.json() as {error?:string;caseId?:string;state?:string;approvals?:number};
   if(!response.ok)throw new Error(result.error??"RECOVERY_ACTION_FAILED");
   setNotice("Καταχωρίστηκε: "+(result.caseId??"")+" · "+(result.state??""));
   setAttested(false);setApprovalRef("");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"RECOVERY_ACTION_FAILED");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section" style={{maxWidth:850}}>
  <h2>Αυστηρά ελεγχόμενη ανάκτηση</h2>
  <p className="fiscal-alert">Η ανάκτηση δεν βασίζεται μόνο στο email ή σε έναν διαχειριστή. Απαιτεί προϋπάρχον,
   επαληθευμένο offline αίτημα με μοναδικό κωδικό REC- και δύο διαφορετικούς super-admin,
   οι οποίοι έχουν ήδη ενεργό authenticator και πρόσφατο MFA step-up.</p>
  {inventory&&!inventory.enabled?<p className="fiscal-muted">Η ηλεκτρονική ανάκτηση παραμένει απενεργοποιημένη μέχρι ανεξάρτητο έλεγχο και δοκιμές.</p>:null}
  {inventory?.enabled?<div style={{display:"grid",gap:20}}>
   <div className="fiscal-card">
    <h3>1 · Αίτημα ανάκτησης του δικού σας authenticator</h3>
    <p>Ζητήστε πρώτα από την υπεύθυνη ομάδα ασφάλειας ανεξάρτητο έλεγχο ταυτότητας και έναν κωδικό υπόθεσης REC-. Δεν μπορείτε να εγκρίνετε το δικό σας αίτημα.</p>
    <label>Κωδικός εγκεκριμένης offline υπόθεσης
     <input value={requestRef} disabled={busy} maxLength={64}
      onChange={e=>setRequestRef(e.target.value.toUpperCase().slice(0,64))}/>
    </label>
    <button className="fiscal-button secondary" type="button" disabled={busy||!/^REC-[A-Z0-9-]{8,60}$/.test(requestRef)}
     onClick={()=>post({action:"request",evidenceRef:requestRef})}>Υποβολή δικού μου αιτήματος</button>
    <h4>Δικά μου αιτήματα</h4>
    {inventory.mine.length===0?<p>Δεν υπάρχει αίτημα.</p>:inventory.mine.map(item=><div key={item.id}>
     <code>{item.id}</code><p>{item.state} · Εγκρίσεις {item.approvals}/2 · {item.evidenceRef}</p>
     {item.state==="pending"?<button className="fiscal-button secondary" disabled={busy} type="button"
       onClick={()=>post({action:"cancel",caseId:item.id})}>Ακύρωση αιτήματος</button>:null}
    </div>)}
   </div>
   <div className="fiscal-card">
    <h3>2 · Έγκριση από ανεξάρτητους εποπτικούς διαχειριστές</h3>
    <p>Μόνο marketplace super-admin που έχει ολοκληρώσει MFA τα τελευταία 15 λεπτά βλέπει εκκρεμείς υποθέσεις. Κάθε επιβεβαίωση προϋποθέτει ανεξάρτητη ταυτοποίηση του αιτούντος.</p>
    <label>Κωδικός υπόθεσης από ανεξάρτητη τεκμηρίωση
     <input value={approvalRef} maxLength={64} disabled={busy}
      onChange={e=>setApprovalRef(e.target.value.toUpperCase().slice(0,64))}/>
    </label>
    <label style={{display:"flex",gap:10,alignItems:"start"}}>
     <input type="checkbox" checked={attested} disabled={busy}
       onChange={e=>setAttested(e.target.checked)}/>
     Επιβεβαιώνω ότι έκανα ανεξάρτητη, εκτός συστήματος επαλήθευση ταυτότητας και δικαιώματος ανάκτησης. 
    </label>
    {inventory.approvable.length===0?<p className="fiscal-muted">Δεν υπάρχουν διαθέσιμα αιτήματα ή απαιτείται πρόσφατο MFA step-up.</p>
      :inventory.approvable.map(item=><div key={item.id} className="fiscal-card">
       <p><strong>Υπόθεση</strong> <code>{item.id}</code></p>
       <p>Τύπος λογαριασμού: {item.targetKind} · Εγκρίσεις: {item.approvals}/2 · Λήξη: {new Date(item.expiresAt).toLocaleString("el-GR")}</p>
       <button type="button" className="fiscal-button" disabled={busy||item.alreadyApproved||!attested||approvalRef!==item.evidenceRef}
        onClick={()=>post({action:"approve",caseId:item.id,evidenceRef:approvalRef,attested:true})}>
        {item.alreadyApproved?"Ήδη επιβεβαιώθηκε":"Επιβεβαίωση με ανεξάρτητη έγκριση"}
       </button>
      </div>)}
   </div>
  </div>:null}
  {error?<p className="fiscal-alert" role="alert">{error}</p>:null}
  {notice?<p role="status">{notice}</p>:null}
  <p className="fiscal-muted">Μόνο μετά τη δεύτερη ανεξάρτητη έγκριση ακυρώνονται όλες οι προηγούμενες MFA συνεδρίες και μπορεί να ρυθμιστεί νέος authenticator. Δεν αποθηκεύουμε πρωτογενή έγγραφα ταυτότητας.</p>
 </section>;
}
