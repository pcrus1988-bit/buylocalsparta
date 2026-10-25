import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../lib/supabase/server";
import {signOut,answerMaziFollowup} from "../actions";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Ο χώρος μου",robots:{index:false,follow:false}};
const messages:Record<string,string>={invitation_accepted:"Η προσωπική πρόσκληση έγινε αποδεκτή. Η συμμετοχή δεν ενεργοποιεί συνδρομή, χρηματοδότηση ή αυτόματη ψήφο.",application_received:"Η αίτηση καταχωρίστηκε με επιτυχία και αναμένει πραγματικό έλεγχο.",invalid_application:"Έλεγξε όλα τα πεδία πριν από την υποβολή.",privacy_required:"Για την υποβολή απαιτείται αποδοχή της ενημέρωσης επεξεργασίας δεδομένων.",already_applied:"Έχεις ήδη υποβάλει αίτηση.",application_failed:"Η αίτηση δεν καταχωρίστηκε. Δοκίμασε ξανά αργότερα.",not_verified:"Η επιχείρηση πρέπει πρώτα να επαληθευτεί.",followup_answered:"Η απάντησή σου καταχωρίστηκε και είναι διαθέσιμη μόνο στον αρμόδιο ελεγκτή.",invalid_followup_answer:"Συμπλήρωσε απάντηση από 20 έως 2.000 χαρακτήρες.",followup_not_available:"Δεν είναι δυνατή η καταχώριση. Η αίτηση ενδέχεται να έχει ήδη αξιολογηθεί."};
const statuses:Record<string,string>={pending:"Υπό έλεγχο",approved:"Εγκεκριμένη",rejected:"Δεν εγκρίθηκε"};
export default async function Members({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const snapshot=await maziMemberRequest<MaziState>("state");
 if(!snapshot.ok)return <main id="content"><section className="section shell">
  <h1>Ο χώρος μελών δεν είναι διαθέσιμος αυτή τη στιγμή.</h1>
  <p>Δεν υποβάλαμε καμία αίτηση. Δοκίμασε ξανά αφού ανανεώσεις τη σελίδα.</p>
 </section></main>;
 const {application,member,followups}=snapshot;
 if(!application)redirect("/onboarding");
 const {notice}=await searchParams;
 return <main id="content"><section className="subhero member-hero"><div className="shell"><span className="eyebrow light">ΜΑΖΙ / ΧΩΡΟΣ ΕΠΙΧΕΙΡΗΣΗΣ</span><h1>Ένας χώρος<br/><em>για την επιχείρησή σου.</em></h1><p>Αίτηση, επαλήθευση, συμμετοχή σε πραγματικές διαδικασίες και παρακολούθηση των αιτημάτων σου.</p></div></section>
 <section className="section shell portal-section"><p><Link className="button dark" href="/dashboard">Ο προσωπικός μου πίνακας ελέγχου ↗</Link></p><div className="portal-heading"><div><span className="eyebrow">ΠΡΟΣΩΠΙΚΟΣ ΧΩΡΟΣ</span><h2>{application?.business_name||"Η επιχείρησή σου"}</h2><p className="small-muted">Συνδέθηκες ως {user.email}</p></div><form action={signOut}><button className="reset-button" type="submit">Αποσύνδεση ↗</button></form></div>
 {notice&&messages[notice]?<p className="form-message" role="status">{messages[notice]}</p>:null}
 {application?<div className="member-status"><span className="eyebrow">ΚΑΤΑΣΤΑΣΗ ΑΙΤΗΣΗΣ</span><h3>{statuses[application.status]||application.status}</h3><p>Καταχώριση: {new Date(application.created_at).toLocaleDateString("el-GR")}. Η έγκριση δεν σημαίνει αυτόματη οικονομική συμμετοχή ή δικαίωμα λήψης χρηματοδότησης.</p>
 {application.review_reason?<p className="legal-hint"><strong>Αιτιολογία αξιολόγησης:</strong> {application.review_reason}</p>:null}
 {followups?.length?<div style={{display:"grid",gap:16,margin:"24px 0"}}>
 <span className="eyebrow">ΔΙΕΥΚΡΙΝΙΣΕΙΣ ΓΙΑ ΤΗΝ ΑΙΤΗΣΗ ΣΟΥ</span>
 {followups.map(f=><section key={f.id} className="record-card">
  <span className="eyebrow">{f.answered_at?"ΑΠΑΝΤΗΘΗΚΕ":"ΑΝΑΜΕΝΕΤΑΙ Η ΑΠΑΝΤΗΣΗ ΣΟΥ"}</span>
  <p><strong>Ερώτημα αξιολόγησης:</strong> {f.question}</p>
  {f.answered_at?<p><strong>Η απάντησή σου:</strong> {f.answer}</p>:application.status==="pending"?
   <form action={answerMaziFollowup} className="stack-form">
    <input type="hidden" name="followup_id" value={f.id}/>
    <label htmlFor={`followup-${f.id}`}>Απάντηση προς τον ελεγκτή (20–2.000 χαρακτήρες)</label>
    <textarea name="answer" id={`followup-${f.id}`} required minLength={20} maxLength={2000} rows={5}
      placeholder="Απάντησε συγκεκριμένα στην ερώτηση χωρίς να προσθέτεις άσχετα προσωπικά δεδομένα."/>
    <button className="button dark" type="submit">Υποβολή απάντησης ↗</button>
   </form>:<p>Η διαδικασία αξιολόγησης έχει ολοκληρωθεί.</p>}
 </section>)}</div>:null}
 {member?.status==="verified"?<div className="member-actions"><span className="status-chip">{member.identity_verified_at?"Ταυτοποιημένη επιχείρηση ΓΕΜΗ":"Αίτηση εγκεκριμένη · εκκρεμεί ΓΕΜΗ"}</span>{member.identity_verified_at?<><Link href="/proposals" className="button dark">Διαχείριση προτάσεων ↗</Link><Link href="/awards" className="button dark">Προσφορές ενίσχυσης ↗</Link></>:<span className="legal-hint">Εκκρεμεί ο έλεγχος ΓΕΜΗ και η επιβεβαίωση νόμιμης εκπροσώπησης πριν από τις προτάσεις και τις ψηφοφορίες.</span>}</div>:<p className="legal-hint">Η δυνατότητα υποβολής προτάσεων ενεργοποιείται μετά από πραγματικό έλεγχο της αίτησης.</p>}
 {member?.voting_eligible?<p className="small-muted">Τα δικαιώματα συμμετοχής σε ψηφοφορία έχουν ενεργοποιηθεί με έλεγχο επιλεξιμότητας.</p>:null}
 
 </div>:null}
 </section></main>;
}
