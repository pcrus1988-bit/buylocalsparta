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
const money=(cents:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(Number(cents)/100);
export default async function MaziSuperAdminPage({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const p=await getAdminSession();
 if(!p)redirect("/admin/login");
 if(!isMaziSuperAdmin(p))return <main className={s.stage}><section className={s.denied}><h1>Πρόσβαση μόνο για τον Super Admin</h1><p>Η διαχείριση του ΜΑΖΙ ανήκει αποκλειστικά στον ΚΟΝΤΑ ΜΟΥ Super Admin. Οι υπόλοιποι ρόλοι δεν μπορούν να δουν ή να τροποποιήσουν δεδομένα.</p><Link href="/admin">Επιστροφή</Link></section></main>;
 let workspace:Awaited<ReturnType<typeof maziAdminSnapshot>>|undefined;
 try{workspace=await maziAdminSnapshot(p);}catch{}
 if(!workspace)return <main className={s.stage}><div className={s.shell}><h1>ΜΑΖΙ</h1><p>Το ασφαλές περιβάλλον διακυβέρνησης δεν είναι προσωρινά διαθέσιμο. Δεν πραγματοποιήθηκε καμία ενέργεια.</p><Link href="/admin">Επιστροφή στην κεντρική διαχείριση</Link></div></main>;
 const {applications,proposals,members,cycle}=workspace;
 const params=await searchParams;
 return <main className={s.stage}><div className={s.shell}>
 <div className={s.breadcrumb}><Link href="/admin">ΚΟΝΤΑ ΜΟΥ / ADMIN</Link><span>↗</span><span>ΜΑΖΙ</span></div>
 <header className={s.hero}><div><p className={s.kicker}>SOLE AUTHORITY · MARKETPLACE SUPER ADMIN</p>
 <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Διακυβέρνηση</em></h1>
 <p className={s.subtitle}>Πραγματικά μέλη, πραγματικές ανάγκες, καταγεγραμμένες αποφάσεις. Μόνο ο υφιστάμενος ΚΟΝΤΑ ΜΟΥ Super Admin έχει δικαίωμα έγκρισης ή διαχείρισης.</p>
 </div><div className={s.lock}><strong>SUPER ADMIN ONLY</strong><span>Ξεχωριστή διαχείριση ΜΑΖΙ: απενεργοποιημένη</span><a href="https://mazi.kontamou.site" target="_blank" rel="noreferrer">Άνοιγμα ΜΑΖΙ ↗</a></div></header>
 {params.notice==="updated"&&<div className={s.notice} role="status">Η ενέργεια αποθηκεύτηκε και καταγράφηκε στο μητρώο ελέγχου.</div>}
 <div className={s.stats}>
  <div><small>01 / ΝΕΕΣ ΑΙΤΗΣΕΙΣ</small><strong>{applications.length}</strong><span>Προς επαλήθευση</span></div>
  <div><small>02 / ΑΝΟΙΧΤΑ ΑΙΤΗΜΑΤΑ</small><strong>{proposals.length}</strong><span>Προς αξιολόγηση</span></div>
  <div><small>03 / ΜΕΛΗ</small><strong>{members.length}</strong><span>Επαληθευμένα / πιο πρόσφατα 75</span></div>
  <div className={s.fund}><small>04 / ΕΝΕΡΓΟ ΤΑΜΕΙΟ</small><strong>€0</strong><span>Η συλλογή χρημάτων παραμένει κλειστή</span></div>
 </div>
 <section className={s.section}><div className={s.sectionTop}><div><p>01 / BUSINESS ONBOARDING</p><h2>Αιτήσεις επιχειρήσεων</h2></div><span>Μόνο ο Super Admin εγκρίνει νέες επιχειρήσεις</span></div>
 {applications.length===0?<div className={s.empty}>Δεν υπάρχουν εκκρεμείς αιτήσεις.</div>:<div className={s.stack}>{applications.map(a=><article className={s.card} key={a.id}><div><span className={s.tag}>ΑΙΤΗΣΗ · {new Date(a.created_at).toLocaleDateString("el-GR")}</span><h3>{a.business_name}</h3><p className={s.meta}>{a.representative_name} · {a.location} · {a.sector}</p><p className={s.body}>{a.description}</p><p className={s.meta}>Αριθμός ΓΕΜΗ: {a.registry_number||"Δεν δόθηκε"}</p></div><div className={s.buttons}><Action csrf={p.csrfToken} kind="application" id={a.id} value="approve" label="Έγκριση"/><Action csrf={p.csrfToken} kind="application" id={a.id} value="reject" label="Απόρριψη" quiet/></div></article>)}</div>}</section>
 <section className={s.section}><div className={s.sectionTop}><div><p>02 / PROJECT GOVERNANCE</p><h2>Προτάσεις προς αξιολόγηση</h2></div><span>Χωρίς αυτοματοποιημένες εγκρίσεις χρηματοδότησης</span></div>
 {proposals.length===0?<div className={s.empty}>Δεν υπάρχουν προτάσεις σε αναμονή.</div>:<div className={s.stack}>{proposals.map(a=><article className={s.card} key={a.id}><div><span className={s.tag}>{a.category.toUpperCase()} · {new Date(a.created_at).toLocaleDateString("el-GR")}</span><h3>{a.title}</h3><p className={s.body}>{a.details}</p><p className={s.requested}>Αιτούμενο ποσό (όχι εκταμίευση): {money(a.amount_cents)}</p></div><div className={s.buttons}><Action csrf={p.csrfToken} kind="proposal" id={a.id} value="approve" label="Επιλεξιμότητα ✓"/><Action csrf={p.csrfToken} kind="proposal" id={a.id} value="reject" label="Απόρριψη" quiet/></div></article>)}</div>}</section>
 <section className={s.section}><div className={s.sectionTop}><div><p>03 / MEMBER RIGHTS</p><h2>Επαληθευμένα μέλη</h2></div><span>Δικαίωμα ψήφου ≠ πρόσβαση στη διαχείριση</span></div>
 {members.length===0?<div className={s.empty}>Δεν υπάρχουν εγκεκριμένα μέλη.</div>:<div className={s.stack}>{members.map(m=><div className={s.member} key={m.user_id}><div><strong>{m.user_id}</strong><span>Κατάσταση: {m.status} · Ψήφος: {m.voting_eligible?"Ενεργή":"Ανενεργή"}</span></div><Action csrf={p.csrfToken} kind="voting" id={m.user_id} value={m.voting_eligible?"no":"yes"} label={m.voting_eligible?"Απενεργοποίηση ψήφου":"Ενεργοποίηση ψήφου"} quiet/></div>)}</div>}</section>
 <section className={s.section}><div className={s.sectionTop}><div><p>04 / CYCLE CONTROL</p><h2>Ιδρυτικός κύκλος αναγκών</h2></div><span>Αποκλειστικά μη χρηματοδοτικός</span></div>
 <div className={s.cycle}><div><strong>{cycle?.title||"Δεν υπάρχει κύκλος"}</strong><p>Στάδιο: {cycle?.status||"—"} · Χρηματοδοτικός προϋπολογισμός: €0 · Ενεργοποίηση χρημάτων: Όχι</p></div>{cycle&&<div className={s.buttons}>{cycle.status==="preparing"&&<Action csrf={p.csrfToken} kind="cycle" value="submissions" label="Έναρξη υποβολών"/>}{cycle.status==="submissions"&&<Action csrf={p.csrfToken} kind="cycle" value="review" label="Έναρξη ελέγχου"/>}{cycle.status==="review"&&<><Action csrf={p.csrfToken} kind="cycle" value="submissions" label="Επανέναρξη υποβολών" quiet/><Action csrf={p.csrfToken} kind="cycle" value="voting" label="Άνοιγμα ψήφων"/></>}{cycle.status==="voting"&&<Action csrf={p.csrfToken} kind="cycle" value="closed" label="Κλείσιμο κύκλου"/>}</div>}</div></section>
 <p className={s.disclaimer}>Οι ενέργειες καταγράφονται με το εσωτερικό αναγνωριστικό του ΚΟΝΤΑ ΜΟΥ Super Admin. Δεν παρέχεται πρόσβαση μέσω Supabase administrator ή ξεχωριστού λογαριασμού ΜΑΖΙ.</p>
 </div></main>;
}
