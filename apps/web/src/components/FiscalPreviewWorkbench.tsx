"use client";
import {useState} from "react";
import type {FormEvent} from "react";
import type {FiscalPreviewLane,FiscalPreviewResult} from "../lib/fiscal-preview-calculator";

type Line={key:number;description:string;quantity:string;unitPrice:string;vatRate:string;discount:string};
const initial:Line={key:1,description:"",quantity:"1",unitPrice:"10,00",vatRate:"24",discount:"0"};
const money=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const minorToInput=(minor:number)=>Math.floor(minor/100)+","+String(minor%100).padStart(2,"0");
function decimal(value:string,places:number,max:number):number|null{
 const escaped=value.trim().replace(",",".");
 const parsed=/^([0-9]{1,11})(?:\.([0-9]+))?$/.exec(escaped);
 if(!parsed||(parsed[2]??"").length>places)return null;
 const result=Number(parsed[1])*10**places+Number((parsed[2]??"").padEnd(places,"0"));
 return Number.isSafeInteger(result)&&result<=max?result:null;
}
export function FiscalPreviewWorkbench({csrfToken,lane,onApplyGrossMinor}:{
 csrfToken:string;lane:FiscalPreviewLane;onApplyGrossMinor:(minor:number)=>void
}){
 const [items,setItems]=useState<Line[]>([initial]);
 const [nextId,setNextId]=useState(2);
 const [preview,setPreview]=useState<FiscalPreviewResult|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const edit=(key:number,field:keyof Omit<Line,"key">,value:string)=>{
  setItems(old=>old.map(item=>item.key===key?{...item,[field]:value}:item));
  setPreview(null);setError("");
 };
 const add=()=>{if(items.length>=10)return;setItems(old=>[...old,{...initial,key:nextId,description:""}]);setNextId(v=>v+1);setPreview(null);setError("")};
 const remove=(key:number)=>{setItems(old=>old.filter(item=>item.key!==key));setPreview(null);setError("")};
 async function calculate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const mapped=items.map(item=>({
   description:item.description.trim(),
   quantityMilli:decimal(item.quantity,3,1_000_000),
   unitPriceMinor:decimal(item.unitPrice,2,1_000_000_000),
   vatRateBps:decimal(item.vatRate,2,10_000),
   discountBps:decimal(item.discount,2,10_000)
  }));
  if(mapped.some(v=>!v.description||v.description.length>160||v.quantityMilli===null||!v.quantityMilli||
    v.unitPriceMinor===null||v.vatRateBps===null||v.discountBps===null)){
   setError("Ελέγξτε τις γραμμές: ποσότητα έως 3 δεκαδικά, ποσό έως 2, ποσοστά 0–100%.");return;
  }
  setBusy(true);setError("");setPreview(null);
  try{
   const response=await fetch("/timologio/api/console/preview",{
    method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},
    body:JSON.stringify({lane,items:mapped}),
    cache:"no-store",signal:AbortSignal.timeout(12_000)
   });
   const result=await response.json() as {preview?:FiscalPreviewResult;error?:string};
   if(!response.ok||result.preview?.kind!=="non_fiscal_test_preview"||
     result.preview.issuanceEnabled!==false||result.preview.legalTaxClassification!==false)
    throw new Error(result.error??"PREVIEW_INVALID_RESPONSE");
   setPreview(result.preview);
  }catch(cause){setError(cause instanceof Error?cause.message:"Ο υπολογισμός απέτυχε");}
  finally{setBusy(false)}
 }
 return <section className="fiscal-section fiscal-preview-workbench" aria-label="Δοκιμαστικός υπολογισμός γραμμών">
  <h3>Υπολογιστής γραμμών — προεπισκόπηση</h3>
  <p className="fiscal-muted">Καταχωρίστε γραμμές, ποσότητες, καθαρή τιμή, ενδεικτικό ΦΠΑ και έκπτωση. Ο συντελεστής ΦΠΑ εισάγεται από εσάς και <strong>δεν επαληθεύεται νομικά</strong>. Δεν αποθηκεύονται γραμμές ούτε εκδίδεται παραστατικό.</p>
  <form onSubmit={calculate}>
   {items.map((item,index)=><fieldset className="fiscal-card fiscal-preview-line" key={item.key} disabled={busy}>
    <legend>Γραμμή {index+1}</legend>
    <label>Περιγραφή<input required maxLength={160} value={item.description} onChange={e=>edit(item.key,"description",e.target.value)} placeholder="Προϊόν ή υπηρεσία" /></label>
    <div className="fiscal-preview-fields">
     <label>Ποσότητα<input required inputMode="decimal" value={item.quantity} onChange={e=>edit(item.key,"quantity",e.target.value)}/></label>
     <label>Καθαρή τιμή/μονάδα €<input required inputMode="decimal" value={item.unitPrice} onChange={e=>edit(item.key,"unitPrice",e.target.value)}/></label>
     <label>Ενδεικτικός ΦΠΑ %<input required inputMode="decimal" value={item.vatRate} onChange={e=>edit(item.key,"vatRate",e.target.value)}/></label>
     <label>Έκπτωση %<input required inputMode="decimal" value={item.discount} onChange={e=>edit(item.key,"discount",e.target.value)}/></label>
    </div>
    {items.length>1?<button type="button" className="fiscal-button secondary" onClick={()=>remove(item.key)} style={{color:"#143c42"}}>Αφαίρεση γραμμής</button>:null}
   </fieldset>)}
   <div className="fiscal-actions">
    <button type="button" className="fiscal-button secondary" style={{color:"#143c42"}} onClick={add} disabled={busy||items.length>=10}>+ Γραμμή</button>
    <button type="submit" className="fiscal-button" disabled={busy}>{busy?"Υπολογισμός…":"Υπολογισμός δοκιμής"}</button>
   </div>
  </form>
  {error?<p className="fiscal-error" role="alert">{error}</p>:null}
  {preview?<div aria-live="polite" className="fiscal-card">
   <h3>Αποτελέσματα δοκιμής</h3>
   <div className="fiscal-preview-totals">
    <span>Καθαρή αξία: <strong>{money(preview.totals.netMinor)}</strong></span>
    <span>Έκπτωση: <strong>{money(preview.totals.discountMinor)}</strong></span>
    <span>Ενδεικτικός ΦΠΑ: <strong>{money(preview.totals.vatMinor)}</strong></span>
    <span>Σύνολο: <strong>{money(preview.totals.grossMinor)}</strong></span>
   </div>
   <p className="fiscal-muted">Στρογγυλοποίηση ανά γραμμή, μισό προς τα πάνω. Το αποτέλεσμα δεν αποτελεί νόμιμο υπολογισμό ΦΠΑ και δεν μεταφέρει αναλυτικές γραμμές σε παραστατικό.</p>
   <button type="button" className="fiscal-button" onClick={()=>onApplyGrossMinor(preview.totals.grossMinor)}>
    Χρήση δοκιμαστικού συνόλου {minorToInput(preview.totals.grossMinor)} € στο draft
   </button>
  </div>:null}
 </section>;
}
