"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function FiscalSuperAdminLogout({csrfToken}:{csrfToken:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const router=useRouter();
 async function logout(){
   setBusy(true);setError("");
   try{
     const res=await fetch("/timologio-admin/api/sso/logout",{method:"POST",headers:{"x-csrf-token":csrfToken}});
     if(!res.ok)throw new Error("Fiscal logout unavailable");
     router.replace("/timologio-admin/login");router.refresh();
   }catch(e){setError(e instanceof Error?e.message:"Sign out failed");}
   finally{setBusy(false);}
 }
 return <span><button type="button" disabled={busy} className="fiscal-button secondary" onClick={logout}>Fiscal sign out</button>{error&&<small role="alert">{error}</small>}</span>;
}
