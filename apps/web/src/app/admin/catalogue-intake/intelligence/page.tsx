import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import {
  adminCatalogueIntelligenceReviewWorkspace,
  approveAdminCatalogueIntelligenceProposal,
  rejectAdminCatalogueIntelligenceProposal,
  type CatalogueIntelligenceAttributeTarget,
  type CatalogueIntelligenceProposal,
  type CatalogueIntelligenceProposalKind
} from "../../../../lib/admin-catalogue-intelligence-review";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Catalogue Intelligence", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

type Params = { source?: string; kind?: string; state?: string; message?: string };

async function approveProposalAction(formData: FormData) {
  "use server";
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  const proposalId=String(formData.get("proposalId") ?? "").trim();
  const source=String(formData.get("source") ?? "").trim();
  const kind=String(formData.get("kind") ?? "").trim();
  const categoryId=String(formData.get("categoryId") ?? "").trim();
  const mappingTarget=String(formData.get("mappingTarget") ?? "").trim();
  try {
    await approveAdminCatalogueIntelligenceProposal(principal,{proposalId,categoryId,mappingTarget});
  } catch(error) {
    redirect(workspaceHref({source,kind,state:"error",message:errorMessage(error)}));
  }
  revalidateIntelligencePaths();
  redirect(workspaceHref({source,kind,state:"approved",message:"Reusable mapping approved. Future matching source evidence can reuse this governed decision."}));
}

async function rejectProposalAction(formData: FormData) {
  "use server";
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  const proposalId=String(formData.get("proposalId") ?? "").trim();
  const source=String(formData.get("source") ?? "").trim();
  const kind=String(formData.get("kind") ?? "").trim();
  const reason=String(formData.get("reason") ?? "").trim();
  try {
    await rejectAdminCatalogueIntelligenceProposal(principal,{proposalId,reason});
  } catch(error) {
    redirect(workspaceHref({source,kind,state:"error",message:errorMessage(error)}));
  }
  revalidateIntelligencePaths();
  redirect(workspaceHref({source,kind,state:"rejected",message:"Proposal rejected with a recorded governance reason."}));
}

