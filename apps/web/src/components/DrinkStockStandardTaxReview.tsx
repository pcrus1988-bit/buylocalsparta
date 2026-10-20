"use client";
import {useState} from "react";
export function DrinkStockStandardTaxReview({partnerId,venueId,csrfToken,alreadyConfirmed}:{
 partnerId:string;venueId:string;csrfToken:string;alreadyConfirmed:boolean;
}){
 const [confirmed,setConfirmed]=useState(alreadyConfirmed);
 const [reason,setReason]=useState("");
 const [pending,setPending]=useState(false);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 const endpoint=`/api/hospitality/partners/${partnerId}/venues/${venueId}/checkout-tax`;
 async function submit(next:boolean){
  if(pending||reason.trim().length<20||reason.trim().length>600)return;
  if(!window.confirm(next?
   "Confirm that this venue uses standard mainland Greece beverage VAT rates and has NO eligible reduced-island treatment?":
   "Withdraw the venue's standard VAT classification confirmation?"))return;
  setPending(true);setNotice("");setError("");
  try{
   const r=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({confirmed:next,reason:reason.trim(),requestKey:crypto.randomUUID()})});
   const data=await r.json() as {error?:string;confirmed?:boolean};
   if(!r.ok||data.confirmed!==next)throw new Error(data.error??"TAX_REVIEW_UNAVAILABLE");
   setConfirmed(next);
   setNotice(next?"Standard jurisdiction confirmation saved; checkout and receipt issuance remain disabled until their adapters are certified.":
    "Tax jurisdiction confirmation withdrawn. Checkout remains blocked.");
   setReason("");
  }catch(e){setError(e instanceof Error?e.message:"TAX_REVIEW_UNAVAILABLE");}
  finally{setPending(false);}
 }
 return <section style={{border:"1px solid #9d8a66",borderRadius:14,padding:17,margin:"20px 0",background:"#1b2330",color:"#fff"}}>
  <h3>Greek VAT jurisdiction · owner confirmation</h3>
  <p style={{fontSize:13,lineHeight:1.6}}>
   <strong>Current: {confirmed?"Standard mainland Greece rates confirmed":"Unverified"}</strong>.
   Only confirm if your venue legally applies normal 24% / 13% rates, not the 17% / 9% island reductions.
   Table QR consumption is treated as dine-in service; takeaway/delivery require separate compliant order flows.
   This confirmation cannot issue a receipt, authorize funds or activate payments.
  </p>
  <label style={{display:"grid",gap:7,fontSize:13}}>Basis of the accountant/merchant's decision (20–600 characters)
   <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}
    disabled={pending} maxLength={600}
    placeholder="Record your venue's actual VAT jurisdiction and the source or accountant confirmation."
    style={{borderRadius:9,padding:10,color:"#0f1c30",background:"#fff"}}/>
  </label>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:13}}>
   <button type="button" disabled={pending||confirmed||reason.trim().length<20}
    onClick={()=>void submit(true)} style={{padding:12,borderRadius:9,background:"#d9ff57",color:"#142132",fontWeight:900}}>
    Confirm standard VAT jurisdiction
   </button>
   <button type="button" disabled={pending||!confirmed||reason.trim().length<20}
    onClick={()=>void submit(false)} style={{padding:12,borderRadius:9,fontWeight:800}}>Withdraw confirmation</button>
  </div>
  {notice&&<p role="status" style={{color:"#d9ff57"}}>{notice}</p>}
  {error&&<p role="alert" style={{color:"#ffb6b6"}}>{error}</p>}
 </section>;
}
