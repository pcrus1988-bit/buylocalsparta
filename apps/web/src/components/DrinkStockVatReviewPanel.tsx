"use client";
import {useState} from "react";
import type {MarketProduct} from "../lib/drinkstock-market-service";
import type {BeverageVatClass} from "../lib/drinkstock-greek-vat";

const OPTIONS=[
 {value:"review_required",label:"Not classified / needs review"},
 {value:"alcoholic",label:"Alcoholic drink"},
 {value:"non_alcoholic",label:"Non-alcoholic drink"},
 {value:"water",label:"Water"}
] as const;
const errors:Record<string,string>={
 OWNER_ONLY:"Only the registered hospitality partner owner may sign off VAT classifications.",
 SESSION_ACTIVE:"End the trading session before changing the tax classification.",
 INVALID_CSRF:"Your session expired. Sign in again.",
 VAT_REVIEW_REQUEST_CONFLICT:"A request key was already used. Refresh this page.",
 PRODUCT_NOT_FOUND:"This drink is no longer active at this venue.",
 VAT_REVIEW_UNAVAILABLE:"The VAT review could not be saved. Please retry after checking the current value."
};
export function DrinkStockVatReviewPanel({products,partnerId,venueId,csrfToken,sessionActive}:{
 products:MarketProduct[];partnerId:string;venueId:string;csrfToken:string;sessionActive:boolean
}){
 const pending=products.filter(p=>!p.vatReviewed||p.vatClass==="review_required").length;
 return <section aria-label="Merchant VAT product review" style={{display:"grid",gap:16}}>
  <div role="status" style={{padding:16,border:"1px solid #ffc177",borderRadius:12}}>
   <strong>{pending} of {products.length} drinks need a verified VAT classification</strong>
   <p style={{fontSize:13}}>This step records the merchant's legal classification, not a payment activation.
    Drinks and VAT rates depend on whether the customer consumes them on-site or takes them away.
    Review with the venue's accountant before confirming.</p>
   {sessionActive&&<p style={{color:"#ffbf8c"}}>VAT edits are locked while a trading session is active. End the session first.</p>}
  </div>
  {products.map(p=><DrinkVatLine key={p.id} product={p} partnerId={partnerId} venueId={venueId}
   csrfToken={csrfToken} sessionActive={sessionActive}/>)}
 </section>;
}
function DrinkVatLine({product,partnerId,venueId,csrfToken,sessionActive}:{
 product:MarketProduct;partnerId:string;venueId:string;csrfToken:string;sessionActive:boolean
}){
 const [saved,setSaved]=useState({vatClass:product.vatClass,reviewed:product.vatReviewed});
 const [vatClass,setVatClass]=useState<BeverageVatClass>(product.vatClass);
 const [reviewBasis,setReviewBasis]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 async function save(){
  if(saving||sessionActive)return;
  if(!confirmed||reviewBasis.trim().length<15||reviewBasis.trim().length>500){
   setError("Confirm the classification and provide a 15–500 character review note.");return;
  }
  if(!window.confirm(`Record the merchant's ${vatClass} VAT classification for ${product.name}?`))return;
  setSaving(true);setError("");setMessage("");
  try{
   const response=await fetch(`/api/hospitality/partners/${partnerId}/venues/${venueId}/vat-review`,{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({productId:product.id,requestKey:crypto.randomUUID(),vatClass,
     reviewed:vatClass!=="review_required",reviewBasis:reviewBasis.trim().replace(/\s+/g," ")})
   });
   const data=await response.json() as {error?:string;vatClass?:BeverageVatClass;reviewed?:boolean};
   if(!response.ok)throw new Error(data.error??"VAT_REVIEW_UNAVAILABLE");
   if(!data.vatClass||typeof data.reviewed!=="boolean")throw new Error("VAT_REVIEW_UNAVAILABLE");
   setSaved({vatClass:data.vatClass,reviewed:data.reviewed});
   setConfirmed(false);setReviewBasis("");
   setMessage("VAT decision recorded and audited. Refresh checkout readiness to see updated totals.");
  }catch(e){
   const code=e instanceof Error?e.message:"VAT_REVIEW_UNAVAILABLE";
   setError(errors[code]??code);
  }finally{setSaving(false);}
 }
 return <article style={{border:"1px solid #698390",borderRadius:15,padding:18,background:"#142439"}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
   <strong>{product.name}</strong>
   <span style={{fontSize:13,color:saved.reviewed?"#adf5c1":"#ffcd96"}}>
    {saved.reviewed?"✓ Reviewed: ":"⚠ Pending: "}{saved.vatClass.replaceAll("_"," ")}</span>
  </div>
  <p style={{fontSize:12,opacity:.85}}>This drink's actual price is {new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(product.priceCents/100)}.
   Its commercial VAT treatment must be verified by the merchant.</p>
  <div style={{display:"grid",gap:12,marginTop:12}}>
   <label>Product classification
    <select value={vatClass} disabled={saving||sessionActive} onChange={e=>setVatClass(e.target.value as BeverageVatClass)}
     style={{display:"block",width:"100%",padding:10,borderRadius:9,background:"#fff",color:"#142132",marginTop:5}}>
     {OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
   </label>
   <label>Reason and accountant/merchant reference
    <textarea value={reviewBasis} disabled={saving||sessionActive} onChange={e=>setReviewBasis(e.target.value)}
     minLength={15} maxLength={500} rows={2}
     placeholder="e.g., merchant reviewed beverage description and applicable classification with tax advisor"
     style={{display:"block",width:"100%",padding:10,borderRadius:9,background:"#fff",color:"#142132",marginTop:5}}/>
   </label>
   <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:13}}>
    <input type="checkbox" checked={confirmed} disabled={saving||sessionActive} onChange={e=>setConfirmed(e.target.checked)}/>
    I am the venue owner and confirm the classification based on the actual drink, its ingredients and applicable Greek tax rules.
   </label>
   <button type="button" onClick={()=>void save()} disabled={saving||sessionActive||!confirmed}
    style={{padding:12,borderRadius:10,fontWeight:800,background:"#d9ff57",color:"#162326",opacity:(saving||sessionActive||!confirmed)?0.5:1}}>
    {saving?"Saving…":"Save audited VAT classification"}
   </button>
   {error&&<p role="alert" style={{color:"#ffabba",margin:0}}>{error}</p>}
   {message&&<p role="status" style={{color:"#bff0cb",margin:0}}>{message}</p>}
  </div>
 </article>;
}
