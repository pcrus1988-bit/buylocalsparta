import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {maziServiceRequest} from "../../../lib/mazi-services-api";
import {issueServicePeriod,transitionService,sendServiceMessage} from "../../services/actions";
import "../../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"MAZI · Διαχείριση υπηρεσιών",robots:{index:false,follow:false}};
type Row={id:string;member_user_id:string;service_title_snapshot:string;token_price:number;status:string;brief:string;created_at:string;admin_note:string|null;completed_at:string|null;revisions_included_snapshot:number};
type Receipt={request_id:string;policy_version:string;accepted_at:string;token_price_snapshot:number;deliverable_snapshot:string;turnaround_business_days_snapshot:number;revisions_included_snapshot:number};
type Note={id:number;request_id:string;author_user_id:string;kind:string;body:string;delivery_url:string|null;created_at:string};
export default async function ServicesAdmin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const dashboard=await maziServiceRequest<{requests:Row[];messages:Note[];acceptances:Receipt[];paid_enabled:boolean;periods:Array<{id:string;member_user_id:string;starts_at:string;ends_at:string;verified_invoice_ref:string;issued_at:string}>;members:Array<{user_id:string;status:string;identity_verified_at:string|null}>}>("admin_dashboard");
 if(!dashboard.ok)redirect("/dashboard");
 const rows=dashboard.requests;
 const messages=dashboard.messages;
 const acceptances=dashboard.acceptances;
 const periods=dashboard.periods;
 const members=dashboard.members;
 const {notice}=await searchParams;
 const feedback:Record<string,string>={invalid:"Άκυρα στοιχεία. Δώσε πλήρεις ημερομηνίες ISO 8601 με ζώνη ώρας.",period_issued:"Ο ελεγμένος κύκλος εκδόθηκε επιτυχώς.",issue_failed:"Αποτυχία έκδοσης: έλεγξε την πληρωμή, την επιλεξιμότητα, τις ημερομηνίες και την μοναδικότητα.",updated:"Η κατάσταση ενημερώθηκε και καταγράφηκε στο ιστορικό.",transition_failed:"Μη επιτρεπτή μετάβαση ή μη έγκυρη αιτιολογία.",message_sent:"Το μήνυμα καταχωρίστηκε.",delivered:"Το παραδοτέο καταχωρίστηκε, με τεκμηρίωση και ολοκλήρωση.",message_failed:"Η ενημέρωση δεν καταχωρίστηκε.",message_invalid:"Το μήνυμα πρέπει να έχει 10–3.000 χαρακτήρες.",invalid_delivery_url:"Το παραδοτέο πρέπει να φιλοξενείται σε εγκεκριμένο ασφαλές Drive/Docs URL.",delivery_summary_required:"Η παράδοση απαιτεί περιγραφή τουλάχιστον 40 χαρακτήρων.",invalid_message_state:"Η κατάσταση του αιτήματος δεν επιτρέπει την ενέργεια."};
 return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">MAZI / SUPER ADMIN</span>
   <h1>Αιτήματα υπηρεσιών.<br/><em>Με τεκμηρίωση.</em></h1>
   <p>Ατομική παρακολούθηση υπηρεσιών, κρατήσεων Tokens και μηνιαίων πληρωμένων κύκλων.</p>
  </div><Link href="/services" className="com-back">Υπηρεσίες μέλους ↗</Link></div>
  {notice&&feedback[notice]?<p className="com-feedback" role="status">{feedback[notice]}</p>:null}
  
  <section className="com-card" style={{marginBottom:26}}>
   <span className="com-kicker">ΕΝΕΡΓΟΠΟΙΗΣΗ / ΜΟΝΟ ΜΕΤΑ ΤΗΝ ΕΞΟΦΛΗΣΗ</span><h2>Έκδοση 250 Tokens για νέο κύκλο</h2>
   <p><strong>Οικονομική δικλίδα:</strong> επαλήθευσε προηγουμένως τη νόμιμη, ξεχωριστή σύμβαση συνδρομής, το αντίστοιχο τιμολόγιο και την πραγματική εξόφληση στο λογιστικό σύστημα. Το παρόν εργαλείο δεν πραγματοποιεί χρέωση ούτε επαληθεύει πληρωμή αυτόματα.</p>
   {dashboard.paid_enabled?<form action={issueServicePeriod} className="com-form">
    <label>Αναγνωριστικό χρήστη μέλους (UUID)<input name="member_user_id" required placeholder="UUID από την επιβεβαιωμένη εγγραφή"/></label>
    <label>Έναρξη κύκλου (ISO 8601 με offset)<input name="starts_at" required placeholder="2026-11-01T00:00:00+02:00"/></label>
    <label>Λήξη κύκλου (ISO 8601 με offset)<input name="ends_at" required placeholder="2026-12-01T00:00:00+02:00"/></label>
    <label>Μοναδική αναφορά επαληθευμένου εξοφλημένου παραστατικού<input name="invoice_reference" minLength={8} maxLength={160} required placeholder="Π.χ. paid-invoice-reference"/></label>
    <button className="com-button" type="submit">Καταχώριση επαληθευμένου κύκλου 250 Tokens</button>
   </form>:<div className="com-alert" role="status">
    <strong>Ασφαλιστική δικλίδα ενεργή: η εμπορική συνδρομή δεν έχει ενεργοποιηθεί.</strong>
    <p>Η βάση απορρίπτει έκδοση Tokens. Απαιτούνται νομική έγκριση, φορολογικός έλεγχος και πραγματική επαλήθευση πληρωμών πριν από χωριστή ελεγχόμενη ενεργοποίηση. Δεν παρέχεται κουμπί παράκαμψης.</p>
   </div>}
   <h3>Πρόσφατα μέλη</h3><div className="com-list">
    {members.map(m=><div key={m.user_id} className="com-meta" style={{overflowWrap:"anywhere"}}><code>{m.user_id}</code><span>{m.status} · {m.identity_verified_at?"ΓΕΜΗ ελεγμένο":"Χωρίς επαλήθευση ΓΕΜΗ"}</span></div>)}
   </div>
  </section>
  <section className="com-stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",marginBottom:25}}>
   <div><span>Αναμονή</span><strong>{rows.filter(r=>r.status==="requested").length}</strong><small>Προς ανάληψη</small></div>
   <div><span>Σε εργασία</span><strong>{rows.filter(r=>["accepted","in_progress"].includes(r.status)).length}</strong><small>Με δεσμευμένα Tokens</small></div>
   <div><span>Παραδόθηκαν</span><strong>{rows.filter(r=>r.status==="completed").length}</strong><small>Μέχρι σήμερα</small></div>
  </section>
  <section className="com-recent"><span className="com-kicker">01 / ΠΑΡΑΓΩΓΗ</span><h2>Διαχείριση αιτημάτων</h2>
   <div className="com-list">{rows.map(r=><article className="com-card" key={r.id}>
    <div className="com-meta"><span>{new Date(r.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span><strong>{r.status} · {r.token_price} Tokens</strong></div>
    <h3>{r.service_title_snapshot}</h3><p><strong>Μέλος:</strong> <code>{r.member_user_id}</code></p><p>{r.brief}</p>
    {acceptances.find(a=>a.request_id===r.id)?<div className="com-meta" style={{display:"block",padding:"10px 0"}}>
     {acceptances.filter(a=>a.request_id===r.id).map(a=><div key={a.request_id}>
      <strong>Καταγεγραμμένη αποδοχή αιτήματος</strong>
      <p>{new Date(a.accepted_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})} · {a.policy_version}</p>
      <p>{a.token_price_snapshot} Tokens · {a.revisions_included_snapshot} διορθώσεις · {a.turnaround_business_days_snapshot} εργάσιμες</p>
      <p><strong>Παραδοτέο:</strong> {a.deliverable_snapshot}</p>
     </div>)}
    </div>:<p className="com-alert">Δεν υπάρχει καταχωρισμένο αποδεικτικό αποδοχής για αυτό το αίτημα.</p>}
    {r.admin_note?<p><strong>Τελευταία σημείωση:</strong> {r.admin_note}</p>:null}
    <div className="com-list" style={{margin:"16px 0"}}>
     {messages.filter(m=>m.request_id===r.id).map(m=><div className="com-meta" key={m.id} style={{display:"block",padding:"9px 0"}}>
      <strong>{m.kind==="delivery"?"Παράδοση":m.kind==="revision_request"?"Διόρθωση μέλους":m.kind==="acceptance"?"Αποδοχή παραλαβής":m.kind==="member_message"?"Μέλος":"Ομάδα"}</strong>
      <span style={{marginLeft:8}}>{new Date(m.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
      <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{m.body}</p>
      {m.delivery_url?<a href={m.delivery_url} rel="noopener noreferrer" target="_blank">Επισκόπηση παραδοτέου ↗</a>:null}
     </div>)}
    </div>
    {["requested","accepted","in_progress","completed"].includes(r.status)?
    <details><summary className="com-minor" style={{cursor:"pointer"}}>Απάντηση μέλους από την ομάδα</summary>
     <form action={sendServiceMessage} className="com-form">
      <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="kind" value="admin_message"/>
      <label>Μήνυμα υπηρεσίας<textarea name="message" minLength={10} maxLength={3000} rows={3} required/></label>
      <button className="com-button" type="submit">Καταγραφή απάντησης</button>
     </form>
    </details>:null}
    {["accepted","in_progress"].includes(r.status)?
    <details style={{marginTop:12}}><summary className="com-minor" style={{cursor:"pointer"}}>Τεκμηριωμένη παράδοση υπηρεσίας</summary>
     <form action={sendServiceMessage} className="com-form">
      <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="kind" value="delivery"/>
      <label>Περιγραφή παραδοτέου (40–3.000 χαρακτήρες)
       <textarea name="message" minLength={40} maxLength={3000} rows={5} required placeholder="Τι ολοκληρώθηκε, πού βρίσκεται το παραδοτέο, οδηγίες πρόσβασης και βήματα για το μέλος…"/>
      </label>
      <label>Σύνδεσμος παράδοσης (προαιρετικός · ασφαλής Google Drive/Docs)
       <input name="delivery_url" type="url" maxLength={1200} placeholder="https://drive.google.com/…"/>
      </label>
      <p className="com-meta">Δώσε πρόσβαση μόνο στο εξουσιοδοτημένο μέλος. Η υποβολή καταγράφει ολοκλήρωση και ένα ανεξίτηλο συμβάν χωρίς πρόσθετη χρέωση Tokens.</p>
      <button className="com-button" type="submit">Παράδοση και ολοκλήρωση ↗</button>
     </form>
    </details>:null}
    {["requested","accepted","in_progress"].includes(r.status)?
     <form action={transitionService} className="com-form">
      <input name="request_id" type="hidden" value={r.id}/>
      <label>Επόμενη κατάσταση<select name="status" required defaultValue="">
       <option value="" disabled>Επιλογή</option>
       {r.status==="requested"?<><option value="accepted">Ανάληψη</option><option value="rejected">Απόρριψη</option></>:null}
       {r.status==="accepted"?<option value="in_progress">Έναρξη εκτέλεσης</option>:null}
       {r.status!=="requested"?<option value="cancelled">Ακύρωση από ομάδα</option>:null}
      </select></label>
      <label>Σημείωση / αιτιολογία (υποχρεωτική για απόρριψη ή ακύρωση)
       <textarea name="note" maxLength={2000} rows={3} placeholder="Σύντομη αναφορά παραδοτέου ή αιτιολογία"/></label>
      <button className="com-button" type="submit">Καταγραφή μετάβασης</button>
     </form>:null}
   </article>)}
   {!rows.length?<p className="com-empty">Καμία καταγεγραμμένη αίτηση.</p>:null}</div>
  </section>
  <section className="com-recent"><span className="com-kicker">02 / ΟΙΚΟΝΟΜΙΚΟΣ ΕΛΕΓΧΟΣ</span><h2>Πρόσφατοι εκδοθέντες κύκλοι</h2>
   <div className="com-list">{periods.map(p=><div className="com-card" key={p.id} style={{overflowWrap:"anywhere"}}>
    <strong>{p.member_user_id}</strong>
    <p>{new Date(p.starts_at).toLocaleDateString("el-GR")} — {new Date(p.ends_at).toLocaleDateString("el-GR")} · 250 Tokens</p>
    <p className="com-meta">Παραστατικό: {p.verified_invoice_ref}</p>
   </div>)}</div>
  </section>
 </main>;
}