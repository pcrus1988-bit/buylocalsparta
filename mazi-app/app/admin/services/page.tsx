import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "../../../lib/supabase/server";
import {issueServicePeriod,transitionService} from "../../services/actions";
import "../../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"MAZI · Διαχείριση υπηρεσιών",robots:{index:false,follow:false}};
type Row={id:string;member_user_id:string;service_title_snapshot:string;token_price:number;status:string;brief:string;created_at:string;admin_note:string|null};
export default async function ServicesAdmin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const {data:authorized,error:authError}=await db.rpc("mazi_is_administrator");
 if(authError||authorized!==true)redirect("/dashboard");
 const [requestsResult,periodsResult,membersResult]=await Promise.all([
  db.from("mazi_service_requests").select("id,member_user_id,service_title_snapshot,token_price,status,brief,created_at,admin_note").order("created_at",{ascending:false}).limit(150),
  db.from("mazi_service_periods").select("id,member_user_id,starts_at,ends_at,verified_invoice_ref,issued_at").order("issued_at",{ascending:false}).limit(30),
  db.from("mazi_members").select("user_id,status,identity_verified_at").order("admitted_at",{ascending:false}).limit(50)
 ]);
 const rows=(requestsResult.data||[]) as Row[];
 const periods=periodsResult.data||[];
 const members=membersResult.data||[];
 const {notice}=await searchParams;
 const feedback:Record<string,string>={invalid:"Άκυρα στοιχεία. Δώσε πλήρεις ημερομηνίες ISO 8601 με ζώνη ώρας.",period_issued:"Ο ελεγμένος κύκλος εκδόθηκε επιτυχώς.",issue_failed:"Αποτυχία έκδοσης: έλεγξε την πληρωμή, την επιλεξιμότητα, τις ημερομηνίες και την μοναδικότητα.",updated:"Η κατάσταση ενημερώθηκε και καταγράφηκε στο ιστορικό.",transition_failed:"Μη επιτρεπτή μετάβαση ή μη έγκυρη αιτιολογία."};
 return <main id="content" className="com-shell">
  <div className="com-top"><div><span className="com-kicker">MAZI / SUPER ADMIN</span>
   <h1>Αιτήματα υπηρεσιών.<br/><em>Με τεκμηρίωση.</em></h1>
   <p>Ατομική παρακολούθηση υπηρεσιών, κρατήσεων Tokens και μηνιαίων πληρωμένων κύκλων.</p>
  </div><Link href="/services" className="com-back">Υπηρεσίες μέλους ↗</Link></div>
  {notice&&feedback[notice]?<p className="com-feedback" role="status">{feedback[notice]}</p>:null}
  {requestsResult.error||periodsResult.error||membersResult.error?<p className="com-alert">Δεν φορτώθηκαν όλες οι ζωντανές εγγραφές. Μην βασιστείς σε ελλιπές σύνολο.</p>:null}
  <section className="com-card" style={{marginBottom:26}}>
   <span className="com-kicker">ΕΝΕΡΓΟΠΟΙΗΣΗ / ΜΟΝΟ ΜΕΤΑ ΤΗΝ ΕΞΟΦΛΗΣΗ</span><h2>Έκδοση 250 Tokens για νέο κύκλο</h2>
   <p><strong>Οικονομική δικλίδα:</strong> επαλήθευσε προηγουμένως τη νόμιμη, ξεχωριστή σύμβαση συνδρομής, το αντίστοιχο τιμολόγιο και την πραγματική εξόφληση στο λογιστικό σύστημα. Το παρόν εργαλείο δεν πραγματοποιεί χρέωση ούτε επαληθεύει πληρωμή αυτόματα.</p>
   <form action={issueServicePeriod} className="com-form">
    <label>Αναγνωριστικό χρήστη μέλους (UUID)<input name="member_user_id" required placeholder="UUID από την επιβεβαιωμένη εγγραφή"/></label>
    <label>Έναρξη κύκλου (ISO 8601 με offset)<input name="starts_at" required placeholder="2026-11-01T00:00:00+02:00"/></label>
    <label>Λήξη κύκλου (ISO 8601 με offset)<input name="ends_at" required placeholder="2026-12-01T00:00:00+02:00"/></label>
    <label>Μοναδική αναφορά επαληθευμένου εξοφλημένου παραστατικού<input name="invoice_reference" minLength={8} maxLength={160} required placeholder="Π.χ. paid-invoice-reference"/></label>
    <button className="com-button" type="submit">Καταχώριση επαληθευμένου κύκλου 250 Tokens</button>
   </form>
   <h3>Πρόσφατα μέλη</h3><div className="com-list">
    {members.map(m=><div key={m.user_id} className="com-meta" style={{overflowWrap:"anywhere"}}><code>{m.user_id}</code><span>{m.status} · {m.identity_verified_at?"ΓΕΜΗ ελεγμένο":"Χωρίς επαλήθευση ΓΕΜΗ"}</span></div>)}
   </div>
  </section>
  <section className="com-recent"><span className="com-kicker">01 / ΠΑΡΑΓΩΓΗ</span><h2>Διαχείριση αιτημάτων</h2>
   <div className="com-list">{rows.map(r=><article className="com-card" key={r.id}>
    <div className="com-meta"><span>{new Date(r.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span><strong>{r.status} · {r.token_price} Tokens</strong></div>
    <h3>{r.service_title_snapshot}</h3><p><strong>Μέλος:</strong> <code>{r.member_user_id}</code></p><p>{r.brief}</p>
    {r.admin_note?<p><strong>Τελευταία σημείωση:</strong> {r.admin_note}</p>:null}
    {["requested","accepted","in_progress"].includes(r.status)?
     <form action={transitionService} className="com-form">
      <input name="request_id" type="hidden" value={r.id}/>
      <label>Επόμενη κατάσταση<select name="status" required defaultValue="">
       <option value="" disabled>Επιλογή</option>
       {r.status==="requested"?<><option value="accepted">Ανάληψη</option><option value="rejected">Απόρριψη</option></>:null}
       {r.status==="accepted"?<option value="in_progress">Έναρξη εκτέλεσης</option>:null}
       {r.status!=="requested"?<><option value="completed">Ολοκληρώθηκε</option><option value="cancelled">Ακύρωση από ομάδα</option></>:null}
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