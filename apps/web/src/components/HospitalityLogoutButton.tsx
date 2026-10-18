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
 }} style={{border:"1px solid #b5c8ba",borderRadius:99,background:"transparent",padding:"12px 16px",cursor:"pointer"}}>Αποσύνδεση</button>;
}