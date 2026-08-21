"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { VendorActionNotice, VendorLifecycle, type VendorLifecycleStep, vendorStatusLabel } from "./VendorLifecycle";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Workspace = { csrfToken: string; returns: readonly any[] };

const replacementLabels: Record<string, string> = {
  accept: "Αποδοχή αντικατάστασης",
  ready: "Η αντικατάσταση είναι έτοιμη",
  ship: "Η αντικατάσταση στάλθηκε",
  deliver: "Παραδόθηκε στον πελάτη",
  reject: "Δεν μπορώ να κάνω την αντικατάσταση"
};
const repairLabels: Record<string, string> = {
  start: "Έναρξη επισκευής",
  await_part: "Αναμονή ανταλλακτικού",
  ready: "Η επισκευή ολοκληρώθηκε",
  return_to_customer: "Επιστράφηκε στον πελάτη",
  fail: "Η επισκευή δεν είναι δυνατή"
};
const reasonLabels: Record<string, string> = {
  withdrawal: "Υπαναχώρηση",
  defect: "Ελάττωμα",
  nonconformity: "Το προϊόν δεν ανταποκρίνεται στα συμφωνημένα",
  missing_part: "Λείπει μέρος / εξάρτημα",
  transit_damage: "Ζημιά κατά τη μεταφορά",
  wrong_item: "Λάθος προϊόν",
  safety_recall: "Ανάκληση ασφαλείας"
};
const remedyLabels: Record<string, string> = {
  refund: "Επιστροφή χρημάτων",
  replacement: "Αντικατάσταση",
  repair: "Επισκευή",
  price_reduction: "Μείωση τιμής"
};

function replacementActions(replacement: any): readonly string[] {
  if (!replacement) return [];
  if (replacement.status === "awaiting_vendor") return ["accept", "reject"];
  if (replacement.status === "accepted") return replacement.fulfilmentMode === "pickup" ? ["ready"] : replacement.fulfilmentMode === "shipping" ? ["ship"] : [];
  if (["ready_for_handover", "shipped"].includes(replacement.status)) return ["deliver"];
  return [];
}

function repairActions(repair: any): readonly string[] {
  if (!repair) return [];
  if (repair.status === "approved") return ["start", "fail"];
  if (repair.status === "in_repair") return ["await_part", "ready", "fail"];
  if (repair.status === "awaiting_part") return ["ready", "fail"];
  if (repair.status === "ready_for_customer") return ["return_to_customer"];
  return [];
}

function returnLifecycle(item: any): readonly VendorLifecycleStep[] {
  const labels = ["Αίτημα", "Έγκριση", "Επιστροφή προϊόντος", "Έλεγχος", "Λύση", "Ολοκλήρωση"];
  const status = String(item.status ?? "").toLowerCase();
  if (["refunded", "replaced", "closed"].includes(status)) return labels.map((label) => ({ label, tone: "done" as const }));
  if (status === "rejected") return [
    { label: "Αίτημα", tone: "done" },
    { label: "Δεν εγκρίθηκε", tone: "blocked" },
    ...labels.slice(2).map((label) => ({ label, tone: "future" as const }))
  ];

  let current = 1;
  let tone: VendorLifecycleStep["tone"] = "waiting";
  if (["approved", "inspection_required", "in_transit"].includes(status)) current = 2;
  if (status === "received") { current = 3; tone = "attention"; }
  if (status === "inspected") current = 4;
  if (status === "remedy_approved") {
    current = 4;
    tone = replacementActions(item.replacement).length || repairActions(item.repair).length ? "attention" : "waiting";
  }

  return labels.map((label, index) => ({ label, tone: index < current ? "done" : index === current ? tone : "future" }));
}

function replacementLifecycle(replacement: any): readonly VendorLifecycleStep[] {
  const labels = replacement.fulfilmentMode === "pickup"
    ? ["Αποδοχή", "Προετοιμασία", "Έτοιμη", "Παράδοση"]
    : ["Αποδοχή", "Προετοιμασία", "Αποστολή", "Παράδοση"];
  const status = replacement.status;
  if (status === "delivered") return labels.map((label) => ({ label, tone: "done" as const }));
  if (status === "rejected") return [{ label: "Δεν έγινε αποδεκτή", tone: "blocked" }, ...labels.slice(1).map((label) => ({ label, tone: "future" as const }))];
  const current = status === "awaiting_vendor" ? 0 : status === "accepted" ? 1 : ["ready_for_handover", "shipped"].includes(status) ? 3 : 1;
  return labels.map((label, index) => ({ label, tone: index < current ? "done" : index === current ? (replacementActions(replacement).length ? "attention" : "current") : "future" }));
}

