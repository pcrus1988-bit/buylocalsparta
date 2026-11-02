import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../../lib/admin-session";
import {getAdminPostgresRuntime} from "../../../../../lib/postgres-runtime";
import {isMaziSuperAdmin,marketplaceMaziActor} from "../../../../../lib/mazi-superadmin";
import s from "../../mazi.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Ετοιμότητα Αναπτυξιακού Ταμείου",robots:{index:false,follow:false}};
type Gate={paid_enabled:boolean;legal_approved_at:Date|null;accounting_approved_at:Date|null;
 payment_integration_verified_at:Date|null;activated_at:Date|null};
type Counter={verified_members:string;paid_members:string;active_financial_rounds:string;
 funded_ballots:string;accepted_awards:string;finance_entries:string;statement_reviews:string};
const number=(x:string)=>Number(x).toLocaleString("el-GR");
export default async function FundReadiness(){
 const session=await getAdminSession();
 if(!session)redirect("/admin/login");
 if(!isMaziSuperAdmin(session))return <main className={s.stage}><div className={s.shell}><h1>Μόνο Super Admin</h1></div></main>;
 try{
  await marketplaceMaziActor(session);
  const db=getAdminPostgresRuntime().nativePool;
  const [gateQuery,metricsQuery,financeQuery]=await Promise.all([
   db.query<Gate>("select paid_enabled,legal_approved_at,accounting_approved_at,"+
    "payment_integration_verified_at,activated_at from public.mazi_service_release_state where id=true"),
   db.query<Counter>(
    "select "+
    "(select count(*)::text from public.mazi_members where status='verified' and identity_verified_at is not null) verified_members,"+
    "(select count(distinct member_user_id)::text from public.mazi_service_periods "+
    " where starts_at<=now() and ends_at>now() and length(btrim(verified_invoice_ref))>=8) paid_members,"+
    "(select count(*)::text from public.mazi_cycles where kind='fund_allocation' and finance_activated=true) active_financial_rounds,"+
    "(select count(*)::text from public.mazi_fund_ballots) funded_ballots,"+
    "(select count(*)::text from public.mazi_grant_award_acknowledgements where affirmatively_accepted=true) accepted_awards,"+
    "(select count(*)::text from public.mazi_fund_ledger) finance_entries,"+
    "(select count(*)::text from public.mazi_fund_reconciliations) statement_reviews"),
   db.query<{report:unknown}>("select public.mazi_fund_public_report() as report")
  ]);
  const gate=gateQuery.rows[0]||null;
  const counts=metricsQuery.rows[0];
  const raw=financeQuery.rows[0]?.report;
  const report=raw!==null&&typeof raw==="object"&&!Array.isArray(raw)?
   raw as Record<string,unknown>:null;
  const value=report?.available_for_new_awards_cents;
  const available=typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:null;
  const readiness=[
   {title:"Επαληθευμένες επιχειρήσεις",value:number(counts.verified_members),
    ready:Number(counts.verified_members)>0,description:"ΓΕΜΗ και προσωπική εκπροσώπηση επιβεβαιωμένα."},
   {title:"Νόμιμη ενεργοποίηση πληρωμένης υπηρεσίας",value:gate?.paid_enabled?"Ενεργή":"Ανενεργή",
    ready:gate?.paid_enabled===true&&Boolean(gate.activated_at),
    description:"Εσωτερικά τεκμηριωμένα στάδια ελέγχου πριν τη συνδρομή."},
   {title:"Ενεργές, τιμολογημένες συνδρομές",value:number(counts.paid_members),
    ready:Number(counts.paid_members)>0&&gate?.paid_enabled===true,
    description:"Μόνο περίοδοι με πραγματικό παραστατικό και ενεργό χρονικό διάστημα."},
   {title:"Πραγματικός χρηματοδοτικός κύκλος",value:number(counts.active_financial_rounds),
    ready:Number(counts.active_financial_rounds)>0,
    description:"Ο ιδρυτικός κύκλος συλλογής αναγκών δεν μετρά ως χρηματοδότηση."},
   {title:"Συμφωνημένο διαθέσιμο για νέες ενισχύσεις",value:available===null?"Μη διαθέσιμο":
    new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(available/100),
    ready:available!==null&&available>0,
    description:"Προϋποθέτει πραγματικό λογιστικό και τραπεζικό έλεγχο."}
  ];
  return <main className={s.stage}><div className={s.shell}>
   <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>→</span>
    <Link href="/admin/mazi/fund">ΑΝΑΠΤΥΞΙΑΚΟ ΤΑΜΕΙΟ</Link><span>→</span>ΕΤΟΙΜΟΤΗΤΑ</div>
   <header className={s.hero}><div><p className={s.kicker}>OPERATIONS · REAL-WORLD READINESS</p>
    <h1>Τι λειτουργεί.<em>Τι δεν έχει ενεργοποιηθεί.</em></h1>
    <p className={s.subtitle}>Πραγματικά στοιχεία συνδρομών, ψηφοφορίας και οικονομικών ελέγχων. Η σελίδα δεν ενεργοποιεί συνδρομές, δεν δημιουργεί έσοδα ή χρηματοδοτικούς κύκλους και δεν αποτελεί νομική βεβαίωση.</p>
   </div><div className={s.lock}><strong>ΜΟΝΟ ΓΙΑ SUPER ADMIN</strong>
    <Link href="/admin/mazi/fund">Οικονομικός απολογισμός ↗</Link>
    <Link href="/admin/mazi/fund/governance">Ψηφοφορίες και έλεγχοι ↗</Link>
    <Link href="/admin/mazi/fund/allocations">Προτεινόμενες κατανομές ↗</Link>
   </div></header>
   <section className={s.section}><div className={s.sectionTop}><div>
     <p>01 / READINESS GATES</p><h2>Οι πραγματικές προϋποθέσεις</h2></div>
     <span>Καμία πλασματική ολοκλήρωση</span></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
    {readiness.map((x,i)=><article key={x.title} className={s.card} style={{display:"block",padding:24}}>
      <span className={s.tag}>{String(i+1).padStart(2,"0")} · {x.ready?"ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΤΟ ΣΥΣΤΗΜΑ":"ΕΚΚΡΕΜΕΙ"}</span>
      <h3 style={{fontSize:20,margin:"18px 0"}}>{x.title}</h3>
      <strong style={{fontSize:30,color:"#173f33"}}>{x.value}</strong>
      <p className={s.meta} style={{marginTop:14}}>{x.description}</p>
     </article>)}
    </div>
   </section>
   <section className={s.section}><div className={s.sectionTop}><div>
    <p>02 / PAID SERVICE EVIDENCE</p><h2>Αποδεικτικά πριν από οικονομική λειτουργία</h2></div></div>
    <div style={{display:"grid",gap:12}}>
    {[
     ["Εσωτερική καταγραφή νομικής έγκρισης",gate?.legal_approved_at],
     ["Εσωτερική καταγραφή λογιστικής έγκρισης",gate?.accounting_approved_at],
     ["Εσωτερική επαλήθευση σύνδεσης πληρωμών",gate?.payment_integration_verified_at],
     ["Χρονική στιγμή ενεργοποίησης πληρωμένων υπηρεσιών",gate?.activated_at]
    ].map(([label,date])=><div key={String(label)} className={s.card}
       style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,flexWrap:"wrap",padding:20}}>
      <span>{String(label)}</span><strong>{date instanceof Date?date.toLocaleString("el-GR",{timeZone:"Europe/Athens"}):"Δεν καταχωρίστηκε"}</strong>
     </div>)}
    </div>
    <p className={s.disclaimer}>Μια ημερομηνία εσωτερικού ελέγχου δεν αποδεικνύει από μόνη της ότι έχουν εκπληρωθεί όλες οι εξωτερικές ρυθμιστικές και φορολογικές υποχρεώσεις.</p>
   </section>
   <section className={s.section}><div className={s.sectionTop}><div><p>03 / PERMANENT AUDIT</p><h2>Αρχείο πραγματικών γεγονότων</h2></div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
    {[
     ["Καταχωρισμένα χρηματοδοτικά ψηφοδέλτια",counts.funded_ballots],
     ["Αποδεκτές ατομικές προσφορές",counts.accepted_awards],
     ["Εγγραφές στο λογιστικό βιβλίο",counts.finance_entries],
     ["Έλεγχοι συμφωνίας λογαριασμού",counts.statement_reviews]
    ].map(([label,n])=><div key={label} style={{padding:22,background:"#edf2e9"}}>
      <span className={s.meta}>{label}</span>
      <strong style={{fontSize:28,display:"block",marginTop:12}}>{number(n)}</strong>
     </div>)}
    </div>
    <p className={s.disclaimer}>Οι μηδενικοί μετρητές εκφράζουν πραγματική απουσία εγγραφών. Η απουσία τραπεζικής συμφωνίας σημαίνει μη διαθέσιμη επαλήθευση υπολοίπου, όχι μηδενικά διαθέσιμα.</p>
   </section>
  </div></main>;
 }catch{
  return <main className={s.stage}><div className={s.shell}><h1>Δεν επαληθεύθηκε η ετοιμότητα του Ταμείου</h1>
   <p>Η βάση ή τα δικαιώματα διαχείρισης δεν επέστρεψαν ασφαλή στοιχεία. Δεν έγινε καμία μεταβολή.</p>
   <Link href="/admin/mazi/fund">Επιστροφή</Link>
  </div></main>;
 }
}
