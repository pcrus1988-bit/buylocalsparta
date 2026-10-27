import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {randomUUID} from "node:crypto";
import {createClient} from "../../lib/supabase/server";
import {maziMemberRequest,type MaziState} from "../../lib/mazi-api";
import {maziServiceRequest,maziPublicServiceCatalogue} from "../../lib/mazi-services-api";
import {requestService,cancelService} from "./actions";
import "../community.css";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Υπηρεσίες κατ’ απαίτηση · 250 Tokens",robots:{index:false,follow:false}};
type Service={id:string;title:string;category:string;description:string;deliverable:string;tokens:number;turnaround_business_days:number;revisions_included:number;is_active:boolean};
type Period={id:string;starts_at:string;ends_at:string;allowance_tokens:number};
type Request={id:string;service_title_snapshot:string;token_price:number;status:string;created_at:string;period_id:string;brief:string;admin_note:string|null};
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
 cancel_failed:"Δεν ήταν δυνατή η ακύρωση. Ίσως το αίτημα έχει ήδη αναληφθεί."
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
  verified?maziServiceRequest<{services:Service[];periods:Period[];requests:Request[]}>("member_wallet"):Promise.resolve(null)
 ]);
 const services=wallet?.ok?wallet.services:catalogue.ok?catalogue.services:[];
 const periods=wallet?.ok?wallet.periods:[];
 const requests=wallet?.ok?wallet.requests:[];
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
        <label>Περιγραφή ανάγκης (20–3.000 χαρακτήρες)
         <textarea name="brief" minLength={20} maxLength={3000} required rows={5} placeholder="Σκοπός, κοινό, στοιχεία και επιθυμητά παραδοτέα…"/></label>
        <button type="submit" className="com-button">Δέσμευση {s.tokens} Tokens ↗</button>
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
     {r.admin_note?<p><strong>Σημείωση ομάδας:</strong> {r.admin_note}</p>:null}
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