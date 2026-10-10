"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import {useRouter} from "next/navigation";
type Kind="business"|"public_body";
const errors:Record<string,string>={
 COUNTERPARTY_NOT_AUTHORIZED:"Απαιτείται εγκεκριμένη επιχείρηση και δικαίωμα ιδιοκτήτη ή λογιστή.",
 INVALID_COUNTERPARTY_VAT_FORMAT:"Το δοκιμαστικό ΑΦΜ πρέπει να έχει εννέα ψηφία.",
 COUNTERPARTY_IDENTITY_CONFLICT:"Το ΑΦΜ υπάρχει ήδη σε αυτήν την κατηγορία, με διαφορετική επωνυμία.",
 CSRF_FAILED:"Η συνεδρία έληξε. Ανανεώστε τη σελίδα."
};
export function FiscalCounterpartyForm({organizationId,csrfToken}:{
 organizationId:string;csrfToken:string
}){
 const router=useRouter();
 const [kind,setKind]=useState<Kind>("business");
 const [legalName,setLegalName]=useState("");
 const [vatNumber,setVatNumber]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(legalName.trim().length<2||legalName.trim().length>240||!/^[0-9]{9}$/.test(vatNumber)){
   setError("Συμπληρώστε δοκιμαστική επωνυμία και εννιαψήφιο ΑΦΜ.");return;
  }
  setBusy(true);setError("");setMessage("");
  try{
   const response=await fetch("/timologio/api/console/counterparties",{
    method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({organizationId,kind,legalName:legalName.trim(),vatNumber}),
    cache:"no-store",signal:AbortSignal.timeout(12000)
   });
   const data=await response.json() as {error?:string;created?:boolean;id?:string;verificationStatus?:string};
   if(!response.ok||!data.id||data.verificationStatus!=="unverified")
    throw new Error(errors[data.error??""]??"Η καταχώριση δοκιμής απέτυχε.");
   setMessage(data.created?"Ο δοκιμαστικός αντισυμβαλλόμενος δημιουργήθηκε.":"Η ίδια δοκιμαστική εγγραφή υπήρχε ήδη.");
   setLegalName("");setVatNumber("");
   router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Αποτυχία δοκιμής.");}
  finally{setBusy(false)}
 }
 return <form className="fiscal-form" style={{maxWidth:"100%"}} onSubmit={submit}>
  <label>Τύπος αντισυμβαλλομένου
   <select value={kind} onChange={e=>{setKind(e.target.value as Kind);setMessage("")}} disabled={busy}>
    <option value="business">Επιχείρηση · B2B</option>
    <option value="public_body">Δημόσιος φορέας · B2G</option>
   </select>
  </label>
  <label>Δοκιμαστική επωνυμία
   <input required minLength={2} maxLength={240} value={legalName}
    onChange={e=>setLegalName(e.target.value)} disabled={busy} placeholder="Παράδειγμα δοκιμαστικής οντότητας"/>
  </label>
  <label>Δοκιμαστικό ΑΦΜ (μορφή 9 ψηφίων)
   <input required minLength={9} maxLength={9} inputMode="numeric" pattern="[0-9]{9}"
    autoComplete="off" value={vatNumber} onChange={e=>setVatNumber(e.target.value)} disabled={busy}/>
  </label>
  <button className="fiscal-button" type="submit" disabled={busy}>{busy?"Αποθήκευση…":"Προσθήκη δοκιμαστικού αντισυμβαλλομένου"}</button>
  {error?<p className="fiscal-error" role="alert">{error}</p>:null}
  {message?<p className="fiscal-muted" role="status">{message}</p>:null}
 </form>;
}
