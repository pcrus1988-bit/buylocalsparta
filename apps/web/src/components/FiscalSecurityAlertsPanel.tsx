"use client";
import {useEffect,useState} from "react";
type Item={id:string;caseId:string;eventCode:string;audience:string;status:string;attempts:number;
 createdAt:string;updatedAt:string;nextAttemptAt:string;providerAcceptedAt:string|null;lastErrorCode:string|null};
type Snapshot={schemaReady:boolean;counts:{pending:number;sending:number;providerAccepted:number;dead:number;overdue:number};alerts:Item[]};
const date=(s:string|null)=>s?new Date(s).toLocaleString("el-GR"):"—";
const states:Record<string,string>={pending:"Αναμονή",sending:"Αποστολή",provider_accepted:"Αποδοχή παρόχου",dead:"Απαιτεί διερεύνηση"};
export function FiscalSecurityAlertsPanel(){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function refresh(){
  setBusy(true);setError("");
  try{
   const response=await fetch("/timologio-admin/api/mfa/alerts",{cache:"no-store",credentials:"same-origin"});
   const result=await response.json() as Snapshot&{error?:string};
   if(!response.ok)throw new Error(result.error??"SECURITY_ALERT_STATUS_FAILED");
   setSnapshot(result);
  }catch(e){setError(e instanceof Error?e.message:"SECURITY_ALERT_STATUS_FAILED");}
  finally{setBusy(false);}
 }
 useEffect(()=>{void refresh();},[]);
 return <section className="fiscal-panel fiscal-section" style={{maxWidth:980}}>
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <h2>Παρακολούθηση ειδοποιήσεων</h2>
   <button type="button" className="fiscal-button secondary" disabled={busy} onClick={()=>void refresh()}>
    {busy?"Έλεγχος…":"Ανανέωση κατάστασης"}
   </button>
  </div>
  {!snapshot&&!error?<p>Έλεγχος ασφαλούς ουράς…</p>:null}
  {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
  {snapshot&&!snapshot.schemaReady?<p className="fiscal-alert">Η ξεχωριστή υποδομή ειδοποιήσεων δεν είναι εγκατεστημένη. Δεν επιτρέπεται ανάκτηση MFA.</p>:null}
  {snapshot?.schemaReady?<div>
   <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBlock:16}}>
    <span>Εκκρεμείς: <strong>{snapshot.counts.pending}</strong></span>
    <span>Σε αποστολή: <strong>{snapshot.counts.sending}</strong></span>
    <span>Αποδοχή παρόχου: <strong>{snapshot.counts.providerAccepted}</strong></span>
    <span>Αποτυχίες: <strong>{snapshot.counts.dead}</strong></span>
    <span>Καθυστερημένες: <strong>{snapshot.counts.overdue}</strong></span>
   </div>
   {snapshot.counts.dead||snapshot.counts.overdue?
    <p role="alert" className="fiscal-alert">Υπάρχουν ειδοποιήσεις που χρειάζονται χειροκίνητη διερεύνηση μέσω ανεξάρτητου καναλιού. Μην υποθέτετε ότι παραδόθηκαν.</p>
    :<p className="fiscal-muted">Η αναφορά δεν βεβαιώνει παράδοση. Απαιτείται επίσης επιβεβαίωση γεγονότων παράδοσης από τον πάροχο.</p>}
   <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
     <thead><tr><th>Υπόθεση</th><th>Συμβάν</th><th>Αποδέκτης</th><th>Κατάσταση</th><th>Προσπάθειες</th><th>Ενημέρωση</th></tr></thead>
     <tbody>
      {snapshot.alerts.map(item=><tr key={item.id}>
       <td><code>{item.caseId.slice(0,8)}</code></td>
       <td>{item.eventCode}</td>
       <td>{item.audience==="soc"?"Υπεύθυνος ασφάλειας":"Κάτοχος"}</td>
       <td>{states[item.status]??item.status}{item.lastErrorCode?" · "+item.lastErrorCode:""}</td>
       <td>{item.attempts}</td>
       <td>{date(item.updatedAt)}</td>
      </tr>)}
      {!snapshot.alerts.length?<tr><td colSpan={6}>Δεν υπάρχουν καταγεγραμμένες ειδοποιήσεις.</td></tr>:null}
     </tbody>
    </table>
   </div>
   <p className="fiscal-muted">Εμφανίζονται μόνο οι τελευταίες 40 εγγραφές. Δεν προβάλλονται διευθύνσεις email, τεκμήρια ανάκτησης, μυστικά MFA ή αναγνωριστικά του παρόχου.</p>
  </div>:null}
 </section>;
}
