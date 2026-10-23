import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {submitProposal,supportProposal} from "../actions";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Προτάσεις επιχειρήσεων",robots:{index:false,follow:false}};
const euro=(cents:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(cents/100);
const states:Record<string,string>={submitted:"Αναμένει αξιολόγηση",approved:"Εγκεκριμένη για αξιολόγηση μελών",rejected:"Δεν εγκρίθηκε",withdrawn:"Αποσύρθηκε"};
const notices:Record<string,string>={proposal_received:"Η πραγματική πρότασή σου καταχωρίστηκε και αναμένει έλεγχο.",invalid_proposal:"Έλεγξε τον τίτλο, το ποσό και την περιγραφή.",already_submitted:"Υπάρχει ήδη αίτημα από την επιχείρησή σου στον τρέχοντα κύκλο.",proposal_failed:"Δεν ήταν δυνατή η καταχώριση.",grant_terms_acknowledgment_required:"Πριν από την υποβολή πρέπει να επιβεβαιώσεις ότι διάβασες τον κανόνα μελλοντικής ενίσχυσης.",vote_cast:"Η υποστήριξή σου καταχωρίστηκε και προστέθηκε στο ίχνος ελέγχου.",already_voted:"Έχεις ήδη καταθέσει την μία επιτρεπόμενη ψήφο σε αυτόν τον κύκλο.",conflict_of_interest:"Δεν επιτρέπεται να ψηφίσεις συνδεδεμένη πρόταση λόγω καταγεγραμμένης σύγκρουσης συμφερόντων.",vote_not_allowed:"Η ψηφοφορία δεν είναι ανοιχτή ή δεν έχεις δικαίωμα ψήφου.",cycle_closed:"Η περίοδος υποβολής δεν είναι ανοιχτή.",invalid_vote:"Μη έγκυρη πρόταση."};
export default async function Proposals({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const snapshot=await maziMemberRequest<MaziState>("state");
 if(!snapshot.ok)return <main id="content"><section className="section shell">
  <h1>Οι προτάσεις δεν είναι διαθέσιμες αυτή τη στιγμή.</h1>
  <p>Δεν καταχωρίστηκε καμία ενέργεια. Δοκίμασε ξανά αργότερα.</p>
 </section></main>;
 const {member,cycle,proposals,votes,proposal_review,recused_proposals,tally,tallies}=snapshot;
 if(member?.status!=="verified"||!member.identity_verified_at)redirect("/members");
 const {notice}=await searchParams;
 const myVotes=new Set((votes||[]).map(x=>x.proposal_id));
 const myProposal=(proposals||[]).some(x=>x.created_by===user.id);
 const canSubmit=cycle?.status==="submissions"&&new Date(cycle.starts_at)<=new Date()&&new Date(cycle.ends_at)>new Date()&&!myProposal;
 const alreadyVoted=(votes||[]).length>0;
 const canVote=member.voting_eligible&&!alreadyVoted&&cycle?.status==="voting"&&
 new Date(cycle.starts_at)<=new Date()&&new Date(cycle.ends_at)>new Date();
 const voteCounts=new Map((tallies||[]).map(x=>[x.proposal_id,x.supporting_ballots]));
 // Transparent queue ordering: first actual financial support requests are
 // presented before repeats; this does not grant a vote or award automatically.
 const shownProposals=[...(proposals||[])].sort((a,b)=>
   Number(Boolean(b.first_time_support_request))-Number(Boolean(a.first_time_support_request))
   || Date.parse(a.created_at)-Date.parse(b.created_at)
 );
 return <main id="content"><section className="subhero member-hero"><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΕΠΙΧΕΙΡΗΜΑΤΙΚΕΣ ΑΝΑΓΚΕΣ</span><h1>Οι ανάγκες μας.<br/><em>Η συλλογική μας φωνή.</em></h1><p>Εδώ υποβάλλονται πραγματικές προτάσεις από επαληθευμένα μέλη — χωρίς δοκιμαστικά δεδομένα.</p></div></section>
 <section className="section shell portal-section">
 <div className="portal-heading"><div><span className="eyebrow">ΕΝΕΡΓΟΣ ΚΥΚΛΟΣ</span><h2>{cycle?.title||"Δεν υπάρχει ενεργός κύκλος"}</h2></div><Link className="text-link" href="/members">Ο χώρος μου →</Link></div>
 <div className="info-strip"><strong>Καταγραφή αναγκών — όχι χρηματοδότηση</strong><p>Αυτός ο ιδρυτικός κύκλος συγκεντρώνει πραγματικές επιχειρηματικές ανάγκες. Ο χρηματοδοτικός προϋπολογισμός είναι €0. Δεν υπάρχουν ακόμη συνδρομές, δεσμεύσεις ή εκταμιεύσεις. Η υποβολή δεν υπόσχεται χρηματοδότηση.</p></div>
 {notice&&notices[notice]?<p className="form-message" role="status">{notices[notice]}</p>:null}
 {alreadyVoted?<p className="form-message">Έχεις ήδη καταθέσει ψήφο σε αυτόν τον κύκλο. Δεν επιτρέπεται δεύτερη ψήφος ούτε αντικατάσταση της αρχικής.</p>:null}
 {cycle?.status==="closed"&&tally?<section className="record-card" aria-label="Οριστικά αποτελέσματα">
  <span className="eyebrow">ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΑ ΑΠΟΤΕΛΕΣΜΑΤΑ · ΟΧΙ ΚΑΤΑΝΟΜΗ ΧΡΗΜΑΤΩΝ</span>
  {"suppressed" in tally?<p>Η ψηφοφορία ολοκληρώθηκε. Οι αριθμητικές κατανομές δεν δημοσιεύονται επειδή οι έγκυρες ψήφοι είναι λιγότερες από πέντε, για την προστασία του απορρήτου.</p>:<p>Έγκυρες ψήφοι: <strong>{tally.valid_ballots}</strong> · Ακυρωμένες: <strong>{tally.invalidated_ballots}</strong> · Προτάσεις: <strong>{tally.proposals_considered}</strong>. Χρηματοδότηση: <strong>€0</strong>.</p>}
 </section>:null}
 <div className="portal-grid"><div><h2 className="portal-section-title">Υποβληθείσες προτάσεις</h2>{shownProposals.length?shownProposals.map(p=><article className="record-card" key={p.id}><span className="eyebrow">{states[p.status]||p.status}</span>{p.first_time_support_request?<p className="small-muted"><strong>ΠΡΟΤΕΡΑΙΟΤΗΤΑ · ΠΡΩΤΗ ΑΙΤΗΣΗ ΕΝΙΣΧΥΣΗΣ</strong></p>:null}<h3>{p.title}</h3><p>{p.details}</p>{p.created_by===user.id&&proposal_review?.id===p.id&&proposal_review.review_reason?<p className="legal-hint"><strong>Αιτιολογία αξιολόγησης:</strong> {proposal_review.review_reason}</p>:null}<div className="record-meta"><span>Αναφερόμενη ανάγκη: {euro(p.amount_cents)}</span><span>{new Date(p.created_at).toLocaleDateString("el-GR")}</span></div>{cycle?.status==="closed"&&tally&&!('suppressed' in tally)&&voteCounts.has(p.id)?<p className="small-muted">Τελική υποστήριξη: {voteCounts.get(p.id)} έγκυρες ψήφοι</p>:null}
 {recused_proposals.includes(p.id)?<p className="small-muted">Υπάρχει καταγεγραμμένος αποκλεισμός συμμετοχής σε αυτή την πρόταση λόγω σύγκρουσης συμφερόντων.</p>:null}
 {canVote&&p.status==="approved"&&p.created_by!==user.id&&!recused_proposals.includes(p.id)&&!myVotes.has(p.id)?<form action={supportProposal}><input type="hidden" name="proposal_id" value={p.id}/><button className="button dark" type="submit">Καταχώριση υποστήριξης ↗</button></form>:null}{myVotes.has(p.id)?<p className="small-muted">Έχεις ήδη υποστηρίξει αυτή την πρόταση σε αυτόν τον κύκλο.</p>:null}</article>):<div className="empty-state">Δεν έχουν ακόμη υποβληθεί προτάσεις στον συγκεκριμένο κύκλο.</div>}</div>
 <div><h2 className="portal-section-title">Η δική σου πρόταση</h2>{canSubmit?<div className="form-panel compact"><p className="paragraph">Έχεις δικαίωμα μίας υποβολής στον ιδρυτικό κύκλο. Περιέγραψε μια πραγματική επιχειρηματική ανάγκη· η πρόταση θα ελεγχθεί πριν εμφανιστεί σε άλλα μέλη.</p><form action={submitProposal} className="stack-form"><label htmlFor="title">Τίτλος πρότασης</label><input name="title" id="title" minLength={8} maxLength={140} required/><label htmlFor="category">Κατηγορία</label><select id="category" name="category"><option value="resilience">Ανθεκτικότητα / ανάγκη</option><option value="growth">Επιχειρηματική ανάπτυξη</option><option value="joint">Κοινή πρωτοβουλία</option></select><label htmlFor="amount">Απαιτούμενο ποσό (€)</label><input id="amount" name="amount_eur" type="number" min="500" max="200000" step="1" required/><label htmlFor="details">Περιγραφή ανάγκης και οφέλους</label><textarea id="details" name="details" minLength={80} maxLength={4000} rows={8} required/><div className="legal-hint" style={{padding:"20px",border:"1px solid #bccac0",borderRadius:12}}>
 <strong>Γνωστοποίηση όρων μελλοντικής ενίσχυσης · έκδοση v1</strong>
 <p>Η παρούσα καταγραφή αναγκών είναι μη χρηματοδοτική. Εάν ένα έργο εγκριθεί μελλοντικά για μη επιστρεπτέα αναπτυξιακή ενίσχυση, η επιχείρηση θα πρέπει να αποδεχθεί ξεχωριστά τους τελικούς νόμιμους όρους <strong>πριν ζητήσει οποιαδήποτε εκταμίευση</strong>.</p>
 <p>Προβλεπόμενη πρόσθετη διάρκεια συμμετοχής: το αιτούμενο ποσό σε ευρώ ÷ 100, στρογγυλοποίηση προς τα επάνω σε ολόκληρους μήνες. Νέα αίτηση μετά από το 80% της διάρκειας. Τα μέλη χωρίς προηγούμενη αίτηση χρηματοδότησης θα έχουν ένδειξη προτεραιότητας. Οι όροι τελούν υπό νομική έγκριση και δεν δημιουργείται υποχρέωση σήμερα.</p>
 <label htmlFor="grant_terms_acknowledged" style={{display:"flex",gap:10,alignItems:"flex-start",cursor:"pointer"}}>
  <input id="grant_terms_acknowledged" name="grant_terms_acknowledged" type="checkbox" required style={{width:20,minWidth:20,height:20,marginTop:3}}/>
  <span>Δηλώνω ότι ενημερώθηκα για την πιθανή πρόσθετη διάρκεια συμμετοχής σε περίπτωση πραγματικής χρηματοδότησης και κατανοώ ότι πριν από εκταμίευση θα απαιτηθεί νέα, ρητή αποδοχή συγκεκριμένης συμφωνίας.</span>
 </label>
 </div><button className="button dark" type="submit">Υποβολή προς αξιολόγηση ↗</button></form></div>:<div className="empty-state">{myProposal?"Έχεις ήδη υποβάλει πρόταση για αυτόν τον κύκλο.":"Οι υποβολές δεν είναι ανοιχτές. Όταν ο επόμενος κύκλος ξεκινήσει, θα μπορείς να υποβάλεις νέα πρόταση."}</div>}</div></div></section></main>;
}
