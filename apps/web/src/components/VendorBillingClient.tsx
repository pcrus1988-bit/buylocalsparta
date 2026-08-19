"use client";

import { useMemo,useState,type FormEvent } from "react";
import type { VendorBillingWorkspace } from "../lib/admin-vendor-billing";
import type { VendorFeeTaxSetting } from "../lib/admin-vendor-fee-tax";

const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Athens",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const monthStart=()=>`${today().slice(0,7)}-01`;
type BillingResponse=VendorBillingWorkspace&{feeTaxSettings?:readonly VendorFeeTaxSetting[];error?:string};

export function VendorBillingClient({initial,initialFeeTaxSettings,csrfToken}:{initial:VendorBillingWorkspace;initialFeeTaxSettings:readonly VendorFeeTaxSetting[];csrfToken:string}){
  const [data,setData]=useState(initial),[feeTaxSettings,setFeeTaxSettings]=useState(initialFeeTaxSettings),[busy,setBusy]=useState(false),[error,setError]=useState(""),[vendorId,setVendorId]=useState("");
  const vendor=useMemo(()=>data.vendors.find(v=>v.id===vendorId),[data.vendors,vendorId]);
  const feeTax=useMemo(()=>feeTaxSettings.find(x=>x.vendorId===vendorId),[feeTaxSettings,vendorId]);
  async function post(payload:Record<string,unknown>){setBusy(true);setError("");try{const r=await fetch("/api/admin/finance/vendor-billing",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(payload)});const body=await r.json() as BillingResponse;if(!r.ok)throw new Error(body.error??"Η ενέργεια απέτυχε");setData(body);if(body.feeTaxSettings)setFeeTaxSettings(body.feeTaxSettings);}catch(e){setError(e instanceof Error?e.message:"Η ενέργεια απέτυχε");}finally{setBusy(false);}}
  async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await post({action:"create_draft",vendorId:String(f.get("vendorId")??""),periodStart:String(f.get("periodStart")??""),periodEnd:String(f.get("periodEnd")??""),includeListingFee:f.get("includeListingFee")==="on",recurringFeeOccurrences:Number(f.get("recurringFeeOccurrences")??0),notes:String(f.get("notes")??"")||undefined,reason:String(f.get("reason")??"")});}
  async function updateFeeTax(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!feeTax)return;const f=new FormData(e.currentTarget),mode=String(f.get("feeTaxMode")??"included"),percent=Number(f.get("feeTaxPercent")??0),reason=String(f.get("feeTaxReason")??"").trim();if(!Number.isFinite(percent)||percent<0||percent>100){setError("Ο συντελεστής ΦΠΑ fee πρέπει να είναι από 0% έως 100%.");return;}await post({action:"update_fee_tax",agreementId:feeTax.agreementId,feeTaxMode:mode,feeTaxRateBps:Math.round(percent*100),reason});}
  async function action(invoiceId:string,actionName:string,extra:Record<string,unknown>={}){const reason=window.prompt("Αιτιολογία / audit note");if(!reason?.trim())return;await post({action:actionName,invoiceId,reason:reason.trim(),...extra});}
  async function download(invoiceId:string){setBusy(true);setError("");try{const r=await fetch(`/api/admin/finance/vendor-billing?invoiceId=${encodeURIComponent(invoiceId)}&document=pdf`,{headers:{accept:"application/pdf"}});if(!r.ok){const b=await r.json().catch(()=>({})) as {error?:string};throw new Error(b.error??"Η λήψη απέτυχε");}const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`vendor-invoice-${invoiceId}.pdf`;a.click();URL.revokeObjectURL(url);}catch(e){setError(e instanceof Error?e.message:"Η λήψη απέτυχε");}finally{setBusy(false);}}
  const approvedPayments=data.paymentMappings.filter(x=>x.status==="approved"&&x.paymentType===5);
  return <>
    <section className="shell vendor-section">
      <div className="workspace-section-heading"><div><div className="eyebrow">Create billing draft</div><h2>Νέο τιμολόγιο προμηθειών & fees</h2><p>Οι προμήθειες λαμβάνονται από τα πραγματικά procurement snapshots και κάθε source μπορεί να τιμολογηθεί μόνο μία φορά.</p></div></div>
      <form className="vendor-form-card" onSubmit={create}>
        <div className="form-grid">
          <label>Vendor<select name="vendorId" required value={vendorId} onChange={e=>setVendorId(e.target.value)}><option value="">Επιλέξτε vendor</option>{data.vendors.map(v=><option key={v.id} value={v.id}>{v.name} · {euro(v.eligibleCommissionMinor)} uninvoiced</option>)}</select></label>
          <label>Από<input name="periodStart" type="date" required defaultValue={monthStart()}/></label>
          <label>Έως<input name="periodEnd" type="date" required defaultValue={today()}/></label>
          <label>Recurring fee occurrences<input name="recurringFeeOccurrences" type="number" min="0" max="24" step="1" defaultValue="0"/></label>
          <label><input name="includeListingFee" type="checkbox"/> Συμπερίληψη one-time/listing fee, εφόσον δεν έχει ήδη τιμολογηθεί</label>
          <label className="form-span-2">Σημειώσεις<input name="notes" placeholder="π.χ. Εκκαθάριση Αυγούστου 2026"/></label>
          <label className="form-span-2">Audit reason<input name="reason" required placeholder="Γιατί δημιουργείται το συγκεκριμένο billing draft"/></label>
        </div>
        {vendor&&<div className="workspace-inline-note"><strong>{vendor.name}</strong> · ΑΦΜ {vendor.taxNumber??"missing"} · eligible commissions {euro(vendor.eligibleCommissionMinor)} / {vendor.eligibleProcurements} procurements · listing {euro(vendor.listingFeeMinor)} · recurring {euro(vendor.recurringFeeMinor)} {vendor.recurringFeePeriod??""}</div>}
        <button className="button button-primary" disabled={busy||!vendorId}>{busy?"Επεξεργασία…":"Create billing draft"}</button>
      </form>

      {vendor&&feeTax&&<form className="vendor-form-card" onSubmit={updateFeeTax} key={`${feeTax.agreementId}:${feeTax.feeTaxMode}:${feeTax.feeTaxRateBps}`}>
        <strong>VAT treatment για listing / recurring fees</strong>
        <p>Αφορά μόνο τα contractual fees της ενεργής συμφωνίας. Η προμήθεια πωλήσεων συνεχίζει να χρησιμοποιεί το δικό της immutable commission tax snapshot.</p>
        <div className="form-grid">
          <label>Fee tax mode<select name="feeTaxMode" defaultValue={feeTax.feeTaxMode}><option value="included">VAT included</option><option value="plus_vat">VAT added on top</option><option value="none">No VAT</option></select></label>
          <label>Fee VAT %<input name="feeTaxPercent" type="number" min="0" max="100" step="0.01" defaultValue={(feeTax.feeTaxRateBps/100).toFixed(2)}/></label>
          <label className="form-span-2">Audit reason<input name="feeTaxReason" required placeholder="Λογιστική αιτιολόγηση αλλαγής VAT treatment"/></label>
        </div>
        <button className="button button-secondary" disabled={busy}>Save fee VAT treatment</button>
      </form>}
      {vendor&&!feeTax&&<div className="workspace-callout"><strong>Δεν υπάρχει ενεργή συμφωνία</strong><span>Listing/recurring fees δεν μπορούν να τιμολογηθούν μέχρι να υπάρχει ενεργή εμπορική συμφωνία.</span></div>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <div className="workspace-section-heading"><div><div className="eyebrow">Invoice lifecycle</div><h2>Vendor invoices</h2><p>Draft → approved tax mapping/payment mapping → prepared → AADE MARK → PDF/email. Η χρέωση commission που έχει ήδη παρακρατηθεί εμφανίζεται ως settlement offset.</p></div></div>
      {data.invoices.length===0?<div className="workspace-empty-state"><strong>Δεν υπάρχουν outbound vendor invoices.</strong><span>Δημιούργησε το πρώτο draft από πραγματικά commission/fee sources.</span></div>:<div className="workspace-queue-list">{data.invoices.map(inv=><article className="workspace-queue-card" key={inv.id}>
        <div className="workspace-queue-head"><div><strong>{inv.documentNumber??inv.id}</strong><small>{inv.vendorName} · {inv.periodStart} → {inv.periodEnd}</small></div><span className="status-pill">{inv.status} · {inv.paymentStatus}</span></div>
        <div className="workspace-queue-primary"><span>Net <strong>{euro(inv.netMinor)}</strong></span><span>VAT <strong>{euro(inv.taxMinor)}</strong></span><span>Total <strong>{euro(inv.grossMinor)}</strong></span><span>Offset <strong>{euro(inv.offsetMinor)}</strong></span>{inv.mark&&<span>MARK <strong>{inv.mark}</strong></span>}</div>
        <details className="workspace-record-details"><summary>Billing lines ({inv.items.length})</summary><div className="workspace-compact-list">{inv.items.map((x,i)=><div className="workspace-compact-row" key={`${inv.id}-${i}`}><strong>{x.kind}</strong><span>{x.description} · {euro(x.grossMinor)} · offset {euro(x.offsetMinor)}</span></div>)}</div></details>
        {inv.lastError&&<p className="form-error">{inv.lastError}</p>}
        <div className="workspace-action-bar"><span>Email: {inv.emailStatus} · AADE: {inv.transmissionStatus??"not prepared"}</span><div className="workspace-action-buttons">
          {inv.status==="draft"&&approvedPayments.map(p=><button key={`${p.processor}:${p.method}`} className="button button-secondary" disabled={busy} onClick={()=>void action(inv.id,"prepare",{processor:p.processor,processorMethod:p.method})}>Prepare · Επί Πιστώσει / offset · {p.processor}/{p.method}</button>)}
          {inv.status==="draft"&&approvedPayments.length===0&&<span>Απαιτείται approved myDATA payment type 5 mapping.</span>}
          {inv.status==="draft"&&<button className="button admin-danger" disabled={busy} onClick={()=>void action(inv.id,"void")}>Delete & release draft</button>}
          {inv.status==="prepared"&&<button className="button button-primary" disabled={busy} onClick={()=>void action(inv.id,"transmit")}>Transmit to AADE</button>}
          {inv.status==="issued"&&<button className="button button-secondary" disabled={busy} onClick={()=>void download(inv.id)}>Download PDF</button>}
          {inv.status==="issued"&&inv.emailStatus!=="sent"&&<button className="button button-primary" disabled={busy} onClick={()=>void action(inv.id,"email")}>Email vendor</button>}
        </div></div>
      </article>)}</div>}
    </div></section>
  </>;
}
