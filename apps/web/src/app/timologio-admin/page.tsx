import Link from "next/link";
import { redirect } from "next/navigation";
import { FiscalReviewButton } from "../../components/FiscalReviewButton";
import { fiscalAdminActor, fiscalAdminOverview } from "../../lib/fiscal-auth";
import { fiscalDatabaseConfigured, fiscalLanes } from "../../lib/fiscal-runtime";
export const dynamic="force-dynamic";
export default async function FiscalAdmin(){
 const actor=await fiscalAdminActor();
 if(!actor)redirect("/timologio-admin/login");
 const configured=fiscalDatabaseConfigured();
 const status=configured?await fiscalAdminOverview().then(data=>({ready:true as const,data})).catch(()=>({ready:false as const,data:undefined})): {ready:false as const,data:undefined};
 const data=status.data;
 const counts=new Map(data?.counts.map(row=>[row.status,Number(row.count)])??[]);
 return <main className="fiscal-shell"><div className="fiscal-wrap">
  <header className="fiscal-topbar"><Link href="/timologio-admin" className="fiscal-brand">KONTA MOY <span>FISCAL · ADMIN</span></Link>
   <nav><Link href="/timologio">Public service</Link>{actor.kind==="marketplace_super_admin"&&<Link href="/admin">KONTA MOY Super Admin</Link>}</nav></header>
  <section className="fiscal-hero"><div className="fiscal-kicker">Independent fiscal operations</div>
   <h1>FISCAL Control Centre</h1><p>Merchant onboarding, provider readiness and four parallel certification tracks, independently from marketplace operations.</p>
   <p style={{fontSize:".88rem"}}>Authenticated as {actor.email} · {actor.kind}</p>
  </section>
  <section className="fiscal-panel">
   <h2>Υποδομή και ενεργοποίηση</h2>
   {!configured?<p className="fiscal-alert">Απαιτείται ξεχωριστή FISCAL_DATABASE_URL. Δεν χρησιμοποιείται η βάση του marketplace ως εναλλακτική.</p>
   :!status.ready?<p className="fiscal-alert">Η βάση FISCAL δεν είναι ακόμη έτοιμη ή δεν έχουν εφαρμοστεί οι ανεξάρτητες migrations. Οι εργασίες παραμένουν κλειδωμένες.</p>
   :<p>Dedicated Fiscal database: connected · merchant applications: {data?.accounts.length??0} shown (latest 40).</p>}
   <div className="fiscal-grid">
    <div className="fiscal-card"><small>FISCAL users</small><div className="fiscal-stat">{data?.users??"—"}</div></div>
    <div className="fiscal-card"><small>Pending review</small><div className="fiscal-stat">{status.ready?counts.get("pending_review")??0:"—"}</div></div>
    <div className="fiscal-card"><small>Under review</small><div className="fiscal-stat">{status.ready?counts.get("under_review")??0:"—"}</div></div>
    <div className="fiscal-card"><small>Fiscal issuance</small><div className="fiscal-stat">OFF</div><p>Certification-gated</p></div>
   </div>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <h2>Parallel licensing workstreams</h2>
   <div className="fiscal-grid">{fiscalLanes.map(lane=><article key={lane.id} className="fiscal-card">
    <small>{lane.id.toUpperCase()}</small><h3>{lane.title}</h3><p>{lane.detail}</p>
    <p><strong>Foundation in development</strong></p></article>)}</div>
   <p className="fiscal-alert" style={{marginTop:18}}>Απαιτούνται χωριστά πιστοποιητικά, ασφαλής έκδοση και ανεξάρτητο αρχείο. Οι λειτουργίες παραγωγής παραμένουν απενεργοποιημένες.</p>
  </section>
  <section className="fiscal-panel fiscal-section" style={{marginTop:20}}>
   <h2>Business applications</h2>
   {!data?.accounts.length?<p className="fiscal-muted">No reviewed merchant applications in the independent Fiscal database yet.</p>:
   <div style={{overflowX:"auto"}}><table className="fiscal-table"><thead><tr><th>Business</th><th>AFM</th><th>State</th><th>Created</th><th>Review</th></tr></thead>
    <tbody>{data.accounts.map(account=><tr key={account.id}><td>{account.legal_name}</td><td>{account.vat_number}</td>
    <td>{account.status}</td><td>{new Date(account.created_at).toLocaleDateString("el-GR")}</td>
    <td>{account.status==="pending_review"?<FiscalReviewButton organizationId={account.id} csrfToken={actor.csrfToken}/>:<span className="fiscal-muted">—</span>}</td></tr>)}</tbody></table></div>}
   <p className="fiscal-muted">Starting a review is not merchant approval. Identity verification, contracts and issuance authorization are separate compliance steps.</p>
  </section>
 </div></main>;
}
