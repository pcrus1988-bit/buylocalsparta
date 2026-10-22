"use client";

import { useMemo, useState } from "react";
import { allocationPreview, validateDraft, type DraftProposal } from "../lib/model";

type Proposal = DraftProposal & {id:string; origin:string};
const starter:Proposal[]=[
  {id:"p1",origin:"Υποθετική επιχείρηση · Σπάρτη",title:"Ανανέωση εξοπλισμού αρτοποιείου",category:"resilience",amountEuro:7500,description:"Αντικατάσταση του βασικού φούρνου για να συνεχιστεί απρόσκοπτα η παραγωγή."},
  {id:"p2",origin:"Υποθετική επιχείρηση · Βόλος",title:"Ψηφιακή προβολή καταστήματος",category:"growth",amountEuro:4000,description:"Φωτογράφιση προϊόντων και οργανωμένες καμπάνιες για νέους πελάτες."},
  {id:"p3",origin:"Υποθετική ομάδα · Καλαμάτα",title:"Κοινή δράση πέντε καταστημάτων",category:"joint",amountEuro:12000,description:"Ενιαία τοπική καμπάνια προβολής και εκδήλωση για πέντε ανεξάρτητες επιχειρήσεις."}
];
const categories:{[key:string]:string}={resilience:"Ανθεκτικότητα",growth:"Ανάπτυξη",joint:"Συνεργασία"};
const euro=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n);

