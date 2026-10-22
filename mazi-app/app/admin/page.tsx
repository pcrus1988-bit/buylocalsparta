import type {Metadata} from "next";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {reviewMembership,reviewProposal,setVotingEligibility,changeCycleStage} from "../actions";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Διακυβέρνηση",robots:{index:false,follow:false}};
export default async function Admin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/join");
 const {data:admin}=await db.from("mazi_administrators").select("user_id").eq("user_id",user.id).maybeSingle();if(!admin)redirect("/members");
 const [{data:applications},{data:proposals},{data:members},{data:cycle}]=await Promise.all([
   db.from("mazi_membership_applications").select("id,business_name,representative_name,location,sector,registry_number,description,status,created_at").eq("status","pending").order("created_at",{ascending:true}).limit(100),
   db.from("mazi_proposals").select("id,title,details,amount_cents,status,created_by").eq("status","submitted").order("created_at",{ascending:true}).limit(100),
   db.from("mazi_members").select("user_id,status,voting_eligible,admitted_at").limit(100),
   db.from("mazi_cycles").select("slug,title,status,funding_budget_cents,finance_activated").eq("slug","founding-needs-2026").maybeSingle()
 ]);
 const notice=(await searchParams).notice;
 return <main id="content"><section className="subhero member-hero"><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΠΙΝΑΚΑΣ ΔΙΑΚΥΒΕΡΝΗΣΗΣ</span><h1>Διαφάνεια.<br/><em>Ευθύνη.</em></h1><p>Ελεγχόμενες πραγματικές αιτήσεις, μέλη και προτάσεις. Κάθε πράξη περιορίζεται σε διορισμένο διαχειριστή.</p></div></section>
 <section className="section shell portal-section">{notice?<p role="status" className="form-message">Η ενέργεια ολοκληρώθηκε ή αναφέρθηκε αποτέλεσμα. Κωδικός: {notice}</p>:null}
 <div className="info-strip"><strong>Χρηματοδοτική ασφάλεια</strong><p>Ο κύκλος παραμένει μη χρηματοδοτικός, με λογιστικό ποσό €0. Δεν υπάρχει κουμπί πληρωμής ή απονομής ποσού. Η επαλήθευση μέλους δεν ενεργοποιεί αυτομάτως δικαιώματα ψηφοφορίας.</p></div>
 <div className="admin-heading"><span className="eyebrow">ΑΙΤΗΣΕΙΣ ΣΕ ΑΝΑΜΟΝΗ</span><h2>{applications?.length||0} αιτήσεις</h2></div>
 {applications?.length?applications.map(a=><article className="record-card" key={a.id}><h3>{a.business_name}</h3><p>{a.representative_name} · {a.location} · {a.sector} · ΓΕΜΗ: {a.registry_number||"Δεν δόθηκε"}</p><p>{a.description}</p><form action={reviewMembership} className="action-row"><input type="hidden" name="application_id" value={a.id}/><button className="button dark" name="decision" value="approve" type="submit">Έγκριση επιχείρησης</button><button className="reset-button" name="decision" value="reject" type="submit">Απόρριψη</button></form></article>):<div className="empty-state">Δεν εκκρεμούν αιτήσεις.</div>}
 <div className="admin-heading"><span className="eyebrow">ΑΙΤΗΜΑΤΑ ΓΙΑ ΕΛΕΓΧΟ</span><h2>{proposals?.length||0} προτάσεις</h2></div>
 {proposals?.length?proposals.map(p=><article className="record-card" key={p.id}><h3>{p.title}</h3><p>{p.details}</p><p>Αναφερόμενο ποσό: {(p.amount_cents/100).toLocaleString("el-GR")} € · Χρήστης: {p.created_by}</p><form action={reviewProposal} className="action-row"><input name="proposal_id" type="hidden" value={p.id}/><button className="button dark" name="decision" value="approve" type="submit">Έγκριση για προβολή</button><button className="reset-button" name="decision" value="reject" type="submit">Απόρριψη</button></form></article>):<div className="empty-state">Δεν υπάρχουν νέες προτάσεις για έλεγχο.</div>}
 <div className="admin-heading"><span className="eyebrow">ΜΕΛΗ</span><h2>Δικαιώματα συμμετοχής</h2></div>
 {members?.length?members.map(m=><div className="member-admin-row" key={m.user_id}><div><strong>{m.user_id}</strong><p className="small-muted">Κατάσταση: {m.status} · Δικαίωμα ψήφου: {m.voting_eligible?"Ναι":"Όχι"}</p></div><form action={setVotingEligibility} className="action-row"><input type="hidden" name="user_id" value={m.user_id}/><button type="submit" name="eligible" value={m.voting_eligible?"no":"yes"} className="reset-button">{m.voting_eligible?"Αφαίρεση ψήφου":"Ενεργοποίηση ψήφου"}</button></form></div>):<div className="empty-state">Δεν έχουν εγκριθεί ακόμη μέλη.</div>}
 <div className="admin-heading"><span className="eyebrow">ΚΥΚΛΟΣ ΑΝΑΓΚΩΝ</span><h2>{cycle?.title||"Κύκλος"}</h2></div>
 <div className="record-card"><p>Στάδιο: <strong>{cycle?.status}</strong> · Πραγματικός χρηματοδοτικός προϋπολογισμός: <strong>€0</strong></p><form action={changeCycleStage} className="action-row"><label htmlFor="stage">Μετάβαση σταδίου:</label><select id="stage" name="stage" defaultValue={cycle?.status}><option value="submissions">Υποβολή</option><option value="review">Έλεγχος</option><option value="voting">Ψηφοφορία για προτεραιότητες (χωρίς χρηματοδότηση)</option><option value="closed">Ολοκλήρωση</option></select><button className="button dark" type="submit">Καταχώριση αλλαγής</button></form></div>
 </section></main>;
}
