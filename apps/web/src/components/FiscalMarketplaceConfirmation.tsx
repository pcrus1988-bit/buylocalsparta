"use client";
import {useState,type FormEvent} from "react";
export function FiscalMarketplaceConfirmation({csrfToken}:{csrfToken:string}){
 const [code,setCode]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setResult("");
  try{
   const response=await fetch("/timologio/api/marketplace-link/confirm",{
    method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({code:code.trim()})
   });
   const data=await response.json() as {error?:string;linked?:boolean;marketplaceVendorId?:string};
   if(!response.ok)throw new Error(data.error??"LINK_FAILED");
   if(!data.linked)throw new Error("LINK_NOT_CONFIRMED");
   setCode("");setResult("Ο έλεγχος ταυτότητας ολοκληρώθηκε και η σύνδεση καταχωρίστηκε για "+data.marketplaceVendorId+". Δεν ενεργοποιείται αυτόματα τιμολόγηση.");
  }catch(e){setError(e instanceof Error?e.message:"Δεν ολοκληρώθηκε η σύνδεση");}
  finally{setBusy(false);}
 }
 return <form className="fiscal-form" onSubmit={submit}>
  <label>Κωδικός από τον κάτοχο KONTA MOY FISCAL
   <input value={code} required maxLength={48} pattern="kmfl_[A-Za-z0-9_-]{43}" autoComplete="off" onChange={e=>setCode(e.target.value)}/>
  </label>
  <button className="fiscal-button" type="submit" disabled={busy}>Επιβεβαίωση σύνδεσης</button>
  {error&&<p className="fiscal-error" role="alert">{error}</p>}
  {result&&<p role="status">{result}</p>}
 </form>;
}
