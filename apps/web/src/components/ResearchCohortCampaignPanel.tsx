"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = {
  id:string;cohort:"A"|"B";status:string;frameVersion:string;
  prepared:number;approved:number;sent:number;skipped:number;
  uncertain:number;completed:number;started:number;pending:number;
};
export function ResearchCohortCampaignPanel({slug,csrfToken,studyTitle,studyStatus,initialCampaigns}:{
  slug:string;csrfToken:string;studyTitle:string;studyStatus:string;initialCampaigns:Campaign[];
}) {
  const router=useRouter();
  const [campaigns,setCampaigns]=useState(initialCampaigns);
  const [pending,setPending]=useState<Campaign|null>(null);
  const [step,setStep]=useState(1);
  const [typed,setTyped]=useState("");
  const [legal,setLegal]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const fmt=(n:number)=>n.toLocaleString("el-GR");
  async function refresh() {
    const response=await fetch("/api/admin/research/surveys/"+encodeURIComponent(slug)+"/cohorts",{cache:"no-store"});
    const result=await response.json();
    if (!response.ok) throw new Error(result.error||"Refresh failed");
    setCampaigns(result.campaigns);
    router.refresh();
  }
  async function command(cohort:"A"|"B",cmd:"prepare"|"approve"|"pause"|"resume"|"cancel",count?:number) {
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/admin/research/surveys/"+encodeURIComponent(slug)+"/cohorts",{
        method:"POST",
        headers:{"content-type":"application/json","x-csrf-token":csrfToken},
        body:JSON.stringify({
          cohort,command:cmd,approvedCount:count,
          reviewConfirmed:cmd==="approve",finalConfirmed:cmd==="approve",
          legalReviewConfirmed:cmd==="approve" && legal
        })
      });
      const data=await response.json();
      if (!response.ok) throw new Error(data.error||"Cohort action failed");
      setPending(null);setStep(1);setTyped("");setLegal(false);
      setMessage("Ομάδα "+cohort+": "+data.state+". Δεν αποστέλλεται email με την προετοιμασία.");
      await refresh();
    } catch(error){setMessage(error instanceof Error?error.message:"Action failed");}
    finally {setBusy(false);}
  }
  const a=campaigns.find((c)=>c.cohort==="A");
  const items:(Campaign|null)[]=[a||null,campaigns.find((c)=>c.cohort==="B")||null];
  return <section className="shell vendor-section">
    <div className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span><strong>Full-frame Research invitation campaign</strong><br/>
          Όλοι οι επιλέξιμοι παραλήπτες, χωρίς συνολικό όριο. Διαδοχικές παρτίδες SES εκτελούνται μετά
          από μία διπλή επιβεβαίωση ανά ομάδα. Η δημιουργία ομάδας δεν στέλνει email.</span>
        <button className="button button-secondary" disabled={busy} type="button"
          onClick={()=>void refresh()}>Ανανέωση</button>
      </div>
      <div className="analytics-workflow-grid">
        {(["A","B"] as const).map((group,i)=>{
          const c=items[i];
          const mayPrepare=!c&&(group==="A" || a?.status==="completed");
          return <article className="analytics-workflow-card" key={group}>
            <span>ΟΜΑΔΑ {group}</span>
            <strong>{group==="A"?"Αρχικό παγωμένο δείγμα — non-food":"Διευρυμένο B2C λιανεμπόριο — μόνο νέες επαφές"}</strong>
            <small>{c?("Κατάσταση: "+c.status+" · "+c.frameVersion):"Δεν έχει προετοιμαστεί"}</small>
            {c && <>
              <div className="workspace-action-bar"><span>Επιλέξιμοι για πρόσκληση</span><strong>{fmt(c.prepared)}</strong></div>
              <div className="workspace-action-bar"><span>Απεσταλμένα</span><strong>{fmt(c.sent)}</strong></div>
              <div className="workspace-action-bar"><span>Σε αναμονή</span><strong>{fmt(c.pending)}</strong></div>
              <small>{fmt(c.completed)} ολοκληρωμένα · {fmt(c.started)} σε εξέλιξη · {fmt(c.skipped)} αποκλεισμένα · {fmt(c.uncertain)} προς χειροκίνητο έλεγχο</small>
            </>}
            <div className="workspace-action-buttons">
              {!c&&<button className="button" type="button" disabled={busy||!mayPrepare}
                onClick={()=>void command(group,"prepare")}>Προετοιμασία όλων των επαφών</button>}
              {c?.status==="review"&&<button className="button" type="button" disabled={busy||studyStatus!=="fielding"||(group==="B"&&a?.status!=="completed")}
                onClick={()=>{setPending(c);setStep(1);setTyped("");setLegal(false);}}>Έγκριση αποστολής σε όλους</button>}
              {c?.status==="running"&&<button className="button button-secondary" type="button" disabled={busy}
                onClick={()=>void command(group,"pause")}>Παύση</button>}
              {c?.status==="paused"&&<button className="button button-secondary" type="button" disabled={busy}
                onClick={()=>void command(group,"resume")}>Συνέχεια</button>}
              {c&&["preparing","review","running","paused"].includes(c.status)&&
                <button className="button button-secondary" type="button" disabled={busy}
                  onClick={()=>void command(group,"cancel")}>Ακύρωση</button>}
            </div>
            {group==="B"&&a?.status!=="completed"&&<small>Η ομάδα B ενεργοποιείται αφού ολοκληρωθεί η ομάδα A.</small>}
          </article>;
        })}
      </div>
      <small>Μεθοδολογία: απογραφή προσκλήσεων στο προσβάσιμο μητρώο επαφών, όχι απογραφή απαντήσεων.
        Οι μη απαντήσεις και η μη αντιπροσωπευτικότητα αξιολογούνται χωριστά ανά ομάδα.</small>
      {message&&<div className="workspace-inline-note" role="status">{message}</div>}
    </div>
    {pending&&<div role="dialog" aria-modal="true" aria-label="Έγκριση αποστολής Research"
      style={{position:"fixed",inset:0,zIndex:11000,display:"grid",placeItems:"center",background:"rgba(14,24,20,.72)",padding:15}}>
      <div style={{background:"var(--surface,#fffdf8)",maxWidth:610,width:"100%",borderRadius:16,padding:22,display:"grid",gap:16}}>
        <h2>Έγκριση {step}/2 · Ομάδα {pending.cohort}</h2>
        <p><strong>Μελέτη:</strong> {studyTitle}<br/>
          <strong>Σκοπός:</strong> Πρόσκληση έρευνας, όχι marketing<br/>
          <strong>Ακριβές πλήθος επαφών:</strong> {fmt(pending.prepared)}<br/>
          <strong>Μηχανισμός:</strong> αυτόματες ελεγχόμενες παρτίδες έως να εξαντληθεί η ομάδα
        </p>
        {step===1?<><label style={{display:"flex",alignItems:"start",gap:10}}>
          <input type="checkbox" checked={legal} onChange={e=>setLegal(e.target.checked)}/>
          Επιβεβαιώνω ότι έχει ελεγχθεί η νόμιμη βάση της ερευνητικής πρόσκλησης,
          η προέλευση δεδομένων, οι αρνήσεις και η συμμόρφωση με τις πολιτικές SES.
        </label>
        <div className="workspace-action-buttons">
          <button className="button button-secondary" onClick={()=>setPending(null)}>Ακύρωση</button>
          <button className="button" disabled={!legal} onClick={()=>setStep(2)}>Έλεγχος 1 · Συνέχεια</button>
        </div></>:<>
          <label>Πληκτρολογήστε τον ακριβή αριθμό {pending.prepared} για την τελική έγκριση
            <input type="text" inputMode="numeric" value={typed} onChange={e=>setTyped(e.target.value.replace(/[^0-9]/g,""))}/>
          </label>
          <div className="workspace-action-buttons">
            <button className="button button-secondary" onClick={()=>setStep(1)}>Πίσω</button>
            <button className="button" disabled={busy||typed!==String(pending.prepared)}
              onClick={()=>void command(pending.cohort,"approve",pending.prepared)}>
              {busy?"Έγκριση…":"Έλεγχος 2 · Εγκρίνω όλες τις προσκλήσεις"}
            </button>
          </div>
        </>}
      </div>
    </div>}
  </section>;
}
