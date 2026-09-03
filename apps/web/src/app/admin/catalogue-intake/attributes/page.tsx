import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { adminCatalogueIntakeWorkspace } from "../../../../lib/admin-catalogue-intake";
import { adminCatalogueAttributeReviewWorkspace } from "../../../../lib/admin-catalogue-attribute-review";
import { mapCatalogueSourceAttribute } from "../../../../lib/admin-catalogue-attribute-mapping";
import { adminCatalogueManualReviewWorkspace, resolveCatalogueManualReview } from "../../../../lib/admin-catalogue-manual-review";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Attribute Review Centre", robots: { index: false, follow: false, nocache: true } };

type Params = {
  snapshot?: string;
  stage?: string;
  dataType?: string;
  item?: string;
  saved?: string;
  mapped?: string;
  review?: string;
  key?: string;
  target?: string;
  manualSaved?: string;
  manualAction?: string;
  manualRows?: string;
  error?: string;
};

async function approveSuggestionAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const snapshotId = String(formData.get("snapshotId") ?? "").trim();
  const sourceProductId = String(formData.get("sourceProductId") ?? "").trim();
  const sourceAttributeKey = String(formData.get("sourceAttributeKey") ?? "").trim();
  const productTypeId = String(formData.get("productTypeId") ?? "").trim();
  const attributeId = String(formData.get("attributeId") ?? "").trim();
  const productTypeCode = String(formData.get("productTypeCode") ?? "").trim();
  const attributeCode = String(formData.get("attributeCode") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  let result;
  try {
    result = await mapCatalogueSourceAttribute(principal, { sourceProductId, sourceAttributeKey, productTypeId, attributeId, reason: reason || "Approved from grouped Supplier PIM attribute review" });
  } catch (error) {
    redirect(pageHref({ snapshot: snapshotId, stage: "unmapped", error: errorMessage(error) }));
  }
  revalidateCataloguePaths();
  redirect(pageHref({ snapshot: snapshotId, stage: "unmapped", saved: "1", mapped: String(result.mappedObservations), review: String(result.reviewRequiredObservations), key: result.sourceAttributeKey, target: `${productTypeCode || result.productTypeCode} / ${attributeCode || result.attributeCode}` }));
}

