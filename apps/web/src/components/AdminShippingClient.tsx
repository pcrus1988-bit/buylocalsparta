"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Row = { vendorId: string; vendorName: string; locationId: string; locationName: string; postcode: string; providerLocationId?: string };

export function AdminShippingClient({ csrfToken, rows }: { csrfToken: string; rows: readonly Row[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const mapped = rows.filter((row) => Boolean(row.providerLocationId)).length;
  const missing = rows.length - mapped;

  async function save(event: FormEvent<HTMLFormElement>, locationId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const providerLocationId = String(form.get("providerLocationId") ?? "").trim();
    setBusy(locationId);
    setError("");
    try {
      const response = await fetch("/api/admin/shipping/origin", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ vendorLocationId: locationId, providerLocationId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση mapping απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αποθήκευση mapping απέτυχε");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Locations", value: rows.length },
      { label: "Mapped", value: mapped, tone: mapped ? "positive" : "default" },
      { label: "Missing", value: missing, tone: missing ? "attention" : "positive" },
      { label: "Coverage", value: rows.length ? `${Math.round((mapped / rows.length) * 100)}%` : "—" }
    ]} />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Origin mapping" title="Vendor locations" note="Το provider origin ID είναι platform-controlled configuration και δεν εκτίθεται στο Vendor workspace." />
      {rows.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν Vendor fulfilment locations για mapping." /> : <div className="workspace-queue-list">{rows.map((row) => <article className="workspace-queue-card" key={row.locationId}>
        <div className="workspace-queue-head"><div><strong>{row.vendorName}</strong><small>{row.locationName} · ΤΚ {row.postcode}</small></div><span className="status-pill">{row.providerLocationId ? "mapped" : "missing"}</span></div>
        <form onSubmit={(event) => void save(event, row.locationId)}>
          <div className="workspace-form-grid"><div className="workspace-form-field span-2"><label htmlFor={`origin-${row.locationId}`}>BOX NOW origin location ID</label><input id={`origin-${row.locationId}`} name="providerLocationId" defaultValue={row.providerLocationId ?? ""} required /></div></div>
          <div className="workspace-form-actions"><button className="button" disabled={busy === row.locationId}>{busy === row.locationId ? "Αποθήκευση…" : row.providerLocationId ? "Update mapping" : "Save mapping"}</button></div>
        </form>
        <WorkspaceRecordDetails label="Internal Vendor location references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Vendor ID</strong><span>{row.vendorId}</span></div><div className="workspace-compact-row"><strong>Location ID</strong><span>{row.locationId}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </section>
  </>;
}
