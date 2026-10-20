"use client";
import {useState} from "react";
export function DrinkStockAadeConnectForm({partnerId,csrfToken}:{partnerId:string;csrfToken:string}){
 const [issuerVatNumber,setVat]=useState(""),[userId,setUser]=useState("");
 const [subscriptionKey,setKey]=useState("");
 const [environment,setEnvironment]=useState<"production"|"test">("production");
 const [confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false);
 const [feedback,setFeedback]=useState("");
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving||!confirmed)return;
  setSaving(true);setFeedback("");
  try{
   const response=await fetch(`/api/hospitality/partners/${partnerId}/aade/connect`,{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({issuerVatNumber,userId,subscriptionKey,environment})
   });
   const body=await response.json() as {error?:string;message?:string;connectivityVerified?:boolean};
   if(!response.ok)throw new Error(body.error??"AADE_CONNECTION_FAILED");
   setKey("");setUser("");setConfirmed(false);
   setFeedback(body.message??"Connection settings saved.");
  }catch(e){setFeedback(e instanceof Error?e.message:"Connection unavailable.");}
  finally{setSaving(false);}
 }
 return <form onSubmit={e=>void submit(e)} style={{display:"grid",gap:13,padding:18,border:"1px solid #556879",borderRadius:16,marginTop:15}}>
  <h3 style={{margin:0}}>Connect this merchant's own AADE myDATA credentials</h3>
  <p style={{margin:0,fontSize:13}}>Credentials are kept in encrypted server-side Vault, never in guest checkout.
   A successful reporting probe is not authorization to issue a statutory retail receipt.</p>
  <label>Merchant AFM (9 digits)
   <input required inputMode="numeric" autoComplete="off" value={issuerVatNumber} maxLength={9}
    onChange={e=>setVat(e.target.value.replace(/\D/g,""))} style={{display:"block",width:"100%",padding:10}}/>
  </label>
  <label>AADE myDATA user ID
   <input required autoComplete="off" value={userId} onChange={e=>setUser(e.target.value)}
    style={{display:"block",width:"100%",padding:10}}/>
  </label>
  <label>AADE subscription key
   <input required type="password" autoComplete="new-password" value={subscriptionKey} onChange={e=>setKey(e.target.value)}
    style={{display:"block",width:"100%",padding:10}}/>
  </label>
  <label>Environment
   <select value={environment} onChange={e=>setEnvironment(e.target.value as "production"|"test")}
    style={{display:"block",padding:10,width:"100%"}}>
    <option value="production">Production</option><option value="test">Test environment</option>
   </select>
  </label>
  <label style={{display:"flex",gap:8}}>
   <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
   I am authorized to configure AADE access for this partner and accept that this is reporting connectivity only.
  </label>
  <button type="submit" disabled={saving||!confirmed} style={{border:0,padding:13,fontWeight:800,borderRadius:12,
   background:"#caff4e",color:"#132536",opacity:(saving||!confirmed)?0.5:1}}>
   {saving?"Verifying secure connection…":"Verify AADE reporting connection"}
  </button>
  {feedback&&<p role="status" style={{fontSize:13}}>{feedback}</p>}
 </form>;
}