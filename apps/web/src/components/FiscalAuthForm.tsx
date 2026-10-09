"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
export function FiscalAuthForm({mode}:{mode:"login"|"register"}){
 const router=useRouter();
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [legalName,setLegalName]=useState(""),[vatNumber,setVatNumber]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/timologio/api/auth",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({action:mode,email,password,legalName,vatNumber})});
   const data=await res.json() as {error?:string;role?:string};
   if(!res.ok)throw new Error(data.error||"Η ενέργεια απέτυχε");
   if(mode==="register"){setMessage("Η αίτησή σας καταχωρίστηκε και αναμένει έλεγχο. Συνδεθείτε στον λογαριασμό σας.");return;}
   router.replace(data.role==="fiscal_admin"?"/timologio-admin":"/timologio/dashboard");router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Δεν ολοκληρώθηκε η ενέργεια");}
  finally{setBusy(false);}
 }
 return <form className="fiscal-form" onSubmit={submit}>
  {mode==="register"&&<>
   <label>Επωνυμία επιχείρησης<input required minLength={2} maxLength={240} value={legalName} onChange={e=>setLegalName(e.target.value)}/></label>
   <label>ΑΦΜ<input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={vatNumber} onChange={e=>setVatNumber(e.target.value)}/></label>
  </>}
  <label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>Κωδικός<input required type="password" minLength={mode==="register"?12:1} autoComplete={mode==="register"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <button className="fiscal-button" disabled={busy} type="submit">{busy?"Παρακαλώ…":mode==="register"?"Υποβολή αίτησης":"Σύνδεση"}</button>
  {error&&<p role="alert" className="fiscal-error">{error}</p>}{message&&<p role="status">{message}</p>}
 </form>;
}
