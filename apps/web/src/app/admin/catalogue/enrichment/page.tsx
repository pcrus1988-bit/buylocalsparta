import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import {
  adminCatalogueEnrichmentWorkspace,
  requeueCatalogueEnrichment,
  saveCatalogueEnrichmentDraft,
  type CatalogueEnrichmentStatus
} from "../../../../lib/admin-catalogue-enrichment";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Catalogue Enrichment QA", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

type Params = { status?: string; q?: string; item?: string; saved?: string; action?: string; error?: string };

async function saveDraftAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const id=String(formData.get("id")??"").trim();
  const status=normalizeStatus(String(formData.get("returnStatus")??""));
  const q=String(formData.get("q")??"").trim();
  try {
    const result=await saveCatalogueEnrichmentDraft(principal,{
      id,
      titleEl:String(formData.get("titleEl")??""),
      shortDescriptionEl:String(formData.get("shortDescriptionEl")??""),
      descriptionEl:String(formData.get("descriptionEl")??""),
      reason:String(formData.get("reason")??"")
    });
    revalidatePath("/admin/catalogue/enrichment");
    redirect(pageHref({status,q,item:id,saved:"1",action:result.status}));
  } catch(error) {
    redirect(pageHref({status,q,item:id,error:errorMessage(error)}));
  }
}

async function requeueAction(formData: FormData) {
  "use server";
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  const id=String(formData.get("id")??"").trim();
  const status=normalizeStatus(String(formData.get("returnStatus")??""));
  const q=String(formData.get("q")??"").trim();
  try {
    await requeueCatalogueEnrichment(principal,{id,reason:String(formData.get("reason")??"")});
    revalidatePath("/admin/catalogue/enrichment");
    redirect(pageHref({status,q,item:id,saved:"1",action:"requeued"}));
  } catch(error) {
    redirect(pageHref({status,q,item:id,error:errorMessage(error)}));
  }
}

export default async function Page({searchParams}:{searchParams:Promise<Params>}) {
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  const params=await searchParams;
  const status=normalizeStatus(params.status);
  const q=params.q?.trim()||undefined;
  const data=await adminCatalogueEnrichmentWorkspace(principal,{status,query:q,itemId:params.item});
  const canWrite=hasAdminPermission(principal,"catalog.write");
  const attention=data.counts.needs_review+data.counts.failed;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Catalogue Enrichment QA" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · enrichment control</div>
        <h1>Catalogue Enrichment QA</h1>
        <p className="lead">Supplier evidence, verified facts and generated Greek merchandising copy stay visibly separate. Admin edits must pass the same deterministic safety validator as AI output.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Publication boundary</span>
        <strong>QA only · not storefront publication</strong>
        <p>An <b>enriched</b> record means the copy passed validation. Storefront consumption remains a separate release decision.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      {label:"Pending",value:data.counts.pending,tone:data.counts.pending?"attention":"default"},
      {label:"Enriched",value:data.counts.enriched,tone:"positive"},
      {label:"Needs review",value:data.counts.needs_review,tone:data.counts.needs_review?"attention":"positive"},
      {label:"Failed",value:data.counts.failed,tone:data.counts.failed?"attention":"positive"}
    ]}/>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Review queue" title="Evidence first, copy second" note="Needs review is deliberately first. There is no approve-anyway action: corrected copy must pass the validator before it can become enriched." />
      <div className="workspace-action-bar">
        <span>{attention.toLocaleString("el-GR")} records currently require attention.</span>
        <Link className="button button-secondary" href="/admin/catalogue">Catalogue overview</Link>
      </div>
      <form method="get" className="admin-directory-filters">
        <label><span>Status</span><select name="status" defaultValue={status??""}><option value="">All</option><option value="needs_review">Needs review</option><option value="failed">Failed</option><option value="pending">Pending</option><option value="enriched">Enriched</option></select></label>
        <label><span>Search</span><input name="q" defaultValue={q??""} placeholder="Brand, model, source title or parent ID" maxLength={120}/></label>
        <div><button className="button button-primary" type="submit">Apply</button></div>
      </form>
      {params.saved==="1" && <div className="workspace-queue-card" role="status" style={{marginTop:"1rem"}}><strong>Decision saved</strong><p>{params.action==="requeued"?"The item was returned to the controlled generation queue.":params.action==="enriched"?"The edited copy passed validation and is now marked enriched.":"The edited copy is still blocked by validation and remains in Needs review."}</p></div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{marginTop:"1rem"}}><strong>Decision was not saved</strong><p>{params.error}</p></div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-queue-list">
        {data.queue.length===0 ? <WorkspaceEmptyState title="No enrichment records in this scope." body="Preparation creates records from supplier-parent evidence. Adjust the filters or wait for the NOVA preparation worker to stage the catalogue."/> : data.queue.map((item)=><article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.candidateTitle||item.displayTitle||item.sourceTitle||item.externalProductId}</strong><small>{item.supplierName} · Parent {item.externalProductId}</small></div>
            <WorkspaceStatusBadge status={badgeTone(item.status)} label={statusLabel(item.status)}/>
          </div>
          <div className="workspace-queue-primary">
            <span><strong>{item.brand||"—"}</strong> brand</span>
            <span><strong>{item.model||"—"}</strong> model</span>
            <span><strong>{item.productType||"—"}</strong> type</span>
            <span><strong>{item.attemptCount}</strong> attempts</span>
            <span><strong>{item.validationErrorCount}</strong> validation errors</span>
          </div>
          <div className="workspace-action-bar">
            <span>{item.modelName||"No model run yet"}{item.promptVersion?` · ${item.promptVersion}`:""}</span>
            <Link className="button button-secondary" href={pageHref({status,q,item:item.id})}>Inspect evidence &amp; copy</Link>
          </div>
        </article>)}
      </div>
    </section>

    {data.selected ? <DetailPanel detail={data.selected} canWrite={canWrite} returnStatus={status} q={q}/> : <section className="shell vendor-section"><WorkspaceEmptyState title="Select an enrichment record" body="Open a queue item to compare source evidence, verified facts, candidate copy and validator findings side by side."/></section>}
  </main>;
}

