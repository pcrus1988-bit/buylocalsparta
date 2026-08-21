"use client";

import { useState } from "react";
import type { AdminPayoutDestinationWorkspace } from "../lib/admin-payout-destinations";

export function AdminPayoutDestinationsPanel({ initial, csrfToken }: { initial: AdminPayoutDestinationWorkspace; csrfToken: string }) {
  const [data,setData]=useState(initial);
  const [vendorId,setVendorId]=useState(initial.vendors[0]?.id??"");
  const [providerReference,setProviderReference]=useState("");
  const [displayLabel,setDisplayLabel]=useState("Κύριος λογαριασμός");
  const [maskedAccount,setMaskedAccount]=useState("");
  const [accountHolder,setAccountHolder]=useState("");
  const [bic,setBic]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function post(payload: Record<string,unknown>) {
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/admin/finance/payout-destinations",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(payload)});
      const body=await response.json() as AdminPayoutDestinationWorkspace & {error?:string};
      if (!response.ok) throw new Error(body.error??"Payout destination action failed");
      setData(body);
      return true;
    } catch (cause) { setError(cause instanceof Error?cause.message:"Payout destination action failed"); return false; }
    finally { setBusy(false); }
  }

  async function create() {
    const ok=await post({kind:"create",vendorId,provider:"bank_transfer",providerReference,displayLabel,maskedAccount,accountHolder,bic,reason});
    if (ok) { setProviderReference("");setMaskedAccount("");setAccountHolder("");setBic("");setReason(""); }
  }
  async function decide(kind:"verify"|"disable",destinationId:string) {
    const explanation=window.prompt(kind==="verify"?"Αιτιολογία επαλήθευσης (maker/checker)":"Αιτιολογία απενεργοποίησης");
    if (explanation===null) return;
    await post({kind,destinationId,reason:explanation});
  }

  const pending=data.destinations.filter(item=>item.status==="pending");
  const verified=data.destinations.filter(item=>item.status==="verified"&&!item.supersededAt);

  return <div className="workspace-queue-list">
    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Νέος προορισμός πληρωμής</strong><small>Αποθηκεύουμε μόνο token/reference του provider και masked στοιχεία. Ποτέ πλήρες IBAN σε αυτόν τον πίνακα.</small></div><span className="status-pill">maker</span></div>
      <div className="form-grid">
        <label>Κατάστημα<select value={vendorId} onChange={event=>setVendorId(event.target.value)}>{data.vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label>Provider / vault reference<input value={providerReference} onChange={event=>setProviderReference(event.target.value)} placeholder="vault_… / provider token" /></label>
        <label>Ετικέτα<input value={displayLabel} onChange={event=>setDisplayLabel(event.target.value)} /></label>
        <label>Masked λογαριασμός<input value={maskedAccount} onChange={event=>setMaskedAccount(event.target.value)} placeholder="GR••••••••1234" /></label>
        <label>Δικαιούχος<input value={accountHolder} onChange={event=>setAccountHolder(event.target.value)} /></label>
        <label>BIC (προαιρετικό)<input value={bic} onChange={event=>setBic(event.target.value)} /></label>
        <label className="form-grid-full">Αιτιολογία / evidence<input value={reason} onChange={event=>setReason(event.target.value)} placeholder="π.χ. στοιχεία επιβεβαιώθηκαν από υπογεγραμμένο vendor form" /></label>
      </div>
      <div className="workspace-action-bar"><span>Η δημιουργία αφήνει το destination σε <strong>pending</strong>.</span><button type="button" className="button button-secondary" disabled={busy||!vendorId} onClick={create}>{busy?"…":"Create pending destination"}</button></div>
    </article>

    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Pending verification</strong><small>Ο checker πρέπει να είναι διαφορετικός από τον maker.</small></div><span className="status-pill">{pending.length}</span></div>
      {pending.length===0?<p className="muted">Δεν υπάρχουν pending destinations.</p>:<div className="workspace-compact-list">{pending.map(item=><div className="workspace-compact-row" key={item.id}><div><strong>{item.vendorName}</strong><small>{item.displayLabel} · {item.maskedAccount} · maker {item.createdBy??"—"}</small></div><div className="workspace-action-buttons"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>decide("verify",item.id)}>Verify</button><button type="button" className="button admin-danger" disabled={busy} onClick={()=>decide("disable",item.id)}>Reject / disable</button></div></div>)}</div>}
    </article>

    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Verified payout destinations</strong><small>Verified οικονομικά στοιχεία είναι immutable. Αλλαγή = νέο pending destination και νέα επαλήθευση.</small></div><span className="status-pill">{verified.length}</span></div>
      {verified.length===0?<p className="muted">Δεν υπάρχει verified payout destination.</p>:<div className="workspace-compact-list">{verified.map(item=><div className="workspace-compact-row" key={item.id}><div><strong>{item.vendorName}</strong><small>{item.maskedAccount} · {item.accountHolder} · checker {item.verifiedBy??"—"}</small></div><button type="button" className="button admin-danger" disabled={busy} onClick={()=>decide("disable",item.id)}>Disable</button></div>)}</div>}
    </article>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