export default async function Page({searchParams}:{searchParams:Promise<Params>}) {
  const principal=await getAdminSession();
  if(!principal) redirect("/admin/login");
  const params=await searchParams;
  const review=await adminCatalogueIntelligenceReviewWorkspace(principal,{sourceId:params.source,kind:params.kind});
  const canWrite=hasAdminPermission(principal,"catalog.write");
  const groupedTargets=groupTargets(review.attributeTargets);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={review.csrfToken} entityLabel="Catalogue Intelligence" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · governed intelligence</div>
        <h1>Catalogue Intelligence Review</h1>
        <p className="lead">The autonomous classifier reuses deterministic canonical knowledge where it is safe. Novel, ambiguous or contract-blocked source structure stops here for one governed Admin decision.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Learning boundary</span>
        <strong>Approve once · reuse safely</strong>
        <p>Approval creates a reusable source-context mapping. It does not silently invent a new canonical category, Product Type or attribute.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      {label:"Open proposals",value:review.totalOpen,tone:review.totalOpen?"attention":"positive"},
      {label:"Category decisions",value:review.categoryOpen,tone:review.categoryOpen?"attention":"default"},
      {label:"Attribute decisions",value:review.attributeOpen,tone:review.attributeOpen?"attention":"default"},
      {label:"Ambiguous",value:review.ambiguousOpen,tone:review.ambiguousOpen?"attention":"default"}
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Decision queue" title="Unresolved catalogue intelligence" note="Exact deterministic reuse is handled automatically by the schema-190 engine. This queue contains only decisions that crossed the governance boundary and therefore require explicit review." />
      <div className="workspace-action-bar">
        <span>Use the existing canonical structure whenever possible. If the right canonical structure does not exist yet, leave the proposal open and create/review that structure separately.</span>
        <Link className="button button-secondary" href="/admin/catalogue-intake/attributes">Attribute Review Centre</Link>
        <Link className="button button-secondary" href="/admin/catalogue-intake">Supplier PIM Intake</Link>
      </div>
      <form method="get" className="admin-directory-filters">
        <label><span>Source</span><select name="source" defaultValue={review.sourceId ?? ""}><option value="">All sources</option>{review.sources.map((source)=><option key={source.id} value={source.id}>{source.name} · {source.openCount} open</option>)}</select></label>
        <label><span>Proposal type</span><select name="kind" defaultValue={review.kind ?? ""}><option value="">All proposal types</option>{proposalKinds.map((item)=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Apply scope</button>{(review.sourceId||review.kind)&&<Link className="text-link" href="/admin/catalogue-intake/intelligence">Clear</Link>}</div>
      </form>
      <div className="workspace-inline-note">A proposal can suggest an existing target, but the suggestion is not authority. Approval is revalidated by the database against the current canonical contracts before a reusable rule is written.</div>
      {!canWrite&&<div className="workspace-inline-note">Read-only mode: your Admin role can inspect evidence but cannot approve or reject catalogue intelligence proposals.</div>}
      {params.state&&params.message&&<div className="workspace-queue-card" role={params.state==="error"?"alert":"status"} style={{marginTop:"1rem"}}><strong>{params.state==="error"?"Decision was not saved":params.state==="approved"?"Proposal approved":"Proposal rejected"}</strong><p>{params.message}</p></div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Evidence-backed review" title="Proposals waiting for a decision" note="Newest and repeatedly observed proposals appear first. Raw supplier evidence remains unchanged; the decision only governs how that exact source context may map into KONTAMOU." />
      {review.proposals.length===0?<WorkspaceEmptyState title="No open catalogue intelligence proposals in this scope." body="Deterministic mappings continue to run automatically. New ambiguous or novel evidence will appear here when it needs governance."/>:<div className="workspace-queue-list">{review.proposals.map((proposal)=><ProposalCard key={proposal.id} proposal={proposal} canWrite={canWrite} categories={review.categories} groupedTargets={groupedTargets} sourceFilter={review.sourceId} kindFilter={review.kind}/>)}</div>}
      {review.proposals.length>=250&&<div className="workspace-inline-note">Showing the 250 newest/highest-repeat open proposals. Resolve these to expose the next set.</div>}
    </section>
  </main>;
}

function ProposalCard({proposal,canWrite,categories,groupedTargets,sourceFilter,kindFilter}:{
  proposal:CatalogueIntelligenceProposal;
  canWrite:boolean;
  categories:readonly {id:string;code:string;name:string}[];
  groupedTargets:readonly {productTypeId:string;productTypeCode:string;productTypeName:string;targets:readonly CatalogueIntelligenceAttributeTarget[]}[];
  sourceFilter?:string;
  kindFilter?:CatalogueIntelligenceProposalKind;
}) {
  const categoryProposal=proposal.kind.startsWith("category_");
  const suggested=categoryProposal
    ? [proposal.candidateCategoryName,proposal.candidateCategoryCode].filter(Boolean).join(" · ")
    : [proposal.candidateProductTypeName,proposal.candidateAttributeName,proposal.candidateAttributeCode].filter(Boolean).join(" · ");
  const context=proposal.sourcePath.length?proposal.sourcePath.join(" › "):proposal.sourceLabel??proposal.scopeKey??proposal.sourceKey??"Source context";
  const confidence=proposal.confidence==null?"—":`${Math.round(proposal.confidence*100)}%`;
  const defaultTarget=proposal.candidateProductTypeId&&proposal.candidateAttributeId?`${proposal.candidateProductTypeId}|${proposal.candidateAttributeId}`:"";

  return <article className="workspace-queue-card">
    <div className="workspace-queue-head"><div><strong>{proposalTitle(proposal)}</strong><small>{proposal.sourceName} · {context}</small></div><span className="status-pill">{proposalKindLabel(proposal.kind)}</span></div>
    <div className="workspace-compact-list">
      <div className="workspace-compact-row"><strong>Source key</strong><span>{proposal.sourceAttributeKey??proposal.sourceLabel??proposal.sourceKey??"—"}</span></div>
      <div className="workspace-compact-row"><strong>Observed</strong><span>{proposal.occurrenceCount.toLocaleString("el-GR")}× · last {when(proposal.lastSeenAt)}</span></div>
      <div className="workspace-compact-row"><strong>Confidence</strong><span>{confidence}</span></div>
      <div className="workspace-compact-row"><strong>Suggested existing target</strong><span>{suggested||"No safe existing target identified"}</span></div>
    </div>

    <details style={{marginTop:"0.75rem"}}><summary>Inspect proposal evidence</summary><div className="workspace-compact-list" style={{marginTop:"0.5rem"}}><div className="workspace-compact-row"><strong>Proposed payload</strong><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:0}}>{pretty(proposal.proposedPayload)}</pre></div><div className="workspace-compact-row"><strong>Evidence</strong><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:0}}>{pretty(proposal.evidence)}</pre></div></div></details>

    {canWrite&&<div className="workspace-queue-list" style={{marginTop:"0.75rem"}}>
      <form action={approveProposalAction} className="workspace-action-bar">
        <input type="hidden" name="proposalId" value={proposal.id}/><input type="hidden" name="source" value={sourceFilter??""}/><input type="hidden" name="kind" value={kindFilter??""}/>
        {categoryProposal?<label style={{flex:"1 1 24rem"}}><span>Existing KONTAMOU category</span><select name="categoryId" required defaultValue={proposal.candidateCategoryId??""}><option value="" disabled>Select canonical category</option>{categories.map((category)=><option key={category.id} value={category.id}>{category.name} · {category.code}</option>)}</select></label>:<label style={{flex:"1 1 24rem"}}><span>Existing Product Type / attribute contract</span><select name="mappingTarget" required defaultValue={defaultTarget}><option value="" disabled>Select canonical contract</option>{groupedTargets.map((group)=><optgroup key={group.productTypeId} label={`${group.productTypeName} · ${group.productTypeCode}`}>{group.targets.map((target)=><option key={`${target.productTypeId}:${target.attributeId}`} value={`${target.productTypeId}|${target.attributeId}`}>{target.attributeName} · {target.attributeCode} · {target.dataType}{target.unit?` · ${target.unit}`:""}</option>)}</optgroup>)}</select></label>}
        <button className="button button-primary" type="submit">Approve reusable mapping</button>
      </form>
      <form action={rejectProposalAction} className="workspace-action-bar">
        <input type="hidden" name="proposalId" value={proposal.id}/><input type="hidden" name="source" value={sourceFilter??""}/><input type="hidden" name="kind" value={kindFilter??""}/>
        <label style={{flex:"1 1 24rem"}}><span>Rejection reason</span><input name="reason" required maxLength={500} placeholder="Why should this source interpretation not be reused?"/></label>
        <button className="button button-secondary" type="submit">Reject proposal</button>
      </form>
    </div>}
  </article>;
}

