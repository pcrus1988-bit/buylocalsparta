"use client";

import { useState } from "react";
import type { AdminFinanceAdjustmentWorkspace } from "../lib/admin-finance-adjustments";

function euro(value:number){return new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(value/100);}

export function AdminFinanceAdjustmentsPanel({initial,csrfToken}:{initial:AdminFinanceAdjustmentWorkspace;csrfToken:string}){
  const [data,setData]=useState(initial); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function action(kind:"approve"|"reject",adjustmentId:string,requiresCredit:boolean,candidates:readonly {id:string;documentNumber:string;invoiceTypeCode:string;mark:string}[]){
    const reason=window.prompt(kind==="approve"?"Αιτιολογία έγκρισης":"Αιτιολογία απόρριψης");
    if(reason===null)return;
    let creditDocumentId:string|undefined;
    if(kind==="approve"&&requiresCredit){
      if(candidates.length===0){setError("Δεν υπάρχει AADE accepted B2B credit note (5.1/5.2) για αυτόν τον vendor. Η προμήθεια δεν μπορεί να αντιστραφεί ακόμη.");return;}
      const menu=candidates.map((doc,index)=>`${index+1}. ${doc.documentNumber} · ${doc.invoiceTypeCode} · MARK ${doc.mark}`).join("\n");
      const selected=window.prompt(`Επίλεξε credit document:\n${menu}\n\nΑριθμός επιλογής`,"1");
      if(selected===null)return;
      const index=Number(selected)-1;
      if(!Number.isInteger(index)||index<0||index>=candidates.length){setError("Μη έγκυρη επιλογή credit document.");return;}
      creditDocumentId=candidates[index].id;
    }
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/admin/finance/adjustments",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify({kind,adjustmentId,creditDocumentId,reason})});
      const body=await response.json() as AdminFinanceAdjustmentWorkspace&{error?:string};
      if(!response.ok)throw new Error(body.error??"Finance adjustment action failed");
      setData(body);
    }catch(cause){setError(cause instanceof Error?cause.message:"Finance adjustment action failed");}
    finally{setBusy(false);}
  }
  const pending=data.adjustments.filter(item=>item.status==="pending");
  const approved=data.adjustments.filter(item=>item.status==="approved");
  return <div className="workspace-queue-list">
    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Pending finance review</strong><small>Καμία επιστροφή, chargeback ή correction δεν κρύβεται μέσα στο payout. Κάθε επίδραση έχει source, reason και approval trail.</small></div><span className="status-pill">{pending.length}</span></div>
      {pending.length===0?<p className="muted">Δεν υπάρχουν pending adjustments.</p>:<div className="workspace-compact-list">{pending.map(item=><div className="workspace-compact-row" key={item.id}><div><strong>{item.vendorName} · {item.direction==="credit_vendor"?"πίστωση vendor":"χρέωση vendor"} {euro(item.amountMinor)}</strong><small>{item.sourceKind} · {item.reasonCode} · {item.orderId??"χωρίς order"}<br/>{item.reason}{item.requiresPlatformCreditDocument?` · fiscal credit required · ${item.candidateCreditDocuments.length} candidate(s)`:""}</small></div><div className="workspace-action-buttons"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>action("approve",item.id,item.requiresPlatformCreditDocument,item.candidateCreditDocuments)}>Approve</button><button type="button" className="button admin-danger" disabled={busy} onClick={()=>action("reject",item.id,item.requiresPlatformCreditDocument,item.candidateCreditDocuments)}>Reject</button></div></div>)}</div>}
    </article>
    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Approved, not yet fully applied</strong><small>Θα δεσμευτούν σε συγκεκριμένες settlement lines και θεωρούνται applied μόνο όταν καταγραφεί το payout.</small></div><span className="status-pill">{approved.length}</span></div>
      {approved.length===0?<p className="muted">Δεν υπάρχουν approved open adjustments.</p>:<div className="workspace-compact-list">{approved.map(item=><div className="workspace-compact-row" key={item.id}><div><strong>{item.vendorName} · {euro(item.amountMinor)}</strong><small>{item.direction} · {item.reasonCode} · {item.orderId??"—"}</small></div><span className="status-pill">approved</span></div>)}</div>}
    </article>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
