"use client";
import {useRouter} from "next/navigation";
import {useState} from "react";
import {
 fiscalKybChecks,fiscalKybCounts,fiscalKybOutcomes,fiscalKybSources,
 type FiscalKybCheck,type FiscalKybOutcome,type FiscalKybSource
} from "../lib/fiscal-kyb-checks";
type Event={
 id:string;check_type:string;outcome:string;source_kind:string;
 source_reference:string|null;recorded_at:string|Date;recorded_by_kind:string
};
const checkLabels:Record<FiscalKybCheck,string>={
 business_registration:"Καταχώριση ΓΕΜΗ",
 vat_identity:"Στοιχεία ΑΦΜ",
 registered_address:"Επίσημη έδρα",
 legal_representation:"Νόμιμος εκπρόσωπος",
 beneficial_ownership:"Πραγματικός δικαιούχος",
 signing_authority:"Εξουσία υπογραφής",
 service_agreement:"Σύμβαση υπηρεσίας"
};
const outcomeLabels:Record<FiscalKybOutcome,string>={
 requested:"Αναμένεται τεκμηρίωση",
 evidence_recorded:"Καταγράφηκε αναφορά τεκμηρίου",
 discrepancy:"Διαπιστώθηκε ασυμφωνία"
};
const sourceLabels:Record<FiscalKybSource,string>={
 none:"Χωρίς πηγή",
 gemi_public_registry:"Δημόσια αναφορά ΓΕΜΗ",
 aade_public_check:"Δημόσιος έλεγχος ΑΑΔΕ",
 merchant_declaration:"Δήλωση επιχείρησης",
 signed_agreement:"Συμφωνητικό",
 manual_offline_review:"Εσωτερική αναφορά ελέγχου"
};
const date=(d:string|Date)=>new Intl.DateTimeFormat("el-GR",{
 dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"
}).format(new Date(d));
export function FiscalKybEvidenceWorkbench({organizationId,status,csrfToken,latest,history}:{
 organizationId:string;status:string;csrfToken:string;
 latest:Event[];history:Event[]
}){
 const router=useRouter();
 const [checkType,setCheckType]=useState<FiscalKybCheck>("business_registration");
 const [outcome,setOutcome]=useState<FiscalKybOutcome>("requested");
 const [sourceKind,setSourceKind]=useState<FiscalKybSource>("none");
 const [sourceReference,setSourceReference]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const counts=fiscalKybCounts(latest);
 const lookup=new Map(latest.map(e=>[e.check_type,e]));
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||status!=="under_review")return;
  setError("");setSuccess("");setBusy(true);
  try{
   const response=await fetch("/timologio-admin/api/kyb-evidence",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({
     organizationId,checkType,outcome,
     sourceKind:outcome==="requested"?"none":sourceKind,
     sourceReference:outcome==="requested"?null:sourceReference.trim()
    })
   });
   const data=await response.json() as {recorded?:boolean;error?:string};
   if(!response.ok||!data.recorded)throw Error(data.error??"Αποτυχία καταγραφής.");
   setSourceReference("");setOutcome("requested");setSourceKind("none");
   setSuccess("Η εσωτερική αναφορά καταγράφηκε αμετάβλητα. Δεν δόθηκε έγκριση.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Αποτυχία καταγραφής.");}
  finally{setBusy(false);}
 }
 return <section className="fiscal-panel fiscal-section">
  <h2>Αναφορές τεκμηρίωσης KYB · {counts.recorded}/{counts.total}</h2>
  <p>Παρακολούθηση συγκέντρωσης στοιχείων για έλεγχο επιχείρησης. <strong>Δεν γίνεται αυτόματη διασταύρωση με ΓΕΜΗ ή ΑΑΔΕ.</strong> Το «καταγράφηκε» σημαίνει μόνο ότι υπάρχει αναφορά τεκμηρίου — όχι ότι είναι γνήσιο, αποδεκτό ή ότι επιτρέπεται έκδοση.</p>
  <div style={{overflowX:"auto"}}><table className="fiscal-table">
   <thead><tr><th>Απαίτηση</th><th>Τελευταία ένδειξη</th><th>Πηγή</th></tr></thead>
   <tbody>{fiscalKybChecks.map(key=>{
    const event=lookup.get(key);
    return <tr key={key}><td>{checkLabels[key]}</td>
     <td>{event?outcomeLabels[event.outcome as FiscalKybOutcome]:"Δεν καταγράφηκε"}</td>
     <td>{event?sourceLabels[event.source_kind as FiscalKybSource]:"—"}</td></tr>;
   })}</tbody></table></div>
  <p className="fiscal-muted">{counts.outstanding} απαιτήσεις χωρίς καταγεγραμμένο τεκμήριο · {counts.discrepancies} ασυμφωνίες. Καμία αυτόματη έγκριση από την πληρότητα.</p>
  {status==="under_review"?<form className="fiscal-form" style={{maxWidth:720}} onSubmit={submit}>
   <h3>Καταχώριση νέας εσωτερικής αναφοράς</h3>
   <label>Απαίτηση
    <select value={checkType} disabled={busy} onChange={e=>setCheckType(e.target.value as FiscalKybCheck)}>
     {fiscalKybChecks.map(key=><option key={key} value={key}>{checkLabels[key]}</option>)}
    </select>
   </label>
   <label>Κατάσταση αναφοράς
    <select value={outcome} disabled={busy} onChange={e=>{
      const value=e.target.value as FiscalKybOutcome;setOutcome(value);
      if(value==="requested"){setSourceKind("none");setSourceReference("");}
      else if(sourceKind==="none")setSourceKind("manual_offline_review");
    }}>
     {fiscalKybOutcomes.map(key=><option key={key} value={key}>{outcomeLabels[key]}</option>)}
    </select>
   </label>
   {outcome!=="requested"?<>
    <label>Τύπος πηγής
     <select value={sourceKind} disabled={busy} onChange={e=>setSourceKind(e.target.value as FiscalKybSource)}>
      {fiscalKybSources.filter(s=>s!=="none").map(key=><option key={key} value={key}>{sourceLabels[key]}</option>)}
     </select>
    </label>
    <label>Κωδικός αναφοράς (5–160 λατινικοί χαρακτήρες, αριθμοί ή . _ : -)
     <input required maxLength={160} pattern="[A-Za-z0-9._:-]{5,160}" value={sourceReference}
      disabled={busy} onChange={e=>setSourceReference(e.target.value)}
      placeholder="GEMI:PUBLIC_RECORD_123" autoComplete="off"/>
    </label>
    <p className="fiscal-alert">Μην εισάγετε αριθμούς ταυτότητας, διαβατήρια, ΑΦΜ φυσικών προσώπων, αρχεία ή προσωπικά έγγραφα σε αυτό το πεδίο. Μόνο κωδικοί δημόσιων ή εσωτερικά αρχειοθετημένων αναφορών.</p>
   </>:null}
   <button type="submit" className="fiscal-button" disabled={busy}>{busy?"Καταχώριση…":"Καταγραφή αναφοράς χωρίς έγκριση"}</button>
   {error?<p role="alert" className="fiscal-alert">{error}</p>:null}
   {success?<p role="status">{success}</p>:null}
  </form>:<p className="fiscal-muted">Οι καταχωρίσεις επιτρέπονται μόνο εφόσον ο φάκελος βρίσκεται σε ενεργό εσωτερικό έλεγχο.</p>}
  <h3>Ιστορικό αναφορών · έως 30 συμβάντα</h3>
  {history.length?<div style={{display:"grid",gap:10}}>
   {history.map(e=><article className="fiscal-card" key={e.id}>
    <strong>{checkLabels[e.check_type as FiscalKybCheck]}</strong> · {date(e.recorded_at)}
    <p>{outcomeLabels[e.outcome as FiscalKybOutcome]} · {sourceLabels[e.source_kind as FiscalKybSource]}</p>
    {e.source_reference?<p className="fiscal-muted" style={{overflowWrap:"anywhere"}}>Κωδικός αναφοράς: {e.source_reference}</p>:null}
   </article>)}</div>:<p>Δεν υπάρχουν αναφορές ακόμα.</p>}
  <p className="fiscal-alert">Αμετάβλητο αρχείο εσωτερικών αναφορών. Ούτε η συμπλήρωση όλων των απαιτήσεων ούτε μία αναφορά τεκμηρίου αποτελεί έγκριση KYB, νόμιμης εκπροσώπησης ή φορολογικής έκδοσης.</p>
 </section>;
}
