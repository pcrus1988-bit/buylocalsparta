import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../../lib/admin-session";
import {getAdminPostgresRuntime} from "../../../../../lib/postgres-runtime";
import {isMaziSuperAdmin,marketplaceMaziActor} from "../../../../../lib/mazi-superadmin";
import {maziFundGovernanceAction} from "../actions";
import s from "../../mazi.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"MAZI · Χρηματοδοτική διακυβέρνηση",robots:{index:false,follow:false}};
type Round={id:string;slug:string;title:string;status:string;kind:string;finance_activated:boolean;
 funding_budget_cents:string;starts_at:Date;ends_at:Date;quorum_percent:number|null;
 max_awards:number|null;minimum_support_votes:number|null;project_cap_cents:string|null;
 published_policy_sha256:string|null;total_ballots:string|null;valid_ballots:string|null;
 invalidated_ballots:string|null;electorate_count:string|null;finalized_at:Date|null};
type Project={id:string;cycle_id:string;title:string;status:string;details:string;
 amount_cents:string;minimum_useful_cents:string|null;first_time_support_request:boolean;
 created_at:Date;review_reason:string|null};
type Ballot={id:string;cycle_id:string;created_at:Date;invalidated:boolean;reason:string|null};
type Tally={cycle_id:string;title:string;supporting_ballots:string};
const eur=(cents:string)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(Number(cents)/100);
const dt=(t:Date)=>new Date(t).toLocaleString("el-GR",{timeZone:"Europe/Athens"});
function Fields({csrf,cycleId,kind,recordId}:{csrf:string;cycleId:string;kind:string;recordId?:string}){
 return <><input type="hidden" name="csrf" value={csrf}/><input type="hidden" name="cycle_id" value={cycleId}/>
  <input type="hidden" name="kind" value={kind}/>{recordId?<input type="hidden" name="record_id" value={recordId}/>:null}</>;
}
export default async function MaziFundGovernance({searchParams}:{searchParams:Promise<{notice?:string}>}){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}><h1>Μόνο Super Admin</h1></div></main>;
 try{
  await marketplaceMaziActor(principal);
  const db=getAdminPostgresRuntime().nativePool;
  const [cycles,projects,ballots,results]=await Promise.all([
   db.query<Round>("select c.id::text,c.slug,c.title,c.status,c.kind,c.finance_activated,c.funding_budget_cents::text, "+
    "c.starts_at,c.ends_at,r.quorum_percent,r.max_awards,r.minimum_support_votes,r.project_cap_cents::text, "+
    "r.published_policy_sha256, f.total_ballots::text,f.valid_ballots::text,f.invalidated_ballots::text, "+
    "f.electorate_count::text,f.finalized_at "+
    "from public.mazi_cycles c left join public.mazi_fund_cycle_rules r on r.cycle_id=c.id "+
    "left join public.mazi_fund_round_finalizations f on f.cycle_id=c.id "+
    "where c.kind='fund_allocation' order by c.created_at desc limit 30"),
   db.query<Project>("select p.id::text,p.cycle_id::text,p.title,p.status,p.details,p.amount_cents::text, "+
    "p.minimum_useful_cents::text,p.first_time_support_request,p.created_at,p.review_reason "+
    "from public.mazi_proposals p join public.mazi_cycles c on c.id=p.cycle_id "+
    "where c.kind='fund_allocation' order by p.first_time_support_request desc,p.created_at limit 150"),
   db.query<Ballot>("select b.id::text,b.cycle_id::text,b.created_at, "+
    "(i.id is not null) invalidated,i.reason "+
    "from public.mazi_fund_ballots b "+
    "left join public.mazi_fund_ballot_invalidations i on i.ballot_id=b.id "+
    "order by b.created_at desc limit 100"),
   db.query<Tally>("select r.cycle_id::text,p.title,r.supporting_ballots::text "+
    "from public.mazi_fund_vote_results r join public.mazi_proposals p on p.id=r.proposal_id "+
    "order by r.supporting_ballots desc,p.title limit 150")
  ]);
  const notice=(await searchParams).notice;
  return <main className={s.stage}><div className={s.shell}>
   <div className={s.breadcrumb}><Link href="/admin">ADMIN</Link><span>→</span>
    <Link href="/admin/mazi">ΜΑΖΙ</Link><span>→</span><Link href="/admin/mazi/fund">ΤΑΜΕΙΟ</Link><span>→</span>
    ΔΙΑΚΥΒΕΡΝΗΣΗ</div>
   <header className={s.hero}><div><p className={s.kicker}>FUND GOVERNANCE · AUDITABLE OPERATIONS</p>
    <h1>Κανόνες.<em>Επαληθευμένες αποφάσεις.</em></h1>
    <p className={s.subtitle}>Επιλεξιμότητα, προδημοσιευμένοι κανόνες, πάγωμα εκλογικού σώματος ανά ΓΕΜΗ, αιτιολογημένες αποφάσεις και οριστικοποίηση. Οι ενέργειες δεν εισπράττουν ούτε εκταμιεύουν χρήματα.</p>
   </div><div className={s.lock}><strong>SUPER ADMIN ONLY</strong><span>Η παρούσα σελίδα δεν μπορεί να ενεργοποιήσει χρηματοδότηση.</span>
    <Link href="/admin/mazi/fund">Οικονομική κατάσταση ↗</Link><Link href="/admin/mazi/fund/projects">Έλεγχος έργων ↗</Link><Link href="/admin/mazi/fund/allocations">Προεπισκόπηση κατανομών ↗</Link><Link href="/admin/mazi/fund/readiness">Πραγματική ετοιμότητα Ταμείου ↗</Link><a href="https://mazi.kontamou.site/fund/results" target="_blank" rel="noreferrer">Δημόσια αποτελέσματα ↗</a></div></header>
   {notice==="updated"?<div className={s.notice} role="status">Η αλλαγή καταχωρίστηκε με μόνιμο ίχνος ελέγχου.</div>:null}
   <section className={s.section}><div className={s.sectionTop}><div><p>01 / FUNDING ROUNDS</p><h2>Πραγματικοί χρηματοδοτικοί κύκλοι</h2></div><span>Δεν δημιουργούνται εικονικοί κύκλοι, ποσά ή μέλη.</span></div>
   {!cycles.rows.length?<div className={s.empty}><strong>Δεν έχουν ενεργοποιηθεί χρηματοδοτικοί κύκλοι.</strong>
    <p>Ο ιδρυτικός κύκλος συγκέντρωσης αναγκών παραμένει ξεχωριστός, χωρίς χρήματα. Η εφαρμογή δεν παρακάμπτει τη νόμιμη οικονομική ενεργοποίηση.</p></div>:
    cycles.rows.map(c=><article key={c.id} className={s.card} style={{display:"block",marginBottom:18}}>
     <span className={s.tag}>{c.slug} · {c.status} · {c.finance_activated?"ΕΝΕΡΓΟΣ ΧΡΗΜΑΤΟΔΟΤΙΚΑ":"ΑΝΕΝΕΡΓΟΣ ΧΡΗΜΑΤΟΔΟΤΙΚΑ"}</span>
     <h3>{c.title}</h3><p className={s.meta}>Προϋπολογισμός: {eur(c.funding_budget_cents)} · Περίοδος {dt(c.starts_at)} — {dt(c.ends_at)}</p>
     {c.published_policy_sha256?<p className={s.meta} style={{overflowWrap:"anywhere"}}>Αμετάβλητο αποτύπωμα κανόνων: <code>{c.published_policy_sha256}</code> · Απαρτία {c.quorum_percent}% · Μέγιστη ενίσχυση {c.project_cap_cents?eur(c.project_cap_cents):"—"} · Έως {c.max_awards} έργα · Ελάχιστη στήριξη {c.minimum_support_votes} ψήφοι</p>:<p className={s.meta}>Κανόνες δεν έχουν οριστικοποιηθεί για αυτόν τον κύκλο.</p>}
     {c.finalized_at?<div style={{padding:"18px 0"}}>
      <strong>ΟΡΙΣΤΙΚΟΠΟΙΗΘΗΚΕ: {dt(c.finalized_at)}</strong>
      <p>Εκλογικό σώμα: {c.electorate_count} · Ψηφοδέλτια: {c.total_ballots} · Έγκυρα: {c.valid_ballots} · Ακυρώσεις: {c.invalidated_ballots}</p>
      {results.rows.filter(x=>x.cycle_id===c.id).map((r,i)=><p key={i} className={s.meta}>{r.title}: {r.supporting_ballots} έγκυρα ψηφοδέλτια</p>)}
     </div>:null}
     {c.finance_activated&&c.status==="review"&&!c.published_policy_sha256?
      <form action={maziFundGovernanceAction} style={{display:"grid",gap:11,maxWidth:580,padding:22,background:"#edf1e8"}}>
       <Fields csrf={principal.csrfToken} cycleId={c.id} kind="publish_rules"/>
       <strong>Κλείδωμα εκ των προτέρων των κανόνων</strong>
       <label>Ελάχιστη απαρτία (%)<input name="quorum_percent" type="number" min={1} max={100} required className={s.primary} style={{background:"white",color:"#153d2c",width:"100%"}}/></label>
       <label>Ελάχιστες ψήφοι στήριξης<input name="minimum_support_votes" type="number" min={1} required style={{display:"block",padding:12,width:"100%"}}/></label>
       <label>Μέγιστος αριθμός έργων<input name="max_awards" type="number" min={1} max={1000} required style={{display:"block",padding:12,width:"100%"}}/></label>
       <label>Μέγιστο ποσό ανά έργο σε λεπτά του ευρώ<input name="project_cap_cents" type="number" min={1} max={20000000} required style={{display:"block",padding:12,width:"100%"}}/></label>
       <label>Πλήρες δημόσιο κείμενο προδημοσιευμένων κανόνων (400–20.000 χαρακτήρες)<textarea name="policy_text" minLength={400} maxLength={20000} rows={12} required placeholder="Δημοσιευμένοι όροι: προθεσμίες, μέλη και συγκρούσεις συμφερόντων, ελάχιστη στήριξη, απαρτία, ισοβαθμίες, κατανομή και διαδικασία ενστάσεων." style={{display:"block",padding:12,width:"100%",font:"inherit"}}/></label>
       <p className={s.disclaimer}>Οι κανόνες δημοσιεύονται πριν από την έναρξη ψηφοφορίας και δεν μπορούν να τροποποιηθούν αργότερα.</p>
       <button type="submit" className={s.primary}>Οριστική δημοσίευση κανόνων</button>
      </form>:null}
     {c.finance_activated&&c.status==="review"&&c.published_policy_sha256?
      <form action={maziFundGovernanceAction} style={{marginTop:15}}>
       <Fields csrf={principal.csrfToken} cycleId={c.id} kind="open_voting"/>
       <button className={s.primary} type="submit">Πάγωμα εκλογικού σώματος & άνοιγμα ψηφοφορίας</button>
      </form>:null}
     {c.finance_activated&&c.status==="voting"?
      <form action={maziFundGovernanceAction} style={{marginTop:15}}>
       <Fields csrf={principal.csrfToken} cycleId={c.id} kind="finalize"/>
       <p>Οριστικοποίηση επιτρέπεται μόνο μετά από {dt(c.ends_at)}. Καμία νέα ψήφος δεν εισέρχεται μετά το κλείσιμο.</p>
       <button className={s.primary} type="submit" disabled={Date.now()<new Date(c.ends_at).getTime()}>Κλείδωμα αποτελεσμάτων & δημοσίευση</button>
      </form>:null}
     <h4 style={{fontSize:18,marginTop:32}}>Αιτήματα αυτού του κύκλου</h4>
     {!projects.rows.some(x=>x.cycle_id===c.id)?<p className={s.meta}>Χωρίς πραγματικά αιτήματα.</p>:
      projects.rows.filter(x=>x.cycle_id===c.id).map(p=><article key={p.id} style={{padding:20,background:"#fff",border:"1px solid #d2ddd3",marginTop:10}}>
       <span className={s.tag}>{p.first_time_support_request?"ΠΡΩΤΗ ΑΙΤΗΣΗ":"ΕΠΑΝΑΛΗΠΤΙΚΗ"} · {p.status}</span>
       <h4 style={{fontSize:21,margin:"12px 0"}}>{p.title}</h4>
       <p className={s.body}>{p.details}</p>
       <p><strong>{eur(p.amount_cents)}</strong> αιτούμενο · ελάχιστο χρήσιμο {p.minimum_useful_cents?eur(p.minimum_useful_cents):"—"}</p>
       {p.review_reason?<p className={s.meta}>Αιτιολογία: {p.review_reason}</p>:null}
       {c.finance_activated&&c.status==="review"&&p.status==="submitted"?
        <form action={maziFundGovernanceAction} style={{display:"grid",gap:9,maxWidth:520}}>
         <input type="hidden" name="csrf" value={principal.csrfToken}/>
         <input type="hidden" name="cycle_id" value={c.id}/><input type="hidden" name="record_id" value={p.id}/>
         <textarea name="reason" rows={3} minLength={20} maxLength={1000} required placeholder="Αιτιολογία του ελέγχου (20–1000 χαρακτήρες)" style={{padding:12}}/>
         <div className={s.buttons}>
          <button type="submit" name="kind" value="review_approve" className={s.primary}>Έγκριση για ψηφοφορία</button>
          <button type="submit" name="kind" value="review_reject" className={s.secondary}>Απόρριψη με αιτιολογία</button>
         </div>
        </form>:null}
      </article>)}
     {c.finance_activated&&c.status==="voting"&&ballots.rows.some(b=>b.cycle_id===c.id)?
      <section style={{marginTop:28}}><h4>Ψηφοδέλτια · ακυρώσεις</h4>
       {ballots.rows.filter(b=>b.cycle_id===c.id).map(b=><div key={b.id} style={{padding:"14px 0",borderBottom:"1px solid #dde1d6"}}>
        <span className={s.meta}>{b.id} · {dt(b.created_at)} · {b.invalidated?"ΑΚΥΡΩΜΕΝΟ":"ΕΝΕΡΓΟ"}</span>
        {b.invalidated?<p className={s.meta}>{b.reason}</p>:<form action={maziFundGovernanceAction} style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
         <Fields csrf={principal.csrfToken} cycleId={c.id} kind="invalidate" recordId={b.id}/>
         <textarea name="reason" minLength={20} maxLength={1000} required placeholder="Τεκμηριωμένη αιτία ακύρωσης" rows={2} style={{flex:"1 1 250px",padding:10}}/>
         <button type="submit" className={s.secondary}>Ακύρωση χωρίς διαγραφή</button>
        </form>}
       </div>)}
      </section>:null}
    </article>)}
   </section>
   <p className={s.disclaimer}>Οι αποφάσεις δημιουργούν καταγραφές ελέγχου. Δεν γίνονται συνδρομές, χρεώσεις, συμβάσεις ή εκταμιεύσεις από αυτή τη σελίδα.</p>
  </div></main>;
 }catch{return <main className={s.stage}><div className={s.shell}><h1>Η διακυβέρνηση δεν είναι διαθέσιμη</h1>
  <p>Δεν έγινε καμία ενέργεια. Δεν προβάλλονται μη επαληθευμένα στοιχεία.</p>
  <Link href="/admin/mazi/fund">Επιστροφή στο Ταμείο</Link></div></main>;}
}
