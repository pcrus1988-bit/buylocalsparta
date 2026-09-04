"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { VendorProfileMediaAssignment } from "../lib/vendor-profile-media-service";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Role = VendorProfileMediaAssignment["role"];
type Props = Readonly<{
  csrfToken: string;
  vendorId: string;
  mediaUploadMode: "direct" | "development_memory" | "gated";
  assignments: readonly VendorProfileMediaAssignment[];
  canApprove: boolean;
  previewEnabled: boolean;
}>;

const ROLE_LABELS: Record<Role, string> = {
  logo: "Λογότυπο",
  storefront: "Κύρια φωτογραφία καταστήματος",
  team: "Άνθρωποι / ομάδα",
  gallery: "Gallery"
};

function approved(asset: VendorProfileMediaAssignment): boolean {
  return asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
}

function statusLabel(asset: VendorProfileMediaAssignment): string {
  if (asset.publicationStatus === "published" && approved(asset)) return "Live";
  if (asset.rejectionReason || [asset.scanStatus, asset.rightsStatus, asset.moderationStatus].includes("rejected")) return "Rejected";
  if (asset.scanStatus !== "clean") return `Scan · ${asset.scanStatus}`;
  if (approved(asset)) return "Approved · ready to publish";
  return "Review required";
}

export function AdminVendorDesignMediaClient({ csrfToken, vendorId, mediaUploadMode, assignments, canApprove, previewEnabled }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vendorAssignments = useMemo(() => assignments.filter((item) => item.vendorId === vendorId && item.publicationStatus !== "archived"), [assignments, vendorId]);
  const published = vendorAssignments.filter((asset) => asset.publicationStatus === "published" && approved(asset));
  const currentByRole = new Map<Role, VendorProfileMediaAssignment>();
  for (const asset of published) if (asset.role !== "gallery") currentByRole.set(asset.role, asset);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mediaUploadMode !== "direct") throw new Error("The production media pipeline is not ready for direct uploads.");
      const form = new FormData(event.currentTarget);
      const file = form.get("file");
      const profileRole = String(form.get("profileRole") ?? "") as Role;
      if (!(file instanceof File) || file.size <= 0) throw new Error("Choose an image first.");
      const intentResponse = await fetch("/api/admin/vendor-design/media-intents", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          vendorId,
          profileRole,
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          altText: String(form.get("altText") ?? ""),
          rightsOwner: String(form.get("rightsOwner") ?? "")
        })
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error ?? "Could not create the secure upload.");
      if (file.size > Number(intent.maxBytes)) throw new Error("The image exceeds the permitted upload size.");
      const put = await fetch(String(intent.uploadUrl), { method: "PUT", headers: intent.headers as Record<string, string>, body: file });
      if (!put.ok) throw new Error("Image upload failed.");
      const complete = await fetch("/api/admin/vendor-design/media-complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ intentId: intent.intentId })
      });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error ?? "Could not complete the image submission.");
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function act(assignmentId: string, action: "approve_publish" | "publish" | "unpublish" | "reject") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/vendor-design/media-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ assignmentId, action, reason: `Partner design: ${action}` })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Media action failed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Media action failed.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {error && <div className="form-error vendor-error" role="alert">{error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Published images", value: published.length, tone: published.length ? "positive" : "default" },
      { label: "Pending / review", value: vendorAssignments.length - published.length, tone: vendorAssignments.length - published.length ? "attention" : "default" },
      { label: "Core visuals", value: ["logo", "storefront", "team"].filter((role) => currentByRole.has(role as Role)).length, hint: "logo / shop / team" },
      { label: "Gallery", value: published.filter((item) => item.role === "gallery").length }
    ]} />

    <section className="vendor-section">
      <WorkspaceSectionHeading eyebrow="Visual identity" title="Logo, storefront, people & gallery" note="The same governed media assignments feed the live vendor storefront and, when DEMO mode is enabled, the DEMO storefront. Replacements do not displace the current published image until approved and published." />
      <div className="workspace-dual-grid">
        {(["logo", "storefront", "team"] as const).map((role) => {
          const current = currentByRole.get(role);
          return <article className="workspace-queue-card" key={role}>
            <div className="workspace-queue-head"><div><strong>{ROLE_LABELS[role]}</strong><small>{current ? current.altText ?? current.filename : "No published image yet"}</small></div><span className="status-pill">{current ? "Published" : "Empty"}</span></div>
            {current && previewEnabled && <div className="workspace-media-preview"><Image src={`/api/media/${encodeURIComponent(current.mediaId)}`} alt={current.altText ?? ROLE_LABELS[role]} width={720} height={420} style={{ width: "100%", height: 220, objectFit: role === "logo" ? "contain" : "cover", borderRadius: 16 }} /></div>}
            {current && !previewEnabled && <div className="workspace-inline-note">Published and ready. Enable DEMO (or make the active/research storefront publicly eligible) to expose the governed media URL for preview.</div>}
          </article>;
        })}
      </div>
    </section>

    <section className="vendor-section section-tint"><div>
      <WorkspaceSectionHeading eyebrow="Upload" title="Add or replace storefront media" note="Admin uploads use the same private storage, automated malware scan, rights review and moderation workflow as vendor uploads." />
      {mediaUploadMode !== "direct" && <div className="workspace-inline-note">Direct media upload is currently gated by production storage / scanner configuration. Existing published media remains available.</div>}
      <details className="workspace-tool-panel" open>
        <summary><span><strong>New storefront image</strong><small>JPEG, PNG or WebP</small></span></summary>
        <div className="workspace-tool-body">
          <form onSubmit={upload}>
            <div className="workspace-form-grid">
              <label>Image role<select name="profileRole" required defaultValue="logo"><option value="logo">Λογότυπο</option><option value="storefront">Κύρια φωτογραφία καταστήματος</option><option value="team">Άνθρωποι / ομάδα</option><option value="gallery">Gallery</option></select></label>
              <label>File<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required disabled={mediaUploadMode !== "direct"} /></label>
              <label className="workspace-form-span-2">Alt text<input name="altText" required maxLength={240} placeholder="Describe exactly what the customer sees" /></label>
              <label className="workspace-form-span-2">Rights owner<input name="rightsOwner" required maxLength={200} placeholder="Business, photographer or rights holder" /></label>
            </div>
            <div className="workspace-action-bar"><span>Upload creates a draft. Publication remains blocked until the automated scan is clean and rights/moderation are approved.</span><button className="button" type="submit" disabled={busy || mediaUploadMode !== "direct"}>{busy ? "Working…" : "Upload for review"}</button></div>
          </form>
        </div>
      </details>
    </div></section>

    <section className="vendor-section">
      <WorkspaceSectionHeading eyebrow="Media queue" title="Review & publication" note="Use Approve & publish only after the automated scanner reports clean. Publishing a new logo/storefront/team image archives the previous published image in that role." />
      {vendorAssignments.length === 0 ? <WorkspaceEmptyState title="No storefront media has been submitted for this vendor." /> : <div className="workspace-compact-list">
        {vendorAssignments.map((asset) => <div className="workspace-compact-row" key={asset.id}>
          <strong>{ROLE_LABELS[asset.role]}</strong>
          <span>{asset.filename} · {statusLabel(asset)}</span>
          <small>{asset.altText ?? "No alt text"}</small>
          <div className="workspace-action-buttons">
            {asset.publicationStatus === "published" && approved(asset) ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => act(asset.id, "unpublish")}>Unpublish</button>
              : approved(asset) ? <button className="button" type="button" disabled={busy} onClick={() => act(asset.id, "publish")}>Publish</button>
              : asset.scanStatus === "clean" && canApprove ? <button className="button" type="button" disabled={busy} onClick={() => act(asset.id, "approve_publish")}>Approve & publish</button>
              : <span className="muted">{asset.scanStatus === "clean" ? "Catalog write permission required" : "Waiting for clean scan"}</span>}
            {asset.publicationStatus !== "published" && canApprove && <button className="button button-secondary" type="button" disabled={busy} onClick={() => act(asset.id, "reject")}>Reject</button>}
          </div>
        </div>)}
      </div>}
    </section>
  </>;
}
