"use client";

import { FormEvent, useEffect, useState } from "react";

type LocalMissing=Readonly<{
  id:string;mark:string;issueDate?:string;invoiceTypeCode?:string;documentNumber?:string;
  incomeCategory?:string;e3Code?:string;classificationValueMinor?:number;
}>;
type E3Mismatch=Readonly<{
  local:LocalMissing;
  expected:Readonly<{incomeCategory:string;e3Code:string;valueMinor:number}>;
  actual:readonly Readonly<{incomeCategory?:string;e3Code?:string;valueMinor?:number}>[];
  reason:"expected_classification_missing"|"classification_value_missing"|"classification_value_mismatch";
}>;
type Diagnostic=Readonly<{
  readOnly:true;
  checkedAt:number;
  environment:string;
  specVersion:string;
  period:{dateFrom:string;dateTo:string};
  status:"matched"|"drift"|"incomplete";
  complete:boolean;
  sellerTaxNumber?:string;
  localDocuments:number;
  acceptedWithoutIssueDate:number;
  vat:{pages:number;complete:boolean;marks:number;matched:number};
  e3:{pages:number;complete:boolean;marks:number;matched:number;classificationChecked:number};
  localMissingInVat:readonly LocalMissing[];
  localMissingInE3:readonly LocalMissing[];
  localWithoutE3Expectation:readonly LocalMissing[];
  e3ClassificationMismatches:readonly E3Mismatch[];
  unmatchedVatMarks:readonly string[];
  unmatchedE3Marks:readonly string[];
  truncated:{
    localMissingInVat:boolean;localMissingInE3:boolean;localWithoutE3Expectation:boolean;e3ClassificationMismatches:boolean;
    unmatchedVatMarks:boolean;unmatchedE3Marks:boolean;
  };
}>;

export function MyDataReportingReconciliation(){
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [diagnostic,setDiagnostic]=useState<Diagnostic>();

  useEffect(()=>{
    const now=new Date();
    const first=new Date(now.getFullYear(),now.getMonth(),1);
    setDateFrom(localDate(first));
    setDateTo(localDate(now));
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!dateFrom||!dateTo)return;
    setBusy(true);setError("");
    try{
      const query=new URLSearchParams({dateFrom,dateTo,maxPages:"10"});
      const response=await fetch(`/api/admin/tax/reporting?${query.toString()}`,{method:"GET",cache:"no-store"});
      const payload=await response.json() as Diagnostic|{error?:string};
      if(!response.ok)throw new Error("error" in payload&&payload.error?payload.error:"myDATA reporting reconciliation failed");
      setDiagnostic(payload as Diagnostic);
    }catch(caught){setError(caught instanceof Error?caught.message:"myDATA reporting reconciliation failed");}
    finally{setBusy(false);}
  }

  return <article className="workspace-queue-card">
    <div className="workspace-queue-head">
      <div><strong>AADE VAT / E3 reconciliation</strong><small>Read-only comparison of accepted local MARKs against AADE reporting, including E3 classification category/type/value. It never transmits, retries or modifies fiscal documents.</small></div>
      <span className="status-pill">READ ONLY</span>
    </div>
    <form className="form-grid" onSubmit={submit}>
      <label>From<input type="date" value={dateFrom} onChange={event=>setDateFrom(event.target.value)} required /></label>
      <label>To<input type="date" value={dateTo} onChange={event=>setDateTo(event.target.value)} required /></label>
      <div className="workspace-action-buttons"><button className="button button-secondary" type="submit" disabled={busy||!dateFrom||!dateTo}>{busy?"Checking AADE…":"Run read-only reconciliation"}</button></div>
    </form>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {diagnostic&&<div className="workspace-queue-list">
      <div className="workspace-action-bar">
        <span>Status: <strong>{diagnostic.status}</strong> · {diagnostic.period.dateFrom} → {diagnostic.period.dateTo} · AADE {diagnostic.environment} / {diagnostic.specVersion}</span>
        <span>{new Date(diagnostic.checkedAt).toLocaleString("el-GR")}</span>
      </div>
      {!diagnostic.complete&&<p className="form-error">This reconciliation is incomplete. Do not interpret the current matches as proof that the fiscal period is clean.</p>}
      {diagnostic.acceptedWithoutIssueDate>0&&<p className="form-error">{diagnostic.acceptedWithoutIssueDate} accepted local fiscal document(s) have no fiscal issue_date, so they cannot be assigned safely to a reporting period.</p>}
      {diagnostic.localWithoutE3Expectation.length>0&&<p className="form-error">{diagnostic.localWithoutE3Expectation.length}{diagnostic.truncated.localWithoutE3Expectation?"+":""} local accepted document(s) lack enough approved mapping metadata to verify E3 classification semantics. The result remains incomplete.</p>}
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Local accepted MARKs</strong><span>{diagnostic.localDocuments}</span></div>
        <div className="workspace-compact-row"><strong>VAT report</strong><span>{diagnostic.vat.matched}/{diagnostic.localDocuments} local MARKs found · {diagnostic.vat.marks} AADE MARKs · {diagnostic.vat.pages} page(s){diagnostic.vat.complete?"":" · incomplete"}</span></div>
        <div className="workspace-compact-row"><strong>E3 report</strong><span>{diagnostic.e3.matched}/{diagnostic.localDocuments} local MARKs found · {diagnostic.e3.classificationChecked}/{diagnostic.localDocuments} semantic checks · {diagnostic.e3.pages} page(s){diagnostic.e3.complete?"":" · incomplete"}</span></div>
        <div className="workspace-compact-row"><strong>Seller AFM filter</strong><span>{diagnostic.sellerTaxNumber??"own AADE account / no approved seller filter"}</span></div>
      </div>
      <Drift title="Local MARKs missing from VAT reporting" rows={diagnostic.localMissingInVat} truncated={diagnostic.truncated.localMissingInVat} />
      <Drift title="Local MARKs missing from E3 reporting" rows={diagnostic.localMissingInE3} truncated={diagnostic.truncated.localMissingInE3} />
      <Drift title="Local MARKs without verifiable E3 expectation" rows={diagnostic.localWithoutE3Expectation} truncated={diagnostic.truncated.localWithoutE3Expectation} />
      <E3Drift rows={diagnostic.e3ClassificationMismatches} truncated={diagnostic.truncated.e3ClassificationMismatches} />
      <RemoteMarks title="AADE VAT MARKs not matched to a local accepted document" marks={diagnostic.unmatchedVatMarks} truncated={diagnostic.truncated.unmatchedVatMarks} />
      <RemoteMarks title="AADE E3 MARKs not matched to a local accepted document" marks={diagnostic.unmatchedE3Marks} truncated={diagnostic.truncated.unmatchedE3Marks} />
      {(diagnostic.unmatchedVatMarks.length>0||diagnostic.unmatchedE3Marks.length>0)&&<p className="workspace-inline-note">AADE-only MARKs are diagnostic information, not automatic errors: the same tax identity may contain fiscal records that were not created by this marketplace. They require review, never automatic retransmission.</p>}
      <p className="workspace-inline-note">VAT reconciliation currently confirms MARK presence only. AADE VAT reporting uses VAT-return boxes (for example 301/302/303), so amount-level VAT comparison remains disabled until an accountant-approved box mapping is defined.</p>
    </div>}
  </article>;
}

