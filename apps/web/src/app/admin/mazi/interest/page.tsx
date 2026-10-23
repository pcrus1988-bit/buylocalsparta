import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {maziInterestReviewQueue} from "../../../../lib/mazi-interest-admin";
import {reviewMaziInterestAction} from "./actions";
import s from "../mazi.module.css";

export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Έλεγχος αιτήσεων ΑΦΜ",robots:{index:false,follow:false}};
export default async function InterestReview({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}>
  <h1>Μόνο ο ΚΟΝΤΑ ΜΟΥ Super Admin έχει πρόσβαση.</h1></div></main>;
 let rows:Awaited<ReturnType<typeof maziInterestReviewQueue>>|null=null;
 try{rows=await maziInterestReviewQueue(principal);}catch{}
 if(!rows)return <main className={s.stage}><div className={s.shell}><h1>Προσωρινά μη διαθέσιμο</h1><p>Δεν έγινε καμία αλλαγή.</p></div></main>;
 const params=await searchParams;
 const pending=rows.filter(r=>r.status==="pending_review"||r.status==="registry_review_required");
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin/mazi">ΚΟΝΤΑ ΜΟΥ / ΜΑΖΙ</Link><span>↗</span> ΑΙΤΗΣΕΙΣ ΑΦΜ</div>
  <header className={s.hero}><div>
   <p className={s.kicker}>SOLE SUPER ADMIN · VERIFIED BUSINESSES ONLY</p>
   <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Ενδιαφέρον</em></h1>
   <p className={s.subtitle}>Δημόσιες αιτήσεις μέσω ΑΦΜ με ανάκτηση στοιχείων ΓΕΜΗ.
     Η έγκριση επιτρέπει μόνο το επόμενο βήμα πρόσκλησης — δεν δημιουργεί λογαριασμό, μέλος ή δικαιώματα.</p>
  </div></header>
  {params.notice==="reviewed"?<p className={s.notice} role="status">Η απόφαση καταχωρίστηκε στο μητρώο ελέγχου. Δεν έχει σταλεί πρόσκληση.</p>:null}
  <section className={s.section}><div className={s.sectionTop}><div>
   <p>01 / INTAKE REVIEW</p><h2>Προς αξιολόγηση ({pending.length})</h2>
  </div><span>Ισχύει ανεξάρτητη επαλήθευση εκπροσώπου και email</span></div>
  {!pending.length?<div className={s.empty}>Δεν υπάρχουν εκκρεμείς αιτήσεις ΑΦΜ.</div>:
   <div className={s.stack}>{pending.map(a=><article key={a.id} className={s.card}>
    <div style={{flex:1,minWidth:280}}>
     <span className={s.tag}>{a.status==="pending_review"?"ΓΕΜΗ ΑΝΕΥΡΕΘΗ":"ΑΠΑΙΤΕΙΤΑΙ ΝΕΟΣ ΕΛΕΓΧΟΣ ΓΕΜΗ"} · {new Date(a.submitted_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
     <h3>{a.registry_legal_name||"Χωρίς επαληθευμένη επωνυμία"}</h3>
     <p className={s.meta}>ΑΦΜ: {a.tax_number} · ΓΕΜΗ: {a.gemi_number||"Δεν επιβεβαιώθηκε"}</p>
     <p className={s.meta}>Κατάσταση ΓΕΜΗ: {a.registry_company_status||"Απαιτείται έλεγχος"} · Περιοχή: {a.registry_city||"—"}</p>
     <p className={s.meta}>Έλεγχος: {a.registry_checked_at?new Date(a.registry_checked_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Μη διαθέσιμος"}</p>
     <p className={s.meta}>Εκπρόσωπος (δήλωση): {a.representative_name}</p>
     <p className={s.meta}>Email επικοινωνίας (μη επαληθευμένο): {a.contact_email}</p>
     <p className={s.body}>{a.application_note}</p>
     <p className={s.disclaimer}>ΠΡΟΣΟΧΗ: Η εύρεση ΓΕΜΗ δεν αποδεικνύει ότι αυτό το πρόσωπο εκπροσωπεί την επιχείρηση. Μην αποδεχτείτε αν δεν έχει γίνει ανεξάρτητος έλεγχος.</p>
    </div>
    <div style={{minWidth:260,maxWidth:420}}>
     <form action={reviewMaziInterestAction} className={s.action} style={{display:"grid",gap:12}}>
      <input type="hidden" name="csrf" value={principal.csrfToken}/>
      <input type="hidden" name="id" value={a.id}/>
      <label className={s.tag} htmlFor={"reason-"+a.id}>Τεκμηρίωση απόφασης (20–1000 χαρακτήρες)</label>
      <textarea id={"reason-"+a.id} name="reason" required minLength={20} maxLength={1000} rows={4}
       style={{padding:14,border:"1px solid #8ea68e",font:"inherit"}}
       placeholder="Πηγή επαλήθευσης νόμιμης εκπροσώπησης και ιδιοκτησίας email ή αιτιολογία απόρριψης"/>
      <label style={{display:"flex",gap:8,alignItems:"start"}}>
       <input name="representativeVerified" type="checkbox"/>
       <span>Έλεγξα ανεξάρτητα ότι ο αιτών εκπροσωπεί τη νομική οντότητα.</span>
      </label>
      <label style={{display:"flex",gap:8,alignItems:"start"}}>
       <input name="emailVerified" type="checkbox"/>
       <span>Επιβεβαίωσα την ιδιοκτησία του δηλωμένου email (όχι μόνο μέσω δημόσιου ΓΕΜΗ).</span>
      </label>
      <div className={s.buttons}>
       <button type="submit" name="decision" value="approve" className={s.primary}
        disabled={a.registry_lookup_status!=="matched"||!a.gemi_number}>
         Έγκριση για μελλοντική πρόσκληση
       </button>
       <button type="submit" name="decision" value="decline" className={s.secondary}>Απόρριψη</button>
      </div>
     </form>
    </div>
   </article>)}</div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / REVIEW HISTORY</p><h2>Προηγούμενες αποφάσεις</h2></div></div>
   {rows.filter(r=>!["pending_review","registry_review_required"].includes(r.status)).map(r=><div key={r.id} className={s.member}><strong>{r.registry_legal_name||r.tax_number}</strong>
    <span>{r.status==="approved_pending_invite"?"Εγκεκριμένη, χωρίς αποστολή πρόσκλησης":"Απορρίφθηκε"} · {r.review_reason||"—"}</span></div>)}
  </section>
 </div></main>;
}
