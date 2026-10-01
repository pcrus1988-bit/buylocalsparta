import Link from "next/link";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { assertAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import {
  adminSetVendorProductFeedStatus,
  adminUpdateVendorProductFeedMapping,
  adminVendorProductFeedDetail,
  adminVendorProductFeedWorkspace,
  syncVendorProductFeedById
} from "../../../../lib/vendor-product-feed-service";
import { VENDOR_FEED_FIELDS, type VendorFeedMapping } from "../../../../lib/vendor-product-feed-xml";

export const metadata:Metadata={title:"Admin · Vendor Product Feeds",robots:{index:false,follow:false,nocache:true}};
export const dynamic="force-dynamic";

type Params={feed?:string;saved?:string;error?:string};

async function feedStatusAction(formData:FormData){
  "use server";
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  assertAdminPermission(principal,"catalog.write");
  const feedId=String(formData.get("feedId")??"").trim();
  const raw=String(formData.get("status")??"");
  const status=raw==="paused"?"paused":"active";
  try{
    await adminSetVendorProductFeedStatus(feedId,status);
  }catch(error){
    redirectWithResult(feedId,undefined,error);
  }
  revalidatePath("/admin/catalogue/vendor-feeds");
  redirectWithResult(feedId,status==="paused"?"Feed paused.":"Feed resumed.");
}

async function forceSyncAction(formData:FormData){
  "use server";
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  assertAdminPermission(principal,"catalog.write");
  const feedId=String(formData.get("feedId")??"").trim();
  try{
    await syncVendorProductFeedById(feedId,{triggerType:"manual"});
  }catch(error){
    redirectWithResult(feedId,undefined,error);
  }
  revalidatePath("/admin/catalogue/vendor-feeds");
  redirectWithResult(feedId,"Feed reprocessed successfully.");
}

async function remapAction(formData:FormData){
  "use server";
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  assertAdminPermission(principal,"catalog.write");
  const feedId=String(formData.get("feedId")??"").trim();
  const mapping:VendorFeedMapping={};
  for(const field of VENDOR_FEED_FIELDS){
    const value=String(formData.get(`map_${field}`)??"").trim();
    if(value)mapping[field]=value;
  }
  try{
    await adminUpdateVendorProductFeedMapping(feedId,mapping);
  }catch(error){
    redirectWithResult(feedId,undefined,error);
  }
  revalidatePath("/admin/catalogue/vendor-feeds");
  redirectWithResult(feedId,"Mapping updated. URL feeds are queued for a fresh sync.");
}

export default async function VendorFeedsAdminPage({searchParams}:{searchParams:Promise<Params>}){
  const principal=await getAdminSession();
  if(!principal)redirect("/admin/login");
  assertAdminPermission(principal,"catalog.read");
  const params=await searchParams;
  const feeds=await adminVendorProductFeedWorkspace();
  const selectedId=params.feed&&feeds.some((feed)=>feed.id===params.feed)?params.feed:undefined;
  const detail=selectedId?await adminVendorProductFeedDetail(selectedId):undefined;
  const active=feeds.filter((feed)=>feed.status==="active").length;
  const errors=feeds.filter((feed)=>feed.status==="error").length;
  const products=feeds.reduce((sum,feed)=>sum+feed.productCount,0);
  const problemRows=feeds.reduce((sum,feed)=>sum+feed.warningCount+feed.errorCount,0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Vendor Product Feeds" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalogue · vendor integrations</div>
        <h1>Vendor Product Feeds</h1>
        <p className="lead">Supervise vendor-owned XML catalogues, synchronization health, mapping, reconciliation and governed catalogue handoff from one operator workspace.</p>
        <div className="workspace-action-bar" style={{marginTop:"1rem"}}>
          <Link className="button button-secondary" href="/admin/catalogue">Catalogue Operations</Link>
          <Link className="button button-secondary" href="/admin/catalogue-intake">Supplier PIM</Link>
        </div>
      </div>
      <aside className="dashboard-health-card">
        <span>Feed health</span>
        <strong>{errors?`${errors} feed${errors===1?"":"s"} need attention`:`${active} active feeds`}</strong>
        <p>Only successful feed runs advance missing-item reconciliation. A feed failure never removes products from the storefront.</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      {label:"Connected feeds",value:feeds.length,tone:feeds.length?"positive":"default"},
      {label:"Active",value:active,tone:active?"positive":"default"},
      {label:"Products observed",value:products},
      {label:"Warnings + errors",value:problemRows,tone:problemRows?"attention":"positive"}
    ]}/>

    {params.saved&&<section className="shell vendor-section"><div className="workspace-inline-note" role="status"><strong>{params.saved}</strong></div></section>}
    {params.error&&<section className="shell vendor-section"><div className="workspace-inline-note" role="alert"><strong>Feed action failed.</strong> {params.error}</div></section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Connections" title="All vendor feeds" note="Open a feed for its mapping, issue queue and run history. Admin can pause/resume or force a fresh URL reprocessing run without changing the vendor's catalogue identity." />
      {feeds.length===0?<WorkspaceEmptyState title="No vendor feeds connected yet." body="When a vendor connects an XML upload or URL, it will appear here automatically."/>:
      <div className="workspace-queue-list">{feeds.map((feed)=><article className={`workspace-queue-card${feed.id===selectedId?" is-selected":""}`} key={feed.id}>
        <div className="workspace-queue-head">
          <div><strong>{feed.vendorName} · {feed.name}</strong><small>{feed.sourceKind==="url"?(feed.sourceUrl??"XML URL"):(feed.sourceFilename??"Uploaded XML")} · {feed.detectedFormat}</small></div>
          <span className="status-pill">{feed.status}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{feed.productCount.toLocaleString("el-GR")} products</span>
          <span>{feed.readyCount.toLocaleString("el-GR")} ready</span>
          <span>{feed.warningCount.toLocaleString("el-GR")} warnings</span>
          <span>{feed.errorCount.toLocaleString("el-GR")} errors</span>
        </div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Last sync</strong><span>{when(feed.lastSyncCompletedAt)}</span></div>
          <div className="workspace-compact-row"><strong>Next sync</strong><span>{feed.sourceKind==="url"?when(feed.nextSyncAt):"Manual upload"}</span></div>
          {feed.lastError&&<div className="workspace-compact-row"><strong>Last error</strong><span>{feed.lastError}</span></div>}
        </div>
        <div className="workspace-action-bar" style={{marginTop:"0.75rem",gap:8,flexWrap:"wrap"}}>
          <Link className="button button-secondary" href={`/admin/catalogue/vendor-feeds?feed=${encodeURIComponent(feed.id)}`}>View feed</Link>
          <form action={feedStatusAction}><input type="hidden" name="feedId" value={feed.id}/><input type="hidden" name="status" value={feed.status==="paused"?"active":"paused"}/><button className="button button-secondary" type="submit">{feed.status==="paused"?"Resume":"Pause"}</button></form>
          {feed.sourceKind==="url"&&feed.status!=="paused"&&<form action={forceSyncAction}><input type="hidden" name="feedId" value={feed.id}/><button className="button button-primary" type="submit">Force sync / Reprocess</button></form>}
        </div>
      </article>)}</div>}
    </section>

    {detail&&<section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Feed detail" title={`${detail.feed.vendorName} · ${detail.feed.name}`} note="Mapping is persisted per feed. Updating it never creates duplicate products: the next successful run reconciles the same external product identities." />

      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Source</strong><span>{detail.feed.sourceKind==="url"?(detail.feed.sourceUrl??"—"):(detail.feed.sourceFilename??"Uploaded XML")}</span></div>
        <div className="workspace-compact-row"><strong>Format</strong><span>{detail.feed.detectedFormat}</span></div>
        <div className="workspace-compact-row"><strong>Missing grace</strong><span>{detail.feed.missingGraceRuns} successful feeds before an absent item is paused</span></div>
        <div className="workspace-compact-row"><strong>Last successful sync</strong><span>{when(detail.feed.lastSyncCompletedAt)}</span></div>
      </div>

      <h3 style={{marginTop:"1.5rem"}}>Field mapping</h3>
      <form action={remapAction} className="admin-directory-filters">
        <input type="hidden" name="feedId" value={detail.feed.id}/>
        {VENDOR_FEED_FIELDS.map((field)=><label key={field}>
          <span>{field}</span>
          <select name={`map_${field}`} defaultValue={detail.feed.mapping[field]??""}>
            <option value="">— not mapped —</option>
            {detail.feed.observedFields.map((source)=><option key={source} value={source}>{source}</option>)}
          </select>
        </label>)}
        <div><button className="button button-primary" type="submit">Save mapping</button></div>
      </form>
      {detail.feed.sourceKind==="upload"&&<div className="workspace-inline-note" style={{marginTop:"1rem"}}><strong>Uploaded feed:</strong> KONTA ΜΟΥ does not retain the raw XML file. After remapping, the vendor must upload the next XML again. URL feeds can be reprocessed immediately.</div>}

      <h3 style={{marginTop:"1.5rem"}}>Errors, warnings & missing items</h3>
      {detail.issues.length===0?<WorkspaceEmptyState title="No active feed issues." body="Current normalized rows have no warnings, errors or missing-state exceptions."/>:
      <div className="workspace-queue-list">{detail.issues.map((item)=><article className="workspace-queue-card" key={`${item.externalProductId}:${item.state}`}>
        <div className="workspace-queue-head"><div><strong>{item.title}</strong><small>{item.externalProductId}{item.vendorSku?` · SKU ${item.vendorSku}`:""}{item.gtin?` · GTIN ${item.gtin}`:""}</small></div><span className="status-pill">{item.state}</span></div>
        <p>{item.messages.map((message)=>typeof message==="object"&&message&&"message" in message?String(message.message):"").filter(Boolean).join(" · ")||"Requires review."}</p>
        <div className="workspace-queue-primary">
          {item.categoryPath&&<span>{item.categoryPath}</span>}
          {item.canonicalVariantId&&<span>canonical linked</span>}
          {item.vendorOfferId&&<span>offer linked</span>}
          {item.submissionId&&<span>submission linked</span>}
          {item.state==="missing"&&<span>{item.missingSuccessfulRuns}/{detail.feed.missingGraceRuns} missing runs</span>}
        </div>
      </article>)}</div>}

      <h3 style={{marginTop:"1.5rem"}}>Feed history</h3>
      {detail.runs.length===0?<WorkspaceEmptyState title="No feed runs yet." body="Synchronization history will appear after the first import."/>:
      <div className="workspace-queue-list">{detail.runs.map((run)=><article className="workspace-queue-card" key={run.id}>
        <div className="workspace-queue-head"><div><strong>{when(run.startedAt)} · {run.triggerType}</strong><small>{run.completedAt?`Completed ${when(run.completedAt)}`:"In progress"}</small></div><span className="status-pill">{run.status}</span></div>
        <div className="workspace-queue-primary"><span>{run.productCount} products</span><span>{run.newCount} new</span><span>{run.updatedCount} updated</span><span>{run.missingCount} missing</span><span>{run.linkedOfferCount} linked offers</span><span>{run.submissionCount} submissions</span></div>
        {run.error&&<p>{run.error}</p>}
      </article>)}</div>}
    </section>}
  </main>;
}

function when(value?:number):string{
  return value?new Intl.DateTimeFormat("el-GR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)):"—";
}

function redirectWithResult(feedId:string,saved?:string,error?:unknown):never{
  const search=new URLSearchParams();
  if(feedId)search.set("feed",feedId);
  if(saved)search.set("saved",saved);
  if(error)search.set("error",error instanceof Error?error.message.slice(0,400):"Unknown feed error");
  redirect(`/admin/catalogue/vendor-feeds?${search.toString()}`);
}
