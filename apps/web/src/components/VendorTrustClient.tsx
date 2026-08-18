"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = {
  csrfToken: string;
  mediaUploadMode: "direct" | "development_memory" | "gated";
  products: readonly { id: string; title: string }[];
  assets: readonly { id: string; canonicalVariantId?: string; filename: string; kind: string; byteSize: number; scanStatus: string; rightsStatus: string; moderationStatus: string; rejectionReason?: string; createdAt: number }[];
  documents: readonly { id: string; canonicalVariantId: string; type: string; issuer?: string; identifier?: string; mediaAssetId?: string; status: string; validTo?: number; rejectionReason?: string; createdAt: number }[];
};

export function VendorTrustClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mediaPending = initial.assets.filter((asset) => asset.scanStatus !== "clean" || asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved").length;
  const mediaRejected = initial.assets.filter((asset) => Boolean(asset.rejectionReason) || [asset.scanStatus, asset.rightsStatus, asset.moderationStatus].includes("rejected")).length;
  const docsPending = initial.documents.filter((document) => !["verified", "approved", "rejected", "expired"].includes(document.status)).length;
  const docsVerified = initial.documents.filter((document) => ["verified", "approved"].includes(document.status)).length;
  const hasProducts = initial.products.length > 0;

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      if (initial.mediaUploadMode === "gated") throw new Error("Production media upload is not configured yet. Private object storage and malware scanning are required.");
      if (initial.mediaUploadMode === "development_memory") {
        const response = await fetch("/api/vendor/media", { method: "POST", headers: { "x-csrf-token": initial.csrfToken }, body: form });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        router.refresh();
        return;
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size <= 0) throw new Error("Media file is required");
      const intentResponse = await fetch("/api/vendor/media/intents", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ canonicalVariantId: form.get("canonicalVariantId"), kind: form.get("kind"), filename: file.name, contentType: file.type, byteSize: file.size, altText: form.get("altText"), rightsOwner: form.get("rightsOwner") }) });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error);
      if (file.size > Number(intent.maxBytes)) throw new Error("Media file exceeds the platform upload limit");
      const put = await fetch(String(intent.uploadUrl), { method: "PUT", headers: intent.headers as Record<string, string>, body: file });
      if (!put.ok) throw new Error(`Private object upload failed (${put.status})`);
      const complete = await fetch("/api/vendor/media/complete", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ intentId: intent.intentId }) });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function compliance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/vendor/compliance", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ canonicalVariantId: form.get("product"), type: form.get("type"), issuer: form.get("issuer"), identifier: form.get("identifier"), mediaAssetId: form.get("asset") || undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed");
    } finally { setBusy(false); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Media", value: initial.assets.length },
      { label: "Media pending", value: mediaPending, tone: mediaPending ? "attention" : "default" },
      { label: "Compliance pending", value: docsPending, tone: docsPending ? "attention" : "default", hint: mediaRejected ? `${mediaRejected} media need correction` : undefined },
      { label: "Verified docs", value: docsVerified, tone: docsVerified ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Submit evidence" title="Νέα τεκμήρια" note="Upload και compliance submission είναι ξεχωριστές εργασίες. Κανένα αρχείο δεν γίνεται public πριν από τα required gates." />
      {!hasProducts && <WorkspaceEmptyState eyebrow="Catalog prerequisite" title="Δεν υπάρχουν canonical products διαθέσιμα για τεκμηρίωση." body="Ολοκλήρωσε πρώτα product matching και offer onboarding." />}
      {hasProducts && <div className="workspace-dual-grid">
        <details className="workspace-tool-panel" open>
          <summary><span><strong>Media upload</strong><small>{initial.mediaUploadMode === "gated" ? "Provider not configured" : initial.mediaUploadMode === "direct" ? "Private upload + malware scan" : "Development upload mode"}</small></span></summary>
          <div className="workspace-tool-body">
            {initial.mediaUploadMode === "gated" && <div className="workspace-inline-note">Upload disabled until private object storage and malware scanning are configured.</div>}
            <form onSubmit={upload}>
              <div className="workspace-form-grid">
                <div className="workspace-form-field span-2"><label htmlFor="trust-product">Product</label><select id="trust-product" name="canonicalVariantId" required>{initial.products.map((product) => <option value={product.id} key={product.id}>{product.title}</option>)}</select></div>
                <div className="workspace-form-field"><label htmlFor="trust-kind">Media type</label><select id="trust-kind" name="kind" required><option value="image">Image</option><option value="video">Video</option><option value="document">PDF document</option></select></div>
                <div className="workspace-form-field"><label htmlFor="trust-rights">Rights owner</label><input id="trust-rights" name="rightsOwner" required /></div>
                <div className="workspace-form-field span-2"><label htmlFor="trust-alt">Alt text</label><input id="trust-alt" name="altText" placeholder="Για εικόνες: περιέγραψε σύντομα το περιεχόμενο" /></div>
                <div className="workspace-form-field span-2"><label htmlFor="trust-file">File</label><input id="trust-file" name="file" type="file" required /></div>
              </div>
              <div className="workspace-form-actions"><button className="button" disabled={busy || initial.mediaUploadMode === "gated"}>{busy ? "Upload…" : "Upload evidence"}</button></div>
            </form>
          </div>
        </details>

        <details className="workspace-tool-panel" open>
          <summary><span><strong>Compliance document</strong><small>Submit for platform verification.</small></span></summary>
          <div className="workspace-tool-body"><form onSubmit={compliance}>
            <div className="workspace-form-grid">
              <div className="workspace-form-field span-2"><label htmlFor="compliance-product">Product</label><select id="compliance-product" name="product" required>{initial.products.map((product) => <option value={product.id} key={product.id}>{product.title}</option>)}</select></div>
              <div className="workspace-form-field"><label htmlFor="compliance-type">Document type</label><input id="compliance-type" name="type" required /></div>
              <div className="workspace-form-field"><label htmlFor="compliance-issuer">Issuer</label><input id="compliance-issuer" name="issuer" /></div>
              <div className="workspace-form-field"><label htmlFor="compliance-identifier">Identifier</label><input id="compliance-identifier" name="identifier" /></div>
              <div className="workspace-form-field"><label htmlFor="compliance-asset">Linked document</label><select id="compliance-asset" name="asset"><option value="">No linked media</option>{initial.assets.filter((asset) => asset.kind === "document").map((asset) => <option value={asset.id} key={asset.id}>{asset.filename}</option>)}</select></div>
            </div>
            <div className="workspace-form-actions"><button className="button" disabled={busy}>Submit for verification</button></div>
          </form></div>
        </details>
      </div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Media review" title="Uploads" note="Το πρώτο επίπεδο δείχνει μόνο τις τρεις publication gates. Technical IDs και file metadata είναι expandable." />
      {initial.assets.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν media uploads." /> : <div className="workspace-queue-list">{initial.assets.map((asset) => <article className="workspace-queue-card" key={asset.id}>
        <div className="workspace-queue-head"><div><strong>{asset.filename}</strong><small>{asset.kind} · {(asset.byteSize / 1024).toFixed(1)} KB</small></div><span className="status-pill">{asset.moderationStatus}</span></div>
        <div className="workspace-queue-primary"><span>Scan {asset.scanStatus}</span><span>Rights {asset.rightsStatus}</span><span>Moderation {asset.moderationStatus}</span></div>
        {asset.rejectionReason && <p className="workspace-queue-summary">{asset.rejectionReason}</p>}
        <WorkspaceRecordDetails label="File & product references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Asset ID</strong><span>{asset.id}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{asset.canonicalVariantId ?? "Unassigned"}</span></div><div className="workspace-compact-row"><strong>Uploaded</strong><span>{new Date(asset.createdAt).toLocaleString("el-GR")}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Compliance verification" title="Documents" note="Verification status first; issuer, identifiers and linked media remain secondary detail." />
      {initial.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν compliance documents." /> : <div className="workspace-queue-list">{initial.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.type}</strong><small>{document.issuer ?? "Issuer not specified"}</small></div><span className="status-pill">{document.status}</span></div>
        {document.rejectionReason && <p className="workspace-queue-summary">{document.rejectionReason}</p>}
        <WorkspaceRecordDetails label="Document references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Product</strong><span>{document.canonicalVariantId}</span></div><div className="workspace-compact-row"><strong>Identifier</strong><span>{document.identifier ?? "—"}</span></div>{document.mediaAssetId && <div className="workspace-compact-row"><strong>Linked media asset</strong><span>{document.mediaAssetId}</span></div>}</div></WorkspaceRecordDetails>
      </article>)}</div>}
    </section>
  </>;
}
