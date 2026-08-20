"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = { csrfToken: string; returns: readonly any[] };
const replacementLabels: Record<string, string> = { accept: "Αποδοχή", ready: "Έτοιμο", ship: "Αποστολή", deliver: "Παράδοση", reject: "Απόρριψη" };
const repairLabels: Record<string, string> = { start: "Έναρξη", await_part: "Αναμονή ανταλλακτικού", ready: "Έτοιμο", return_to_customer: "Επιστροφή στον πελάτη", fail: "Αδυναμία επισκευής" };

export function VendorReturnsClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const replacementCases = initial.returns.filter((item) => Boolean(item.replacement)).length;
  const repairCases = initial.returns.filter((item) => Boolean(item.repair)).length;
  const intakeCases = initial.returns.filter((item) => ["in_transit", "received"].includes(item.status)).length;

  async function act(returnId: string, kind: string, action: string) {
    const key = `${returnId}:${kind}:${action}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/vendor/returns/action", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ returnId, kind, action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η ενέργεια απέτυχε");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert">{error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Return cases", value: initial.returns.length },
      { label: "Physical intake", value: intakeCases, tone: intakeCases ? "attention" : "default" },
      { label: "Replacement", value: replacementCases },
      { label: "Repair", value: repairCases }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Assigned cases" title="Returns & after-sales" note="Η πλατφόρμα αποφασίζει eligibility και οικονομικό remedy. Το κατάστημα επιβεβαιώνει τη φυσική παραλαβή και την κατάσταση του προϊόντος. Refund μέσω Viva εκτελείται αποκλειστικά από εξουσιοδοτημένο admin." />
      {initial.returns.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν return cases ανατεθειμένα στο κατάστημά σου." /> : <div className="workspace-queue-list">{initial.returns.map((item) => <article className="workspace-queue-card" key={item.id}>
        <div className="workspace-queue-head"><div><strong>Order {item.orderId}</strong><small>{item.quantity}× product · requested {item.requestedRemedy}</small></div><span className="status-pill">{item.status}</span></div>
        <div className="workspace-queue-primary"><span>{item.requestedRemedy}</span>{item.replacement && <span>Replacement {item.replacement.status}</span>}{item.repair && <span>Repair {item.repair.status}</span>}</div>
        <p className="workspace-queue-summary">{item.reason}</p>
        <WorkspaceRecordDetails label="RMA, product & case references">
          <div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Return ID</strong><span>{item.id}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{item.canonicalVariantId}</span></div>{item.authorization && <div className="workspace-compact-row"><strong>RMA {item.authorization.rmaCode}</strong><span>{item.authorization.instructions}</span></div>}</div>
        </WorkspaceRecordDetails>

        {["in_transit", "received"].includes(item.status) && <details className="workspace-tool-panel" style={{ marginTop: 12 }} open>
          <summary><span><strong>Physical return intake</strong><small>Καταχώρισε μόνο γεγονότα που συνέβησαν πραγματικά στο κατάστημα.</small></span></summary>
          <div className="workspace-tool-body"><div className="workspace-action-buttons" style={{ marginTop: 14 }}>
            {item.status === "in_transit" && <button className="button" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "receive")}>{busy === `${item.id}:intake:receive` ? "Καταχώριση…" : "Παραλήφθηκε από το κατάστημα"}</button>}
            {item.status === "received" && <><button className="button" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "inspect_sellable")}>{busy === `${item.id}:intake:inspect_sellable` ? "Καταχώριση…" : "Έλεγχος: sellable"}</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "inspect_blocked")}>{busy === `${item.id}:intake:inspect_blocked` ? "Καταχώριση…" : "Έλεγχος: blocked/damaged"}</button></>}
          </div></div>
        </details>}

        {item.replacement && <details className="workspace-tool-panel" style={{ marginTop: 12 }} open>
          <summary><span><strong>Replacement · {item.replacement.status}</strong><small>Operational actions για την αντικατάσταση.</small></span></summary>
          <div className="workspace-tool-body"><div className="workspace-action-buttons" style={{ marginTop: 14 }}>{["accept", "ready", "ship", "deliver", "reject"].map((action) => <button className={`button${action === "reject" ? " button-secondary" : ""}`} disabled={Boolean(busy)} key={action} onClick={() => void act(item.id, "replacement", action)}>{busy === `${item.id}:replacement:${action}` ? "Ενέργεια…" : replacementLabels[action]}</button>)}</div></div>
        </details>}
        {item.repair && <details className="workspace-tool-panel" style={{ marginTop: 12 }} open>
          <summary><span><strong>Repair · {item.repair.status}</strong><small>Operational actions για την επισκευή.</small></span></summary>
          <div className="workspace-tool-body"><div className="workspace-action-buttons" style={{ marginTop: 14 }}>{["start", "await_part", "ready", "return_to_customer", "fail"].map((action) => <button className={`button${action === "fail" ? " button-secondary" : ""}`} disabled={Boolean(busy)} key={action} onClick={() => void act(item.id, "repair", action)}>{busy === `${item.id}:repair:${action}` ? "Ενέργεια…" : repairLabels[action]}</button>)}</div></div>
        </details>}
      </article>)}</div>}
    </section>
  </>;
}
