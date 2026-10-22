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
const notices:Record<string,string>={proposal_received:"Η πραγματική πρότασή σου καταχωρίστηκε και αναμένει έλεγχο.",invalid_proposal:"Έλεγξε τον τίτλο, το ποσό και την περιγραφή.",already_submitted:"Υπάρχει ήδη αίτημα από την επιχείρησή σου στον τρέχοντα κύκλο.",proposal_failed:"Δεν ήταν δυνατή η καταχώριση.",vote_cast:"Η υποστήριξή σου καταχωρίστηκε και προστέθηκε στο ίχνος ελέγχου.",already_voted:"Έχεις ήδη υποστηρίξει αυτή την πρόταση.",vote_not_allowed:"Η ψηφοφορία δεν είναι ανοιχτή ή δεν έχεις δικαίωμα ψήφου.",cycle_closed:"Η περίοδος υποβολής δεν είναι ανοιχτή.",invalid_vote:"Μη έγκυρη πρόταση."};
export default async function Proposals({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const snapshot=await maziMemberRequest<MaziState>("state");
 if(!snapshot.ok)return <main id="content"><section className="section shell">
  <h1>Οι προτάσεις δεν είναι διαθέσιμες αυτή τη στιγμή.</h1>
  <p>Δεν καταχωρίστηκε καμία ενέργεια. Δοκίμασε ξανά αργότερα.</p>
 </section></main>;
 const {member,cycle,proposals,votes,proposal_review}=snapshot;
 if(member?.status!=="verified"||!member.identity_verified_at)redirect("/members");
 const {notice}=await searchParams;
 const myVotes=new Set((votes||[]).map(x=>x.proposal_id));
 const myProposal=(proposals||[]).some(x=>x.created_by===user.id);
 const canSubmit=cycle?.status==="submissions"&&new Date(cycle.starts_at)<=new Date()&&new Date(cycle.ends_at)>new Date()&&!myProposal;
 const canVote=member.voting_eligible&&cycle?.status==="voting"&&new Date(cycle.ends_at)>new Date();
 return <main id="content"><section className="subhero member-hero"><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΕΠΙΧΕΙΡΗΜΑΤΙΚΕΣ ΑΝΑΓΚΕΣ</span><h1>Οι ανάγκες μας.<br/><em>Η συλλογική μας φωνή.</em></h1><p>Εδώ υποβάλλονται πραγματικές προτάσεις από επαληθευμένα μέλη — χωρίς δοκιμαστικά δεδομένα.</p></div></section>
 <section className="section shell portal-section">
 <div className="portal-heading"><div><span className="eyebrow">ΕΝΕΡΓΟΣ ΚΥΚΛΟΣ</span><h2>{cycle?.title||"Δεν υπάρχει ενεργός κύκλος"}</h2></div><Link className="text-link" href="/members">Ο χώρος μου →</Link></div>
 <div className="info-strip"><strong>Καταγραφή αναγκών — όχι χρηματοδότηση</strong><p>Αυτός ο ιδρυτικός κύκλος συγκεντρώνει πραγματικές επιχειρηματικές ανάγκες. Ο χρηματοδοτικός προϋπολογισμός είναι €0. Δεν υπάρχουν ακόμη συνδρομές, δεσμεύσεις ή εκταμιεύσεις. Η υποβολή δεν υπόσχεται χρηματοδότηση.</p></div>
 {notice&&notices[notice]?<p className="form-message" role="status">{notices[notice]}</p>:null}
 <div className="portal-grid"><div><h2 className="portal-section-title">Υποβληθείσες προτάσεις</h2>{proposals&&proposals.length?proposals.map(p=><article className="record-card" key={p.id}><span className="eyebrow">{states[p.status]||p.status}</span><h3>{p.title}</h3><p>{p.details}</p>{p.created_by===user.id&&proposal_review?.id===p.id&&proposal_review.review_reason?<p className="legal-hint"><strong>Αιτιολογία αξιολόγησης:</strong> {proposal_review.review_reason}</p>:null}<div className="record-meta"><span>Αναφερόμενη ανάγκη: {euro(p.amount_cents)}</span><span>{new Date(p.created_at).toLocaleDateString("el-GR")}</span></div>{canVote&&p.status==="approved"&&p.created_by!==user.id&&!myVotes.has(p.id)?<form action={supportProposal}><input type="hidden" name="proposal_id" value={p.id}/><button className="button dark" type="submit">Καταχώριση υποστήριξης ↗</button></form>:null}{myVotes.has(p.id)?<p className="small-muted">Έχεις υποστηρίξει αυτή την πρόταση.</p>:null}</article>):<div className="empty-state">Δεν έχουν ακόμη υποβληθεί προτάσεις στον συγκεκριμένο κύκλο.</div>}</div>
 <div><h2 className="portal-section-title">Η δική σου πρόταση</h2>{canSubmit?<div className="form-panel compact"><p className="paragraph">Έχεις δικαίωμα μίας υποβολής στον ιδρυτικό κύκλο. Περιέγραψε μια πραγματική επιχειρηματική ανάγκη· η πρόταση θα ελεγχθεί πριν εμφανιστεί σε άλλα μέλη.</p><form action={submitProposal} className="stack-form"><label htmlFor="title">Τίτλος πρότασης</label><input name="title" id="title" minLength={8} maxLength={140} required/><label htmlFor="category">Κατηγορία</label><select id="category" name="category"><option value="resilience">Ανθεκτικότητα / ανάγκη</option><option value="growth">Επιχειρηματική ανάπτυξη</option><option value="joint">Κοινή πρωτοβουλία</option></select><label htmlFor="amount">Απαιτούμενο ποσό (€)</label><input id="amount" name="amount_eur" type="number" min="500" max="200000" step="1" required/><label htmlFor="details">Περιγραφή ανάγκης και οφέλους</label><textarea id="details" name="details" minLength={80} maxLength={4000} rows={8} required/><button className="button dark" type="submit">Υποβολή προς αξιολόγηση ↗</button></form></div>:<div className="empty-state">{myProposal?"Έχεις ήδη υποβάλει πρόταση για αυτόν τον κύκλο.":"Οι υποβολές δεν είναι ανοιχτές. Όταν ο επόμενος κύκλος ξεκινήσει, θα μπορείς να υποβάλεις νέα πρόταση."}</div>}</div></div></section></main>;
}
