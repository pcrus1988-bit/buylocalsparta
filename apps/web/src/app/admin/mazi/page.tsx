import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../lib/admin-session";
import {isMaziSuperAdmin,maziAdminSnapshot} from "../../../lib/mazi-superadmin";
import {maziSuperAdminCommand} from "./actions";
import s from "./mazi.module.css";

export const metadata={title:"ΜΑΖΙ · KONTA MOY Super Admin",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
function Action({csrf,kind,id,value,label,quiet=false}:{csrf:string;kind:string;id?:string;value:string;label:string;quiet?:boolean}){
 return <form action={maziSuperAdminCommand} className={s.action}>
   <input type="hidden" name="csrf" value={csrf}/><input type="hidden" name="kind" value={kind}/>
   {id&&<input type="hidden" name="id" value={id}/>}
   <input type="hidden" name="value" value={value}/>
   <button type="submit" className={quiet?s.secondary:s.primary}>{label}</button>
 </form>;
}
function ReviewDecision({csrf,kind,id}:{csrf:string;kind:"application"|"proposal";id:string}) {
 return <form action={maziSuperAdminCommand} className={s.action}
   style={{display:"flex",flexDirection:"column",gap:12,minWidth:250,maxWidth:370}}>
  <input type="hidden" name="csrf" value={csrf}/>
  <input type="hidden" name="kind" value={kind}/>
  <input type="hidden" name="id" value={id}/>
  <label htmlFor={`reason-${kind}-${id}`} className={s.tag}>ΑΙΤΙΟΛΟΓΙΑ · 20–1.000 ΧΑΡΑΚΤΗΡΕΣ</label>
  <textarea id={`reason-${kind}-${id}`} name="reason" required minLength={20} maxLength={1000} rows={4}
   style={{padding:12,border:"1px solid #aec0af",font:"inherit"}} placeholder="Συγκεκριμένοι λόγοι έγκρισης ή απόρριψης"/>
  <div className={s.buttons}>
    <button type="submit" name="value" value="approve" className={s.primary}>Έγκριση με αιτιολογία</button>
    <button type="submit" name="value" value="reject" className={s.secondary}>Απόρριψη με αιτιολογία</button>
  </div>
 </form>;
}
const money=(cents:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(cents)/100);
export default async function MaziSuperAdminPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const p=await getAdminSession();
 if(!p)redirect("/admin/login");
 if(!isMaziSuperAdmin(p))return <main className={s.stage}><section className={s.denied}><h1>Πρόσβαση μόνο για τον Super Admin</h1><p>Η διαχείριση του ΜΑΖΙ ανήκει αποκλειστικά στον ΚΟΝΤΑ ΜΟΥ Super Admin. Οι υπόλοιποι ρόλοι δεν μπορούν να δουν ή να τροποποιήσουν δεδομένα.</p><Link href="/admin">Επιστροφή</Link></section></main>;
 let workspace:Awaited<ReturnType<typeof maziAdminSnapshot>>|undefined;
 try{workspace=await maziAdminSnapshot(p);}catch{}
 if(!workspace)return <main className={s.stage}><div className={s.shell}><h1>ΜΑΖΙ</h1><p>Το ασφαλές περιβάλλον διακυβέρνησης δεν είναι προσωρινά διαθέσιμο. Δεν πραγματοποιήθηκε καμία ενέργεια.</p><Link href="/admin">Επιστροφή στην κεντρική διαχείριση</Link></div></main>;
 const {applications,proposals,members,cycle,approvedProposals,ballots,result,proposalResults,followups,stats}=workspace;
 const params=await searchParams;
 return <main className={s.stage}><div className={s.shell}>
 <div className={s.breadcrumb}><Link href="/admin">ΚΟΝΤΑ ΜΟΥ / ADMIN</Link><span>↗</span><span>ΜΑΖΙ</span></div>
 <header className={s.hero}><div><p className={s.kicker}>SOLE AUTHORITY · MARKETPLACE SUPER ADMIN</p>
 <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Διακυβέρνηση</em></h1>
 <p className={s.subtitle}>Πραγματικά μέλη, πραγματικές ανάγκες, καταγεγραμμένες αποφάσεις. Μόνο ο υφιστάμενος ΚΟΝΤΑ ΜΟΥ Super Admin έχει δικαίωμα έγκρισης ή διαχείρισης.</p>
 </div><div className={s.lock}><strong>SUPER ADMIN ONLY</strong><span>Ξεχωριστή διαχείριση ΜΑΖΙ: απενεργοποιημένη</span><Link href="/admin/mazi/interest">Αιτήσεις ΑΦΜ και ΓΕΜΗ ↗</Link><Link href="/admin/mazi/operations">Ζωντανός έλεγχος λειτουργίας ↗</Link><Link href="/admin/mazi/marketing">Συλλογικό marketing ↗</Link><Link href="/admin/mazi/fund">Αναπτυξιακό Ταμείο · Οικονομικός έλεγχος ↗</Link><Link href="/admin/mazi/fund/governance">Αναπτυξιακό Ταμείο · Διακυβέρνηση ↗</Link><Link href="/admin/mazi/moderation">Εποπτεία κοινότητας ↗</Link><a href="https://mazi.kontamou.site" target="_blank" rel="noreferrer">Άνοιγμα ΜΑΖΙ ↗</a></div></header>
 {params.notice==="updated"&&<div className={s.notice} role="status">Η ενέργεια αποθηκεύτηκε και καταγράφηκε στο μητρώο ελέγχου.</div>}
 {params.notice==="duplicate_entity"&&<div className={s.notice} role="alert">Ο αριθμός ΓΕΜΗ ανήκει σε ήδη επαληθευμένη νομική οντότητα. Δεν δημιουργήθηκε δεύτερη συμμετοχή ή ψήφος.</div>}
 <div className={s.stats}>
  <div><small>01 / ΝΕΕΣ ΑΙΤΗΣΕΙΣ</small><strong>{stats.applications_pending}</strong><span>Προς επαλήθευση · συνολικά {stats.applications_total} · {stats.awaiting_reply} αναμονή απάντησης</span></div>
  <div><small>02 / ΑΝΟΙΧΤΑ ΑΙΤΗΜΑΤΑ</small><strong>{proposals.length}</strong><span>Προς αξιολόγηση</span></div>
  <div><small>03 / ΜΕΛΗ</small><strong>{stats.kyb_verified}</strong><span>Επαληθεύσεις ΓΕΜΗ · {stats.voting_eligible} δικαιώματα ψήφου</span></div>
  <div className={s.fund}><small>04 / ΕΝΕΡΓΟ ΤΑΜΕΙΟ</small><strong>€0</strong><span>Η συλλογή χρημάτων παραμένει κλειστή</span></div>
 </div>
 <section className={s.section}><div className={s.sectionTop}><div><p>01 / BUSINESS ONBOARDING</p><h2>Αιτήσεις επιχειρήσεων</h2></div><span>Μόνο ο Super Admin εγκρίνει νέες επιχειρήσεις</span></div>
 {applications.length===0?<div className={s.empty}>Δεν υπάρχουν εκκρεμείς αιτήσεις.</div>:<div className={s.stack}>{applications.map(a=>{
 const history=followups.filter(f=>f.application_id===a.id);
 const pending=history.some(f=>!f.answered_at);
 return <article className={s.card} key={a.id}>
  <div style={{flex:1}}>
   <span className={s.tag}>ΑΙΤΗΣΗ · {new Date(a.created_at).toLocaleDateString("el-GR")}</span>
   <h3>{a.business_name}</h3>
   <p className={s.meta}>{a.representative_name} · {a.location} · {a.sector}</p>
   <p className={s.body}>{a.description}</p>
   <p className={s.meta}>Αριθμός ΓΕΜΗ: {a.registry_number||"Δεν δόθηκε"}</p>
   {history.length>0?<div style={{marginTop:22,display:"grid",gap:10}}>
    <strong>Διευκρινίσεις ({history.length})</strong>
    {history.map(f=><div key={f.id} style={{padding:15,background:"#ecf1e7"}}>
     <p className={s.body}><strong>Ερώτημα:</strong> {f.question}</p>
     {f.answered_at?<p className={s.body}><strong>Απάντηση επιχείρησης:</strong> {f.answer}</p>
       :<p className={s.meta}>Αναμένεται απάντηση της επιχείρησης.</p>}
    </div>)}
   </div>:null}
  </div>
  <div style={{display:"grid",gap:22,alignContent:"start"}}>
   {pending?<p className={s.tag}>ΕΚΚΡΕΜΕΙ ΑΠΑΝΤΗΣΗ — ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΑΠΟΦΑΣΗ</p>
     :<ReviewDecision csrf={p.csrfToken} kind="application" id={a.id}/>}
   {!pending?<form action={maziSuperAdminCommand} className={s.action}
     style={{display:"flex",flexDirection:"column",gap:10,minWidth:260,maxWidth:370}}>
     <input type="hidden" name="csrf" value={p.csrfToken}/>
     <input type="hidden" name="kind" value="followup"/>
     <input type="hidden" name="id" value={a.id}/>
     <label className={s.tag} htmlFor={`question-${a.id}`}>ΖΗΤΗΣΕ ΠΡΟΣΘΕΤΑ ΣΤΟΙΧΕΙΑ</label>
     <textarea id={`question-${a.id}`} name="reason" required minLength={20} maxLength={1000}
      rows={4} style={{padding:12,border:"1px solid #aec0af",font:"inherit"}}
      placeholder="Τι χρειάζεσαι για να αξιολογήσεις την αίτηση;"/>
     <button type="submit" className={s.secondary}>Αίτημα διευκρινίσεων ↗</button>
   </form>:null}
  </div>
 </article>})}</div>}</section>
 <section className={s.section}><div className={s.sectionTop}><div><p>02 / PROJECT GOVERNANCE</p><h2>Προτάσεις προς αξιολόγηση</h2></div><span>Χωρίς αυτοματοποιημένες εγκρίσεις χρηματοδότησης</span></div>
 {proposals.length===0?<div className={s.empty}>Δεν υπάρχουν προτάσεις σε αναμονή.</div>:<div className={s.stack}>{proposals.map(a=><article className={s.card} key={a.id}><div><span className={s.tag}>{a.category.toUpperCase()} · {new Date(a.created_at).toLocaleDateString("el-GR")}</span>
 {a.first_time_support_request?<p className={s.tag} style={{marginTop:10}}>ΠΡΟΤΕΡΑΙΟΤΗΤΑ · ΠΡΩΤΗ ΑΙΤΗΣΗ ΕΝΙΣΧΥΣΗΣ</p>:null}
 <h3>{a.title}</h3>
 <p className={s.meta}>Ενημέρωση μελλοντικών όρων: {a.grant_policy_ack_version==="mazi-grant-retention-v1" && a.grant_policy_acknowledged_at
   ? new Date(a.grant_policy_acknowledged_at).toLocaleDateString("el-GR")
   : "Δεν τεκμηριώθηκε"}</p><p className={s.body}>{a.details}</p><p className={s.requested}>Αιτούμενο ποσό (όχι εκταμίευση): {money(a.amount_cents)}</p></div><ReviewDecision csrf={p.csrfToken} kind="proposal" id={a.id}/></article>)}</div>}</section>
 <section className={s.section}>
 <div className={s.sectionTop}><div><p>03 / KYB & VOTING RIGHTS</p><h2>Επαλήθευση επιχειρήσεων</h2></div><span>Μία νόμιμη επιχείρηση · μία ψήφος</span></div>
 <p className={s.disclaimer}>Έλεγξε τη νόμιμη κατάσταση ΓΕΜΗ, την ταυτοποίηση του εκπροσώπου και τις συνδεδεμένες επιχειρήσεις στην <a href="https://publicity.businessportal.gr/" target="_blank" rel="noopener noreferrer" style={{textDecoration:"underline"}}>επίσημη Δημοσιότητα ΓΕΜΗ ↗</a>. Η επαλήθευση εδώ καταγράφει χειροκίνητο έλεγχο, όχι αυτόματη επιβεβαίωση από κρατικό API.</p>
 {members.length===0?<div className={s.empty}>Δεν υπάρχουν εγκεκριμένα μέλη.</div>:<div className={s.stack}>
 {members.map(m=><article className={s.card} key={m.user_id}>
 <div style={{flex:1}}>
  <span className={s.tag}>{m.identity_verified_at?"ΓΕΜΗ ΕΠΙΒΕΒΑΙΩΜΕΝΟ":"ΑΝΑΜΟΝΗ ΕΠΑΛΗΘΕΥΣΗΣ"}</span>
  <h3>{m.business_name}</h3>
  <p className={s.meta}>Εκπρόσωπος: {m.representative_name}</p>
  <p className={s.meta}>Δήλωση ΓΕΜΗ: {m.requested_gemi||"Δεν δηλώθηκε"} · Επαληθευμένο: {m.gemi_number||"Όχι"}</p>
  <p className={s.meta}>Κατάσταση: {m.status} · Δικαίωμα ψήφου: {m.voting_eligible?"Ενεργό":"Ανενεργό"}</p>
  {!m.identity_verified_at&&m.status==="verified"?<form action={maziSuperAdminCommand} className={s.action} style={{display:"grid",gap:12,maxWidth:560,marginTop:24}}>
   <input type="hidden" name="csrf" value={p.csrfToken}/><input type="hidden" name="kind" value="identity"/><input type="hidden" name="id" value={m.user_id}/><input type="hidden" name="value" value="confirm"/>
   <label htmlFor={`gemi-${m.user_id}`}>12ψήφιος αριθμός ΓΕΜΗ</label>
   <input style={{padding:14,border:"1px solid #abbcaf",font:"inherit"}} id={`gemi-${m.user_id}`} name="gemi" defaultValue={m.requested_gemi||""} inputMode="numeric" pattern="[0-9]{12}" minLength={12} maxLength={12} required/>
   <label htmlFor={`evidence-${m.user_id}`}>Τεκμηρίωση ελέγχου (20–1.000 χαρακτήρες)</label>
   <textarea style={{padding:14,border:"1px solid #abbcaf",font:"inherit"}} id={`evidence-${m.user_id}`} name="evidence" minLength={20} maxLength={1000} rows={3} required placeholder="Έλεγχος δημόσιας μερίδας ΓΕΜΗ, ενεργής κατάστασης και εκπροσώπησης"/>
   <button type="submit" className={s.primary}>Καταχώριση πραγματικής επαλήθευσης ΓΕΜΗ</button>
  </form>:null}
 </div>
 <div className={s.buttons}>{m.identity_verified_at?<Action csrf={p.csrfToken} kind="voting" id={m.user_id} value={m.voting_eligible?"no":"yes"} label={m.voting_eligible?"Απενεργοποίηση ψήφου":"Ενεργοποίηση ψήφου"} quiet/>:<span className={s.tag}>ΠΡΩΤΑ ΕΠΑΛΗΘΕΥΣΗ</span>}</div>
 </article>)}
 </div>}
 </section>
 <section className={s.section}>
 <div className={s.sectionTop}><div><p>04 / TRUST & CONFLICTS</p><h2>Συγκρούσεις συμφερόντων</h2></div>
 <span>Αποκλειστικά ο ΚΟΝΤΑ ΜΟΥ Super Admin</span></div>
 <p className={s.disclaimer}>Καταχώριση πραγματικής σχέσης ή σύγκρουσης συμφερόντων. Μία επιχείρηση διαθέτει μία μόνο ψήφο ανά κύκλο, δεν ψηφίζει τη δική της πρόταση και δεν μπορεί να ψηφίσει συνδεδεμένη πρόταση. Η απόφαση απαιτεί αιτιολογία και καταγράφεται αμετάβλητα.</p>
 {cycle&&["review","voting"].includes(cycle.status)&&approvedProposals.length&&members.length?
 <form action={maziSuperAdminCommand} className={s.card} style={{display:"flex",flexDirection:"column",gap:14}}>
  <input type="hidden" name="csrf" value={p.csrfToken}/><input type="hidden" name="kind" value="conflict"/>
  <label htmlFor="conflict-voter">Επιχείρηση που έχει σύγκρουση</label>
  <select id="conflict-voter" name="voter_id" required style={{padding:12,border:"1px solid #9daea0"}}>
   <option value="">Επίλεξε επαληθευμένο μέλος</option>
   {members.filter(m=>m.status==="verified"&&Boolean(m.identity_verified_at)).map(m=><option key={m.user_id} value={m.user_id}>{m.business_name} ({m.gemi_number})</option>)}
  </select>
  <label htmlFor="conflict-proposal">Συνδεδεμένη πρόταση</label>
  <select id="conflict-proposal" name="proposal_id" required style={{padding:12,border:"1px solid #9daea0"}}>
   <option value="">Επίλεξε πρόταση</option>
   {approvedProposals.map(q=><option key={q.id} value={q.id}>{q.title}</option>)}
  </select>
  <label htmlFor="conflict-reason">Τεκμηρίωση σύγκρουσης (20–1.000 χαρακτήρες)</label>
  <textarea id="conflict-reason" name="reason" required minLength={20} maxLength={1000} rows={3}
    placeholder="Έλεγχος κοινής ιδιοκτησίας ή συμφέροντος και τεκμηριωμένη αιτιολογία"
    style={{padding:12,border:"1px solid #9daea0",font:"inherit"}}/>
  <button type="submit" className={s.primary}>Αποκλεισμός ψήφου για συνδεδεμένη πρόταση</button>
 </form>:
 <div className={s.empty}>Οι αποκλεισμοί καταχωρίζονται στον στάδιο ελέγχου ή ψηφοφορίας, εφόσον υπάρχουν πραγματικά επαληθευμένα μέλη και εγκεκριμένες προτάσεις.</div>}
 </section>
 <section className={s.section}>
 <div className={s.sectionTop}><div><p>05 / BALLOT INTEGRITY</p><h2>Ψηφοδέλτια και αποκλεισμοί</h2></div>
 <span>Μόνο πραγματικές, καταγεγραμμένες ψήφοι</span></div>
 {ballots.length?ballots.map(v=><div className={s.member} key={v.id}>
   <div><strong>Ψήφος {v.id}</strong><span>Μέλος {v.voter_id} · Πρόταση {v.proposal_id}</span>
    {v.invalidation_reason?<span>Ακυρωμένη: {v.invalidation_reason}</span>:<span>Ενεργό ψηφοδέλτιο · {new Date(v.created_at).toLocaleDateString("el-GR")}</span>}
   </div>
   {cycle?.status==="voting"&&!v.invalidation_reason?
    <form action={maziSuperAdminCommand} className={s.action} style={{display:"flex",flexDirection:"column",gap:10,maxWidth:320}}>
     <input type="hidden" name="csrf" value={p.csrfToken}/><input type="hidden" name="kind" value="invalidation"/><input type="hidden" name="id" value={v.id}/>
     <label htmlFor={`invalidate-${v.id}`}>Αιτιολογία ακύρωσης</label>
     <textarea id={`invalidate-${v.id}`} name="reason" required minLength={20} maxLength={1000} rows={3}
      style={{padding:12,border:"1px solid #9daea0",font:"inherit"}}/>
     <button type="submit" className={s.secondary}>Καταχώριση ακύρωσης (χωρίς διαγραφή)</button>
    </form>:null}
  </div>):<div className={s.empty}>Δεν υπάρχουν ακόμη πραγματικές ψήφοι.</div>}
 </section>
 <section className={s.section}>
 <div className={s.sectionTop}><div><p>06 / FINALIZED OUTCOMES</p><h2>Αποτελέσματα καταγραφής</h2></div>
 <span>Αποτελέσματα προτεραιοτήτων · όχι χρηματοδοτήσεις</span></div>
 {result?<div className={s.card} style={{display:"block"}}>
  <p>Οριστικοποίηση: {new Date(result.finalized_at).toLocaleDateString("el-GR")} · Ψήφοι: {result.total_ballots} · Έγκυρες: {result.valid_ballots} · Ακυρωμένες: {result.invalidated_ballots}</p>
  <p>Προτάσεις: {result.proposals_considered} · Διατεθέν κεφάλαιο: €0</p>
  {proposalResults.map(v=><div className={s.member} key={v.proposal_id}><strong>{v.title}</strong><span>{v.supporting_ballots} έγκυρες ψήφοι</span></div>)}
 </div>:<div className={s.empty}>Δεν υπάρχουν αποτελέσματα προς παρουσίαση πριν από την πραγματική ολοκλήρωση του κύκλου.</div>}
 </section>
 <section className={s.section}><div className={s.sectionTop}><div><p>07 / CYCLE CONTROL</p><h2>Ιδρυτικός κύκλος αναγκών</h2></div><span>Αποκλειστικά μη χρηματοδοτικός</span></div>
 <div className={s.cycle}><div><strong>{cycle?.title||"Δεν υπάρχει κύκλος"}</strong><p>Στάδιο: {cycle?.status||"—"} · Χρηματοδοτικός προϋπολογισμός: €0 · Ενεργοποίηση χρημάτων: Όχι</p></div>{cycle&&<div className={s.buttons}>{cycle.status==="preparing"&&<Action csrf={p.csrfToken} kind="cycle" value="submissions" label="Έναρξη υποβολών"/>}{cycle.status==="submissions"&&<Action csrf={p.csrfToken} kind="cycle" value="review" label="Έναρξη ελέγχου"/>}{cycle.status==="review"&&<><Action csrf={p.csrfToken} kind="cycle" value="submissions" label="Επανέναρξη υποβολών" quiet/><Action csrf={p.csrfToken} kind="cycle" value="voting" label="Άνοιγμα ψήφων"/></>}{cycle.status==="voting"&&<Action csrf={p.csrfToken} kind="cycle" value="closed" label="Κλείσιμο κύκλου"/>}</div>}</div></section>
 <p className={s.disclaimer}>Οι ενέργειες καταγράφονται με το εσωτερικό αναγνωριστικό του ΚΟΝΤΑ ΜΟΥ Super Admin. Δεν παρέχεται πρόσβαση μέσω Supabase administrator ή ξεχωριστού λογαριασμού ΜΑΖΙ.</p>
 </div></main>;
}
