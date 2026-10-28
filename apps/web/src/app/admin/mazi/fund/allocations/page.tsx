import Link from "next/link";
import {redirect} from "next/navigation";
import {getAdminSession} from "../../../../../../lib/admin-session";
import {getAdminPostgresRuntime} from "../../../../../../lib/postgres-runtime";
import {isMaziSuperAdmin,marketplaceMaziActor} from "../../../../../../lib/mazi-superadmin";
import {
 MAZI_FUND_ALLOCATION_VERSION,previewFundAllocation,type FundCandidate,type FundAllocationRules
} from "../../../../../../lib/mazi-fund-allocation-policy";
import s from "../../../mazi.module.css";
export const dynamic="force-dynamic";
export const metadata={title:"ΜΑΖΙ · Κατανομή αναπτυξιακών ενισχύσεων",robots:{index:false,follow:false}};
type RuleCycle={id:string;slug:string;title:string;funding_budget_cents:string;
 project_cap_cents:string;quorum_percent:number;max_awards:number;
 minimum_support_votes:number;allocation_policy_version:string;
 electorate_count:string;valid_ballots:string;finalized_at:Date};
type Proposal={id:string;cycle_id:string;title:string;amount_cents:string;
 minimum_useful_cents:string|null;created_at:Date;status:string;
 first_time_support_request:boolean;supporting_ballots:string|null};
