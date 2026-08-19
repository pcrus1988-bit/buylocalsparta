"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type Policy = Readonly<{
  id:string; version:string; status:string; sellerOfRecord:boolean; sellerLegalName:string; sellerTaxNumber:string;
  compatibilityTarget:string; productionPublishedSchema?:string; fiscalisationRoute:"unselected"|"viva_fiscal_provider"|"aade_direct_erp"; effectiveFrom?:string;
}>;
type DocumentMapping = Readonly<{eventCode:string;customerKind:string;itemKind:string;geography:string;direction:string;invoiceType:string;incomeCategory?:string;e3Code?:string;seriesCode:string;status:"proposed"|"approved"|"future"|"exception";correlationRequired:boolean;negativeOriginalClassification:boolean;notes?:string}>;
type PaymentMapping = Readonly<{processor:string;processorMethod:string;mydataPaymentType:number;requiresTransactionId:boolean;erpRequiresEcrToken:boolean;providerSignatureRoute:boolean;status:"proposed"|"approved"|"future"|"exception";notes?:string}>;
type FiscalSeries = Readonly<{series:string;invoiceType:string;purpose:string;fiscalYear:number;nextAa:number;lastIssuedAa?:number;lastMark?:string;locked:boolean}>;
type VatCategory = Readonly<{code:number;rateBps:number;label:string;specialCategory:boolean}>;
type RuntimeConfig = Readonly<{environment:string;baseUrl?:string;specVersion:string;requestTimeoutMs:number;issuanceEnabled:boolean;ecrTokenEnabled:boolean;vivaFiscalEnabled:boolean;mappingVersionPin?:string;capturePaidOrders:boolean;emailAcceptedDocuments:boolean;updatedAt?:number}>;

type Props = Readonly<{
  csrfToken:string;
  policy?:Policy;
  documentMappings:readonly DocumentMapping[];
  paymentMappings:readonly PaymentMapping[];
  series:readonly FiscalSeries[];
  vatCategories:readonly VatCategory[];
  runtimeConfig:RuntimeConfig;
  credentialsConfigured:boolean;
  credentialSource?:string;
}>;

const mappingStatuses=["proposed","approved","future","exception"] as const;

