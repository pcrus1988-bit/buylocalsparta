import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../../../lib/admin-session";
import {getAdminPostgresRuntime} from "../../../../../../lib/postgres-runtime";
import {isMaziSuperAdmin,marketplaceMaziActor} from "../../../../../../lib/mazi-superadmin";
import {maziFundPublishProgress} from "../actions";
import s from "../../../mazi.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Έλεγχος αναπτυξιακών έργων",robots:{index:false,follow:false}};
type Accepted={id:string;cycle_id:string;proposal_title:string;cycle_title:string;assigned_amount_cents:string;
 acknowledged_at:Date;accepted_document_sha256:string};
type Update={id:string;offer_id:string;update_kind:string;public_summary:string;
 evidence_sha256:string|null;private_evidence_reference:string|null;
 supersedes_id:string|null;published_at:Date};
const money=(n:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(Number(n)/100);
const date=(d:Date)=>new Date(d).toLocaleString("el-GR",{timeZone:"Europe/Athens"});
export default async function MaziFundProjectAdmin({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}><h1>Μόνο Super Admin</h1></div></main>;
 try{
  await marketplaceMaziActor(principal);
  const db=getAdminPostgresRuntime().nativePool;
  const [offers,events]=await Promise.all([
   db.query<Accepted>(
    "select a.id::text,a.cycle_id::text,p.title as proposal_title,c.title as cycle_title, "+
    "a.assigned_amount_cents::text,ack.acknowledged_at,ack.accepted_document_sha256 "+
    "from public.mazi_grant_award_offers a "+
    "join public.mazi_grant_award_acknowledgements ack on ack.offer_id=a.id and ack.affirmatively_accepted=true "+
    "join public.mazi_proposals p on p.id=a.proposal_id "+
    "join public.mazi_cycles c on c.id=a.cycle_id "+
    "where c.kind='fund_allocation' and c.status='closed' and c.finance_activated=true "+
    "order by ack.acknowledged_at desc limit 100"),
   db.query<Update>(
    "select id::text,offer_id::text,update_kind,public_summary,evidence_sha256, "+
    "private_evidence_reference,supersedes_id::text,published_at "+
    "from public.mazi_fund_project_updates order by published_at desc,id desc limit 200")
  ]);
  const notice=(await searchParams).notice;
  return <main className={s.stage}><div className={s.shell}>
   <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>→</span>
    <Link href="/admin/mazi/fund">ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ</Link><span>→</span>ΕΛΕΓΧΟΣ ΕΡΓΩΝ</div>
   <header className={s.hero}><div><p className={s.kicker}>GROWTH FUND · VERIFIED IMPACT</p>
     <h1>Κάθε ενίσχυση.<em>Πραγματικό αποτύπωμα.</em></h1>
     <p className={s.subtitle}>Δημοσίευση μόνο πραγματικών οροσήμων και επαληθευμένων τεκμηρίων, μετά την αποδοχή της ατομικής σύμβασης. Κάθε διόρθωση διατηρεί το ιστορικό της. Δεν γίνεται πληρωμή από την παρούσα οθόνη.</p>
   </div><div className={s.lock}><strong>SUPER ADMIN ONLY</strong>
    <Link href="/admin/mazi/fund/governance">Διακυβέρνηση ↗</Link><Link href="/admin/mazi/fund/allocations">Προεπισκόπηση κατανομών ↗</Link>
    <a href="https://mazi.kontamou.site/fund/projects" target="_blank" rel="noreferrer">Δημόσια έργα ↗</a>
   </div></header>
   {notice==="published"?<p className={s.notice} role="status">Η αναφορά καταχωρίστηκε αμετάκλητα και είναι διαθέσιμη στο δημόσιο χρονολόγιο.</p>:null}
   <section className={s.section}><div className={s.sectionTop}><div><p>01 / ACCEPTED AWARDS</p><h2>Πραγματικά έργα με αποδεκτή προσφορά</h2></div>
    <span>{offers.rows.length} καταχωρισμένα έργα στο τρέχον παράθυρο</span></div>
    {offers.rows.length===0?<div className={s.empty}><strong>Δεν υπάρχουν ακόμη αποδεκτές οικονομικές ενισχύσεις.</strong>
     <p>Δεν εμφανίζονται εικονικά έργα, ανύπαρκτες δαπάνες ή επινοημένα ορόσημα. Η πρώτη αναφορά απαιτεί πραγματική προσφορά και καταγεγραμμένη αποδοχή.</p></div>:
     offers.rows.map(o=><article key={o.id} className={s.card} style={{display:"block",marginBottom:22}}>
      <span className={s.tag}>ΕΛΕΓΜΕΝΗ ΑΠΟΔΟΧΗ · {date(o.acknowledged_at)}</span>
      <h3>{o.proposal_title}</h3><p className={s.meta}>{o.cycle_title} · Προσφερόμενη ενίσχυση {money(o.assigned_amount_cents)} · Δεν αποτελεί απόδειξη εκταμίευσης.</p>
      <p className={s.meta} style={{overflowWrap:"anywhere"}}>Αποτύπωμα αποδεκτής σύμβασης: <code>{o.accepted_document_sha256}</code></p>
      <div style={{display:"grid",gap:12,marginTop:20}}>
       {events.rows.filter(e=>e.offer_id===o.id).map(e=><div key={e.id} style={{background:"#f2f6f1",padding:17,border:"1px solid #d7e5d3"}}>
        <span className={s.tag}>{e.update_kind} · {date(e.published_at)}</span>
        <p>{e.public_summary}</p>
        <p className={s.meta} style={{overflowWrap:"anywhere"}}>ID {e.id} · SHA-256: {e.evidence_sha256||"Δεν επισυνάφθηκε τεκμήριο"}
         {e.supersedes_id?" · διορθώνει "+e.supersedes_id:""}</p>
        {e.private_evidence_reference?<p className={s.meta}>Ιδιωτικός δείκτης τεκμηρίου: {e.private_evidence_reference}</p>:null}
        <form action={maziFundPublishProgress} style={{display:"grid",gap:9,maxWidth:630,marginTop:15}}>
         <input type="hidden" name="csrf" value={principal.csrfToken}/>
         <input type="hidden" name="offer_id" value={o.id}/>
         <input type="hidden" name="update_kind" value="correction"/>
         <input type="hidden" name="supersedes_id" value={e.id}/>
         <label>Διόρθωση δημόσιας αναφοράς (50–750 χαρακτήρες)
          <textarea name="public_summary" minLength={50} maxLength={750} rows={3} required style={{display:"block",width:"100%",padding:12}}/></label>
         <button className={s.secondary} type="submit">Δημοσίευση νέας διορθωτικής εγγραφής</button>
        </form>
       </div>)}
      </div>
      <form action={maziFundPublishProgress} style={{display:"grid",gap:11,maxWidth:670,marginTop:28,padding:24,background:"#edf2ea"}}>
       <input type="hidden" name="csrf" value={principal.csrfToken}/>
       <input type="hidden" name="offer_id" value={o.id}/>
       <strong>Νέα επαληθευμένη αναφορά υλοποίησης</strong>
       <label>Είδος αναφοράς
        <select name="update_kind" required defaultValue="milestone" style={{display:"block",padding:12,width:"100%"}}>
         <option value="milestone">Ορόσημο / στάδιο εργασιών</option>
         <option value="evidence_verified">Ελεγμένο παραστατικό ή αποδεικτικό</option>
         <option value="completion">Ολοκλήρωση με έγκυρη τεκμηρίωση</option>
        </select>
       </label>
       <label>Προσεκτικά ελεγμένο δημόσιο κείμενο (50–750 χαρακτήρες)
        <textarea name="public_summary" rows={5} minLength={50} maxLength={750} required placeholder="Τι έχει αποδειχθεί; Πότε; Τι εκκρεμεί; Μην αποκαλύπτετε προσωπικά ή τραπεζικά δεδομένα." style={{display:"block",padding:12,width:"100%"}}/></label>
       <label>SHA-256 ελεγμένου αρχείου · υποχρεωτικό για τεκμήριο ή ολοκλήρωση
        <input name="evidence_sha256" pattern="[a-fA-F0-9]{64}" maxLength={64} style={{display:"block",padding:12,width:"100%"}}/></label>
       <label>Εσωτερικός δείκτης ιδιωτικού τεκμηρίου (δεν δημοσιεύεται)
        <input name="private_evidence_reference" minLength={8} maxLength={300} style={{display:"block",padding:12,width:"100%"}}/></label>
       <p className={s.disclaimer}>Απαγορεύεται η εισαγωγή εικονικού οροσήμου. Επιβεβαιώστε τα αποδεικτικά πριν από την αμετάκλητη δημοσίευση. Οι πραγματικές εκταμιεύσεις εμφανίζονται αποκλειστικά στον οικονομικό απολογισμό.</p>
       <button className={s.primary} type="submit">Αμετάκλητη δημόσια καταχώριση</button>
      </form>
     </article>)}
   </section>
   <p className={s.disclaimer}>Η αποδοχή μιας προσφοράς δεν είναι λογιστική δαπάνη. Η δημοσίευση ενός οροσήμου δεν δημιουργεί από μόνη της μεταφορά χρημάτων, απαίτηση, παραστατικό ή οικονομική συμφωνία.</p>
  </div></main>;
 }catch{
  return <main className={s.stage}><div className={s.shell}><h1>Η εποπτεία έργων δεν είναι διαθέσιμη</h1>
   <p>Δεν διατίθεται επαληθευμένη πρόσβαση. Δεν εκτελέστηκε ενέργεια.</p>
   <Link href="/admin/mazi/fund">Επιστροφή στον οικονομικό έλεγχο</Link>
  </div></main>;
 }
}
