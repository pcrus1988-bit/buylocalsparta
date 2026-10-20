"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function HospitalityLogoutButton(){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 return <button type="button" disabled={busy} onClick={async()=>{
   if(busy)return;
   setBusy(true);
   try{
     const response=await fetch("/api/hospitality/logout",{method:"POST",credentials:"same-origin"});
     if(!response.ok)throw new Error("logout_failed");
     router.replace("/drinkstock/login");
     router.refresh();
   }finally{setBusy(false);}
 }} style={{border:"1px solid var(--ds-border, #665585)",borderRadius:11,background:"var(--ds-surface-raised, #211936)",color:"var(--ds-ink, #fff)",padding:"12px 16px",cursor:"pointer",fontWeight:850}}>Αποσύνδεση</button>;
}