function Drift({title,rows,truncated}:{title:string;rows:readonly LocalMissing[];truncated:boolean}){
  if(rows.length===0)return null;
  return <details className="workspace-record-details"><summary>{title} ({rows.length}{truncated?"+":""})</summary><div className="workspace-compact-list">{rows.map(row=><div className="workspace-compact-row" key={`${title}-${row.id}`}><strong>{row.documentNumber??row.id}</strong><span>MARK {row.mark} · {row.issueDate??"no date"} · type {row.invoiceTypeCode??"—"}{row.incomeCategory||row.e3Code?` · ${row.incomeCategory??"—"}/${row.e3Code??"—"}`:""}</span></div>)}</div></details>;
}
function E3Drift({rows,truncated}:{rows:readonly E3Mismatch[];truncated:boolean}){
  if(rows.length===0)return null;
  return <details className="workspace-record-details"><summary>E3 classification drift ({rows.length}{truncated?"+":""})</summary><div className="workspace-compact-list">{rows.map(row=><div className="workspace-compact-row" key={`e3-${row.local.id}-${row.reason}`}><strong>{row.local.documentNumber??row.local.id}</strong><span>{e3Reason(row.reason)} · expected {row.expected.incomeCategory}/{row.expected.e3Code} = {money(row.expected.valueMinor)} · AADE {row.actual.length?row.actual.map(actual=>`${actual.incomeCategory??"—"}/${actual.e3Code??"—"}=${actual.valueMinor===undefined?"—":money(actual.valueMinor)}`).join("; "):"no classification rows"}</span></div>)}</div></details>;
}
function RemoteMarks({title,marks,truncated}:{title:string;marks:readonly string[];truncated:boolean}){
  if(marks.length===0)return null;
  return <details className="workspace-record-details"><summary>{title} ({marks.length}{truncated?"+":""})</summary><div className="workspace-compact-list">{marks.map(mark=><div className="workspace-compact-row" key={`${title}-${mark}`}><strong>MARK</strong><span>{mark}</span></div>)}</div></details>;
}
function e3Reason(value:E3Mismatch["reason"]):string{
  if(value==="expected_classification_missing")return "Expected category/type not found";
  if(value==="classification_value_missing")return "AADE classification value missing";
  return "Classification amount differs";
}
function money(minor:number):string{return (minor/100).toLocaleString("el-GR",{style:"currency",currency:"EUR"});}
function localDate(value:Date):string{
  const year=value.getFullYear();
  const month=String(value.getMonth()+1).padStart(2,"0");
  const day=String(value.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}
