"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ResearchBusinessClassificationWorkspace
} from "../lib/research-business-classification";
import {
  WorkspaceMetricStrip,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "./WorkspacePagePrimitives";

function classificationLabel(status?: string): string {
  if (status === "confirmed") return "Επιβεβαιωμένη";
  if (status === "suggested") return "Πρόταση";
  return "Εκκρεμεί";
}

function activityEvidence(
  item: ResearchBusinessClassificationWorkspace["items"][number]
): string {
  if (item.sourceActivityDetails.length) {
    return item.sourceActivityDetails.map((activity) =>
      activity.code + (activity.description ? " · " + activity.description : "")
    ).join(" | ");
  }
  return item.allKadCodes.join(", ");
}

export function ResearchBusinessClassificationControls({
  slug,
  csrfToken,
  canManage,
  initial
}: {
  slug: string;
  csrfToken: string;
  canManage: boolean;
  initial: ResearchBusinessClassificationWorkspace;
}) {
  const router = useRouter();
  const [items, setItems] = useState([...initial.items]);
  const [categoryByUnit, setCategoryByUnit] = useState<Record<string, string>>(
    Object.fromEntries(initial.items.flatMap((item) => item.categoryCode ? [[item.frameUnitId, item.categoryCode]] : []))
  );
  const [noteByUnit, setNoteByUnit] = useState<Record<string, string>>({});
  const [rememberByUnit, setRememberByUnit] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");

  const categoryLabels = useMemo(
    () => new Map(initial.categories.map((category) => [category.code, category.label])),
    [initial.categories]
  );

  async function canonicalize(frameUnitId: string) {
    const categoryCode = categoryByUnit[frameUnitId];
    if (!categoryCode) {
      setMessage("Επιλέξτε πρώτα κανονικοποιημένη κατηγορία.");
      return;
    }
    setBusy(frameUnitId);
    setMessage("");
    try {
      const response = await fetch(
        "/api/admin/research/surveys/" + encodeURIComponent(slug) + "/business-classification",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken
          },
          body: JSON.stringify({
            frameUnitId,
            categoryCode,
            note: noteByUnit[frameUnitId] || undefined,
            rememberAlias: rememberByUnit[frameUnitId] !== false
          })
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "RESEARCH_BUSINESS_CLASSIFICATION_FAILED");

      setItems((current) => current.map((item) => item.frameUnitId === frameUnitId
        ? {
            ...item,
            categoryCode,
            categoryLabel: categoryLabels.get(categoryCode),
            classificationStatus: "confirmed",
            classificationSource: "admin",
            confidence: undefined
          }
        : item
      ));
      setMessage(body.aliasRemembered
        ? "Η κατηγορία επιβεβαιώθηκε και η διατύπωση αποθηκεύτηκε ως κανόνας για μελλοντικές παρόμοιες απαντήσεις."
        : "Η κατηγορία επιβεβαιώθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν ήταν δυνατή η κανονικοποίηση.");
    } finally {
      setBusy(undefined);
    }
  }

  if (!initial.databaseConfigured || !initial.studyFound) return null;

  return <section className="shell vendor-section" id={"survey-business-classification-" + slug}>
    <WorkspaceSectionHeading
      eyebrow="Κατηγοριοποίηση επιχειρήσεων"
      title="Κύρια δραστηριότητα & κανονικοποιημένες κατηγορίες"
      note="Τα στοιχεία πηγής παραμένουν αμετάβλητα. Η απάντηση της επιχείρησης και η κανονικοποιημένη κατηγορία αποθηκεύονται χωριστά, ώστε κάθε διόρθωση να είναι ελέγξιμη."
    />

    <WorkspaceMetricStrip items={[
      { label: "Επικοινωνήσιμες μονάδες", value: initial.counts.contactable.toLocaleString("el-GR") },
      { label: "Με δήλωση δραστηριότητας", value: initial.counts.withRespondentActivity.toLocaleString("el-GR") },
      { label: "Αυτόματες προτάσεις", value: initial.counts.suggested.toLocaleString("el-GR") },
      { label: "Επιβεβαιωμένες", value: initial.counts.confirmed.toLocaleString("el-GR") },
      { label: "Χωρίς κατηγορία", value: initial.counts.pending.toLocaleString("el-GR") }
    ]} />

    <div className="workspace-inline-note">
      <strong>Κανόνας:</strong> «Κύριος ΚΑΔ» εμφανίζεται μόνο όταν η ίδια η πηγή τον χαρακτηρίζει ρητά ως κύριο.
      Οι ΚΑΔ που χρησιμοποιήθηκαν για να εντοπιστεί μια επιχείρηση στο δείγμα δεν θεωρούνται κύριοι ΚΑΔ.
    </div>

    {items.length === 0 ? <div className="workspace-inline-note">Δεν υπάρχουν ακόμη επικοινωνήσιμες μονάδες προς κατηγοριοποίηση.</div> : <div style={{ overflowX: "auto", marginTop: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1260 }}>
        <thead><tr>
          <th style={{ textAlign: "left", padding: 10 }}>Επιχείρηση</th>
          <th style={{ textAlign: "left", padding: 10 }}>Στοιχεία ΚΑΔ πηγής</th>
          <th style={{ textAlign: "left", padding: 10 }}>Δήλωση επιχείρησης</th>
          <th style={{ textAlign: "left", padding: 10 }}>Κανονικοποίηση</th>
          <th style={{ textAlign: "left", padding: 10 }}>Ενέργεια</th>
        </tr></thead>
        <tbody>{items.map((item) => {
          const selected = categoryByUnit[item.frameUnitId] || "";
          const hasRespondentWording = Boolean(
            item.respondentSaysPrimaryRevenue === false
              ? item.respondentPrimaryRevenueActivity
              : item.respondentMainActivity
          );
          return <tr key={item.frameUnitId}>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", verticalAlign: "top" }}>
              <strong>{item.legalName || "Χωρίς επωνυμία"}</strong><br />
              <small>{[item.municipality, item.prefecture].filter(Boolean).join(" · ") || "—"}</small>
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", verticalAlign: "top", maxWidth: 360 }}>
              <strong>Κύριος από πηγή:</strong> {item.sourcePrimaryKad || "Δεν δηλώνεται"}<br />
              <small title={activityEvidence(item)}>
                Όλοι οι ΚΑΔ: {item.allKadCodes.length ? item.allKadCodes.join(", ") : "—"}
              </small>
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", verticalAlign: "top", maxWidth: 300 }}>
              {item.respondentMainActivity
                ? <>
                    <strong>{item.respondentMainActivity}</strong><br />
                    <small>
                      {item.respondentSaysPrimaryRevenue === true
                        ? "Δηλώθηκε ως κύρια πηγή εσόδων"
                        : item.respondentSaysPrimaryRevenue === false
                          ? "Κύρια πηγή εσόδων: " + (item.respondentPrimaryRevenueActivity || "—")
                          : "—"}
                    </small>
                  </>
                : <small>Δεν έχει απαντήσει ακόμη.</small>}
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", verticalAlign: "top", minWidth: 250 }}>
              <WorkspaceStatusBadge
                status={item.classificationStatus === "confirmed" ? "active" : item.classificationStatus === "suggested" ? "warning" : "pending"}
                label={classificationLabel(item.classificationStatus)}
              />
              {item.categoryLabel && <><br /><strong>{item.categoryLabel}</strong></>}
              {item.confidence != null && <><br /><small>Ομοιότητα διατύπωσης: {Math.round(item.confidence * 100)}%</small></>}
              <select
                aria-label={"Κανονικοποιημένη κατηγορία " + (item.legalName || item.frameUnitId)}
                disabled={!canManage || Boolean(busy)}
                onChange={(event) => setCategoryByUnit((current) => ({ ...current, [item.frameUnitId]: event.target.value }))}
                value={selected}
                style={{ width: "100%", marginTop: 8 }}
              >
                <option value="">Επιλέξτε κατηγορία…</option>
                {initial.categories.map((category) => <option key={category.code} value={category.code}>
                  {category.parentCode ? "↳ " : ""}{category.label}
                </option>)}
              </select>
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", verticalAlign: "top", minWidth: 280 }}>
              {canManage ? <>
                <input
                  aria-label={"Σημείωση κανονικοποίησης " + (item.legalName || item.frameUnitId)}
                  maxLength={500}
                  placeholder="Σημείωση (προαιρετική)"
                  type="text"
                  value={noteByUnit[item.frameUnitId] || ""}
                  onChange={(event) => setNoteByUnit((current) => ({ ...current, [item.frameUnitId]: event.target.value }))}
                  style={{ width: "100%" }}
                />
                <label style={{ display: "flex", gap: 8, margin: "8px 0", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={rememberByUnit[item.frameUnitId] !== false}
                    disabled={!hasRespondentWording}
                    onChange={(event) => setRememberByUnit((current) => ({ ...current, [item.frameUnitId]: event.target.checked }))}
                  />
                  <small>
                    {hasRespondentWording
                      ? "Θυμήσου αυτή τη διατύπωση για παρόμοιες μελλοντικές απαντήσεις."
                      : "Ο κανόνας επανάχρησης ενεργοποιείται όταν υπάρχει απάντηση της επιχείρησης."}
                  </small>
                </label>
                <button
                  className="button button-secondary"
                  disabled={Boolean(busy) || !selected}
                  onClick={() => void canonicalize(item.frameUnitId)}
                  type="button"
                >{busy === item.frameUnitId ? "Αποθήκευση…" : "Επιβεβαίωση κατηγορίας"}</button>
              </> : <small>Απαιτείται δικαίωμα σχεδιασμού έρευνας για αλλαγές.</small>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    {items.length >= 300 && <div className="workspace-inline-note">
      Προβάλλονται οι πρώτες 300 μονάδες, με προτεραιότητα σε απαντήσεις που χρειάζονται έλεγχο και σε αυτόματες προτάσεις.
    </div>}
    {message && <div className="workspace-inline-note">{message}</div>}
  </section>;
}
