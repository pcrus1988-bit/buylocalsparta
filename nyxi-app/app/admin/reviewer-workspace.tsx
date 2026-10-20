"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import ReviewerTriage from "./reviewer-triage";

type Review = { fragment_id:string; source_title:string; authority:string; source_url:string; section:string; excerpt:string; quality_lane:string; snapshot_date:string };
type Summary = { pending_current_fragments:number; human_review_candidates:number; possible_duplicates:number; possible_page_chrome:number; short_fragments:number; contributing_sources:number };
type Reply = { status:"ready_for_review"; read_only:true; queue:Review[]; summary:Summary; offset:number; error?:string };
const LANES: Record<string,string> = { "":"Όλες οι εργασίες",human_evidence_review:"Για έλεγχο τεκμηρίωσης",page_chrome_review:"Πιθανό κείμενο πλοήγησης",duplicate_review:"Πιθανά διπλότυπα",too_short_review:"Σύντομα αποσπάσματα" };

export default function ReviewerWorkspace() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [data,setData]=useState<Reply|null>(null);
  const [offset,setOffset]=useState(0);
  const [lane,setLane]=useState("");
  const [loading,setLoading]=useState(false);

  const signIn=async (event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setMessage("");
    try {
      const r=await fetch("/api/reviewer/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password}),cache:"no-store"});
      const data=await r.json();
      if (!r.ok||data.status!=="authenticated"||typeof data.token!=="string") throw new Error(r.status===503?"Η υπηρεσία δεν είναι διαθέσιμη.":"Δεν έγινε είσοδος. Απαιτείται εγκεκριμένος λογαριασμός αξιολογητή.");
      setToken(data.token);setPassword("");setOffset(0);setData(null);
    } catch(error) {setPassword("");setMessage(error instanceof Error?error.message:"Αποτυχία σύνδεσης.");}
    finally {setBusy(false);}
  };

  const load=useCallback(async(signal:AbortSignal)=>{
    if(!token)return;
    setLoading(true);setMessage("");
    try {
      const q=new URLSearchParams({offset:String(offset)});
      if(lane)q.set("lane",lane);
      const r=await fetch("/api/reviewer/queue?"+q,{headers:{authorization:"Bearer "+token},cache:"no-store",signal});
      const v=await r.json() as Reply;
      if(!r.ok||v.status!=="ready_for_review"||v.read_only!==true||!Array.isArray(v.queue)) {
        if(r.status===401||r.status===403) {setToken("");setData(null);}
        throw new Error("Δεν ήταν δυνατή η φόρτωση της ιδιωτικής λίστας. Συνδέσου ξανά αν χρειάζεται.");
      }
      if(!signal.aborted)setData(v);
    } catch(e){if(!signal.aborted)setMessage(e instanceof Error?e.message:"Αποτυχία φόρτωσης.");}
    finally{if(!signal.aborted)setLoading(false);}
  },[token,offset,lane]);

  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);

  return <main className="reviewer-shell">
    <header className="reviewer-header"><a href="/" className="footer-brand">NYXI<span className="dot">.</span></a><span className="beta-label">PRIVATE REVIEW</span></header>
    <div className="reviewer-hero"><span className="overline">KNOWLEDGE GOVERNANCE / PRIVATE</span><h1>Evidence Review <em>Workbench.</em></h1>
      <p>Ιδιωτικός έλεγχος της τεκμηρίωσης πριν από οποιαδήποτε δημοσίευση. Η πρόσβαση απαιτεί επιβεβαιωμένο λογαριασμό με ρητή εξουσιοδότηση.</p></div>
    {!token?<section className="reviewer-login panel" aria-labelledby="reviewer-signin">
      <h2 id="reviewer-signin">Είσοδος αξιολογητή</h2>
      <p className="muted">Δεν επιτρέπονται δημόσιες εγγραφές. Ζήτησε πρώτα από τον διαχειριστή να σε καταχωρίσει στο Supabase Auth και στον ιδιωτικό κατάλογο αξιολογητών.</p>
      <form onSubmit={signIn} className="reviewer-form">
        <label htmlFor="reviewer-email">Email</label><input id="reviewer-email" autoComplete="username" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
        <label htmlFor="reviewer-password">Κωδικός πρόσβασης</label><input id="reviewer-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
        <button className="primary-action" type="submit" disabled={busy}>{busy?"Έλεγχος πρόσβασης…":"Είσοδος στον έλεγχο"}</button>
      </form>
      {message&&<p className="notice warning" role="alert">{message}</p>}
      <p className="microcopy">Η συνεδρία παραμένει μόνο στη μνήμη του browser — δεν αποθηκεύεται το διακριτικό εισόδου ή η τεκμηρίωση τοπικά.</p>
    </section>:<section className="reviewer-private">
      <div className="reviewer-toolbar"><strong>Μόνο ανάγνωση · δεν έχουν δοθεί εξουσίες δημοσίευσης</strong>
        <button type="button" className="ar-secondary" onClick={()=>{setToken("");setData(null);setMessage("");}}>Αποσύνδεση</button></div>
      {data&&<div className="reviewer-metrics">
        <div><strong>{data.summary.pending_current_fragments}</strong><span>Τρέχοντα αποσπάσματα</span></div>
        <div><strong>{data.summary.human_review_candidates}</strong><span>Για ανθρώπινο έλεγχο</span></div>
        <div><strong>{data.summary.possible_page_chrome}</strong><span>Πιθανή πλοήγηση</span></div>
        <div><strong>{data.summary.contributing_sources}</strong><span>Πηγές με υλικό</span></div>
      </div>}
      <div className="reviewer-filter"><label htmlFor="review-lane">Κατηγορία ελέγχου</label>
        <select id="review-lane" value={lane} onChange={e=>{setLane(e.target.value);setOffset(0);}}>{Object.entries(LANES).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select>
      </div>
      {loading&&<p className="notice" role="status">Ανάκτηση ιδιωτικών υποψηφίων…</p>}
      {message&&<p className="notice warning" role="alert">{message}</p>}
      {data&&!loading&&<><div className="reviewer-items">
        {data.queue.length===0?<p className="notice">Δεν βρέθηκαν άλλες εγγραφές.</p>:data.queue.map(entry=><article className="reviewer-item" key={entry.fragment_id}>
          <div className="reviewer-item-top"><span>{LANES[entry.quality_lane]||"Απαιτείται έλεγχος"}</span><small>{entry.snapshot_date?.slice(0,10)}</small></div>
          <h3>{entry.source_title}</h3><p className="reviewer-authority">{entry.authority}{entry.section?" · "+entry.section:""}</p>
          <p className="reviewer-excerpt">{entry.excerpt}</p>
          {entry.source_url&&<a target="_blank" rel="noopener noreferrer" href={entry.source_url}>Άνοιγμα πρωτότυπης πηγής ↗</a>}
          <ReviewerTriage fragmentId={entry.fragment_id} token={token}/>
        </article>)}
      </div><div className="reviewer-pagination">
        <button type="button" className="ar-secondary" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-10))}>← Προηγούμενα</button>
        <span>Εγγραφές {offset+1}–{offset+data.queue.length}</span>
        <button type="button" className="ar-secondary" disabled={data.queue.length<10||offset>=500} onClick={()=>setOffset(n=>n+10)}>Επόμενα →</button>
      </div></>}
      <p className="source-note">Αυτό είναι εργαλείο προελέγχου και όχι σύστημα έγκρισης. Δεν πραγματοποιείται μεταβολή της κατάστασης δημοσίευσης από αυτή τη σελίδα.</p>
    </section>}
  </main>;
}
