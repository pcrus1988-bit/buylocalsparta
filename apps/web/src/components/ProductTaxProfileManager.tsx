"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Variant=Readonly<{variantId:string;slug:string;title:string;existingTaxRateBps:number;profile?:Readonly<{id:string;vatCategory:number;vatRateBps:number;vatExemptionCategory?:number;effectiveFrom:string;effectiveUntil?:string;approved:boolean;approvalVersion?:string;profileHash?:string}>}>;
type Vat=Readonly<{code:number;rateBps:number;label:string;specialCategory:boolean}>;

export function ProductTaxProfileManager({variants,vatCategories,csrfToken,defaultEffectiveFrom}:{variants:readonly Variant[];vatCategories:readonly Vat[];csrfToken:string;defaultEffectiveFrom:string}){
  const router=useRouter();
  const [variantId,setVariantId]=useState(variants.find(v=>!v.profile?.approved)?.variantId??variants[0]?.variantId??"");
  const [vatCategory,setVatCategory]=useState("");
  const [exemption,setExemption]=useState("");
  const [effectiveFrom,setEffectiveFrom]=useState(defaultEffectiveFrom);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const variant=useMemo(()=>variants.find(v=>v.variantId===variantId),[variants,variantId]);
  const selectedVat=vatCategories.find(v=>String(v.code)===vatCategory);

  async function post(body:Record<string,unknown>){setBusy(true);setMessage("");try{const response=await fetch("/api/admin/tax/product-profile",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":csrfToken},body:JSON.stringify(body)});const payload=await response.json() as {error?:string};if(!response.ok)throw new Error(payload.error??"Tax profile action failed");setMessage("Η ενέργεια αποθηκεύτηκε.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Tax profile action failed");}finally{setBusy(false);}}

  function propose(){if(!variant||!vatCategory)return;const notes=window.prompt("Evidence / λογιστική αιτιολόγηση για το προτεινόμενο VAT profile");if(!notes?.trim())return;void post({action:"propose",variantId:variant.variantId,vatCategory:Number(vatCategory),vatExemptionCategory:exemption.trim()?Number(exemption):undefined,effectiveFrom,notes:notes.trim()});}
  function approve(){const profile=variant?.profile;if(!profile||profile.approved)return;const notes=window.prompt("Evidence / λογιστική αιτιολόγηση τελικής έγκρισης VAT profile");if(!notes?.trim())return;void post({action:"approve",profileId:profile.id,notes:notes.trim()});}

  return <div className="workspace-queue-list">
    <article className="workspace-queue-card">
      <div className="workspace-queue-head"><div><strong>Product tax profile editor</strong><small>Δεν γίνεται αυτόματο mapping από tax_rate_bps ή category.</small></div><span className="status-pill">accountant controlled</span></div>
      <div className="form-grid">
        <label>Canonical variant<select value={variantId} onChange={e=>{setVariantId(e.target.value);setVatCategory("");setExemption("");}}>{variants.map(v=><option value={v.variantId} key={v.variantId}>{v.title} · {v.variantId}{v.profile?.approved?" · approved":""}</option>)}</select></label>
        <label>AADE vatCategory<select value={vatCategory} onChange={e=>{setVatCategory(e.target.value);if(e.target.value!=="7")setExemption("");}}><option value="">— select explicitly —</option>{vatCategories.map(v=><option value={v.code} key={v.code}>{v.code} · {v.label}</option>)}</select></label>
        <label>Effective from<input type="date" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} /></label>
        <label>VAT exemption category<input type="number" value={exemption} onChange={e=>setExemption(e.target.value)} disabled={vatCategory!=="7"} placeholder={vatCategory==="7"?"required":"not applicable"} /></label>
      </div>
      {variant&&<div className="workspace-inline-note">Existing commerce tax hint: <strong>{(variant.existingTaxRateBps/100).toLocaleString("el-GR")}%</strong>. {selectedVat?`Selected AADE category: ${selectedVat.code} / ${selectedVat.label}.`:"No AADE VAT category selected."}</div>}
      {variant?.profile&&<div className="workspace-inline-note">Latest profile: category {variant.profile.vatCategory} · {(variant.profile.vatRateBps/100).toLocaleString("el-GR")}% · from {variant.profile.effectiveFrom}{variant.profile.effectiveUntil?` to ${variant.profile.effectiveUntil}`:""} · <strong>{variant.profile.approved?`approved ${variant.profile.approvalVersion??""}`:"PROPOSED"}</strong>{variant.profile.profileHash?` · ${variant.profile.profileHash.slice(0,12)}…`:""}</div>}
      <div className="workspace-action-buttons"><button className="button button-secondary" type="button" disabled={busy||!variant||!vatCategory||!effectiveFrom||(vatCategory==="7"&&!exemption.trim())} onClick={propose}>{busy?"…":"Propose VAT profile"}</button>{variant?.profile&&!variant.profile.approved&&<button className="button button-secondary" type="button" disabled={busy} onClick={approve}>{busy?"…":"Approve exact profile"}</button>}</div>
      {message&&<p className={message.includes("αποθηκεύτηκε")?"workspace-inline-note":"form-error"} role="status">{message}</p>}
    </article>
    <article className="workspace-queue-card"><div className="workspace-queue-head"><div><strong>Coverage inventory</strong><small>{variants.length} active variants shown</small></div></div><div className="workspace-compact-list">{variants.map(v=><div className="workspace-compact-row" key={v.variantId}><strong>{v.title}</strong><span>{v.profile?`VAT ${v.profile.vatCategory} · ${(v.profile.vatRateBps/100).toLocaleString("el-GR")}% · ${v.profile.approved?"approved":"proposed"}`:"MISSING"}</span><small>{v.variantId}</small></div>)}</div></article>
  </div>;
}