type Offered={cycle_id:string;total:string;sum_cents:string};
type Book={report:unknown};
const safe=(value:string|number):number|null=>{
 const n=Number(value);
 return Number.isSafeInteger(n)&&n>=0?n:null;
};
const money=(n:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(n/100);
export default async function FundAllocationAdmin(){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 if(!isMaziSuperAdmin(principal))return <main className={s.stage}><div className={s.shell}><h1>Μόνο Super Admin</h1></div></main>;
 try{
  await marketplaceMaziActor(principal);
  const db=getAdminPostgresRuntime().nativePool;
  const [cycles,proposals,offers,book]=await Promise.all([
   db.query<RuleCycle>(
    "select c.id::text,c.slug,c.title,c.funding_budget_cents::text, "+
    "r.project_cap_cents::text,r.quorum_percent,r.max_awards,r.minimum_support_votes, "+
    "r.allocation_policy_version,f.electorate_count::text,f.valid_ballots::text,f.finalized_at "+
    "from public.mazi_cycles c "+
    "join public.mazi_fund_round_finalizations f on f.cycle_id=c.id "+
    "join public.mazi_fund_cycle_rules r on r.cycle_id=c.id "+
    "where c.kind='fund_allocation' and c.status='closed' and c.finance_activated=true "+
    "order by f.finalized_at desc limit 30"),
   db.query<Proposal>(
    "select p.id::text,p.cycle_id::text,p.title,p.amount_cents::text, "+
    "p.minimum_useful_cents::text,p.created_at,p.status,p.first_time_support_request, "+
    "v.supporting_ballots::text "+
    "from public.mazi_proposals p "+
    "join public.mazi_fund_round_finalizations f on f.cycle_id=p.cycle_id "+
    "left join public.mazi_fund_vote_results v on v.proposal_id=p.id and v.cycle_id=p.cycle_id "+
    "where p.status='approved' order by p.created_at,p.id"),
   db.query<Offered>(
    "select cycle_id::text,count(*)::text as total, "+
    "coalesce(sum(assigned_amount_cents),0)::text as sum_cents "+
    "from public.mazi_grant_award_offers group by cycle_id"),
   db.query<Book>("select public.mazi_fund_public_report() as report")
  ]);
  const report=book.rows[0]?.report;
  const record=report!==null&&typeof report==="object"&&!Array.isArray(report)
   ?report as Record<string,unknown>:null;
  const rawAvailable=record?.available_for_new_awards_cents;
  const available=(typeof rawAvailable==="number"&&Number.isSafeInteger(rawAvailable)
   &&rawAvailable>=0)?rawAvailable:null;
  return <main className={s.stage}><div className={s.shell}>
   <div className={s.breadcrumb}><Link href="/admin/mazi">ΜΑΖΙ</Link><span>→</span>
    <Link href="/admin/mazi/fund">ΤΑΜΕΙΟ</Link><span>→</span>ΚΑΤΑΝΟΜΕΣ</div>
   <header className={s.hero}><div><p className={s.kicker}>SUPER ADMIN · EXPLAINABLE ALLOCATION</p>
    <h1>Από την ψήφο.<em>Στη διαφανή πρόταση.</em></h1>
    <p className={s.subtitle}>Μη δεσμευτική προεπισκόπηση με πλήρη λογική κατανομής, οικονομικό όριο, δικαιολογητικά και αιτιολογία αποκλεισμών. Δεν εκδίδεται προσφορά, σύμβαση ή εντολή πληρωμής.</p></div>
    <div className={s.lock}><strong>READ-ONLY FINANCIAL CONTROL</strong>
     <Link href="/admin/mazi/fund">Οικονομικός έλεγχος ↗</Link>
     <Link href="/admin/mazi/fund/governance">Ψηφοφορίες ↗</Link>
     <Link href="/admin/mazi/fund/projects">Εποπτεία υλοποίησης ↗</Link>
    </div></header>
   <section className={s.section}><div className={s.sectionTop}><div>
    <p>01 / EVIDENCE-BASED ALLOCATION</p><h2>Επαληθευμένο διαθέσιμο έναντι τελικών ψηφοφοριών</h2></div>
    <span>Πολιτική: {MAZI_FUND_ALLOCATION_VERSION}</span></div>
    {available===null?<div className={s.empty} role="alert"><strong>Δεν υπάρχει επαληθευμένο διαθέσιμο προς νέα κατανομή.</strong>
     <p>Η κατανομή παραμένει αποκλεισμένη μέχρι να επιβεβαιωθεί η οικονομική συμφωνία. Η έλλειψη ποσού δεν μετατρέπεται σε μηδενική ή εικονική χρηματοδότηση.</p>
    </div>:<div className={s.card} style={{display:"block",padding:25}}>
      <span className={s.tag}>ΔΙΑΘΕΣΙΜΟ ΕΛΕΓΜΕΝΗΣ ΣΥΜΦΩΝΙΑΣ</span>
      <h3 style={{fontSize:35,margin:"14px 0"}}>{money(available)}</h3>
      <p>Ποσό για νέες ενισχύσεις μετά από λογιστικά καταχωρισμένες εκκρεμείς προσφορές. Δεν αντικαθιστά έλεγχο νόμιμης πραγματικής διαθεσιμότητας ούτε εγκρίνει αυτόματα εκταμίευση.</p>
    </div>}
    {!cycles.rows.length?<div className={s.empty} style={{marginTop:22}}><strong>Δεν υπάρχουν οριστικοποιημένοι πραγματικοί χρηματοδοτικοί κύκλοι.</strong>
     <p>Δεν παράγουμε τεχνητούς νικητές, ψήφους ή προϋπολογισμούς. Ο ιδρυτικός μη οικονομικός κύκλος δεν συμμετέχει.</p></div>:
     cycles.rows.map(c=>{
      const existing=offers.rows.find(o=>o.cycle_id===c.id);
      const alreadyCommitted=Number(existing?.total||0)>0;
      const candidates=proposals.rows.filter(p=>p.cycle_id===c.id);
      const budget=safe(c.funding_budget_cents),cap=safe(c.project_cap_cents),
       electorate=safe(c.electorate_count),valid=safe(c.valid_ballots);
      let result:ReturnType<typeof previewFundAllocation>|null=null;
      let error:string|null=null;
      if(alreadyCommitted)error="Υπάρχουν ήδη εκδοθείσες προσφορές. Αποκλείεται νέα αυτόματη πρόταση για τον ίδιο κύκλο.";
      else if(available===null)error="Λείπει οικονομική συμφωνία και διαθέσιμο κεφάλαιο.";
      else if(c.allocation_policy_version!==MAZI_FUND_ALLOCATION_VERSION)
       error="Η έκδοση του προδημοσιευμένου αλγορίθμου δεν συμφωνεί με τη διαθέσιμη υλοποίηση.";
      else if([budget,cap,electorate,valid].some(x=>x===null))
       error="Μη ασφαλή ποσά ή αθροίσματα στον κύκλο.";
      else if(!candidates.length||candidates.length>1000||candidates.some(p=>
        p.supporting_ballots===null||p.minimum_useful_cents===null||
        safe(p.amount_cents)===null||safe(p.minimum_useful_cents)===null||
        safe(p.supporting_ballots)===null))
       error="Η καταμέτρηση ή οι απαιτήσεις έργων είναι ελλιπείς.";
      else{
       try{
        const rules:FundAllocationRules={budgetCents:Math.min(budget!,available),
         projectCapCents:cap!,quorumPercent:c.quorum_percent,maxAwards:c.max_awards,
         minimumSupportingVotes:c.minimum_support_votes,eligibleBusinesses:electorate!,
         validBallots:valid!,finalized:true};
        const input:FundCandidate[]=candidates.map(p=>({
         id:p.id,requestedCents:Number(p.amount_cents),minimumUsefulCents:Number(p.minimum_useful_cents),
         supportVotes:Number(p.supporting_ballots),firstTimeRequester:p.first_time_support_request===true,
         submittedAt:new Date(p.created_at).toISOString(),approved:p.status==="approved",recused:false
        }));
        result=previewFundAllocation(rules,input);
       }catch{error="Η ελεγμένη πολιτική δεν μπορεί να εφαρμοστεί στα παρόντα δεδομένα.";}
      }
      return <article key={c.id} className={s.card} style={{display:"block",marginTop:20}}>
       <span className={s.tag}>{c.slug} · ΟΡΙΣΤΙΚΟΠΟΙΗΜΕΝΟΣ</span>
       <h3>{c.title}</h3>
       <p className={s.meta}>Εκλογικό σώμα: {c.electorate_count} · Έγκυρες ψήφοι: {c.valid_ballots} · Απαρτία: {c.quorum_percent}%
        · Προϋπολογισμός κύκλου: {budget===null?"—":money(budget)}
        · Υφιστάμενες προσφορές: {existing?.total||"0"}</p>
       {error?<div role="status" className={s.empty}><strong>Η προεπισκόπηση δεν ενεργοποιείται.</strong><p>{error}</p></div>:result?<>
        <div style={{padding:"17px 20px",background:"#ecf1e7",marginTop:18}}>
         <strong>{result.quorumReached?"Η απαιτούμενη απαρτία επετεύχθη.":"Η απαρτία ΔΕΝ επετεύχθη."}</strong>
         <p>Προτεινόμενα έργα: {result.awards.length} · Συνολικά υπό μη δεσμευτική εξέταση: {money(result.budgetCents-result.unallocatedCents)}
          · Αδιάθετο κατά την προεπισκόπηση: {money(result.unallocatedCents)}</p>
        </div>
        {result.awards.map((a,i)=>{
         const p=candidates.find(x=>x.id===a.proposalId);
         return <div key={a.proposalId} style={{padding:"18px 0",borderBottom:"1px solid #d6dfd2"}}>
          <span className={s.tag}>#{i+1} · {a.firstTimeRequester?"ΠΡΩΤΗ ΑΙΤΗΣΗ":"ΕΠΑΝΑΛΗΠΤΙΚΗ"}</span>
          <h4 style={{margin:"9px 0",fontSize:21}}>{p?.title||a.proposalId}</h4>
          <p><strong>{money(a.proposedCents)} προτεινόμενη κατανομή</strong> · {money(a.requestedCents)} αιτούμενα
           · {a.supportingVotes} έγκυρες στηρίξεις</p>
          <p className={s.meta}>Προβλεπόμενη πρόσθετη παραμονή βάσει αιτούμενου ποσού (όχι καταβληθέντος): {a.retentionMonthsFromRequested} μήνες</p>
         </div>;
        })}
        <details style={{marginTop:20}}><summary>Αιτιολογία μη επιλογής ({result.excluded.length})</summary>
         {result.excluded.map(x=><p key={x.proposalId} className={s.meta}>{candidates.find(p=>p.id===x.proposalId)?.title||x.proposalId} · {x.reason}</p>)}
        </details>
       </>:null}
       <p className={s.disclaimer} style={{marginTop:20}}>Η λογική αξιοποιεί προτεραιότητα πρώτης αίτησης, ελάχιστα χρήσιμα ποσά, όρια ανά έργο, ποσοστό στήριξης και ισοψηφίες. Απαιτείται ανεξάρτητος έλεγχος συγκρούσεων συμφερόντων και δικαιολογητικών πριν από οποιαδήποτε δεσμευτική απόφαση. Η παρούσα σελίδα δεν αποθηκεύει ούτε εκταμιεύει προτεινόμενα ποσά.</p>
      </article>;
     })}
   </section>
  </div></main>;
 }catch{return <main className={s.stage}><div className={s.shell}>
  <h1>Η οικονομική κατανομή δεν είναι διαθέσιμη</h1>
  <p>Δεν υπάρχουν ασφαλή και επαληθεύσιμα δεδομένα για προεπισκόπηση.</p>
  <Link href="/admin/mazi/fund">Επιστροφή στον έλεγχο Ταμείου</Link>
 </div></main>;}
}