function repairLifecycle(repair: any): readonly VendorLifecycleStep[] {
  const labels = ["Έναρξη", "Επισκευή", "Έτοιμο", "Επιστροφή"];
  if (repair.status === "returned") return labels.map((label) => ({ label, tone: "done" as const }));
  if (repair.status === "failed") return [{ label: "Έναρξη", tone: "done" }, { label: "Δεν ήταν δυνατή", tone: "blocked" }, { label: "Έτοιμο", tone: "future" }, { label: "Επιστροφή", tone: "future" }];
  const current = repair.status === "approved" ? 0 : ["in_repair", "awaiting_part"].includes(repair.status) ? 1 : repair.status === "ready_for_customer" ? 3 : 1;
  return labels.map((label, index) => ({ label, tone: index < current ? "done" : index === current ? (repairActions(repair).length ? "attention" : "current") : "future" }));
}

export function VendorReturnsClient({ initial }: { initial: Workspace }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const replacementCases = initial.returns.filter((item) => Boolean(item.replacement)).length;
  const repairCases = initial.returns.filter((item) => Boolean(item.repair)).length;
  const intakeCases = initial.returns.filter((item) => ["in_transit", "received"].includes(item.status)).length;

  async function act(returnId: string, kind: string, action: string) {
    if (["reject", "fail", "deliver", "return_to_customer"].includes(action)) {
      const message = action === "reject" ? "Επιβεβαιώνεις ότι το κατάστημα δεν μπορεί να αναλάβει την αντικατάσταση;"
        : action === "fail" ? "Επιβεβαιώνεις ότι η επισκευή δεν μπορεί να ολοκληρωθεί;"
          : "Επιβεβαιώνεις ότι το προϊόν παραδόθηκε στον πελάτη;";
      if (!window.confirm(message)) return;
    }
    const key = `${returnId}:${kind}:${action}`;
    setBusy(key);
    setError("");
    try {
      const response = await fetch("/api/vendor/returns/action", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": initial.csrfToken }, body: JSON.stringify({ returnId, kind, action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ενημερώσουμε την επιστροφή.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να ενημερώσουμε την επιστροφή.");
    } finally { setBusy(""); }
  }

  return <>
    {error && <div className="shell form-error vendor-error" role="alert"><strong>Η κατάσταση δεν άλλαξε.</strong> {error}</div>}
    <WorkspaceMetricStrip items={[
      { label: "Επιστροφές", value: initial.returns.length },
      { label: "Χρειάζονται παραλαβή / έλεγχο", value: intakeCases, tone: intakeCases ? "attention" : "default" },
      { label: "Αντικαταστάσεις", value: replacementCases },
      { label: "Επισκευές", value: repairCases }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Επιστροφές" title="Κάθε υπόθεση, ένα επόμενο βήμα" note="Το ΚΟΝΤΑ ΜΟΥ χειρίζεται την επιλεξιμότητα και τις οικονομικές αποφάσεις. Εσύ καταγράφεις μόνο ό,τι συμβαίνει πραγματικά με το προϊόν στο κατάστημά σου." />
      <WorkspaceHowItWorks className="vendor-page-help">
        <p><strong>Όταν επιστρέφεται προϊόν:</strong> επιβεβαιώνεις πρώτα ότι το παρέλαβες και μετά την πραγματική του κατάσταση.</p>
        <p><strong>Αν εγκριθεί αντικατάσταση ή επισκευή:</strong> εμφανίζονται μόνο οι ενέργειες που επιτρέπονται στο τρέχον στάδιο.</p>
        <p><strong>Επιστροφή χρημάτων:</strong> γίνεται από το ΚΟΝΤΑ ΜΟΥ. Δεν χρειάζεται να πληρώσεις τον πελάτη από το κατάστημα.</p>
      </WorkspaceHowItWorks>
      {initial.returns.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν επιστροφές ανατεθειμένες στο κατάστημά σου." /> : <div className="workspace-queue-list">{initial.returns.map((item) => {
        const replacementNext = replacementActions(item.replacement);
        const repairNext = repairActions(item.repair);
        const needsIntake = ["in_transit", "received"].includes(item.status);
        const needsAction = needsIntake || replacementNext.length > 0 || repairNext.length > 0;
        return <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head"><div><strong className="vendor-case-title">{item.authorization?.rmaCode ? `Επιστροφή ${item.authorization.rmaCode}` : "Αίτημα επιστροφής"}</strong><small>{item.quantity}× προϊόν · {remedyLabels[item.requestedRemedy] ?? "Αίτημα εξυπηρέτησης"}</small></div><span className="vendor-merchant-status">{vendorStatusLabel(item.status)}</span></div>
          <VendorLifecycle steps={returnLifecycle(item)} ariaLabel="Πορεία επιστροφής" />
          {needsAction ? <VendorActionNotice tone="attention" title="Χρειάζεται ενέργεια από εσένα">Η σωστή επόμενη ενέργεια εμφανίζεται ακριβώς παρακάτω.</VendorActionNotice> : ["refunded", "replaced", "closed"].includes(item.status) ? <VendorActionNotice tone="positive" title="Η υπόθεση ολοκληρώθηκε" /> : <VendorActionNotice tone="waiting" title="Δεν χρειάζεται ενέργεια αυτή τη στιγμή">Περιμένουμε τον πελάτη ή το ΚΟΝΤΑ ΜΟΥ να προχωρήσει το επόμενο στάδιο.</VendorActionNotice>}
          <div className="workspace-queue-primary"><span>{remedyLabels[item.requestedRemedy] ?? item.requestedRemedy}</span>{item.replacement && <span>Αντικατάσταση: {vendorStatusLabel(item.replacement.status)}</span>}{item.repair && <span>Επισκευή: {vendorStatusLabel(item.repair.status)}</span>}</div>
          <p className="workspace-queue-summary"><strong>Λόγος:</strong> {reasonLabels[item.reason] ?? item.reason}</p>

          {["in_transit", "received"].includes(item.status) && <section className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <div className="workspace-tool-body">
              <strong>{item.status === "in_transit" ? "Το προϊόν επιστρέφεται στο κατάστημά σου" : "Έλεγξε την κατάσταση του προϊόντος"}</strong>
              <div className="workspace-action-buttons" style={{ marginTop: 14 }}>
                {item.status === "in_transit" && <button className="button" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "receive")}>{busy === `${item.id}:intake:receive` ? "Καταχώριση…" : "Παρέλαβα το προϊόν"}</button>}
                {item.status === "received" && <><button className="button" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "inspect_sellable")}>{busy === `${item.id}:intake:inspect_sellable` ? "Καταχώριση…" : "Άθικτο / κατάλληλο προς πώληση"}</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, "intake", "inspect_blocked")}>{busy === `${item.id}:intake:inspect_blocked` ? "Καταχώριση…" : "Κατεστραμμένο / μη πωλήσιμο"}</button></>}
              </div>
            </div>
          </section>}

          {item.replacement && <section className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <div className="workspace-tool-body">
              <strong>Αντικατάσταση</strong>
              <VendorLifecycle steps={replacementLifecycle(item.replacement)} ariaLabel="Πορεία αντικατάστασης" />
              {replacementNext.length ? <div className="workspace-action-buttons" style={{ marginTop: 14 }}>{replacementNext.map((action) => <button className={`button${action === "reject" ? " button-secondary" : ""}`} disabled={Boolean(busy)} key={action} onClick={() => void act(item.id, "replacement", action)}>{busy === `${item.id}:replacement:${action}` ? "Ενημέρωση…" : replacementLabels[action]}</button>)}</div> : <p className="vendor-waiting-copy">Δεν υπάρχει διαθέσιμη ενέργεια για το κατάστημα στο τρέχον στάδιο.</p>}
            </div>
          </section>}
          {item.repair && <section className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <div className="workspace-tool-body">
              <strong>Επισκευή</strong>
              <VendorLifecycle steps={repairLifecycle(item.repair)} ariaLabel="Πορεία επισκευής" />
              {repairNext.length ? <div className="workspace-action-buttons" style={{ marginTop: 14 }}>{repairNext.map((action) => <button className={`button${action === "fail" ? " button-secondary" : ""}`} disabled={Boolean(busy)} key={action} onClick={() => void act(item.id, "repair", action)}>{busy === `${item.id}:repair:${action}` ? "Ενημέρωση…" : repairLabels[action]}</button>)}</div> : <p className="vendor-waiting-copy">Δεν υπάρχει διαθέσιμη ενέργεια για το κατάστημα στο τρέχον στάδιο.</p>}
            </div>
          </section>}

          <WorkspaceRecordDetails label="Τεχνικές λεπτομέρειες για υποστήριξη">
            <div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Return ID</strong><span className="vendor-technical-id">{item.id}</span></div><div className="workspace-compact-row"><strong>Order</strong><span className="vendor-technical-id">{item.orderId}</span></div><div className="workspace-compact-row"><strong>Product reference</strong><span className="vendor-technical-id">{item.canonicalVariantId}</span></div>{item.authorization && <div className="workspace-compact-row"><strong>{item.authorization.rmaCode}</strong><span>{item.authorization.instructions}</span></div>}</div>
          </WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>
  </>;
}
