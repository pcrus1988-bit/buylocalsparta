import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
import {maziServiceRequest,maziPublicServiceCatalogue} from "../../lib/mazi-services-api";
import {requestService,cancelService,sendServiceMessage} from "./actions";
import "../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Υπηρεσίες κατ’ απαίτηση · 250 Tokens",robots:{index:false,follow:false}};
type Service={id:string;title:string;category:string;description:string;deliverable:string;tokens:number;turnaround_business_days:number;revisions_included:number;is_active:boolean};
type Period={id:string;starts_at:string;ends_at:string;allowance_tokens:number};
type Request={id:string;service_title_snapshot:string;token_price:number;status:string;created_at:string;period_id:string;brief:string;admin_note:string|null;completed_at:string|null;revisions_included_snapshot:number};
type AcceptanceReceipt={request_id:string;policy_version:string;accepted_at:string;token_price_snapshot:number;deliverable_snapshot:string;turnaround_business_days_snapshot:number;revisions_included_snapshot:number};
type ServiceMessage={id:number;request_id:string;author_user_id:string;kind:string;body:string;delivery_url:string|null;created_at:string};
const statusText:Record<string,string>={requested:"Αναμονή ελέγχου",accepted:"Εγκρίθηκε",in_progress:"Σε εκτέλεση",completed:"Παραδόθηκε",rejected:"Απορρίφθηκε",cancelled:"Ακυρώθηκε"};
const feedback:Record<string,string>={
 requested:"Το αίτημα καταχωρίστηκε. Τα Tokens δεσμεύτηκαν προσωρινά.",
 cancelled:"Το αίτημα ακυρώθηκε. Τα Tokens αποδεσμεύτηκαν στον αρχικό κύκλο.",
 invalid_request:"Έλεγξε την υπηρεσία και την περιγραφή (20–3.000 χαρακτήρες).",
 insufficient_tokens:"Δεν υπάρχουν αρκετά διαθέσιμα Tokens στον τρέχοντα κύκλο.",
 allowance_inactive:"Δεν υπάρχει ενεργός, επαληθευμένος πληρωμένος κύκλος.",
 member_not_eligible:"Απαιτείται επαληθευμένη συμμετοχή.",
 unknown_service:"Η υπηρεσία δεν προσφέρεται πλέον.",
 request_failed:"Το αίτημα δεν καταχωρίστηκε· δεν έγινε δέσμευση.",
 cancel_failed:"Δεν ήταν δυνατή η ακύρωση. Ίσως το αίτημα έχει ήδη αναληφθεί.",
 service_conditions_not_accepted:"Πρέπει να αποδεχτείς ρητά τους όρους του συγκεκριμένου αιτήματος.",
 idempotency_conflict:"Το αναγνωριστικό της αίτησης έχει χρησιμοποιηθεί διαφορετικά. Ξαναφόρτωσε τη σελίδα.",
 subscription_not_activated:"Το οικονομικό πρόγραμμα υπηρεσιών δεν έχει ενεργοποιηθεί ακόμη.",
 message_sent:"Το μήνυμα καταχωρίστηκε στην επικοινωνία της υπηρεσίας.",
 message_failed:"Δεν έγινε καταχώριση μηνύματος· δοκίμασε ξανά.",
 message_invalid:"Το μήνυμα πρέπει να περιέχει 10–3.000 χαρακτήρες.",
 revision_sent:"Το αίτημα αναθεώρησης καταχωρίστηκε χωρίς νέα χρέωση Tokens.",
 revision_window_closed:"Η περίοδος αναθεώρησης έχει λήξει.",
 revision_limit_reached:"Έχει χρησιμοποιηθεί ο αριθμός διορθώσεων που περιλαμβάνει η υπηρεσία.",
 already_accepted:"Η παράδοση έχει ήδη αποδεχθεί.",
 accepted:"Η παραλαβή της υπηρεσίας καταγράφηκε.",
 invalid_message_state:"Η κατάσταση της υπηρεσίας δεν επιτρέπει αυτήν την ενέργεια."
};
const fmt=(d:string)=>new Date(d).toLocaleDateString("el-GR",{day:"2-digit",month:"long",year:"numeric",timeZone:"Europe/Athens"});
export default async function Services({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/join");
 const state=await maziMemberRequest<MaziState>("state");
 if(!state.ok)return <main className="com-shell"><h1>Οι υπηρεσίες δεν είναι διαθέσιμες.</h1><p>Δεν καταχωρίστηκε κάποια αλλαγή.</p><Link href="/dashboard">Επιστροφή</Link></main>;
 if(!state.application)redirect("/onboarding");
 const verified=state.application.status==="approved"&&state.member?.status==="verified"&&Boolean(state.member.identity_verified_at);
 const [catalogue,wallet]=await Promise.all([
  maziPublicServiceCatalogue<{services:Service[]}>(),
  verified?maziServiceRequest<{services:Service[];periods:Period[];requests:Request[];messages:ServiceMessage[];acceptances:AcceptanceReceipt[]}>("member_wallet"):Promise.resolve(null)
 ]);
 const services=wallet?.ok?wallet.services:catalogue.ok?catalogue.services:[];
 const periods=wallet?.ok?wallet.periods:[];
 const requests=wallet?.ok?wallet.requests:[];
 const messages=wallet?.ok?wallet.messages:[];
 const acceptances=wallet?.ok?wallet.acceptances:[];
 const serviceUnavailable=!catalogue.ok||(verified&&!wallet?.ok);
 const now=Date.now();
 const active=periods.find(p=>Date.parse(p.starts_at)<=now&&Date.parse(p.ends_at)>now);
 const activeRequests=requests.filter(r=>r.period_id===active?.id);
 const committed=activeRequests.filter(r=>["requested","accepted","in_progress","completed"].includes(r.status)).reduce((n,r)=>n+r.token_price,0);
 const reserved=activeRequests.filter(r=>["requested","accepted","in_progress"].includes(r.status)).reduce((n,r)=>n+r.token_price,0);
 const consumed=activeRequests.filter(r=>r.status==="completed").reduce((n,r)=>n+r.token_price,0);
 const available=active?Math.max(0,active.allowance_tokens-committed):0;
 const {notice}=await searchParams;
 return <main id="content" className="com-shell">
  <header className="com-top"><div><span className="com-kicker">ΜΑΖΙ / ΑΝΑΠΤΥΞΗ ΤΗΣ ΕΠΙΧΕΙΡΗΣΗΣ</span>
   <h1>Οι υπηρεσίες σου.<br/><em>Με 250 Tokens.</em></h1>
   <p>Υπηρεσίες πραγματικής παραγωγής, με σαφή παραδοτέα και προκαθορισμένη χρέωση σε Tokens. Επιλέγεις ακριβώς ό,τι χρειάζεται η επιχείρησή σου.</p>
  </div><Link href="/dashboard" className="com-back">Το Dashboard μου ↗</Link></header>
  {notice&&feedback[notice]?<p className="com-feedback" role="status">{feedback[notice]}</p>:null}
  {serviceUnavailable?<div className="com-alert">Το σύστημα υπηρεσιών δεν είναι ακόμη διαθέσιμο. Δεν μπορούν να υποβληθούν αιτήματα ή να υπολογιστούν υπόλοιπα.</div>:null}
  <section aria-label="Υπόλοιπο υπηρεσιών" className="com-stats" style={{gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))"}}>
   <div><span>Διαθέσιμα</span><strong>{available} Tokens</strong><small>{active?"Για νέες υπηρεσίες":"Δεν υπάρχει ενεργός πληρωμένος κύκλος"}</small></div>
   <div><span>Σε εκκρεμότητα</span><strong>{reserved}</strong><small>Δεσμευμένα Tokens</small></div>
   <div><span>Ολοκληρώθηκαν</span><strong>{consumed}</strong><small>Tokens υπηρεσιών στον κύκλο</small></div>
   <div><span>Ανανέωση</span><strong>{active?fmt(active.ends_at):"—"}</strong><small>Μηδενισμός υπολοίπου· νέα 250 μετά επιβεβαίωση πληρωμής</small></div>
  </section>
  <div className="com-alert">{active
   ?"Έχει εκδοθεί επαληθευμένος κύκλος συνδρομής. Τα αχρησιμοποίητα Tokens λήγουν στο τέλος του και δεν μεταφέρονται."
   :"Η συμμετοχή στην πιλοτική κοινότητα δεν ενεργοποιεί συνδρομή. Θα εμφανιστούν 250 Tokens μόνο όταν υπάρξει ξεχωριστή συμφωνία και επαληθευμένη πληρωμή της συνδρομής."}</div>
  <section className="com-recent" aria-labelledby="catalog-title" style={{marginTop:28}}>
   <span className="com-kicker">01 / ΚΑΤΑΛΟΓΟΣ</span><h2 id="catalog-title">Επέλεξε υπηρεσία</h2>
   <p>1 Token αντιστοιχεί σε €1 καταλογικής αξίας υπηρεσιών. Δεν αποτελεί χρήμα, πίστωση μετρητών ή αγοραστική αξία εκτός ΜΑΖΙ. Δεν καλύπτει εξωτερικά έξοδα, media spend, εκτυπώσεις ή προμήθειες τρίτων.</p>
   <div className="com-dashboard-grid" style={{marginTop:25}}>
    {services.map(s=><article key={s.id} className="com-card">
     <span className="com-kicker">{s.category}</span>
     <h3>{s.title}</h3><p>{s.description}</p><p><strong>Παραδοτέο:</strong> {s.deliverable}</p>
     <div className="com-meta"><strong style={{fontSize:25}}>{s.tokens} Tokens</strong><span>Ενδεικτικά {s.turnaround_business_days} εργάσιμες · {s.revisions_included} διορθώσεις</span></div>
     {verified&&active&&available>=s.tokens&&!serviceUnavailable?
      <details style={{marginTop:20}}><summary className="com-minor" style={{cursor:"pointer"}}>Αίτημα υπηρεσίας</summary>
       <form action={requestService} className="com-form">
        <input type="hidden" name="service_id" value={s.id}/>
        <input type="hidden" name="idempotency_key" value={randomUUID()}/>
        <input type="hidden" name="terms_version" value="mazi-service-order-v1-2026-10-28"/>
        <label>Περιγραφή ανάγκης (20–3.000 χαρακτήρες)
         <textarea name="brief" minLength={20} maxLength={3000} required rows={5} placeholder="Σκοπός, κοινό, στοιχεία και επιθυμητά παραδοτέα…"/></label>
        <label style={{display:"flex",alignItems:"flex-start",gap:10,marginTop:12}}>
         <input name="terms_accepted" type="checkbox" value="yes" required style={{marginTop:5}}/>
         <span>Αποδέχομαι ειδικά για αυτό το αίτημα τη δέσμευση <strong>{s.tokens} Tokens</strong>, το περιγραφόμενο παραδοτέο, τον ενδεικτικό χρόνο {s.turnaround_business_days} εργάσιμων ημερών, τις {s.revisions_included} περιλαμβανόμενες διορθώσεις και ότι εξωτερικά έξοδα δεν καλύπτονται. Τα μη χρησιμοποιημένα Tokens λήγουν στο τέλος του μήνα. Έχω διαβάσει τους <Link href="/terms">όρους συμμετοχής</Link> και τον <Link href="/services/catalogue">κατάλογο υπηρεσιών</Link>. Η αποδοχή καταγράφεται με ημερομηνία και έκδοση.</span>
        </label>
        <button type="submit" className="com-button">Αποδοχή όρων και δέσμευση {s.tokens} Tokens ↗</button>
       </form></details>:
       <p className="com-meta">{!verified?"Διαθέσιμη μετά την επαλήθευση και ενεργοποίηση πληρωμένης συνδρομής":!active?"Εκκρεμεί ενεργός κύκλος":available<s.tokens?"Δεν επαρκούν τα διαθέσιμα Tokens":"Προσωρινά μη διαθέσιμη"}</p>}
    </article>)}
   </div>
   {!services.length?<p className="com-empty">Δεν υπάρχουν διαθέσιμες υπηρεσίες στον ζωντανό κατάλογο.</p>:null}
  </section>
  <section className="com-recent" aria-labelledby="requests-title">
   <span className="com-kicker">02 / ΔΙΑΦΑΝΕΙΑ</span><h2 id="requests-title">Τα αιτήματά μου</h2>
   <div className="com-list">
    {requests.map(r=><article className="com-card" key={r.id}>
     <div className="com-meta"><span>{fmt(r.created_at)}</span><strong>{statusText[r.status]||r.status}</strong></div>
     <h3>{r.service_title_snapshot} · {r.token_price} Tokens</h3>
     <p>{r.brief}</p>
     {acceptances.find(a=>a.request_id===r.id)?<details style={{margin:"10px 0"}}>
      <summary className="com-minor" style={{cursor:"pointer"}}>Αποδεικτικό αποδοχής παραγγελίας</summary>
      {acceptances.filter(a=>a.request_id===r.id).map(a=><div key={a.request_id} style={{marginTop:9}}>
       <p><strong>Έκδοση:</strong> {a.policy_version} · <strong>Αποδοχή:</strong> {new Date(a.accepted_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</p>
       <p><strong>Δεσμευμένα Tokens:</strong> {a.token_price_snapshot} · <strong>Διορθώσεις:</strong> {a.revisions_included_snapshot} · <strong>Χρόνος:</strong> {a.turnaround_business_days_snapshot} εργάσιμες</p>
       <p><strong>Συμφωνημένο παραδοτέο:</strong> {a.deliverable_snapshot}</p>
      </div>)}
     </details>:null}
     {r.admin_note?<p><strong>Τελευταία σημείωση ομάδας:</strong> {r.admin_note}</p>:null}
     <div style={{margin:"18px 0",paddingTop:12,borderTop:"1px solid var(--line, #d8ded8)"}}>
      <span className="com-kicker">ΙΣΤΟΡΙΚΟ ΕΠΙΚΟΙΝΩΝΙΑΣ ΚΑΙ ΠΑΡΑΔΟΣΗΣ</span>
      <div className="com-list" style={{marginTop:12}}>
       {messages.filter(m=>m.request_id===r.id).map(m=><div key={m.id} className="com-meta" style={{display:"block",padding:"10px 0"}}>
        <strong>{m.kind==="delivery"?"Παράδοση":m.kind==="revision_request"?"Αίτημα διόρθωσης":m.kind==="acceptance"?"Αποδοχή παραλαβής":m.kind==="member_message"?"Μήνυμα μέλους":"Απάντηση ομάδας"}</strong>
        <span style={{marginLeft:8}}>{new Date(m.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
        <p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{m.body}</p>
        {m.delivery_url?<a href={m.delivery_url} rel="noopener noreferrer" target="_blank">Άνοιγμα παραδοτέου ↗</a>:null}
       </div>)}
       {!messages.some(m=>m.request_id===r.id)?<p className="com-empty">Δεν έχουν καταχωριστεί ακόμη μηνύματα ή παραδοτέα.</p>:null}
      </div>
     </div>
     {["requested","accepted","in_progress","completed"].includes(r.status)&&!messages.some(m=>m.request_id===r.id&&m.kind==="acceptance")?
      <details><summary className="com-minor" style={{cursor:"pointer"}}>Αποστολή μηνύματος προς την ομάδα</summary>
       <form action={sendServiceMessage} className="com-form">
        <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="kind" value="member_message"/>
        <label>Το μήνυμά σου<textarea name="message" minLength={10} maxLength={3000} rows={3} required/></label>
        <button className="com-button" type="submit">Αποστολή μηνύματος</button>
       </form>
      </details>:null}
     {r.status==="completed"&&!messages.some(m=>m.request_id===r.id&&m.kind==="acceptance")?
      <div style={{marginTop:16}}>
       <span className="com-kicker">ΠΑΡΑΛΑΒΗ ΚΑΙ ΔΙΟΡΘΩΣΕΙΣ</span>
       <p>Περιλαμβάνονται έως {r.revisions_included_snapshot} διορθώσεις. Για αίτημα αναθεώρησης ισχύουν 10 ημερολογιακές ημέρες μετά την τελευταία παράδοση.</p>
       <form action={sendServiceMessage} className="com-form">
        <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="kind" value="acceptance"/>
        <input type="hidden" name="message" value="Παρέλαβα και αποδέχομαι το παραδοτέο της υπηρεσίας."/>
        <button className="com-minor" type="submit">Επιβεβαίωση παραλαβής</button>
       </form>
       {r.completed_at&&Date.now()<=Date.parse(r.completed_at)+10*86400000&&
        messages.filter(m=>m.request_id===r.id&&m.kind==="revision_request").length<r.revisions_included_snapshot?
        <details style={{marginTop:10}}><summary className="com-minor" style={{cursor:"pointer"}}>Ζητώ περιλαμβανόμενη διόρθωση</summary>
         <form action={sendServiceMessage} className="com-form">
          <input type="hidden" name="request_id" value={r.id}/><input type="hidden" name="kind" value="revision_request"/>
          <label>Ποιες αλλαγές χρειάζεσαι;<textarea name="message" minLength={10} maxLength={3000} rows={4} required/></label>
          <button className="com-button" type="submit">Υποβολή αναθεώρησης χωρίς νέα Tokens</button>
         </form>
        </details>:null}
      </div>:null}
     {r.status==="requested"?<form action={cancelService}><input type="hidden" name="request_id" value={r.id}/><button className="com-minor">Ακύρωση πριν την ανάληψη</button></form>:null}
    </article>)}
    {!requests.length?<p className="com-empty">Δεν υπάρχουν αιτήματα υπηρεσιών.</p>:null}
   </div>
  </section>
  <section className="com-recent"><span className="com-kicker">03 / ΚΑΝΟΝΕΣ</span><h2>Πώς λειτουργούν τα Tokens</h2>
   <p>Κάθε επαληθευμένος, εξοφλημένος μηνιαίος κύκλος δημιουργεί νέα παροχή 250 Tokens. Τα Tokens δεν συσσωρεύονται, δεν μεταφέρονται, δεν ανταλλάσσονται με χρήματα και δεν χρηματοδοτούν το Αναπτυξιακό Ταμείο. Η τιμή δεσμεύεται κατά την αποστολή. Αν απορριφθεί ή ακυρωθεί έγκαιρα, αποδεσμεύεται μόνο στο ίδιο χρονικό διάστημα· αν έχει λήξει, δεν μεταφέρεται. Αιτήματα που έχουν αναληφθεί ολοκληρώνονται με τη συμφωνημένη παροχή ακόμη και μετά τη λήξη του κύκλου. Κάθε επιπλέον εργασία ή κόστος τρίτου απαιτεί χωριστή έγκριση και συμφωνία.</p>
  </section>
 </main>;
}