function DetailPanel({detail,canWrite,returnStatus,q}:{detail:NonNullable<Awaited<ReturnType<typeof adminCatalogueEnrichmentWorkspace>>["selected"]>;canWrite:boolean;returnStatus?:CatalogueEnrichmentStatus;q?:string}) {
  const fallbackTitle=textValue(detail.deterministicFallback.titleEl);
  const fallbackShort=textValue(detail.deterministicFallback.shortDescriptionEl);
  const editTitle=detail.candidate.titleEl||detail.display.titleEl||fallbackTitle;
  const editShort=detail.candidate.shortDescriptionEl??detail.display.shortDescriptionEl??fallbackShort;
  const editDescription=detail.candidate.descriptionEl??detail.display.descriptionEl??"";
  return <>
    <section className="shell vendor-section section-tint">
      <WorkspaceSectionHeading eyebrow="Selected parent product" title={editTitle||detail.sourceTitle||detail.externalProductId} note={`${detail.supplierName} · Parent ${detail.externalProductId} · source hash ${detail.sourceHash.slice(0,12)}…`}/>
      <div className="catalogue-attention-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Supplier evidence</strong><small>Sanitized display only · original source remains immutable</small></div><WorkspaceStatusBadge status="default" label="Evidence"/></div>
          <p><b>Title:</b> {detail.sourceTitle||"—"}</p>
          <p style={{whiteSpace:"pre-wrap"}}>{detail.sourceDescription||"No supplier description available."}</p>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Verified facts</strong><small>These facts govern generation and manual validation</small></div><WorkspaceStatusBadge status={detail.bazaarOverlay.commerceChannel==="bazaar"?"attention":"active"} label={detail.bazaarOverlay.commerceChannel==="bazaar"?"BAZAAR":"Normal"}/></div>
          <FactRows facts={detail.verifiedFacts}/>
          <details><summary>Fact provenance</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(detail.factProvenance,null,2)}</pre></details>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Validator" title="Why this copy is accepted or blocked" note="A manual edit does not bypass the rules. The same validator runs again when you save."/>
      {detail.validationErrors.length ? <div className="workspace-queue-card"><strong>{detail.validationErrors.length} validation issue(s)</strong><ul>{detail.validationErrors.map((error)=><li key={error}><code>{error}</code></li>)}</ul></div> : <div className="workspace-inline-note">No stored validation errors for the current candidate.</div>}
      <div className="workspace-compact-list" style={{marginTop:"1rem"}}>
        <div className="workspace-compact-row"><strong>Status</strong><span>{statusLabel(detail.status)}</span></div>
        <div className="workspace-compact-row"><strong>Generator</strong><span>{[detail.generationProvider,detail.generationModel,detail.promptVersion].filter(Boolean).join(" · ")||"Not generated yet"}</span></div>
        <div className="workspace-compact-row"><strong>Rules</strong><span>{detail.rulesVersion}</span></div>
        <div className="workspace-compact-row"><strong>Attempts</strong><span>{detail.attemptCount}</span></div>
        <div className="workspace-compact-row"><strong>Last error</strong><span>{detail.lastError||"—"}</span></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Greek merchandising copy" title="Edit through the safety gate" note="Use verified evidence only. If the edit introduces an unsupported fact, internal supplier detail, shipping/price claim or hides BAZAAR condition, it stays blocked."/>
      <form action={saveDraftAction} className="workspace-queue-card">
        <input type="hidden" name="id" value={detail.id}/><input type="hidden" name="returnStatus" value={returnStatus??""}/><input type="hidden" name="q" value={q??""}/>
        <label><span>Greek title</span><input name="titleEl" defaultValue={editTitle} maxLength={140} required/></label>
        <label style={{display:"block",marginTop:"1rem"}}><span>Short description</span><textarea name="shortDescriptionEl" defaultValue={editShort} maxLength={280} rows={3}/></label>
        <label style={{display:"block",marginTop:"1rem"}}><span>Full description</span><textarea name="descriptionEl" defaultValue={editDescription} maxLength={1800} rows={9}/></label>
        <label style={{display:"block",marginTop:"1rem"}}><span>Review note</span><input name="reason" maxLength={300} placeholder="What did you correct or verify?"/></label>
        <div className="workspace-action-bar"><span>{canWrite?"Saving runs deterministic validation before accepting the copy.":"Read-only: catalog.write permission is required."}</span>{canWrite&&<button className="button button-primary" type="submit">Validate &amp; save</button>}</div>
      </form>
      {canWrite && <form action={requeueAction} className="workspace-action-bar" style={{marginTop:"1rem"}}>
        <input type="hidden" name="id" value={detail.id}/><input type="hidden" name="returnStatus" value={returnStatus??""}/><input type="hidden" name="q" value={q??""}/><input type="hidden" name="reason" value="Requeued by Admin after enrichment QA review"/>
        <span>Requeue clears the rejected candidate and retry counter but preserves the last accepted display copy until a replacement validates.</span><button className="button button-secondary" type="submit">Requeue generation</button>
      </form>}
    </section>
  </>;
}

