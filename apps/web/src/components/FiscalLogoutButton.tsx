"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function FiscalLogoutButton({csrfToken}:{csrfToken:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const router=useRouter();
 async function signOut(){
  setBusy(true);setError("");
  try {
   const response=await fetch("/timologio/api/auth",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({action:"logout"})});
   if(!response.ok)throw new Error("Η αποσύνδεση δεν ολοκληρώθηκε.");
   router.replace("/timologio/login");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Σφάλμα σύνδεσης");}
  finally{setBusy(false);}
 }
 return <span><button className="fiscal-button secondary" disabled={busy} onClick={signOut} type="button">Αποσύνδεση</button>{error&&<span role="alert">{error}</span>}</span>;
}
