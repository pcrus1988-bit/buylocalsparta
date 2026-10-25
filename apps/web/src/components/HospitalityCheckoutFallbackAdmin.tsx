"use client";
import {useState} from "react";
import type {HospitalityAdminPartner} from "../lib/hospitality-admin-service";

const errorText:Record<string,string>={
 INVALID_CHECKOUT_FALLBACK_REASON:"Give a clear 15–600 character eligibility or revocation reason.",
 CHECKOUT_FALLBACK_NOT_ELIGIBLE:"Confirm the POS limitation and all three reviews before granting fallback access.",
 HOSPITALITY_PARTNER_NOT_ELIGIBLE:"Partner or DrinkStock access is no longer active.",
 CHECKOUT_REQUEST_KEY_CONFLICT:"Request was reused with different content; reload and try again.",
 UNAUTHORIZED:"Admin permission or session expired.",INVALID_ORIGIN:"Invalid page origin.",
 CHECKOUT_FALLBACK_UNAVAILABLE:"The change could not be confirmed. Refresh the status before retrying."
};
const field={display:"flex",gap:9,alignItems:"flex-start",fontSize:13,lineHeight:1.55} as const;
const control={padding:10,borderRadius:9,border:"1px solid #8995a9",background:"#fff",color:"#101828"} as const;
export function HospitalityCheckoutFallbackAdmin({partners,csrfToken}:{
 partners:HospitalityAdminPartner[];csrfToken:string;
}){
 return <section className="shell vendor-section" aria-label="POS-less KONTA MOY checkout approval">
  <h2>KONTA MOY Checkout · POS fallback</h2>
  <p>Admin-only eligibility approval for Hospitality partners without a compatible POS.
   KONTA MOY's existing Mollie and AADE infrastructure is reused centrally; venue owners do not configure their own provider credentials. Every approval is partner-specific, recorded with an audit event, and reversible.
   <strong> Approval does not activate customer payments:</strong> the DrinkStock-specific
   legal seller/settlement verification, certified receipt issuance, and venue order adapter must be completed before checkout can accept money.</p>
  {!partners.length?<p>No partners are eligible for review.</p>:
   <div style={{display:"grid",gap:17}}>
    {partners.map(p=><PartnerApproval key={p.id} partner={p} csrfToken={csrfToken}/>)}
   </div>}
 </section>;
}
function PartnerApproval({partner,csrfToken}:{partner:HospitalityAdminPartner;csrfToken:string}){
 const initial=partner.fallback;
 const [approved,setApproved]=useState(initial.adminEnabled);
 const [posUnavailable,setPosUnavailable]=useState(initial.posUnavailable);
 const [merchantAuthorizationReviewed,setMerchantAuthorizationReviewed]=useState(initial.merchantAuthorizationReviewed);
 const [settlementReviewed,setSettlementReviewed]=useState(initial.settlementReviewed);
 const [fiscalReviewed,setFiscalReviewed]=useState(initial.fiscalReviewed);
 const [reason,setReason]=useState(initial.reason);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
 async function change(enabled:boolean){
  if(busy)return;
  if(enabled&&(partner.status!=="active"||!partner.drinkStockEnabled||partner.venues<1)){
   setError("The partner, app and at least one venue must be active.");return;
  }
  if(reason.trim().length<15||reason.trim().length>600){
   setError(errorText.INVALID_CHECKOUT_FALLBACK_REASON);return;
  }
  if(enabled&&(!posUnavailable||!merchantAuthorizationReviewed||!settlementReviewed||!fiscalReviewed)){
   setError(errorText.CHECKOUT_FALLBACK_NOT_ELIGIBLE);return;
  }
  if(!window.confirm(enabled?
   `Grant ${partner.name} the POS-less KONTA MOY checkout entitlement? This does not turn on payments.`:
   `Revoke the KONTA MOY fallback entitlement for ${partner.name}?`))return;
  setBusy(true);setError("");setStatus("");
  try{
   const response=await fetch("/api/admin/hospitality/checkout-fallback",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({partnerId:partner.id,requestKey:crypto.randomUUID(),enabled,
      posUnavailable,merchantAuthorizationReviewed,settlementReviewed,fiscalReviewed,reason})
   });
   const value=await response.json() as {error?:string;checkout?:{adminEnabled:boolean;checkoutLive:false};auditRecorded?:boolean};
   if(!response.ok||!value.checkout)throw new Error(value.error??"CHECKOUT_FALLBACK_UNAVAILABLE");
   setApproved(value.checkout.adminEnabled);
   setStatus((enabled?"Fallback entitlement granted.":"Fallback entitlement revoked.")+
    " Guest payment remains disabled pending the certified checkout adapter."+
    (value.auditRecorded===false?" Review secondary admin audit logging.":""));
  }catch(e){const code=e instanceof Error?e.message:"";setError(errorText[code]??code??"Unable to save");}
  finally{setBusy(false)}
 }
 const inactive=partner.status!=="active"||!partner.drinkStockEnabled||partner.venues<1;
 return <article style={{border:"1px solid #c7d0d8",borderRadius:15,padding:20,background:"#f7fafc",color:"#18202d"}}>
  <div style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:9,marginBottom:13}}>
   <div><h3 style={{margin:0}}>{partner.name}</h3><small>{partner.slug} · {partner.venues} venue(s)</small></div>
   <strong style={{padding:"8px 12px",borderRadius:9,background:approved?"#dbf4e8":"#eceff4",fontSize:12}}>
    {approved?"ADMIN GRANTED · PAYMENT INACTIVE":"DISABLED"}
   </strong>
  </div>
  <div style={{display:"grid",gap:9,marginBottom:14}}>
   <label style={field}><input type="checkbox" checked={posUnavailable} disabled={busy||(inactive&&!approved)} onChange={e=>setPosUnavailable(e.target.checked)}/> Compatible POS unavailable for this partner</label>
   <label style={field}><input type="checkbox" checked={merchantAuthorizationReviewed} disabled={busy||(inactive&&!approved)} onChange={e=>setMerchantAuthorizationReviewed(e.target.checked)}/> Merchant/seller-of-record authorization reviewed</label>
   <label style={field}><input type="checkbox" checked={settlementReviewed} disabled={busy||(inactive&&!approved)} onChange={e=>setSettlementReviewed(e.target.checked)}/> Settlement and payment-provider responsibilities reviewed</label>
   <label style={field}><input type="checkbox" checked={fiscalReviewed} disabled={busy||(inactive&&!approved)} onChange={e=>setFiscalReviewed(e.target.checked)}/> Greek VAT and fiscal-receipt responsibilities reviewed</label>
  </div>
  <label style={{display:"grid",gap:7,fontWeight:700,fontSize:13}}>Admin review / revocation reason
   <textarea value={reason} minLength={15} maxLength={600} rows={2} disabled={busy||(inactive&&!approved)}
    onChange={e=>setReason(e.target.value)} style={{...control,width:"100%"}} placeholder="Explain POS limitations and why checkout fallback is eligible…"/>
  </label>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginTop:13}}>
   <button type="button" className="button" disabled={busy||inactive||approved}
    onClick={()=>void change(true)}>Approve fallback</button>
   <button type="button" disabled={busy||!approved} style={{...control,cursor:"pointer",fontWeight:800}}
    onClick={()=>void change(false)}>Revoke fallback</button>
   <small style={{color:"#596373"}}>{initial.updatedAt?"Last saved: "+new Date(initial.updatedAt).toLocaleString("el-GR"):"Never reviewed"}</small>
  </div>
  {inactive&&<p role="status" style={{color:"#964b21"}}>New approval requires an active partner, DrinkStock app and venue. Existing approvals can still be revoked.</p>}
  {error&&<p role="alert" style={{color:"#a21d2d"}}>{error}</p>}
  {status&&<p role="status" style={{color:"#205f44"}}>{status}</p>}
 </article>;
}
