"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { VendorProfileMediaAssignment } from "../lib/vendor-profile-media-service";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = Readonly<{
  csrfToken: string;
  vendorId: string;
  mediaUploadMode: "direct" | "development_memory" | "gated";
  assignments: readonly VendorProfileMediaAssignment[];
}>;

type Role = VendorProfileMediaAssignment["role"];

const ROLE_LABELS: Record<Role, string> = {
  logo: "Λογότυπο",
  storefront: "Φωτογραφία καταστήματος",
  team: "Άνθρωποι / ομάδα",
  gallery: "Gallery"
};

const ROLE_HELP: Record<Role, string> = {
  logo: "Καθαρό λογότυπο ή brand mark. Προτίμησε τετράγωνη εικόνα με αρκετό κενό γύρω από το σήμα.",
  storefront: "Κύρια φωτογραφία της φυσικής βιτρίνας ή του εσωτερικού που αναγνωρίζει αμέσως το κατάστημα.",
  team: "Εγκεκριμένη φωτογραφία ιδιοκτήτη, συμβούλου ή ομάδας που παρουσιάζεται δημόσια στο Meet the vendor.",
  gallery: "Πρόσθετες αυθεντικές φωτογραφίες καταστήματος, χώρου, υπηρεσίας ή εμπειρίας. Δεν χρησιμοποιούνται ως εικόνες προϊόντων."
};

function approved(asset: VendorProfileMediaAssignment): boolean {
  return asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
}

function statusLabel(asset: VendorProfileMediaAssignment): string {
  if (asset.publicationStatus === "published" && approved(asset)) return "Δημοσιευμένο";
  if (asset.rejectionReason || [asset.scanStatus, asset.rightsStatus, asset.moderationStatus].includes("rejected")) return "Χρειάζεται διόρθωση";
  if (approved(asset)) return "Εγκεκριμένο · αναμένει δημοσίευση";
  if (asset.publicationStatus === "archived") return "Αρχειοθετημένο";
  return "Σε έλεγχο";
}

function publicMediaUrl(asset: VendorProfileMediaAssignment): string | undefined {
  return asset.publicationStatus === "published" && approved(asset) ? `/api/media/${encodeURIComponent(asset.mediaId)}` : undefined;
}

