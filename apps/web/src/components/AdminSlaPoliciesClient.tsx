"use client";

import { useState, type FormEvent } from "react";

type Workspace = Readonly<{
  defaults: Readonly<{ acceptanceMinutes: number; preparationMinutes: number; warningPercent: number; emailReminderPercent: number; escalationGraceMinutes: number; timezone: string }>;
  agreements: readonly Readonly<{
    agreementId: string; agreementCode: string; agreementVersion: number; agreementStatus: string; vendorId: string; vendorName: string;
    sourceText: Readonly<{ orderAcceptanceSla: string; fulfilmentSla: string }>;
    configured: boolean; policyId?: string; acceptanceMinutes: number; preparationMinutes: number; warningPercent: number;
    emailReminderPercent: number; escalationGraceMinutes: number; timezone: string; updatedAt?: string;
  }>[];
}>;

export function AdminSlaPoliciesClient({ initial, csrfToken }: { initial: Workspace; csrfToken: string }) {
  const [workspace, setWorkspace] = useState(initial);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>, agreementId: string) {
    event.preventDefault();
    setBusyId(agreementId);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/finance/agreements/sla", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          agreementId,
          acceptanceMinutes: Number(form.get("acceptanceMinutes")),
          preparationMinutes: Number(form.get("preparationMinutes")),
          warningPercent: Number(form.get("warningPercent")),
          emailReminderPercent: Number(form.get("emailReminderPercent")),
          escalationGraceMinutes: Number(form.get("escalationGraceMinutes"))
        })
      });
      const data = await response.json() as Workspace & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η αποθήκευση απέτυχε");
      setWorkspace(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αποθήκευση απέτυχε");
    } finally {
      setBusyId("");
    }
  }

  return <section className="shell vendor-section">
    <div className="workspace-callout"><strong>Fallback για παλιές συμφωνίες χωρίς executable policy</strong><span>Αποδοχή {workspace.defaults.acceptanceMinutes}′ · προετοιμασία {workspace.defaults.preparationMinutes}′ · in-app στο {workspace.defaults.warningPercent}% · email στο {workspace.defaults.emailReminderPercent}% · escalation +{workspace.defaults.escalationGraceMinutes}′. Το fallback επισημαίνεται στο Admin Notification Centre και δεν αλλάζει το κείμενο ήδη υπογεγραμμένης σύμβασης.</span></div>
    {workspace.agreements.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν ανοικτές συμφωνίες.</strong></div> : <div className="workspace-queue-list">{workspace.agreements.map((agreement) => <article className="workspace-queue-card" key={agreement.agreementId}>
      <div className="workspace-queue-head"><div><strong>{agreement.vendorName}</strong><small>{agreement.agreementCode} · v{agreement.agreementVersion}</small></div><span className="status-pill">{agreement.configured ? "SLA configured" : "fallback"}</span></div>
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>Contract: acceptance</strong><span>{agreement.sourceText.orderAcceptanceSla || "—"}</span></div>
        <div className="workspace-compact-row"><strong>Contract: fulfilment</strong><span>{agreement.sourceText.fulfilmentSla || "—"}</span></div>
      </div>
      <form className="vendor-form-card" onSubmit={(event) => void save(event, agreement.agreementId)}>
        <div className="form-grid">
          <label>Acceptance SLA (minutes)<input name="acceptanceMinutes" type="number" min="5" max="10080" required defaultValue={agreement.acceptanceMinutes} /></label>
          <label>Preparation SLA (minutes)<input name="preparationMinutes" type="number" min="5" max="43200" required defaultValue={agreement.preparationMinutes} /></label>
          <label>1ο in-app reminder %<input name="warningPercent" type="number" min="1" max="95" required defaultValue={agreement.warningPercent} /></label>
          <label>Email reminder %<input name="emailReminderPercent" type="number" min="5" max="99" required defaultValue={agreement.emailReminderPercent} /></label>
          <label>Grace πριν escalation (minutes)<input name="escalationGraceMinutes" type="number" min="0" max="10080" required defaultValue={agreement.escalationGraceMinutes} /></label>
          <label>Timezone<input value={agreement.timezone} readOnly /></label>
        </div>
        <div className="workspace-action-bar"><span>{agreement.updatedAt ? `Updated ${new Date(agreement.updatedAt).toLocaleString("el-GR")}` : "Δεν έχει αποθηκευτεί executable policy"}</span><button className="button button-primary" disabled={busyId === agreement.agreementId}>{busyId === agreement.agreementId ? "Αποθήκευση…" : "Αποθήκευση SLA policy"}</button></div>
      </form>
    </article>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
