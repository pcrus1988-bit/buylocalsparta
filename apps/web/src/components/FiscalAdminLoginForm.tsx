"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
export function FiscalAdminLoginForm(){
 const router=useRouter(),[email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch("/timologio-admin/api/login",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({email,password})});
   const data=await response.json() as {error?:string;role?:string};
   if(!response.ok)throw new Error(data.error||"Authentication failed");
   if(data.role!=="super_admin")throw new Error("Απαιτείται λογαριασμός super admin.");
   router.replace("/timologio-admin");router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Αποτυχία σύνδεσης");}
  finally{setBusy(false);}
 }
 return <form className="fiscal-form" onSubmit={submit}>
  <label>KONTA MOY Super Admin email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>Κωδικός<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <button className="fiscal-button" type="submit" disabled={busy}>{busy?"Σύνδεση…":"Είσοδος Super Admin"}</button>
  {error&&<p role="alert" className="fiscal-error">{error}</p>}
 </form>;
}
