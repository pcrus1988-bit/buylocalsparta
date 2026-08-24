import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCatalogueIntakeWorkspace } from "../../../lib/admin-catalogue-intake";
import { adminCatalogueVendorOptions, assignCatalogueSnapshotToVendor } from "../../../lib/admin-catalogue-vendor-assignment";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Supplier PIM Intake", robots: { index: false, follow: false, nocache: true } };

type Params = {
  snapshot?: string; q?: string; price?: string; classification?: string; product?: string;
  assigned?: string; assignedRows?: string; alreadyAssigned?: string; vendorName?: string; assignmentError?: string;
};

async function assignCatalogueAction(formData: FormData) {
  "use server";
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const snapshotId = String(formData.get("snapshotId") ?? "").trim();
  const vendorId = String(formData.get("vendorId") ?? "").trim();
  try {
    const result = await assignCatalogueSnapshotToVendor(principal, { snapshotId, vendorId });
    revalidatePath("/admin/catalogue-intake");
    revalidatePath("/admin/vendors");
    const search = new URLSearchParams({
      snapshot: result.snapshotId,
      assigned: "1",
      assignedRows: String(result.newlyAssigned),
      alreadyAssigned: String(result.alreadyAssigned),
      vendorName: result.vendorName
    });
    redirect(`/admin/catalogue-intake?${search.toString()}`);
  } catch (error) {
    const search = new URLSearchParams({ snapshot: snapshotId, assignmentError: errorMessage(error) });
    redirect(`/admin/catalogue-intake?${search.toString()}`);
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const [data, vendors] = await Promise.all([
    adminCatalogueIntakeWorkspace(principal, {
      snapshotId: params.snapshot,
      q: params.q,
      priceState: params.price,
      classificationStatus: params.classification,
      productId: params.product
    }),
    adminCatalogueVendorOptions(principal)
  ]);
  const snapshot = data.snapshots.find((item) => item.id === data.effectiveSnapshotId) ?? data.snapshots[0];
  const selected = data.selected;
  const hasFilters = Boolean(params.q?.trim() || params.price?.trim() || params.classification?.trim());
  const assignmentSuccess = params.assigned === "1";
  const hrefFor = (productId: string) => {
    const search = new URLSearchParams();
    if (data.effectiveSnapshotId) search.set("snapshot", data.effectiveSnapshotId);
    if (params.q) search.set("q", params.q);
    if (params.price) search.set("price", params.price);
    if (params.classification) search.set("classification", params.classification);
    search.set("product", productId);
    return `/admin/catalogue-intake?${search.toString()}`;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Supplier PIM Intake" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Catalog · source evidence</div><h1>Supplier PIM Intake</h1><p className="lead">Governed supplier catalogue workspace for provenance, taxonomy, price evidence, attributes, canonical matching and bulk vendor assortment assignment before anything becomes public or sellable.</p></div>
      <aside className="dashboard-health-card"><span>Governance mode</span><strong>Evidence + assignment</strong><p>Bulk assignment creates vendor assortment candidates only. It never creates stock or public offers automatically.</p></aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Snapshot products", value: snapshot?.productCount ?? 0 },
      { label: "Price conflicts", value: snapshot?.priceConflict ?? 0, tone: snapshot?.priceConflict ? "attention" : "default" },
      { label: "Price review", value: snapshot?.priceReviewRequired ?? 0, tone: snapshot?.priceReviewRequired ? "attention" : "default" },
      { label: "Unmapped attributes", value: snapshot?.unmappedAttributes ?? 0, tone: snapshot?.unmappedAttributes ? "attention" : "default" },
      { label: "Compatibility candidates", value: snapshot?.candidateCompatibility ?? 0, tone: snapshot?.candidateCompatibility ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Vendor catalogue" title="Assign the entire catalogue to a vendor" note="Choose a Supplier PIM snapshot and vendor. Every source product is attached to the vendor's primary active location in one idempotent operation. Existing assignments are preserved; later canonical matching upgrades the same assortment rows." />
      {assignmentSuccess && <div className="workspace-queue-card" role="status" style={{marginBottom:"1rem"}}>
        <strong>Catalogue assigned to {params.vendorName ?? "vendor"}</strong>
        <p>{Number(params.assignedRows ?? 0).toLocaleString("el-GR")} products newly assigned · {Number(params.alreadyAssigned ?? 0).toLocaleString("el-GR")} were already assigned.</p>
        <small>No offers, inventory or public publication were activated by this operation.</small>
      </div>}
      {params.assignmentError && <div className="workspace-queue-card" role="alert" style={{marginBottom:"1rem"}}><strong>Could not assign catalogue</strong><p>{params.assignmentError}</p></div>}
      <form action={assignCatalogueAction} className="admin-directory-filters">
        <label>
          <span>Supplier PIM snapshot</span>
          <select name="snapshotId" required defaultValue={data.effectiveSnapshotId ?? ""}>
            <option value="" disabled>Select snapshot</option>
            {data.snapshots.map((item)=><option key={item.id} value={item.id}>{item.sourceName} · {item.productCount.toLocaleString("el-GR")} products</option>)}
          </select>
        </label>
        <label>
          <span>Assign to vendor</span>
          <select name="vendorId" required defaultValue="">
            <option value="" disabled>Select vendor</option>
            {vendors.map((vendor)=><option key={vendor.id} value={vendor.id} disabled={!vendor.locationId}>{vendor.name} · {vendor.status}{vendor.demoMode?" · demo":""}{vendor.locationId?` · ${vendor.locationName ?? "primary location"}`:" · no active location"}</option>)}
          </select>
        </label>
        <div><button className="button button-primary" type="submit" disabled={!snapshot || vendors.every((vendor)=>!vendor.locationId)}>Assign entire catalogue</button></div>
      </form>
      <div className="workspace-inline-note">Assignment is deliberately separate from publication. Unmatched products become candidate assortments; already matched products keep their canonical links. Vendor confirmation, pricing, stock and offer activation remain governed separately.</div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Immutable evidence" title="Source snapshots" note="Κάθε εισαγωγή παραμένει ξεχωριστό immutable snapshot. Το hash επιτρέπει να αποδεικνύεται ακριβώς ποιο master file παρήγαγε τα review records." />
      {data.snapshots.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη supplier snapshot." body="Promote a completed catalogue crawl or import a governed source before assigning it to vendors." /> : <div className="workspace-queue-list">{data.snapshots.map((item) => {
        const active = item.id === data.effectiveSnapshotId;
        const search = new URLSearchParams();
        search.set("snapshot", item.id);
        return <article className={`workspace-queue-card${active ? " is-selected" : ""}`} key={item.id}>
          <div className="workspace-queue-head"><div><strong>{item.sourceName}</strong><small>{item.sourceFilename ?? item.sourceCode} · version {item.sourceVersion ?? "—"}</small></div><span className="status-pill">{item.productCount} rows</span></div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>SHA-256</strong><span title={item.sourceHash}>{item.sourceHash.slice(0, 16)}…</span></div>
            <div className="workspace-compact-row"><strong>Observed</strong><span>{when(item.observedAt ?? item.createdAt)}</span></div>
            <div className="workspace-compact-row"><strong>Price states</strong><span>{item.priceMatched} matched · {item.priceUnpriced} unpriced · {item.priceConflict} conflicts · {item.priceReviewRequired} review</span></div>
            <div className="workspace-compact-row"><strong>Taxonomy</strong><span>{item.approvedCategoryMappings} approved · {item.candidateCategoryMappings} candidate mappings</span></div>
          </div>
          {!active && <div className="workspace-action-bar"><span>Inspect this immutable intake snapshot</span><Link className="button button-secondary" href={`/admin/catalogue-intake?${search.toString()}`}>Open snapshot</Link></div>}
        </article>;
      })}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Quality queue" title="Evidence requiring review" note="Priority: price conflicts → price review → classification → unmapped attributes → compatibility/canonical candidates. Η λίστα περιορίζεται στα 120 υψηλότερης προτεραιότητας records ανά filter." />
      <div className="workspace-inline-note">The evidence review below remains read-only. Bulk vendor assignment above does not approve questionable canonical matches or publish products.</div>
      <form method="get" className="admin-directory-filters">
        {data.effectiveSnapshotId && <input type="hidden" name="snapshot" value={data.effectiveSnapshotId} />}
        <label><span>Search</span><input name="q" defaultValue={params.q ?? ""} placeholder="Title, supplier code, model, brand…" /></label>
        <label><span>Price state</span><select name="price" defaultValue={params.price ?? ""}><option value="">All</option><option value="conflict">Conflict</option><option value="review_required">Review required</option><option value="unpriced">Unpriced</option><option value="matched">Matched</option></select></label>
        <label><span>Classification</span><select name="classification" defaultValue={params.classification ?? ""}><option value="">All</option><option value="review_required">Review required</option><option value="raw">Raw</option><option value="mapped">Mapped</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
        <div><button className="button button-secondary" type="submit">Filter</button>{hasFilters && <Link className="text-link" href={data.effectiveSnapshotId ? `/admin/catalogue-intake?snapshot=${encodeURIComponent(data.effectiveSnapshotId)}` : "/admin/catalogue-intake"}>Clear</Link>}</div>
      </form>

      {data.queue.length === 0 ? <WorkspaceEmptyState title={data.snapshots.length ? "Δεν βρέθηκαν source products με αυτά τα φίλτρα." : "Η review queue θα εμφανιστεί μετά το πρώτο governed import."} /> : <div className="admin-split-workspace">
        <div className="admin-triage-list" aria-label="Supplier PIM review queue">{data.queue.map((item) => <Link href={hrefFor(item.id)} key={item.id} className={`admin-triage-row${selected?.product.id === item.id ? " is-selected" : ""}`}>
          <span><strong>{item.title}</strong><small>{[item.brand, item.model, item.supplierCode].filter(Boolean).join(" · ") || item.sourceProductKey}</small></span>
          <span className="admin-triage-meta"><b>{item.priceState.replaceAll("_", " ")}</b><small>{item.reviewReasons.slice(0, 2).join(" · ") || "evidence captured"}</small></span><i aria-hidden="true">›</i>
        </Link>)}</div>

        {selected && <article className="admin-decision-panel">
          <div className="admin-decision-head"><div><span>Source evidence</span><h2>{selected.product.title}</h2><p>{selected.product.sourceName} · {selected.product.taxonomyPath.join(" › ") || "Uncategorized"}</p></div><span className="status-pill">{selected.product.priceState}</span></div>
          <div className="admin-decision-summary"><div><span>Supplier code</span><strong>{selected.product.supplierCode ?? "—"}</strong></div><div><span>App category</span><strong>{selected.product.appCategoryCode ?? "Needs mapping"}</strong></div><div><span>Review reasons</span><strong>{selected.product.reviewReasons.length}</strong></div></div>

          <WorkspaceRecordDetails label="Identity & provenance" open><div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Source key</strong><span>{selected.product.sourceProductKey}</span></div>
            <div className="workspace-compact-row"><strong>Brand / model</strong><span>{[selected.product.brand, selected.product.model].filter(Boolean).join(" · ") || "—"}</span></div>
            <div className="workspace-compact-row"><strong>GTIN evidence</strong><span>{selected.product.gtinCandidate ? `${selected.product.gtinCandidate} · ${selected.product.gtinStatus ?? "candidate"}` : "No GTIN evidence"}</span></div>
            <div className="workspace-compact-row"><strong>Snapshot</strong><span title={selected.product.sourceHash}>{selected.product.sourceFilename ?? "source file"} · {selected.product.sourceHash.slice(0, 16)}…</span></div>
            {selected.product.sourceUrl && <div className="workspace-compact-row"><strong>Source page</strong><a className="text-link" href={selected.product.sourceUrl} target="_blank" rel="noreferrer">Open supplier evidence ↗</a></div>}
          </div></WorkspaceRecordDetails>

          <WorkspaceRecordDetails label={`Price evidence · ${selected.prices.length}`} open>{selected.prices.length === 0 ? <div className="workspace-inline-note">No price observation is attached to this source row.</div> : <div className="workspace-compact-list">{selected.prices.map((price, index) => <div className="workspace-compact-row" key={`${price.kind}-${price.amountMinor}-${index}`}><strong>{money(price.amountMinor, price.currency)}</strong><span>{price.kind} · {price.status}{price.confidence !== undefined ? ` · ${Math.round(price.confidence * 100)}%` : ""}{price.sourceReference ? ` · ${price.sourceReference}` : ""}</span></div>)}</div>}</WorkspaceRecordDetails>

          <WorkspaceRecordDetails label={`Attributes · ${selected.attributes.length}`}><div className="workspace-compact-list">{selected.attributes.slice(0, 80).map((attribute, index) => <div className="workspace-compact-row" key={`${attribute.sourceKey}-${index}`}><strong>{attribute.attributeCode ?? attribute.sourceKey}</strong><span>{compactValue(attribute.normalizedValue ?? attribute.rawValue)} · {attribute.mappingStatus}{attribute.sourceUnit ? ` · ${attribute.sourceUnit}` : ""}</span></div>)}</div>{selected.attributes.length > 80 && <div className="workspace-inline-note">Showing first 80 of {selected.attributes.length} attributes.</div>}</WorkspaceRecordDetails>

          <WorkspaceRecordDetails label={`Compatibility · ${selected.compatibility.length}`}><div className="workspace-compact-list">{selected.compatibility.map((claim, index) => <div className="workspace-compact-row" key={`${claim.targetKind}-${claim.targetReference ?? claim.platformName}-${index}`}><strong>{claim.platformName ?? claim.targetReference ?? claim.targetKind}</strong><span>{claim.relationshipType} · {claim.evidenceLevel} · {claim.reviewStatus} · {Math.round(claim.confidence * 100)}%</span></div>)}</div></WorkspaceRecordDetails>

          <WorkspaceRecordDetails label={`Category mappings · ${selected.categoryMappings.length}`}><div className="workspace-compact-list">{selected.categoryMappings.map((mapping) => <div className="workspace-compact-row" key={`${mapping.categoryCode}-${mapping.mappingStatus}`}><strong>{mapping.categoryCode}</strong><span>{mapping.mappingStatus} · {mapping.mappingMethod}{mapping.confidence !== undefined ? ` · ${Math.round(mapping.confidence * 100)}%` : ""}</span></div>)}</div></WorkspaceRecordDetails>

          <WorkspaceRecordDetails label={`Canonical candidates · ${selected.links.length}`}><div className="workspace-compact-list">{selected.links.map((link) => <div className="workspace-compact-row" key={`${link.canonicalVariantId}-${link.linkStatus}`}><strong>{link.canonicalVariantId}</strong><span>{link.linkStatus} · {link.matchMethod}{link.confidence !== undefined ? ` · ${Math.round(link.confidence * 100)}%` : ""}</span></div>)}</div></WorkspaceRecordDetails>

          <WorkspaceRecordDetails label="Quality evidence"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Review reasons</strong><span>{selected.product.reviewReasons.join(" · ") || "No current review reason"}</span></div><div className="workspace-compact-row"><strong>Quality payload</strong><span>{compactValue(selected.product.qualityPayload)}</span></div></div></WorkspaceRecordDetails>
          <div className="workspace-action-bar"><span>Next lifecycle: reviewed source evidence → governed canonical matching.</span><Link className="button button-secondary" href="/admin/matching">Open Product Matching</Link></div>
        </article>}
      </div>}
    </section>
  </main>;
}

function when(value: number): string { return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)); }
function money(minor: number, currency: string): string { return new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(minor / 100); }
function compactValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  const raw = JSON.stringify(value);
  return raw.length > 240 ? `${raw.slice(0, 237)}…` : raw;
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error || "Catalogue assignment failed"); }