export function MemberDemo(){
  const [members,setMembers]=useState(500);
  const [supported,setSupported]=useState<string[]>([]);
  const [proposals,setProposals]=useState<Proposal[]>(starter);
  const [tab,setTab]=useState<"view"|"new">("view");
  const [draft,setDraft]=useState<DraftProposal>({title:"",category:"growth",amountEuro:2500,description:""});
  const [message,setMessage]=useState("");
  const budget=useMemo(()=>allocationPreview(members),[members]);
  const selectedTotal=proposals.filter(p=>supported.includes(p.id)).reduce((sum,p)=>sum+p.amountEuro,0);
  function addDraft(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const error=validateDraft(draft);
    if(error){setMessage(error);return;}
    setProposals(prev=>[{...draft,id:"local-"+(prev.length+1),origin:"Δικό σου υποθετικό προσχέδιο · μόνο σε αυτή τη σελίδα"},...prev]);
    setDraft({title:"",category:"growth",amountEuro:2500,description:""});
    setMessage("Το προσχέδιο προστέθηκε μόνο στην τρέχουσα προσομοίωση. Δεν αποθηκεύτηκε ή υποβλήθηκε.");
    setTab("view");
  }
  function toggle(id:string){setSupported(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  return <section className="section shell demo-section">
    <div className="demo-warning" role="status"><strong>DEMO / ΠΡΟΣΟΜΟΙΩΣΗ</strong><span>Όλα τα έργα, ποσά και αποτελέσματα εδώ είναι υποθετικά. Δεν υπάρχει σύνδεση με πραγματικά μέλη, εκλογές, λογαριασμούς ή χρηματοδοτήσεις. Τα στοιχεία χάνονται με την ανανέωση της σελίδας.</span></div>
    <div className="demo-top">
      <div><span className="eyebrow">ΟΙΚΟΝΟΜΙΚΟ ΣΕΝΑΡΙΟ</span><h2>Όταν οι πόροι <em>ενώνονται.</em></h2></div>
      <label className="members-control">Υποθετικός αριθμός μελών <strong>{members.toLocaleString("el-GR")}</strong><input type="range" min="50" max="2000" step="50" value={members} onChange={e=>setMembers(Number(e.target.value))} aria-label="Υποθετικός αριθμός μελών"/></label>
    </div>
    <div className="demo-stats"><div><span>Υποθετικές μηνιαίες εισφορές*</span><strong>{euro(budget.totalEuro)}</strong></div><div><span>Υποθετικό Ταμείο Ανάπτυξης · 40%</span><strong>{euro(budget.fundEuro)}</strong></div><div><span>Επιλεγμένες ανάγκες στο demo</span><strong>{euro(selectedTotal)}</strong></div></div>
    <p className="small-muted">*Υποθέτει €250 καθαρή μηνιαία εισφορά ανά μέλος, πριν από λοιπές δαπάνες. Δεν είναι διαθέσιμο υπόλοιπο, πρόβλεψη συμμετοχών ή δεσμευμένη χρηματοδότηση.</p>
    <div className="demo-toolbar"><div><span className="eyebrow">ΥΠΟΘΕΤΙΚΗ ΜΗΝΙΑΙΑ ΣΥΝΕΛΕΥΣΗ</span><h2>Κάθε ανάγκη έχει <em>μια ιστορία.</em></h2></div><div className="tabs" aria-label="Ενότητες προσομοίωσης"><button type="button" aria-pressed={tab==="view"} className={tab==="view"?"active":""} onClick={()=>{setTab("view");setMessage("");}}>Προτάσεις</button><button type="button" aria-pressed={tab==="new"} className={tab==="new"?"active":""} onClick={()=>{setTab("new");setMessage("");}}>Νέο προσχέδιο +</button></div></div>
    {tab==="view"?<div className="demo-cards">{proposals.map(p=><article className="demo-card" key={p.id}><div className="demo-card-top"><span>{categories[p.category]}</span><span>DEMO</span></div><p className="demo-origin">{p.origin}</p><h3>{p.title}</h3><p className="demo-desc">{p.description}</p><div className="demo-card-bottom"><div><small>ΖΗΤΟΥΜΕΝΟ ΠΟΣΟ</small><strong>{euro(p.amountEuro)}</strong></div><button type="button" aria-pressed={supported.includes(p.id)} onClick={()=>toggle(p.id)} className={supported.includes(p.id)?"support on":"support"}>{supported.includes(p.id)?"✓ Υποστηρίζεις":"Υποστήριξε ↗"}</button></div></article>)}</div>
      :<form className="draft-form" onSubmit={addDraft}><div><label htmlFor="draft-title">Τίτλος αιτήματος</label><input id="draft-title" required minLength={8} maxLength={100} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="π.χ. Αναβάθμιση επαγγελματικού εξοπλισμού"/></div><div className="form-grid"><div><label htmlFor="draft-type">Κατηγορία</label><select id="draft-type" value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as DraftProposal["category"]})}><option value="growth">Ανάπτυξη</option><option value="resilience">Ανθεκτικότητα</option><option value="joint">Συνεργασία</option></select></div><div><label htmlFor="draft-amount">Ενδεικτικό ποσό (€)</label><input id="draft-amount" type="number" min="500" max="20000" step="1" required value={draft.amountEuro} onChange={e=>setDraft({...draft,amountEuro:Number(e.target.value)})}/></div></div><div><label htmlFor="draft-desc">Τι χρειάζεσαι και γιατί;</label><textarea id="draft-desc" required minLength={25} maxLength={1000} rows={5} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Περιέγραψε την ανάγκη και το αποτέλεσμα που θέλεις να πετύχεις."/></div><button className="button dark" type="submit">Πρόσθεσε στο demo ↗</button></form>}
    {message&&<p className="form-message" role="status">{message}</p>}
    <div className="demo-end"><div><strong>{supported.length} υποθετικές επιλογές υποστήριξης</strong><p>Η επιλογή σου δεν είναι πραγματική ψήφος. Σε πραγματική λειτουργία θα απαιτείται επαληθευμένο μέλος, έλεγχος σύγκρουσης συμφερόντων και καταγεγραμμένη απόφαση.</p></div><button type="button" onClick={()=>{setSupported([]);setProposals(starter);setMessage("Η προσομοίωση επανήλθε στην αρχική κατάσταση.");setTab("view");}} className="reset-button">Επαναφορά προσομοίωσης ↺</button></div>
  </section>;
}