function FactRows({facts}:{facts:NonNullable<Awaited<ReturnType<typeof adminCatalogueEnrichmentWorkspace>>["selected"]>["verifiedFacts"]}) {
  const rows:[string,string][]=[
    ["Brand",facts.brand||"—"],["Model / line",facts.model||"—"],["Product type",facts.productType||"—"],["Colour",facts.color||"—"],
    ["Materials",facts.materials.join(" · ")||"—"],["Dimensions",Object.entries(facts.dimensions).map(([k,v])=>`${k}: ${v}`).join(" · ")||"—"],
    ["Season",facts.season||"—"],["Gender",facts.gender||"—"],["Condition",facts.condition||"—"],["Features",facts.features.join(" · ")||"—"],["Claims",facts.claims.join(" · ")||"—"]
  ];
  return <div className="workspace-compact-list">{rows.map(([label,value])=><div className="workspace-compact-row" key={label}><strong>{label}</strong><span>{value}</span></div>)}</div>;
}

function normalizeStatus(value:string|undefined):CatalogueEnrichmentStatus|undefined { return value==="pending"||value==="enriched"||value==="needs_review"||value==="failed"?value:undefined; }
function statusLabel(status:CatalogueEnrichmentStatus):string { return status==="needs_review"?"Needs review":status==="enriched"?"Enriched":status==="failed"?"Failed":"Pending"; }
function badgeTone(status:CatalogueEnrichmentStatus):"active"|"attention"|"processing"|"default" { return status==="enriched"?"active":status==="needs_review"||status==="failed"?"attention":status==="pending"?"processing":"default"; }
function pageHref(input:{status?:CatalogueEnrichmentStatus;q?:string;item?:string;saved?:string;action?:string;error?:string}):string { const params=new URLSearchParams();for(const [key,value] of Object.entries(input)) if(value) params.set(key,value);const query=params.toString();return `/admin/catalogue/enrichment${query?`?${query}`:""}`; }
function errorMessage(error:unknown):string { return (error instanceof Error?error.message:String(error)).slice(0,300); }
function textValue(value:unknown):string { return typeof value==="string"?value:""; }