export function VendorStorefrontMediaClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useMemo(() => initial.assignments.filter((asset) => asset.publicationStatus !== "archived"), [initial.assignments]);
  const published = active.filter((asset) => asset.publicationStatus === "published" && approved(asset));
  const pending = active.filter((asset) => asset.publicationStatus !== "published" || !approved(asset));
  const singletonPublished = new Map<Role, VendorProfileMediaAssignment>();
  for (const asset of published) if (asset.role !== "gallery") singletonPublished.set(asset.role, asset);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (initial.mediaUploadMode !== "direct") throw new Error(initial.mediaUploadMode === "gated"
        ? "Η ασφαλής αποστολή εικόνων είναι προσωρινά απενεργοποιημένη από την πλατφόρμα."
        : "Η διαχείριση storefront media απαιτεί το production media pipeline.");
      const form = new FormData(event.currentTarget);
      const file = form.get("file");
      const role = String(form.get("profileRole") ?? "") as Role;
      if (!(file instanceof File) || file.size <= 0) throw new Error("Επίλεξε εικόνα για ανέβασμα.");
      if (!Object.hasOwn(ROLE_LABELS, role)) throw new Error("Επίλεξε έγκυρο ρόλο εικόνας.");
      const intentResponse = await fetch("/api/vendor/media/intents", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({
          profileRole: role,
          kind: "image",
          filename: file.name,
          contentType: file.type,
          byteSize: file.size,
          altText: String(form.get("altText") ?? ""),
          rightsOwner: String(form.get("rightsOwner") ?? "")
        })
      });
      const intent = await intentResponse.json();
      if (!intentResponse.ok) throw new Error(intent.error ?? "Δεν δημιουργήθηκε ασφαλές upload.");
      if (file.size > Number(intent.maxBytes)) throw new Error("Η εικόνα υπερβαίνει το επιτρεπόμενο μέγεθος.");
      const put = await fetch(String(intent.uploadUrl), { method: "PUT", headers: intent.headers as Record<string, string>, body: file });
      if (!put.ok) throw new Error("Η μεταφόρτωση της εικόνας απέτυχε.");
      const complete = await fetch("/api/vendor/media/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({ intentId: intent.intentId })
      });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error ?? "Δεν ολοκληρώθηκε η υποβολή της εικόνας.");
      event.currentTarget.reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η υποβολή απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/vendor/storefront/media", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken },
        body: JSON.stringify({ assignmentId, action: "archive" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η απόσυρση της εικόνας.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}

    <WorkspaceMetricStrip items={[
      { label: "Δημοσιευμένες εικόνες", value: published.length, tone: published.length ? "positive" : "default" },
      { label: "Σε έλεγχο / αναμονή", value: pending.length, tone: pending.length ? "attention" : "default" },
      { label: "Βασικές θέσεις έτοιμες", value: ["logo","storefront","team"].filter((role) => singletonPublished.has(role as Role)).length },
      { label: "Gallery", value: published.filter((asset) => asset.role === "gallery").length }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Public storefront" title="Οι εικόνες που χτίζουν την ταυτότητα του καταστήματός σου" note="Κάθε εικόνα έχει συγκεκριμένο ρόλο. Μετά το upload περνά malware scan, έλεγχο δικαιωμάτων και moderation πριν μπορεί να δημοσιευθεί." />
      <div className="workspace-dual-grid">
        {(["logo","storefront","team"] as const).map((role) => {
          const current = singletonPublished.get(role);
          return <article className="workspace-queue-card" key={role}>
            <div className="workspace-queue-head"><div><strong>{ROLE_LABELS[role]}</strong><small>{ROLE_HELP[role]}</small></div><span className="status-pill">{current ? "Live" : "Κενό"}</span></div>
            {current ? <div className="workspace-media-preview"><Image src={publicMediaUrl(current)!} alt={current.altText ?? ROLE_LABELS[role]} width={720} height={420} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 16 }} /></div> : <p className="workspace-queue-summary">Δεν υπάρχει ακόμη δημοσιευμένη εικόνα σε αυτή τη θέση. Το δημόσιο storefront χρησιμοποιεί ασφαλές fallback μέχρι να εγκριθεί μία.</p>}
          </article>;
        })}
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Upload" title="Πρόσθεσε ή αντικατάστησε storefront εικόνα" note="Η νέα εικόνα δεν αντικαθιστά την υπάρχουσα live εικόνα μέχρι να ολοκληρωθούν οι έλεγχοι και να δημοσιευθεί από το admin." />
      {initial.mediaUploadMode !== "direct" && <div className="workspace-inline-note">Η ασφαλής μεταφόρτωση δεν είναι αυτή τη στιγμή διαθέσιμη. Οι ήδη δημοσιευμένες εικόνες παραμένουν κανονικά ενεργές.</div>}
      <details className="workspace-tool-panel" open>
        <summary><span><strong>Νέα storefront εικόνα</strong><small>JPEG, PNG ή WebP</small></span></summary>
        <div className="workspace-tool-body">
          <form onSubmit={upload}>
            <div className="workspace-form-grid">
              <label>Ρόλος εικόνας<select name="profileRole" required defaultValue="storefront"><option value="logo">Λογότυπο</option><option value="storefront">Φυσικό κατάστημα</option><option value="team">Άνθρωποι / ομάδα</option><option value="gallery">Gallery</option></select></label>
              <label>Αρχείο<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required disabled={initial.mediaUploadMode !== "direct"} /></label>
              <label className="workspace-form-span-2">Alt text<input name="altText" required maxLength={240} placeholder="π.χ. Η βιτρίνα του καταστήματος στην οδό …" /></label>
              <label className="workspace-form-span-2">Κάτοχος δικαιωμάτων<input name="rightsOwner" required maxLength={200} placeholder="Επωνυμία επιχείρησης ή φωτογράφος / δικαιούχος" /></label>
            </div>
            <div className="workspace-action-bar"><span>Με την υποβολή δηλώνεις ποιος κατέχει τα δικαιώματα. Η εικόνα δεν γίνεται δημόσια πριν την έγκριση.</span><button className="button" type="submit" disabled={busy || initial.mediaUploadMode !== "direct"}>{busy ? "Αποστολή…" : "Υποβολή για έλεγχο"}</button></div>
          </form>
        </div>
      </details>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Media history" title="Υποβολές storefront" note="Βλέπεις ξεχωριστά τον τεχνικό έλεγχο, την έγκριση και τη δημοσίευση. Μπορείς να αποσύρεις μία υποβολή ή live εικόνα οποιαδήποτε στιγμή." />
      {active.length === 0 ? <WorkspaceEmptyState title="Δεν έχεις υποβάλει ακόμη storefront εικόνες." body="Ξεκίνα με λογότυπο, μία καθαρή φωτογραφία της πρόσοψης και μία προαιρετική φωτογραφία της ομάδας." /> : <div className="workspace-queue-list">
        {active.map((asset) => <article className="workspace-queue-card" key={asset.id}>
          <div className="workspace-queue-head"><div><strong>{ROLE_LABELS[asset.role]}</strong><small>{asset.filename}</small></div><span className="status-pill">{statusLabel(asset)}</span></div>
          <div className="workspace-queue-primary"><span>Scan {asset.scanStatus}</span><span>Rights {asset.rightsStatus}</span><span>Moderation {asset.moderationStatus}</span><span>Publication {asset.publicationStatus}</span></div>
          {asset.rejectionReason && <div className="workspace-inline-note"><strong>Παρατήρηση:</strong> {asset.rejectionReason}</div>}
          <div className="workspace-action-bar"><span>{asset.publicationStatus === "published" ? "Η απόσυρση αφαιρεί την εικόνα από το δημόσιο storefront." : "Μπορείς να αποσύρεις την υποβολή όσο περιμένει έλεγχο ή δημοσίευση."}</span><button className="button button-secondary" type="button" disabled={busy} onClick={() => void archive(asset.id)}>Απόσυρση</button></div>
        </article>)}
      </div>}
    </section>
  </>;
}