export function TaxConfigurationEditor(props:Props){
  const router=useRouter();
  const editable=Boolean(props.policy&&["draft","review"].includes(props.policy.status));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const [runtime,setRuntime]=useState({...props.runtimeConfig,mappingVersionPin:props.runtimeConfig.mappingVersionPin??""});
  const [userId,setUserId]=useState("");
  const [subscriptionKey,setSubscriptionKey]=useState("");

  const [policyForm,setPolicyForm]=useState({
    sellerOfRecord:props.policy?.sellerOfRecord??true,
    sellerLegalName:props.policy?.sellerLegalName??"",
    sellerTaxNumber:props.policy?.sellerTaxNumber??"",
    compatibilityTarget:props.policy?.compatibilityTarget??"2.0.2",
    productionPublishedSchema:props.policy?.productionPublishedSchema??"",
    effectiveFrom:props.policy?.effectiveFrom??"",
    route:props.policy?.fiscalisationRoute??"unselected"
  });
  const [revisionVersion,setRevisionVersion]=useState("");

  const [docKey,setDocKey]=useState(props.documentMappings[0]?.eventCode??"");
  const selectedDoc=useMemo(()=>props.documentMappings.find(x=>x.eventCode===docKey),[props.documentMappings,docKey]);
  const [docForm,setDocForm]=useState(()=>docState(props.documentMappings[0]));

  const [payKey,setPayKey]=useState(props.paymentMappings[0]?`${props.paymentMappings[0].processor}\u0000${props.paymentMappings[0].processorMethod}`:"");
  const selectedPay=useMemo(()=>props.paymentMappings.find(x=>`${x.processor}\u0000${x.processorMethod}`===payKey),[props.paymentMappings,payKey]);
  const [payForm,setPayForm]=useState(()=>paymentState(props.paymentMappings[0]));

  const [seriesKey,setSeriesKey]=useState(props.series[0]?.series??"");
  const selectedSeries=useMemo(()=>props.series.find(x=>x.series===seriesKey),[props.series,seriesKey]);
  const [seriesForm,setSeriesForm]=useState(()=>seriesState(props.series[0]));

  const [vatKey,setVatKey]=useState(props.vatCategories[0]?.code??1);
  const selectedVat=useMemo(()=>props.vatCategories.find(x=>x.code===vatKey),[props.vatCategories,vatKey]);
  const [vatForm,setVatForm]=useState(()=>vatState(props.vatCategories[0]));

  const [orderId,setOrderId]=useState("");

  async function post(endpoint:string,body:Record<string,unknown>,success:string){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-csrf-token":props.csrfToken},body:JSON.stringify(body)});
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error??"Admin tax action failed");
      setMessage(success);router.refresh();return true;
    }catch(error){setMessage(error instanceof Error?error.message:"Admin tax action failed");return false;}
    finally{setBusy(false);}
  }
  function askReason(promptText:string){const value=window.prompt(promptText);return value?.trim()||undefined;}

  async function saveRuntime(event:FormEvent){
    event.preventDefault();const reason=askReason("Αιτιολογία αλλαγής AADE/myDATA runtime configuration");if(!reason)return;
    let confirmation:string|undefined;
    if(runtime.issuanceEnabled&&!props.runtimeConfig.issuanceEnabled){confirmation=window.prompt("Για ενεργοποίηση πραγματικής φορολογικής διαβίβασης γράψτε ακριβώς: ENABLE LIVE FISCAL")?.trim();if(confirmation!=="ENABLE LIVE FISCAL")return;}
    await post("/api/admin/tax/config",{action:"save_runtime",environment:runtime.environment,specVersion:runtime.specVersion,requestTimeoutMs:Number(runtime.requestTimeoutMs),issuanceEnabled:runtime.issuanceEnabled,ecrTokenEnabled:runtime.ecrTokenEnabled,vivaFiscalEnabled:runtime.vivaFiscalEnabled,mappingVersionPin:runtime.mappingVersionPin||undefined,capturePaidOrders:runtime.capturePaidOrders,emailAcceptedDocuments:runtime.emailAcceptedDocuments,confirmation,reason},"Η AADE/myDATA runtime configuration αποθηκεύτηκε.");
  }
  async function saveCredentials(event:FormEvent){
    event.preventDefault();if(!userId.trim()&&!subscriptionKey.trim()){setMessage("Συμπληρώστε τουλάχιστον ένα credential για ενημέρωση.");return;}const reason=askReason("Αιτιολογία αλλαγής AADE credentials");if(!reason)return;
    const ok=await post("/api/admin/tax/config",{action:"save_credentials",userId:userId.trim()||undefined,subscriptionKey:subscriptionKey.trim()||undefined,reason},"Τα AADE credentials ενημερώθηκαν στο encrypted Vault.");if(ok){setUserId("");setSubscriptionKey("");}
  }
  async function savePolicy(event:FormEvent){
    event.preventDefault();if(!props.policy)return;const reason=askReason("Αιτιολογία αλλαγής Accounting Policy");if(!reason)return;
    const ok=await post("/api/admin/tax/policy",{action:"update_policy",policyId:props.policy.id,sellerOfRecord:policyForm.sellerOfRecord,sellerLegalName:policyForm.sellerLegalName,sellerTaxNumber:policyForm.sellerTaxNumber,compatibilityTarget:policyForm.compatibilityTarget,productionPublishedSchema:policyForm.productionPublishedSchema||undefined,effectiveFrom:policyForm.effectiveFrom||undefined,reason},"Η βασική Accounting Policy ενημερώθηκε.");
    if(ok&&policyForm.route!==props.policy.fiscalisationRoute)await post("/api/admin/tax/policy",{action:"set_route",policyId:props.policy.id,route:policyForm.route,reason},"Η fiscalisation route ενημερώθηκε.");
  }
  async function createRevision(){if(!props.policy||!revisionVersion.trim())return;const reason=askReason("Αιτιολογία δημιουργίας νέας Accounting Policy revision");if(!reason)return;await post("/api/admin/tax/policy",{action:"create_revision",policyId:props.policy.id,version:revisionVersion.trim(),reason},"Δημιουργήθηκε νέα editable Accounting Policy revision.");}
  async function saveDocument(event:FormEvent){event.preventDefault();if(!props.policy||!selectedDoc)return;const reason=askReason(`Αιτιολογία αλλαγής mapping ${selectedDoc.eventCode}`);if(!reason)return;await post("/api/admin/tax/policy",{action:"update_document_mapping",policyId:props.policy.id,eventCode:selectedDoc.eventCode,...docForm,reason},"Το document mapping ενημερώθηκε.");}
  async function savePayment(event:FormEvent){event.preventDefault();if(!props.policy||!selectedPay)return;const reason=askReason(`Αιτιολογία αλλαγής payment mapping ${selectedPay.processor}/${selectedPay.processorMethod}`);if(!reason)return;await post("/api/admin/tax/policy",{action:"update_payment_mapping",policyId:props.policy.id,processor:selectedPay.processor,processorMethod:selectedPay.processorMethod,...payForm,mydataPaymentType:Number(payForm.mydataPaymentType),reason},"Το payment mapping ενημερώθηκε.");}
  async function saveSeries(event:FormEvent){event.preventDefault();if(!selectedSeries)return;const reason=askReason(`Αιτιολογία αλλαγής fiscal series ${selectedSeries.series}`);if(!reason)return;await post("/api/admin/tax/policy",{action:"update_series",series:selectedSeries.series,...seriesForm,fiscalYear:Number(seriesForm.fiscalYear),nextAa:Number(seriesForm.nextAa),reason},"Η fiscal series ενημερώθηκε.");}
  async function saveVat(event:FormEvent){event.preventDefault();if(!selectedVat)return;const reason=askReason(`Αιτιολογία αλλαγής AADE VAT category ${selectedVat.code}`);if(!reason)return;await post("/api/admin/tax/policy",{action:"update_vat_category",code:selectedVat.code,rateBps:Number(vatForm.rateBps),label:vatForm.label,specialCategory:vatForm.specialCategory,reason},"Η VAT category ενημερώθηκε.");}
  async function captureOrder(event:FormEvent){event.preventDefault();if(!orderId.trim())return;const reason=askReason("Αιτιολογία manual fiscal capture της παραγγελίας");if(!reason)return;const ok=await post("/api/admin/tax/documents",{action:"capture_order",orderId:orderId.trim(),reason},"Η παραγγελία καταχωρήθηκε στο fiscal document lifecycle.");if(ok)setOrderId("");}

  function chooseDoc(value:string){setDocKey(value);setDocForm(docState(props.documentMappings.find(x=>x.eventCode===value)));}
  function choosePay(value:string){setPayKey(value);setPayForm(paymentState(props.paymentMappings.find(x=>`${x.processor}\u0000${x.processorMethod}`===value)));}
  function chooseSeries(value:string){setSeriesKey(value);setSeriesForm(seriesState(props.series.find(x=>x.series===value)));}
  function chooseVat(value:number){setVatKey(value);setVatForm(vatState(props.vatCategories.find(x=>x.code===value)));}

  return <div className="workspace-queue-list">
    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>AADE / myDATA runtime</strong><small>Operational switches stored in the database and controlled only from Admin.</small></div><span className="status-pill">{runtime.issuanceEnabled?"issuance ON":"issuance OFF"}</span></div>
      <form className="form-grid" onSubmit={saveRuntime}>
        <label>AADE environment<select value={runtime.environment} onChange={e=>setRuntime(v=>({...v,environment:e.target.value}))}><option value="production">production</option><option value="test">test</option></select></label>
        <label>myDATA spec version<input value={runtime.specVersion} onChange={e=>setRuntime(v=>({...v,specVersion:e.target.value}))} /></label>
        <label>Request timeout (ms)<input type="number" min={1000} max={60000} value={runtime.requestTimeoutMs} onChange={e=>setRuntime(v=>({...v,requestTimeoutMs:Number(e.target.value)}))} /></label>
        <label>Approved mapping pin<input value={runtime.mappingVersionPin} onChange={e=>setRuntime(v=>({...v,mappingVersionPin:e.target.value}))} placeholder="blank = current approved policy" /></label>
        <label className="checkbox-label"><input type="checkbox" checked={runtime.capturePaidOrders} onChange={e=>setRuntime(v=>({...v,capturePaidOrders:e.target.checked}))} />Create pending fiscal record after captured Viva payment</label>
        <label className="checkbox-label"><input type="checkbox" checked={runtime.emailAcceptedDocuments} onChange={e=>setRuntime(v=>({...v,emailAcceptedDocuments:e.target.checked}))} />Email accepted fiscal document to customer</label>
        <label className="checkbox-label"><input type="checkbox" checked={runtime.ecrTokenEnabled} onChange={e=>setRuntime(v=>({...v,ecrTokenEnabled:e.target.checked}))} />Direct ERP / ECRToken capability enabled</label>
        <label className="checkbox-label"><input type="checkbox" checked={runtime.vivaFiscalEnabled} onChange={e=>setRuntime(v=>({...v,vivaFiscalEnabled:e.target.checked}))} />Viva Fiscal provider capability enabled</label>
        <label className="checkbox-label"><input type="checkbox" checked={runtime.issuanceEnabled} onChange={e=>setRuntime(v=>({...v,issuanceEnabled:e.target.checked}))} />Allow live fiscal issuance when all policy gates pass</label>
        <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save runtime configuration"}</button></div>
      </form>
      <p className="workspace-inline-note">Endpoint is derived from the selected official AADE environment; custom credential-exfiltration URLs are not accepted. Live issuance still requires an approved policy and all per-document gates.</p>
    </article>

    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>AADE credentials</strong><small>Encrypted Supabase Vault · existing secrets are never displayed back to the browser.</small></div><span className="status-pill">{props.credentialsConfigured?`configured${props.credentialSource?` · ${props.credentialSource}`:""}`:"missing"}</span></div>
      <form className="form-grid" onSubmit={saveCredentials}>
        <label>AADE User ID<input autoComplete="off" value={userId} onChange={e=>setUserId(e.target.value)} placeholder="leave blank to keep current" /></label>
        <label>Subscription key<input type="password" autoComplete="new-password" value={subscriptionKey} onChange={e=>setSubscriptionKey(e.target.value)} placeholder="leave blank to keep current" /></label>
        <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Update encrypted credentials"}</button></div>
      </form>
    </article>

    {props.policy&&<article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Accounting Policy v{props.policy.version}</strong><small>Seller, compatibility target, effective date and fiscalisation route.</small></div><span className="status-pill">{props.policy.status}</span></div>
      {editable?<form className="form-grid" onSubmit={savePolicy}>
        <label>Seller legal name<input value={policyForm.sellerLegalName} onChange={e=>setPolicyForm(v=>({...v,sellerLegalName:e.target.value}))} /></label>
        <label>Seller AFM<input inputMode="numeric" value={policyForm.sellerTaxNumber} onChange={e=>setPolicyForm(v=>({...v,sellerTaxNumber:e.target.value}))} /></label>
        <label>Compatibility target<input value={policyForm.compatibilityTarget} onChange={e=>setPolicyForm(v=>({...v,compatibilityTarget:e.target.value}))} /></label>
        <label>Published production schema<input value={policyForm.productionPublishedSchema} onChange={e=>setPolicyForm(v=>({...v,productionPublishedSchema:e.target.value}))} /></label>
        <label>Effective from<input type="date" value={policyForm.effectiveFrom} onChange={e=>setPolicyForm(v=>({...v,effectiveFrom:e.target.value}))} /></label>
        <label>Fiscalisation route<select value={policyForm.route} onChange={e=>setPolicyForm(v=>({...v,route:e.target.value as typeof v.route}))}><option value="unselected">unselected</option><option value="aade_direct_erp">AADE Direct ERP</option><option value="viva_fiscal_provider">Viva Fiscal provider</option></select></label>
        <label className="checkbox-label"><input type="checkbox" checked={policyForm.sellerOfRecord} onChange={e=>setPolicyForm(v=>({...v,sellerOfRecord:e.target.checked}))} />KONTA MOY / SP BUSINESS LAB is seller of record</label>
        <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save Accounting Policy"}</button></div>
      </form>:<div className="workspace-action-bar"><span>Approved policy records are immutable. Change tax policy through a new auditable revision.</span><div className="workspace-action-buttons"><input aria-label="New policy version" value={revisionVersion} onChange={e=>setRevisionVersion(e.target.value)} placeholder="e.g. 1.1" /><button type="button" className="button button-secondary" disabled={busy||!revisionVersion.trim()} onClick={()=>void createRevision()}>Create revision</button></div></div>}
    </article>}

    {props.policy&&props.documentMappings.length>0&&<article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Document mapping editor</strong><small>Invoice type, income classification, E3 code, fiscal series and production status.</small></div><span className="status-pill">{editable?"editable":"immutable"}</span></div>
      <form className="form-grid" onSubmit={saveDocument}>
        <label>Mapping<select value={docKey} onChange={e=>chooseDoc(e.target.value)}>{props.documentMappings.map(x=><option key={x.eventCode} value={x.eventCode}>{x.eventCode}</option>)}</select></label>
        <label>Customer kind<select value={docForm.customerKind} disabled={!editable} onChange={e=>setDocForm(v=>({...v,customerKind:e.target.value}))}><option>b2c</option><option>b2b</option><option>none</option></select></label>
        <label>Item kind<select value={docForm.itemKind} disabled={!editable} onChange={e=>setDocForm(v=>({...v,itemKind:e.target.value}))}><option>goods</option><option>services</option><option>mixed</option><option>none</option></select></label>
        <label>Geography<select value={docForm.geography} disabled={!editable} onChange={e=>setDocForm(v=>({...v,geography:e.target.value}))}><option>domestic</option><option>eu</option><option>third_country</option><option>none</option></select></label>
        <label>Direction<select value={docForm.direction} disabled={!editable} onChange={e=>setDocForm(v=>({...v,direction:e.target.value}))}><option>sale</option><option>credit</option><option>platform_service</option><option>delivery</option></select></label>
        <label>myDATA invoice type<input disabled={!editable} value={docForm.invoiceType} onChange={e=>setDocForm(v=>({...v,invoiceType:e.target.value}))} /></label>
        <label>Income category<input disabled={!editable} value={docForm.incomeCategory} onChange={e=>setDocForm(v=>({...v,incomeCategory:e.target.value}))} /></label>
        <label>E3 code<input disabled={!editable} value={docForm.e3Code} onChange={e=>setDocForm(v=>({...v,e3Code:e.target.value}))} /></label>
        <label>Fiscal series<select disabled={!editable} value={docForm.seriesCode} onChange={e=>setDocForm(v=>({...v,seriesCode:e.target.value}))}>{props.series.map(s=><option value={s.series} key={s.series}>{s.series}</option>)}</select></label>
        <label>Status<select disabled={!editable} value={docForm.status} onChange={e=>setDocForm(v=>({...v,status:e.target.value as typeof v.status}))}>{mappingStatuses.map(s=><option value={s} key={s}>{s}</option>)}</select></label>
        <label className="checkbox-label"><input type="checkbox" disabled={!editable} checked={docForm.negativeOriginalClassification} onChange={e=>setDocForm(v=>({...v,negativeOriginalClassification:e.target.checked}))} />Negative original classification</label>
        <label className="checkbox-label"><input type="checkbox" disabled={!editable} checked={docForm.correlationRequired} onChange={e=>setDocForm(v=>({...v,correlationRequired:e.target.checked}))} />Original-document correlation required</label>
        <label>Notes<textarea disabled={!editable} value={docForm.notes} onChange={e=>setDocForm(v=>({...v,notes:e.target.value}))} /></label>
        {editable&&<div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save document mapping"}</button></div>}
      </form>
    </article>}

    {props.policy&&props.paymentMappings.length>0&&<article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Payment mapping editor</strong><small>Processor method to myDATA payment type and fiscal evidence requirements.</small></div><span className="status-pill">{editable?"editable":"immutable"}</span></div>
      <form className="form-grid" onSubmit={savePayment}>
        <label>Mapping<select value={payKey} onChange={e=>choosePay(e.target.value)}>{props.paymentMappings.map(x=>{const key=`${x.processor}\u0000${x.processorMethod}`;return <option key={key} value={key}>{x.processor} / {x.processorMethod}</option>;})}</select></label>
        <label>myDATA payment type<input type="number" min={1} max={8} disabled={!editable} value={payForm.mydataPaymentType} onChange={e=>setPayForm(v=>({...v,mydataPaymentType:Number(e.target.value)}))} /></label>
        <label>Status<select disabled={!editable} value={payForm.status} onChange={e=>setPayForm(v=>({...v,status:e.target.value as typeof v.status}))}>{mappingStatuses.map(s=><option value={s} key={s}>{s}</option>)}</select></label>
        <label className="checkbox-label"><input type="checkbox" disabled={!editable} checked={payForm.requiresTransactionId} onChange={e=>setPayForm(v=>({...v,requiresTransactionId:e.target.checked}))} />transactionId required</label>
        <label className="checkbox-label"><input type="checkbox" disabled={!editable} checked={payForm.erpRequiresEcrToken} onChange={e=>setPayForm(v=>({...v,erpRequiresEcrToken:e.target.checked}))} />ERP ECRToken required</label>
        <label className="checkbox-label"><input type="checkbox" disabled={!editable} checked={payForm.providerSignatureRoute} onChange={e=>setPayForm(v=>({...v,providerSignatureRoute:e.target.checked}))} />Provider signature route</label>
        <label>Notes<textarea disabled={!editable} value={payForm.notes} onChange={e=>setPayForm(v=>({...v,notes:e.target.value}))} /></label>
        {editable&&<div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save payment mapping"}</button></div>}
      </form>
    </article>}

    {props.series.length>0&&<article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Fiscal series & numbering</strong><small>AA sequence changes are protected against moving behind an already issued document.</small></div><span className="status-pill">Admin only</span></div>
      <form className="form-grid" onSubmit={saveSeries}>
        <label>Series<select value={seriesKey} onChange={e=>chooseSeries(e.target.value)}>{props.series.map(s=><option key={s.series}>{s.series}</option>)}</select></label>
        <label>Invoice type<input value={seriesForm.invoiceType} onChange={e=>setSeriesForm(v=>({...v,invoiceType:e.target.value}))} /></label>
        <label>Purpose<input value={seriesForm.purpose} onChange={e=>setSeriesForm(v=>({...v,purpose:e.target.value}))} /></label>
        <label>Fiscal year<input type="number" value={seriesForm.fiscalYear} onChange={e=>setSeriesForm(v=>({...v,fiscalYear:Number(e.target.value)}))} /></label>
        <label>Next AA<input type="number" min={1} value={seriesForm.nextAa} onChange={e=>setSeriesForm(v=>({...v,nextAa:Number(e.target.value)}))} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={seriesForm.locked} onChange={e=>setSeriesForm(v=>({...v,locked:e.target.checked}))} />Lock series</label>
        <div className="workspace-inline-note">Last issued AA: {selectedSeries?.lastIssuedAa??"—"} · Last MARK: {selectedSeries?.lastMark??"—"}</div>
        <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save fiscal series"}</button></div>
      </form>
    </article>}

    {props.vatCategories.length>0&&<article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>AADE VAT category catalogue</strong><small>Platform VAT catalogue; product-specific assignments remain independently accountant-approved.</small></div><span className="status-pill">Admin only</span></div>
      <form className="form-grid" onSubmit={saveVat}>
        <label>Category<select value={vatKey} onChange={e=>chooseVat(Number(e.target.value))}>{props.vatCategories.map(v=><option key={v.code} value={v.code}>{v.code} · {v.label}</option>)}</select></label>
        <label>Rate (basis points)<input type="number" min={0} value={vatForm.rateBps} onChange={e=>setVatForm(v=>({...v,rateBps:Number(e.target.value)}))} /></label>
        <label>Label<input value={vatForm.label} onChange={e=>setVatForm(v=>({...v,label:e.target.value}))} /></label>
        <label className="checkbox-label"><input type="checkbox" checked={vatForm.specialCategory} onChange={e=>setVatForm(v=>({...v,specialCategory:e.target.checked}))} />Special category</label>
        <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"…":"Save VAT category"}</button><Link className="button button-secondary" href="/admin/finance/mydata/products">Product VAT profiles</Link></div>
      </form>
    </article>}

    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Invoice / receipt creation</strong><small>Manual recovery path for a confirmed, fully captured order. Duplicate fiscal capture is idempotent.</small></div><span className="status-pill">Admin only</span></div>
      <form className="form-grid" onSubmit={captureOrder}><label>Order ID<input value={orderId} onChange={e=>setOrderId(e.target.value)} placeholder="ord_…" /></label><div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy||!orderId.trim()}>{busy?"…":"Create / recover fiscal record"}</button></div></form>
      <p className="workspace-inline-note">This creates the governed fiscal lifecycle record. Actual AADE transmission remains a separate action after mapping, VAT, payment evidence and route validation.</p>
    </article>

    {message&&<p className={message.includes("αποθηκεύ")||message.includes("ενημερώ")||message.includes("Δημιουργήθηκε")||message.includes("καταχωρήθηκε")?"workspace-inline-note":"form-error"} role="status">{message}</p>}
  </div>;
}