const proposalKinds:readonly {value:CatalogueIntelligenceProposalKind;label:string}[]=[
  {value:"category_new",label:"New category structure"},
  {value:"category_ambiguous",label:"Ambiguous category"},
  {value:"attribute_new",label:"New attribute structure"},
  {value:"attribute_ambiguous",label:"Ambiguous attribute"},
  {value:"attribute_contract_missing",label:"Attribute contract missing"}
];

function groupTargets(targets:readonly CatalogueIntelligenceAttributeTarget[]){
  const groups=new Map<string,{productTypeId:string;productTypeCode:string;productTypeName:string;targets:CatalogueIntelligenceAttributeTarget[]}>();
  for(const target of targets){const existing=groups.get(target.productTypeId);if(existing)existing.targets.push(target);else groups.set(target.productTypeId,{productTypeId:target.productTypeId,productTypeCode:target.productTypeCode,productTypeName:target.productTypeName,targets:[target]});}
  return [...groups.values()];
}
function proposalTitle(proposal:CatalogueIntelligenceProposal):string { return proposal.kind.startsWith("category_")?proposal.sourceLabel??proposal.sourceKey??"Supplier category":proposal.sourceAttributeKey??"Supplier attribute"; }
function proposalKindLabel(kind:CatalogueIntelligenceProposalKind):string { return proposalKinds.find((item)=>item.value===kind)?.label??kind.replaceAll("_"," "); }
function pretty(value:unknown):string { try{return JSON.stringify(value??{},null,2);}catch{return String(value??"");} }
function when(value:string):string { const date=new Date(value); return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(date); }
function workspaceHref(input:{source?:string;kind?:string;state?:string;message?:string}){const search=new URLSearchParams();if(input.source)search.set("source",input.source);if(input.kind)search.set("kind",input.kind);if(input.state)search.set("state",input.state);if(input.message)search.set("message",input.message.slice(0,350));const query=search.toString();return `/admin/catalogue-intake/intelligence${query?`?${query}`:""}`;}
function revalidateIntelligencePaths(){revalidatePath("/admin/catalogue-intake/intelligence");revalidatePath("/admin/catalogue-intake/attributes");revalidatePath("/admin/catalogue-intake");revalidatePath("/admin/catalogue");}
function errorMessage(error:unknown):string { return error instanceof Error?error.message:String(error||"Unexpected catalogue intelligence review error"); }
