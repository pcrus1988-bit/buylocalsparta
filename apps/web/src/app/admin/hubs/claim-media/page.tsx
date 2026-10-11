import type {Metadata} from "next";
import Link from "next/link";
import {redirect,revalidatePath} from "next/navigation";
import type {SqlRow} from "@buy-local-sparta/core";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf,recordAdminAudit} from "../../../../lib/admin-runtime";
import {getProductionPostgresRuntime} from "../../../../lib/postgres-runtime";
import {reviewHubClaimImage} from "../../../../lib/hub-claim-media";
import {AdminWorkspaceHeader} from "../../../../components/AdminWorkspaceHeader";

export const metadata:Metadata={title:"Admin · CLAIM media review",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";

async function review(formData:FormData){
  "use server";
  const principal=await getAdminSession();
  if(!principal?.roles.includes("super_admin"))throw Error("SUPER_ADMIN_REQUIRED");
  assertAdminCsrf(principal,String(formData.get("csrfToken")??""));
  const id=String(formData.get("id")??""),approve=String(formData.get("decision")??"")==="approve",reason=String(formData.get("reason")??"Manual review");
  await reviewHubClaimImage(principal,id,approve,reason);
  await recordAdminAudit(principal,approve?"hub_claim.image_approved":"hub_claim.image_rejected","hub_claim_media",id,reason);
  revalidatePath("/admin/hubs/claim-media");
}

export default async function ClaimMediaReviewPage(){
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  if(!principal.roles.includes("super_admin"))redirect("/admin");
  const result=await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT m.public_id,m.role,m.alt_text,m.rights_owner,m.submitted_at,
           h.business_name,h.hub_city,h.public_id AS claim_public_id
    FROM hub_claim_media m JOIN hub_expansion_prospects h ON h.id=m.prospect_id
    WHERE m.status='pending' AND h.plan_code='claim'
    ORDER BY m.submitted_at ASC LIMIT 100
  `);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="CLAIM media review"/>
    <section className="shell vendor-section">
      <h1>Έγκριση φωτογραφιών CLAIM</h1>
      <p>Εικόνες ανεβαίνουν σε ιδιωτικό χώρο και δεν εμφανίζονται δημόσια πριν ελεγχθούν. Μην εγκρίνεις περιεχόμενο που είναι ύποπτο ή χωρίς αποδεδειγμένα δικαιώματα.</p>
      <Link className="button button-secondary" href="/admin/applications">← Αιτήσεις</Link>
      {result.rows.length===0?<p>Δεν υπάρχουν φωτογραφίες σε αναμονή.</p>:
        <div className="workspace-queue-list">{result.rows.map(row=><article className="workspace-queue-card" key={String(row.public_id)}>
          <h2>{String(row.business_name)} · {String(row.hub_city)}</h2>
          <p>{String(row.role)} · {String(row.alt_text)}</p>
          <p>Δικαιώματα: {String(row.rights_owner)}</p>
          <img src={"/api/hubs/claim/media/"+encodeURIComponent(String(row.public_id))} alt={String(row.alt_text)} style={{width:"100%",maxWidth:480,objectFit:"contain",maxHeight:280}} loading="lazy"/>
          <form action={review} className="admin-directory-filters">
            <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
            <input type="hidden" name="id" value={String(row.public_id)}/>
            <label>Αιτιολογία<input name="reason" defaultValue="Manual image and rights review" minLength={3} maxLength={500}/></label>
            <button className="button" name="decision" value="approve">Έγκριση</button>
            <button className="button button-secondary" name="decision" value="reject">Απόρριψη</button>
          </form>
        </article>)}</div>}
    </section>
  </main>;
}
