import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../lib/admin-session";
import {isMaziSuperAdmin} from "../../../../lib/mazi-superadmin";
import {maziCommunityReports,type MaziCommunityReport} from "../../../../lib/mazi-community-moderation";
import {moderateMaziCommunityAction} from "./actions";
import s from "../mazi.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Εποπτεία κοινότητας",robots:{index:false,follow:false}};
const label=(type:MaziCommunityReport["resource_type"])=>
 ({listing:"Αγορά",thread:"Θέμα φόρουμ",reply:"Απάντηση",chat:"Livechat"})[type];
export default async function MaziModeration({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><section className={s.denied}>
  <h1>Πρόσβαση μόνο για τον Super Admin</h1><Link href="/admin">Επιστροφή</Link>
 </section></main>;
 let reports:MaziCommunityReport[]|null=null;
 try{reports=await maziCommunityReports(principal);}catch{}
 if(!reports)return <main className={s.stage}><div className={s.shell}>
  <h1>Η διαχείριση κοινότητας δεν είναι διαθέσιμη.</h1>
  <p>Δεν εμφανίζουμε μη επαληθευμένα στοιχεία ούτε πραγματοποιούμε αυτοματοποιημένες ενέργειες.</p>
  <Link href="/admin/mazi">Πίσω στη διαχείριση</Link>
 </div></main>;
 const {notice}=await searchParams;
 const open=reports.filter(r=>r.status==="open");
 return <main className={s.stage}><div className={s.shell}>
  <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>↗</span><span>ΕΠΟΠΤΕΙΑ ΚΟΙΝΟΤΗΤΑΣ</span></div>
  <header className={s.hero}><div>
   <p className={s.kicker}>SUPER ADMIN · ΧΕΙΡΟΚΙΝΗΤΕΣ ΑΠΟΦΑΣΕΙΣ</p>
   <h1>ΜΑΖΙ<span className={s.dot}>.</span><em>Εποπτεία κοινότητας</em></h1>
   <p className={s.subtitle}>Αναφορές καταχωρίσεων, συζητήσεων, απαντήσεων και συνομιλιών. Καμία αυτόματη διαγραφή ή ποινή. Κάθε απόφαση απαιτεί αιτιολογία και καταγράφεται στο ιστορικό.</p>
  </div><div className={s.lock}><strong>ΑΝΟΙΧΤΕΣ ΑΝΑΦΟΡΕΣ</strong><strong style={{fontSize:32}}>{open.length}</strong><Link href="/admin/mazi/operations">Έλεγχος λειτουργίας ↗</Link></div></header>
  {notice==="saved"?<p className={s.notice} role="status">Η απόφαση καταχωρίστηκε και προστέθηκε στο αμετάβλητο ιστορικό.</p>:null}
  {notice==="failed"||notice==="invalid"?<p className={s.notice} role="alert">Η απόφαση δεν καταχωρίστηκε. Έλεγξε την αναφορά και την αιτιολογία.</p>:null}
  <section className={s.section}><div className={s.sectionTop}><div><p>01 / QUEUE</p><h2>Αναφορές προς εξέταση</h2></div><span>Χειροκίνητη εξέταση από τον μόνο διαχειριστή</span></div>
  {open.length===0?<div className={s.empty}>Δεν υπάρχουν ανοιχτές αναφορές.</div>:
   <div className={s.stack}>{open.map(r=><article className={s.card} key={r.id}>
    <div style={{flex:1,minWidth:220}}><span className={s.tag}>{label(r.resource_type)} · {new Date(r.created_at).toLocaleString("el-GR",{timeZone:"Europe/Athens"})}</span>
    <h3>{r.subject}</h3><p className={s.body}><strong>Αιτιολογία μέλους:</strong> {r.reason}</p>
    <p className={s.meta}>Αναφορά: {r.id}</p></div>
    <form action={moderateMaziCommunityAction} className={s.action} style={{display:"grid",gap:12,minWidth:265,maxWidth:370}}>
     <input type="hidden" name="csrf" value={principal.csrfToken}/>
     <input type="hidden" name="report_id" value={r.id}/>
     <label className={s.tag} htmlFor={"reason-"+r.id}>ΑΙΤΙΟΛΟΓΙΑ ΑΠΟΦΑΣΗΣ · 20–1.000 ΧΑΡΑΚΤΗΡΕΣ</label>
     <textarea name="reason" id={"reason-"+r.id} required minLength={20} maxLength={1000} rows={4}
      style={{font:"inherit",padding:12,border:"1px solid #afc0b1"}}/>
     <div className={s.buttons}>
      <button className={s.primary} type="submit" name="decision" value="hide">Απόκρυψη περιεχομένου</button>
      <button className={s.secondary} type="submit" name="decision" value="dismiss">Απόρριψη αναφοράς</button>
     </div>
    </form></article>)}</div>}
  </section>
  <section className={s.section}><div className={s.sectionTop}><div><p>02 / HISTORY</p><h2>Πρόσφατες αποφάσεις</h2></div></div>
  <div className={s.stack}>{reports.filter(r=>r.status!=="open").slice(0,30).map(r=><div className={s.member} key={r.id}>
   <div><strong>{label(r.resource_type)}: {r.subject}</strong><span>{new Date(r.created_at).toLocaleDateString("el-GR")}</span></div>
   <span className={s.tag}>{r.status==="hidden"?"ΚΡΥΦΤΗΚΕ":"ΑΠΟΡΡΙΦΘΗΚΕ"}</span>
  </div>)}{reports.every(r=>r.status==="open")?<p className={s.empty}>Δεν έχουν πραγματοποιηθεί αποφάσεις.</p>:null}</div>
  </section></div></main>;
}
