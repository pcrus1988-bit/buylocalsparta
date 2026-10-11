import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {FiscalAccountReviewActions} from "../../../../components/FiscalAccountReviewActions";
import {fiscalAdminActor} from "../../../../lib/fiscal-auth";
import {fiscalPool} from "../../../../lib/fiscal-runtime";

export const dynamic="force-dynamic";
type Case={id:string;legal_name:string;vat_number:string;status:string;
 created_at:Date;reviewed_at:Date|null};
type Member={email:string;role:string;user_role:string;disabled_at:Date|null};
type Audit={id:string;action:string;actor_kind:string;created_at:Date;note:string};
type Count={lane:string;count:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const stamp=(value:Date)=>new Intl.DateTimeFormat("el-GR",{
 dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"
}).format(new Date(value));

export default async function FiscalAccountCase({params}:{
 params:Promise<{id:string}>
}){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const {id}=await params;
 if(!uuid.test(id))notFound();
 const org=await fiscalPool().query<Case>(
  "SELECT id,legal_name,vat_number,status,created_at,reviewed_at FROM fiscal_organizations WHERE id=$1 LIMIT 1",[id]);
 const account=org.rows[0];
 if(!account)notFound();
 const [members,audits,drafts]=await Promise.all([
  fiscalPool().query<Member>(
   `SELECT u.email,m.role,u.role AS user_role,u.disabled_at
    FROM fiscal_memberships m JOIN fiscal_users u ON u.id=m.user_id
    WHERE m.organization_id=$1 ORDER BY m.role,u.email LIMIT 25`,[id]),
  fiscalPool().query<Audit>(
   `SELECT id::text,action,actor_kind,created_at,
    COALESCE(details->>'note','') AS note
    FROM fiscal_audit_events
    WHERE organization_id=$1 AND action IN
     ('registration.submitted','onboarding.review_started',
      'onboarding.internal_follow_up_recorded','onboarding.rejected')
    ORDER BY created_at DESC,id DESC LIMIT 30`,[id]),
  fiscalPool().query<Count>(
   "SELECT lane,count(*)::text AS count FROM fiscal_document_intakes WHERE organization_id=$1 GROUP BY lane",[id])
 ]);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar">
   <Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio-admin">Πίσω στο κέντρο ελέγχου</Link><Link href="/timologio-admin/compliance">Πιστοποιήσεις</Link></nav>
  </header>
  <section className="fiscal-hero">
   <div className="fiscal-kicker">Εσωτερικός έλεγχος · KYB case</div>
   <h1>{account.legal_name}</h1>
   <p>Φορολογικός αριθμός: {account.vat_number} · Κατάσταση: <strong>{account.status}</strong></p>
   <p>Υποβλήθηκε {stamp(account.created_at)}
    {account.reviewed_at?" · Τελευταία αλλαγή ελέγχου "+stamp(account.reviewed_at):""}</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <h2>Συνδεδεμένοι χρήστες · {members.rows.length} (έως 25)</h2>
   {members.rows.length?<div style={{overflowX:"auto"}}><table className="fiscal-table">
    <thead><tr><th>Email</th><th>Ρόλος στην επιχείρηση</th><th>Κατάσταση</th></tr></thead>
    <tbody>{members.rows.map((m,i)=><tr key={i}><td>{m.email}</td><td>{m.role}</td>
     <td>{m.disabled_at?"Απενεργοποιημένος":"Ενεργός"}</td></tr>)}</tbody></table></div>
    :<p className="fiscal-muted">Δεν υπάρχουν χρήστες στην επιχείρηση.</p>}
   <p className="fiscal-muted">Οι πληροφορίες είναι μόνο για χειροκίνητο εσωτερικό έλεγχο. Δεν έχουν διασταυρωθεί με ΓΕΜΗ/ΑΑΔΕ.</p>
  </section>
  <FiscalAccountReviewActions organizationId={account.id} status={account.status} csrfToken={actor.csrfToken}/>
  <section className="fiscal-panel fiscal-section">
   <h2>Χρονικό ελέγχου · έως 30 εγγραφές</h2>
   {audits.rows.length===0?<p className="fiscal-muted">Καμία καταγεγραμμένη ενέργεια ελέγχου.</p>:
   <div style={{display:"grid",gap:12}}>{audits.rows.map(event=><article key={event.id} className="fiscal-card">
    <strong>{event.action}</strong> · {stamp(event.created_at)}
    <p className="fiscal-muted">Δράστης: {event.actor_kind}</p>
    {event.note?<p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{event.note}</p>:null}
   </article>)}</div>}
   <p className="fiscal-muted">Εσωτερικά, αμετάβλητα συμβάντα. Καμία αυτόματη ειδοποίηση εμπόρου.</p>
  </section>
  <section className="fiscal-panel fiscal-section">
   <h2>Δοκιμαστικά παραστατικά ανά κλάδο</h2>
   {drafts.rows.length===0?<p>Δεν υπάρχουν draft intakes.</p>:
    <div className="fiscal-grid">{drafts.rows.map(x=><article className="fiscal-card" key={x.lane}>
     <small>{x.lane.toUpperCase()}</small><div className="fiscal-stat">{x.count}</div>
     <p>Μη φορολογικά προσχέδια</p></article>)}</div>}
   <p className="fiscal-alert">Καμία απόφαση ή σημείωση εδώ δεν επιτρέπει επίσημη έκδοση, πιστοποίηση ή διαβίβαση σε δημόσια αρχή.</p>
  </section>
 </div></main>;
}