function docState(value:DocumentMapping|undefined){return{customerKind:value?.customerKind??"b2c",itemKind:value?.itemKind??"goods",geography:value?.geography??"domestic",direction:value?.direction??"sale",invoiceType:value?.invoiceType??"",incomeCategory:value?.incomeCategory??"",e3Code:value?.e3Code??"",seriesCode:value?.seriesCode??"",status:value?.status??"proposed" as DocumentMapping["status"],negativeOriginalClassification:value?.negativeOriginalClassification??false,correlationRequired:value?.correlationRequired??false,notes:value?.notes??""};}
function paymentState(value:PaymentMapping|undefined){return{mydataPaymentType:value?.mydataPaymentType??7,requiresTransactionId:value?.requiresTransactionId??false,erpRequiresEcrToken:value?.erpRequiresEcrToken??false,providerSignatureRoute:value?.providerSignatureRoute??false,status:value?.status??"proposed" as PaymentMapping["status"],notes:value?.notes??""};}
function seriesState(value:FiscalSeries|undefined){return{invoiceType:value?.invoiceType??"",purpose:value?.purpose??"",fiscalYear:value?.fiscalYear??new Date().getFullYear(),nextAa:value?.nextAa??1,locked:value?.locked??false};}
function vatState(value:VatCategory|undefined){return{rateBps:value?.rateBps??0,label:value?.label??"",specialCategory:value?.specialCategory??false};}
