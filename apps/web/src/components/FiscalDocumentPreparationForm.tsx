"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type DocumentMapping=Readonly<{eventCode:string;customerKind:string;geography:string;direction:string;invoiceType:string;status:string}>;
type PaymentMapping=Readonly<{processor:string;processorMethod:string;mydataPaymentType:number;status:string;erpRequiresEcrToken:boolean}>;

export function FiscalDocumentPreparationForm(props:{documentId:string;csrfToken:string;documentMappings:readonly DocumentMapping[];paymentMappings:readonly PaymentMapping[]}){
  const router=useRouter();
  const documents=useMemo(()=>props.documentMappings.filter(x=>x.status==="approved"&&x.customerKind==="b2c"&&x.geography==="domestic"&&x.direction==="sale"&&["11.1","11.2"].includes(x.invoiceType)),[props.documentMappings]);
  const payments=useMemo(()=>props.paymentMappings.filter(x=>x.status==="approved"),[props.paymentMappings]);
  const [eventCode,setEventCode]=useState(documents[0]?.eventCode??"");
  const [paymentKey,setPaymentKey]=useState(payments[0]?`${payments[0].processor}|${payments[0].processorMethod}`:"");
  const [paymentTid,setPaymentTid]=useState("");
  const [ecrSigningAuthor,setEcrSigningAuthor]=useState("");
  const [ecrSignature,setEcrSignature]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const selectedPayment=payments.find(x=>`${x.processor}|${x.processorMethod}`===paymentKey);
  const needsEcr=Boolean(selectedPayment&&(selectedPayment.mydataPaymentType===7||selectedPayment.erpRequiresEcrToken));

  async function submit(event:FormEvent){
    event.preventDefault();if(!eventCode||!selectedPayment)return;
    const reason=window.prompt("Αιτιολογία προετοιμασίας φορολογικού παραστατικού")?.trim();if(!reason)return;
    if(needsEcr&&(!ecrSigningAuthor.trim()||!ecrSignature.trim())){setMessage("Για POS/e-POS type 7 απαιτείται πραγματικό ECRToken SigningAuthor και Signature.");return;}
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/tax/documents",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":props.csrfToken},body:JSON.stringify({action:"prepare_document",documentId:props.documentId,eventCode,processor:selectedPayment.processor,processorMethod:selectedPayment.processorMethod,paymentTid:paymentTid.trim()||undefined,ecrSigningAuthor:ecrSigningAuthor.trim()||undefined,ecrSignature:ecrSignature.trim()||undefined,reason})});
      const payload=await response.json() as {error?:string;documentNumber?:string};if(!response.ok)throw new Error(payload.error??"Fiscal preparation failed");
      setMessage(`Prepared ${payload.documentNumber??props.documentId}.`);setEcrSignature("");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Fiscal preparation failed");}finally{setBusy(false);}
  }

  if(!documents.length||!payments.length)return <p className="workspace-inline-note">Preparation is blocked until at least one domestic B2C document mapping and one payment mapping are approved.</p>;
  return <form className="form-grid" onSubmit={submit}>
    <label>Document mapping<select value={eventCode} onChange={e=>setEventCode(e.target.value)}>{documents.map(x=><option value={x.eventCode} key={x.eventCode}>{x.eventCode} · type {x.invoiceType}</option>)}</select></label>
    <label>Payment mapping<select value={paymentKey} onChange={e=>setPaymentKey(e.target.value)}>{payments.map(x=>{const key=`${x.processor}|${x.processorMethod}`;return <option value={key} key={key}>{x.processor}/{x.processorMethod} · myDATA {x.mydataPaymentType}</option>;})}</select></label>
    <label>POS TID (when available)<input value={paymentTid} onChange={e=>setPaymentTid(e.target.value)} maxLength={200} /></label>
    {needsEcr&&<>
      <label>ECRToken SigningAuthor<input value={ecrSigningAuthor} onChange={e=>setEcrSigningAuthor(e.target.value)} maxLength={20} autoComplete="off" /></label>
      <label>ECRToken Signature<input type="password" value={ecrSignature} onChange={e=>setEcrSignature(e.target.value)} autoComplete="new-password" /></label>
    </>}
    <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy}>{busy?"Preparing…":"Prepare invoice / receipt"}</button></div>
    {message&&<p className="workspace-inline-note" role="status">{message}</p>}
  </form>;
}
