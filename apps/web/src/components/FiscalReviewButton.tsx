"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function FiscalReviewButton({organizationId,csrfToken}:{organizationId:string;csrfToken:string}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 async function review(){
  setBusy(true);setError("");
  try{
   const response=await fetch("/timologio-admin/api/accounts",{method:"POST",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({action:"start_review",organizationId})});
   if(!response.ok)throw new Error("Η κατάσταση δεν ενημερώθηκε.");
   router.refresh();
  }catch(cause){setError(cause instanceof Error?cause.message:"Αποτυχία");}
  finally{setBusy(false);}
 }
 return <span><button className="fiscal-button" onClick={review} type="button" disabled={busy}>{busy?"…":"Έναρξη ελέγχου"}</button>
 {error&&<small role="alert" className="fiscal-error">{error}</small>}</span>;
}
