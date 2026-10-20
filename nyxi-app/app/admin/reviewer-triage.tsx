"use client";

import { useState, type FormEvent } from "react";

type Props={ fragmentId:string; token:string };
const OPTIONS=[
  ["needs_source_check","Απαιτείται έλεγχος πρωτογενούς πηγής"],
  ["needs_rights_review","Απαιτείται ανεξάρτητος έλεγχος δικαιωμάτων"],
  ["candidate_for_review","Υποψήφιο για περαιτέρω αξιολόγηση"],
  ["reject_bad_text","Απόρριψη αποσπάσματος (ποιότητα)"],
  ["duplicate","Πιθανό διπλότυπο"],
] as const;

/** Append-only preliminary triage. Never approves publication. */
export default function ReviewerTriage({fragmentId,token}:Props){
  const [disposition,setDisposition]=useState<string>("needs_source_check");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [recorded,setRecorded]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setMessage("");
    const requestId=crypto.randomUUID();
    try{
      const response=await fetch("/api/reviewer/triage",{
        method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
        cache:"no-store",body:JSON.stringify({fragment_id:fragmentId,request_id:requestId,
          disposition,reason:reason.trim()})
      });
      const data=await response.json();
      if(!response.ok||data?.status!=="recorded"||data?.publication!=="none")
        throw new Error(response.status===409?"Το τεκμήριο δεν είναι πλέον διαθέσιμο για προέλεγχο.":"Η καταγραφή δεν ολοκληρώθηκε.");
      setRecorded(true);setReason("");setMessage("Καταγράφηκε ο ιδιωτικός προέλεγχος. Δεν εγκρίθηκε δημοσίευση.");
    }catch(error){setMessage(error instanceof Error?error.message:"Αποτυχία καταγραφής.");}
    finally{setBusy(false);}
  };
  return <form onSubmit={submit} className="reviewer-form" aria-label="Καταγραφή ιδιωτικού προελέγχου">
    <p className="microcopy"><strong>Προκαταρκτική αξιολόγηση μόνο.</strong> Δεν επιτρέπει δημοσίευση ή αλλαγή δικαιωμάτων.</p>
    <label htmlFor={"triage-decision-"+fragmentId}>Απόφαση προελέγχου</label>
    <select id={"triage-decision-"+fragmentId} value={disposition} onChange={e=>setDisposition(e.target.value)} disabled={busy||recorded}>
      {OPTIONS.map(([value,title])=><option value={value} key={value}>{title}</option>)}
    </select>
    <label htmlFor={"triage-reason-"+fragmentId}>Αιτιολογία (20–1000 χαρακτήρες)</label>
    <textarea id={"triage-reason-"+fragmentId} minLength={20} maxLength={1000} rows={2}
      value={reason} onChange={e=>setReason(e.target.value)} disabled={busy||recorded}
      placeholder="Σύντομη, τεκμηριωμένη αιτιολογία, με αναφορά στην πηγή όταν χρειάζεται." required/>
    <button type="submit" className="ar-secondary" disabled={busy||recorded||reason.trim().length<20}>
      {busy?"Καταγραφή…":recorded?"Καταγράφηκε":"Καταγραφή προελέγχου"}
    </button>
    {message&&<p className="microcopy" role="status">{message}</p>}
  </form>;
}
