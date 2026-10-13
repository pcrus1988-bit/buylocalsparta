import Link from "next/link";
import type { ResearchConsentDirectoryResult } from "../lib/research-survey-consent-directory";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "./WorkspacePagePrimitives";

const LABELS: Readonly<Record<string, string>> = {
  research_participation: "Συμμετοχή στην έρευνα",
  results_notification: "Ενημέρωση αποτελεσμάτων",
  thank_you_code: "Κωδικός ευχαριστίας",
  marketing: "Εμπορική επικοινωνία (marketing)"
};

function dateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "medium", timeStyle: "medium" })
    : "—";
}

export function ResearchStudyConsentDirectory({
  slug, data
}: {
  slug: string;
  data: ResearchConsentDirectoryResult;
}) {
  const root = "/admin/research/surveys/" + encodeURIComponent(slug) + "/consent";
  const next = new URLSearchParams();
  if (data.kind) next.set("kind", data.kind);
  if (data.decision) next.set("decision", data.decision);
  if (data.nextCursor) next.set("cursor", data.nextCursor);

  return <section className="shell vendor-section" id="survey-consent-evidence">
    <WorkspaceSectionHeading
      eyebrow="Μητρώο συγκαταθέσεων"
      title="Συμμετέχοντες, email και ακριβείς χρόνοι opt-in"
      note="Κάθε γραμμή είναι η τελευταία καταγεγραμμένη επιλογή ανά συμμετέχοντα και τύπο συγκατάθεσης. Περιλαμβάνονται όλες οι φάσεις της μελέτης, ακόμη και μετά το κλείσιμο ή τη δημοσίευσή της."
    />

    <div className="analytics-workflow-grid">
      {data.summary.map(item => <article className="analytics-workflow-card" key={item.kind}>
        <span>{LABELS[item.kind] || item.kind}</span>
        <strong>{item.granted.toLocaleString("el-GR")} Ναι</strong>
        <small>{item.declined.toLocaleString("el-GR")} Όχι · {item.total.toLocaleString("el-GR")} επιλογές</small>
      </article>)}
    </div>
    {data.summary.length === 0 && <div className="workspace-inline-note">Δεν υπάρχουν καταγεγραμμένες επιλογές συγκατάθεσης.</div>}

    <div className="workspace-inline-note" style={{ marginTop: 14 }}>
      Τα δεδομένα προέρχονται από το ιστορικό πραγματικών γεγονότων συγκατάθεσης, όχι από εκτιμήσεις βάσει της τελευταίας απάντησης.
      Η ανάκληση, η απόσυρση συμμετοχής ή η καταστολή email υπερισχύει για οποιαδήποτε μελλοντική επικοινωνία.
      Οι διευθύνσεις παραμένουν ορατές μετά το τέλος της έρευνας μόνο όσο επιτρέπεται από τον ισχύοντα χρόνο διατήρησης ταυτότητας και δεν έχει ασκηθεί δικαίωμα διαγραφής.
    </div>

    <form action={root} method="get" className="workspace-action-bar" style={{ gap: 12, flexWrap: "wrap", marginTop: 16, alignItems: "end" }}>
      <label style={{ display: "grid", gap: 5 }}>
        <strong>Τύπος συγκατάθεσης</strong>
        <select name="kind" defaultValue={data.kind} style={{ minWidth: 240, padding: 10 }}>
          <option value="">Όλοι οι τύποι</option>
          <option value="research_participation">Συμμετοχή στην έρευνα</option>
          <option value="results_notification">Ενημέρωση αποτελεσμάτων</option>
          <option value="thank_you_code">Κωδικός ευχαριστίας</option>
          <option value="marketing">Marketing opt-in</option>
        </select>
      </label>
      <label style={{ display: "grid", gap: 5 }}>
        <strong>Τελευταία επιλογή</strong>
        <select name="decision" defaultValue={data.decision} style={{ minWidth: 175, padding: 10 }}>
          <option value="">Όλες</option>
          <option value="yes">Ναι (opt-in)</option>
          <option value="no">Όχι / ανάκληση</option>
        </select>
      </label>
      <button className="button" type="submit">Εφαρμογή φίλτρων</button>
      <Link prefetch={false} className="button button-secondary" href={root}>Επαναφορά</Link>
    </form>

    <p style={{ marginTop: 12, fontSize: "0.9rem" }}>
      {data.canViewEmail
        ? "Η πρόσβαση σε πλήρη email επιτρέπεται μόνο σε εξουσιοδοτημένους διαχειριστές και καταγράφεται στο ιστορικό πρόσβασης."
        : "Απαιτείται άδεια διαχείρισης προσωπικών δεδομένων, fieldwork ή research για να εμφανιστούν τα email."}
      {" "}Ώρα Ελλάδας (Europe/Athens).
    </p>

    {data.rows.length === 0 ? <div className="workspace-inline-note">Δεν βρέθηκαν επιλογές για αυτά τα φίλτρα.</div> : <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
        <thead><tr>
          <th style={{ textAlign: "left", padding: 10 }}>Email συμμετέχοντα</th>
          <th style={{ textAlign: "left", padding: 10 }}>Συγκατάθεση</th>
          <th style={{ textAlign: "left", padding: 10 }}>Τρέχουσα επιλογή</th>
          <th style={{ textAlign: "left", padding: 10 }}>Τελευταίο opt-in</th>
          <th style={{ textAlign: "left", padding: 10 }}>Χρόνος τελευταίας επιλογής</th>
          <th style={{ textAlign: "left", padding: 10 }}>Αποδεικτικό / κατάσταση</th>
        </tr></thead>
        <tbody>{data.rows.map(row => {
          const restricted = row.responseStatus === "withdrawn" ||
            row.contactStatus === "suppressed" ||
            row.contactStatus === "invalid" ||
            row.contactStatus === "bounced";
          return <tr key={row.kind + ":" + row.id}>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", overflowWrap: "anywhere" }}>
              {row.email || (data.canViewEmail ? "Μη διαθέσιμο / έχει διαγραφεί" : "Περιορισμένη προβολή")}
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{LABELS[row.kind] || row.kind}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>
              <WorkspaceStatusBadge status={row.granted ? "success" : "warning"} label={row.granted ? "Ναι" : "Όχι / ανάκληση"} />
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", whiteSpace: "nowrap" }}>{dateTime(row.lastOptInAt)}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", whiteSpace: "nowrap" }}>{dateTime(row.occurredAt)}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>
              <small>Έκδοση: {row.statementVersion || "—"}</small>
              <small style={{ display: "block" }}>Πηγή: {row.source || "—"}</small>
              {restricted && <small style={{ display: "block" }}><strong>Μη επικοινωνήσιμο</strong> · {row.responseStatus === "withdrawn" ? "Αποσύρθηκε" : row.contactStatus}</small>}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    {data.nextCursor && <div className="workspace-action-bar" style={{ justifyContent: "flex-end", marginTop: 14 }}>
      <Link prefetch={false} className="button button-secondary" href={root + "?" + next.toString()}>Επόμενες 25 εγγραφές →</Link>
    </div>}
  </section>;
}
