"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export function DrinkStockStaffInviteClaim({token,csrfToken}:{
 token:string;csrfToken:string;
}){
 const router=useRouter();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function accept(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   const r=await fetch("/api/hospitality/staff-invites/claim",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({token})
   });
   const data=await r.json() as {error?:string;accepted?:boolean;partnerId?:string;venueId?:string};
   if(!r.ok||!data.accepted||!data.partnerId||!data.venueId)
    throw new Error(data.error??"INVITE_NOT_AVAILABLE");
   // Avoid retaining the bearer token in browser history after redemption.
   router.replace(`/drinkstock/dashboard/${data.partnerId}`);
   router.refresh();
  }catch(e){
   const code=e instanceof Error?e.message:"INVITE_NOT_AVAILABLE";
   setError(code==="INVITE_NOT_AVAILABLE"?"Invitation unavailable or belongs to a different verified email.":
    code==="INVITE_EXPIRED"?"This invitation has expired. Ask the venue manager for another one.":
    code==="MEMBERSHIP_REVIEW_REQUIRED"?"An existing partner role requires manual manager review.":
    code==="VERIFIED_CUSTOMER_ACCOUNT_REQUIRED"?"Sign in with a verified KONTA MOY customer account.":
    "Could not confirm staff access ("+code+"). Do not create another account; contact the venue owner.");
  }finally{setBusy(false);}
 }
 return <div style={{marginTop:18}}>
  <button type="button" disabled={busy} onClick={()=>void accept()}
   style={{padding:"15px 22px",borderRadius:12,fontWeight:900,background:"#caff4e",color:"#11202a",border:0,cursor:"pointer"}}>
   {busy?"Confirming…":"ACCEPT VENUE STAFF INVITATION ↗"}
  </button>
  {error&&<p role="alert" style={{color:"#ffc4c4",marginTop:14}}>{error}</p>}
  <p style={{color:"#c6cbd5",fontSize:12,lineHeight:1.7,marginTop:15}}>
   Your verified account email must match the invitation. Access is restricted to the
   invited partner and station. No customer payment or guest permission is created.
  </p>
 </div>;
}