async function resolveManualReviewAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const snapshot = String(formData.get("snapshot") ?? "").trim();
  const dataType = String(formData.get("dataType") ?? "").trim();
  const observationId = String(formData.get("observationId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "approve").trim() === "reject" ? "reject" : "approve";
  const reason = String(formData.get("reason") ?? "").trim();
  const canonicalValue = String(formData.get("canonicalValue") ?? "");
  const mappingTarget = String(formData.get("mappingTarget") ?? "").trim();
  const separator = mappingTarget.indexOf("|");
  const productTypeId = separator > 0 ? mappingTarget.slice(0, separator) : undefined;
  const attributeId = separator > 0 ? mappingTarget.slice(separator + 1) : undefined;
  try {
    const result = await resolveCatalogueManualReview(principal, {
      observationId,
      decision,
      canonicalValue,
      reason,
      applyToExactMatches: formData.get("applyToExactMatches") === "1",
      productTypeId,
      attributeId
    });
    revalidateCataloguePaths();
    redirect(pageHref({ snapshot, stage: "review", dataType, manualSaved: "1", manualAction: result.action, manualRows: String(result.changed) }));
  } catch (error) {
    redirect(pageHref({ snapshot, stage: "review", dataType, item: observationId, error: errorMessage(error) }));
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const snapshotId = params.snapshot?.trim() || undefined;
  const stage = params.stage === "review" ? "review" : "unmapped";
  const dataType = params.dataType?.trim() || undefined;
  const selectedObservationId = params.item?.trim() || undefined;
  const [review, intake, manual] = await Promise.all([
    adminCatalogueAttributeReviewWorkspace(principal, { snapshotId }),
    adminCatalogueIntakeWorkspace(principal, { snapshotId }),
    adminCatalogueManualReviewWorkspace(principal, { snapshotId, dataType, selectedObservationId })
  ]);
  const selectedSnapshot = snapshotId ? intake.snapshots.find((item) => item.id === snapshotId) : undefined;
  const canWrite = hasAdminPermission(principal, "catalog.write");
  const reviewRequiredInScope = manual.typeCounts.reduce((sum, item) => sum + item.count, 0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={review.csrfToken} entityLabel="Attribute Review Centre" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · source normalization</div>
        <h1>Attribute Review Centre</h1>
        <p className="lead">One Admin workflow for unmapped supplier attributes, taxonomy blockers and value/unit decisions that are already under review.</p>
      </div>
      <aside className="dashboard-health-card">
        <span>Decision model</span>
        <strong>Evidence first · Admin decides</strong>
        <p>Raw supplier evidence is never overwritten. Reusable mappings, corrected canonical values and rejected parser artifacts are explicit audited decisions.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Unmapped in scope", value: review.totalUnmapped, tone: review.totalUnmapped ? "attention" : "positive" },
      { label: "Under review", value: reviewRequiredInScope, tone: reviewRequiredInScope ? "attention" : "positive" },
      { label: "Ready to map", value: review.actionableGroups, tone: review.actionableGroups ? "attention" : "default" },
      { label: "Blocked by taxonomy", value: review.blockedGroups, tone: review.blockedGroups ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Review scope" title="Choose the source first" note="Counts are separated by source so a new supplier intake cannot look like regression in a catalogue you already cleaned. Exact source context and approved Product Types remain the governance boundary." />
      <div className="workspace-queue-list" style={{marginBottom:"1rem"}}>
        {manual.sourceCounts.map((source) => <div className="workspace-queue-card" key={source.sourceId}>
          <div className="workspace-queue-head"><div><strong>{source.sourceName}</strong><small>Supplier PIM evidence</small></div><span className="status-pill">{source.unmapped.toLocaleString("el-GR")} unmapped</span></div>
          <div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Under review</strong><span>{source.reviewRequired.toLocaleString("el-GR")}</span></div></div>
        </div>)}
      </div>
      <div className="workspace-action-bar">
        <span>{selectedSnapshot ? `${selectedSnapshot.sourceName} · ${selectedSnapshot.productCount.toLocaleString("el-GR")} products` : "All Supplier PIM snapshots"}</span>
        <Link className={`button ${stage === "unmapped" ? "button-primary" : "button-secondary"}`} href={pageHref({ snapshot: snapshotId, stage: "unmapped" })}>Unmapped · {review.totalUnmapped.toLocaleString("el-GR")}</Link>
        <Link className={`button ${stage === "review" ? "button-primary" : "button-secondary"}`} href={pageHref({ snapshot: snapshotId, stage: "review" })}>Under review · {reviewRequiredInScope.toLocaleString("el-GR")}</Link>
        <Link className="button button-secondary" href="/admin/catalogue-intake/values">Controlled values</Link>
        <Link className="button button-secondary" href="/admin/catalogue-intake/intelligence">Catalogue Intelligence</Link>
      </div>
      <form method="get" className="admin-directory-filters">
        <input type="hidden" name="stage" value={stage} />
        {dataType && <input type="hidden" name="dataType" value={dataType} />}
        <label><span>Supplier snapshot</span><select name="snapshot" defaultValue={snapshotId ?? ""}><option value="">All snapshots</option>{intake.snapshots.map((item) => <option key={item.id} value={item.id}>{item.sourceName} · {item.productCount.toLocaleString("el-GR")} products · {item.unmappedAttributes.toLocaleString("el-GR")} unmapped</option>)}</select></label>
        <div><button className="button button-secondary" type="submit">Apply source</button></div>
      </form>
      {!canWrite && <div className="workspace-inline-note">Read-only mode: your Admin role can inspect evidence but cannot save mapping/review decisions.</div>}
      {params.error && <div className="workspace-queue-card" role="alert" style={{marginTop:"1rem"}}><strong>Decision was not saved</strong><p>{params.error}</p></div>}
    </section>

    {stage === "unmapped" ? <UnmappedQueue review={review} snapshotId={snapshotId} canWrite={canWrite} params={params} /> : <ManualQueue manual={manual} snapshotId={snapshotId} dataType={dataType} selectedObservationId={selectedObservationId} canWrite={canWrite} params={params} />}
  </main>;
}

function UnmappedQueue({review,snapshotId,canWrite,params}:{review:Awaited<ReturnType<typeof adminCatalogueAttributeReviewWorkspace>>;snapshotId?:string;canWrite:boolean;params:Params}) {
  return <section className="shell vendor-section">
    <WorkspaceSectionHeading eyebrow="Step 1 · Attribute meaning" title="Repeated unmapped attributes" note="Highest-volume exact contexts appear first. If taxonomy is missing, resolve that prerequisite first; the button takes you directly to the correct governance queue." />
    {params.saved === "1" && <div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}><strong>Grouped mapping approved</strong><p>{params.key} → {params.target} · {Number(params.mapped ?? 0).toLocaleString("el-GR")} mapped · {Number(params.review ?? 0).toLocaleString("el-GR")} moved to manual value/unit review.</p></div>}
    {review.groups.length === 0 ? <WorkspaceEmptyState title="No unmapped attribute groups in this scope." body="Use Under review for mapped meanings that still need a value, unit or parser decision." /> : <div className="workspace-queue-list">{review.groups.map((group) => {
      const manual = new URLSearchParams(); if (snapshotId) manual.set("snapshot", snapshotId); manual.set("product", group.representativeProductId);
      const intelligence = new URLSearchParams({ source: group.sourceId, kind: "category_new" });
      return <article className="workspace-queue-card" key={`${group.sourceId}:${group.sourceAttributeKey}:${group.scopeKind}:${group.scopeKey ?? "none"}`}>
        <div className="workspace-queue-head"><div><strong>{group.sourceAttributeKey}</strong><small>{group.sourceName} · {group.contextLabel}</small></div><span className="status-pill">{group.observationCount.toLocaleString("el-GR")} observations</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Products</strong><span>{group.productCount.toLocaleString("el-GR")}</span></div>
          <div className="workspace-compact-row"><strong>Source units</strong><span>{group.sourceUnits.join(" · ") || "—"}</span></div>
          <div className="workspace-compact-row"><strong>Canonical category</strong><span>{group.approvedCategoryCode ?? (group.scopeKind === "source_category" ? "Provider context" : "Not approved yet")}</span></div>
          <div className="workspace-compact-row"><strong>Sample values</strong><span>{group.samples.map((sample) => compactValue(sample.rawValue)).join(" · ") || "—"}</span></div>
          <div className="workspace-compact-row"><strong>Sample products</strong><span>{group.samples.map((sample) => sample.title).join(" · ") || "—"}</span></div>
        </div>
        {!group.actionable ? <>
          <div className="workspace-inline-note">{group.blocker}</div>
          <div className="workspace-action-bar"><span>Required first step</span><Link className="button button-primary" href={`/admin/catalogue-intake/intelligence?${intelligence.toString()}`}>Review taxonomy</Link></div>
        </> : group.suggestions.length === 0 ? <div className="workspace-inline-note">No safe candidate was suggested. Open one representative product and choose the canonical Product Type / attribute manually.</div> : <div className="workspace-queue-list" style={{marginTop:"0.75rem"}}>{group.suggestions.map((suggestion) => <div className="workspace-queue-card" key={`${suggestion.productTypeId}:${suggestion.attributeId}`}>
          <div className="workspace-queue-head"><div><strong>{suggestion.productTypeName} · {suggestion.attributeCode}</strong><small>{suggestion.dataType}{suggestion.unit ? ` · ${suggestion.unit}` : ""} · {suggestion.reasons.join(" · ") || "candidate"}</small></div><span className="status-pill">{Math.round(suggestion.score * 100)}% advisory</span></div>
          {canWrite ? <form action={approveSuggestionAction} className="workspace-action-bar">
            <input type="hidden" name="snapshotId" value={snapshotId ?? ""}/><input type="hidden" name="sourceProductId" value={group.representativeProductId}/><input type="hidden" name="sourceAttributeKey" value={group.sourceAttributeKey}/><input type="hidden" name="productTypeId" value={suggestion.productTypeId}/><input type="hidden" name="attributeId" value={suggestion.attributeId}/><input type="hidden" name="productTypeCode" value={suggestion.productTypeCode}/><input type="hidden" name="attributeCode" value={suggestion.attributeCode}/>
            <label style={{flex:"1 1 18rem"}}><span>Review note</span><input name="reason" maxLength={240} placeholder="Optional reason"/></label><button className="button button-primary" type="submit">Approve mapping</button>
          </form> : <div className="workspace-inline-note">Approval requires catalog.write permission.</div>}
        </div>)}</div>}
        <div className="workspace-action-bar"><span>Need full product evidence?</span><Link className="button button-secondary" href={`/admin/catalogue-intake?${manual.toString()}`}>Open representative product</Link></div>
      </article>;
    })}</div>}
    {review.groups.length >= 180 && <div className="workspace-inline-note">Showing the 180 highest-volume contexts. This is a display limit, not the total number of unresolved contexts.</div>}
  </section>;
}

function ManualQueue({manual,snapshotId,dataType,selectedObservationId,canWrite,params}:{manual:Awaited<ReturnType<typeof adminCatalogueManualReviewWorkspace>>;snapshotId?:string;dataType?:string;selectedObservationId?:string;canWrite:boolean;params:Params}) {
  return <section className="shell vendor-section">
    <WorkspaceSectionHeading eyebrow="Step 2 · Manual value review" title="Mapped meanings that still need an Admin decision" note="Identical raw/normalized values inside the same exact supplier context are grouped together. Approve the group, correct its canonical value, change its target, or reject it as parser/source noise. Raw evidence remains unchanged." />
    {params.manualSaved === "1" && <div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}><strong>Manual review saved</strong><p>{Number(params.manualRows ?? 0).toLocaleString("el-GR")} observation(s) {params.manualAction === "rejected" ? "rejected from canonical use" : "approved as canonical evidence"}.</p></div>}
    <form method="get" className="admin-directory-filters">
      <input type="hidden" name="stage" value="review"/>{snapshotId && <input type="hidden" name="snapshot" value={snapshotId}/>}<label><span>Review type</span><select name="dataType" defaultValue={dataType ?? ""}><option value="">All review types</option>{manual.typeCounts.map((item)=><option key={item.dataType} value={item.dataType}>{reviewTypeLabel(item.dataType)} · {item.count.toLocaleString("el-GR")}</option>)}</select></label><div><button className="button button-secondary" type="submit">Apply filter</button></div>
    </form>
    <div className="workspace-inline-note">Fast path: approve a correct exact group with one click. Use “Open manual editor” only when the value/unit or canonical target needs correction. Enum values continue through the dedicated controlled-value workflow.</div>
    {manual.groups.length === 0 ? <WorkspaceEmptyState title="No review-required attribute groups in this scope." body="Choose another source/type or return to Unmapped."/> : <div className="workspace-queue-list">{manual.groups.map((group) => {
      const selected=selectedObservationId===group.representativeObservationId;
      const editHref=pageHref({snapshot:snapshotId,stage:"review",dataType,item:group.representativeObservationId});
      const productHref=pageHref({snapshot:snapshotId,stage:"review",dataType});
      return <article className={`workspace-queue-card${selected?" is-selected":""}`} key={`${group.representativeObservationId}:${group.attributeId ?? "none"}`}>
        <div className="workspace-queue-head"><div><strong>{group.sourceAttributeKey}</strong><small>{group.sourceName} · {group.contextLabel}</small></div><span className="status-pill">{group.observationCount.toLocaleString("el-GR")} exact match{group.observationCount===1?"":"es"}</span></div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Current canonical target</strong><span>{group.productTypeCode ? `${group.productTypeCode} / ` : ""}{group.attributeCode ?? "No attribute assigned"} · {reviewTypeLabel(group.dataType)}{group.canonicalUnit?` · ${group.canonicalUnit}`:""}</span></div>
          <div className="workspace-compact-row"><strong>Raw supplier value</strong><span>{compactValue(group.rawValue)}{group.sourceUnit?` ${group.sourceUnit}`:""}</span></div>
          <div className="workspace-compact-row"><strong>Current normalized value</strong><span>{compactValue(group.normalizedValue)}</span></div>
          <div className="workspace-compact-row"><strong>Products</strong><span>{group.productCount.toLocaleString("el-GR")} · {group.sampleTitles.join(" · ")}</span></div>
          {group.mappingReason && <div className="workspace-compact-row"><strong>Why it is under review</strong><span>{group.mappingReason}</span></div>}
        </div>
        {group.needsControlledValue ? <div className="workspace-action-bar"><span>Controlled enum value required</span><Link className="button button-primary" href="/admin/catalogue-intake/values">Review controlled value</Link></div> : canWrite && group.canApproveAsIs ? <form action={resolveManualReviewAction} className="workspace-action-bar">
          <input type="hidden" name="snapshot" value={snapshotId ?? ""}/><input type="hidden" name="dataType" value={dataType ?? ""}/><input type="hidden" name="observationId" value={group.representativeObservationId}/><input type="hidden" name="decision" value="approve"/><input type="hidden" name="applyToExactMatches" value="1"/><button className="button button-primary" type="submit">Approve exact group · {group.observationCount.toLocaleString("el-GR")}</button><Link className="button button-secondary" href={editHref}>Open manual editor</Link>
        </form> : <div className="workspace-action-bar"><span>{group.attributeId ? "Manual correction or confirmation required" : "Canonical attribute target required"}</span><Link className="button button-primary" href={editHref}>Open manual editor</Link></div>}

        {selected && <div className="workspace-queue-card" style={{marginTop:"0.9rem"}}>
          <div className="workspace-queue-head"><div><strong>Manual editor</strong><small>Correct canonical interpretation without changing raw supplier evidence.</small></div><Link className="text-link" href={productHref}>Close</Link></div>
          {canWrite ? <>
            <form action={resolveManualReviewAction} className="admin-directory-filters" style={{marginTop:"0.75rem"}}>
              <input type="hidden" name="snapshot" value={snapshotId ?? ""}/><input type="hidden" name="dataType" value={dataType ?? ""}/><input type="hidden" name="observationId" value={group.representativeObservationId}/><input type="hidden" name="decision" value="approve"/>
              {manual.selectedTargets.length > 0 && <label><span>Canonical Product Type / attribute</span><select name="mappingTarget" defaultValue={group.productTypeId && group.attributeId ? `${group.productTypeId}|${group.attributeId}` : ""}><option value="">Keep current target</option>{manual.selectedTargets.map((target)=><option key={`${target.productTypeId}:${target.attributeId}`} value={`${target.productTypeId}|${target.attributeId}`}>{target.productTypeName} · {target.attributeCode} · {reviewTypeLabel(target.dataType)}{target.unit?` · ${target.unit}`:""}</option>)}</select></label>}
              <label><span>Canonical value{group.canonicalUnit?` (${group.canonicalUnit})`:""}</span><input name="canonicalValue" defaultValue={editableValue(group.normalizedValue)} placeholder={canonicalPlaceholder(group.dataType)}/></label>
              <label><span>Admin review note</span><input name="reason" maxLength={500} placeholder="Why is this canonical interpretation correct?"/></label>
              <label><span>Scope</span><select name="applyToExactMatches" defaultValue="1"><option value="1">Apply to all {group.observationCount} exact matches</option><option value="0">This observation only</option></select></label>
              <div><button className="button button-primary" type="submit">Save correction & approve</button></div>
            </form>
            <form action={resolveManualReviewAction} className="workspace-action-bar" style={{marginTop:"0.75rem"}}>
              <input type="hidden" name="snapshot" value={snapshotId ?? ""}/><input type="hidden" name="dataType" value={dataType ?? ""}/><input type="hidden" name="observationId" value={group.representativeObservationId}/><input type="hidden" name="decision" value="reject"/><input type="hidden" name="applyToExactMatches" value="1"/>
              <label style={{flex:"1 1 22rem"}}><span>Parser/source rejection reason</span><input name="reason" required maxLength={500} defaultValue={group.mappingReason ?? ""} placeholder="Model-code fragment, duplicate measurement, defective source value…"/></label><button className="button button-secondary" type="submit">Reject exact group · {group.observationCount}</button>
            </form>
          </> : <div className="workspace-inline-note">catalog.write permission is required to save decisions.</div>}
        </div>}
      </article>;
    })}</div>}
    {manual.groups.length >= 120 && <div className="workspace-inline-note">Showing the 120 highest-volume exact review groups for the current filter. Resolve these to expose the next set.</div>}
  </section>;
}

function pageHref(input:{snapshot?:string;stage?:string;dataType?:string;item?:string;saved?:string;mapped?:string;review?:string;key?:string;target?:string;manualSaved?:string;manualAction?:string;manualRows?:string;error?:string}):string {
  const search=new URLSearchParams();
  for(const [key,value] of Object.entries(input)) if(value) search.set(key,value.slice(0,500));
  const query=search.toString();return `/admin/catalogue-intake/attributes${query?`?${query}`:""}`;
}
function revalidateCataloguePaths(){revalidatePath("/admin/catalogue-intake");revalidatePath("/admin/catalogue-intake/attributes");revalidatePath("/admin/catalogue-intake/values");revalidatePath("/admin/catalogue-intake/intelligence");revalidatePath("/admin/catalogue");}
function compactValue(value:unknown):string { if(value==null)return "—";if(typeof value==="string")return value.length>110?`${value.slice(0,107)}…`:value;if(typeof value==="number"||typeof value==="boolean")return String(value);try{const text=JSON.stringify(value);return text.length>110?`${text.slice(0,107)}…`:text;}catch{return "[value]";} }
function editableValue(value:unknown):string { if(value==null)return "";if(typeof value==="string")return value;if(typeof value==="number"||typeof value==="boolean")return String(value);try{return JSON.stringify(value);}catch{return "";} }
function reviewTypeLabel(value:string):string { return ({number:"Number / unit",dimension:"Dimensions",enum:"Controlled value",multienum:"Multiple controlled values",text:"Text",boolean:"Yes / no",unassigned:"Needs attribute target"} as Record<string,string>)[value] ?? value; }
function canonicalPlaceholder(dataType:string):string { if(dataType==="number")return "Enter canonical number";if(dataType==="boolean")return "true / false";if(dataType==="multienum")return "value1, value2 or JSON array";if(dataType==="dimension")return "e.g. 57x12.5x18cm";return "Canonical value"; }
function errorMessage(error:unknown):string { return error instanceof Error?error.message:String(error||"Unexpected attribute review error"); }
