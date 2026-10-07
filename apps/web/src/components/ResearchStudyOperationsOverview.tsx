import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceSectionHeading,
  WorkspaceStatusBadge
} from "./WorkspacePagePrimitives";
import type {
  ResearchConsentOverview,
  ResearchFieldworkDirectoryRow,
  ResearchKadOverview
} from "../lib/research-survey-runtime";

function contactSourceLabel(source: string): string {
  if (source === "gemi_public_registry") return "Γ.Ε.ΜΗ. δημόσιο μητρώο";
  if (source === "manual_upload") return "Μεταφόρτωση αρχείου";
  return source || "—";
}

function consentLabel(kind: string): string {
  if (kind === "research_participation") return "Συμμετοχή στην έρευνα";
  if (kind === "results_notification") return "Ενημέρωση αποτελεσμάτων";
  if (kind === "thank_you_code") return "Κωδικός ευχαριστίας";
  return kind;
}

function shortId(value: string): string {
  return value.length > 12 ? value.slice(0, 8) + "…" : value;
}

export function ResearchStudyOperationsOverview({
  slug,
  canFieldwork,
  canPrivacy,
  contacts,
  kad,
  consents
}: {
  slug: string;
  canFieldwork: boolean;
  canPrivacy: boolean;
  contacts: readonly ResearchFieldworkDirectoryRow[];
  kad: ResearchKadOverview;
  consents: ResearchConsentOverview;
}) {
  return <>
    <div id={"research-contacts-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Fieldwork"
        title="Επαφές & προσκλήσεις"
        note={canFieldwork
          ? "Οι επαφές εμφανίζονται μαζί με την πηγή τους και την κατάσταση πρόσκλησης. Η τρέχουσα μελέτη δημιουργεί τις επαφές της από το παγωμένο πλαίσιο Γ.Ε.ΜΗ.· δεν πρόκειται για ξεχωριστή CSV mailing list."
          : "Τα στοιχεία ταυτότητας επαφών είναι διαθέσιμα μόνο σε ρόλους Research Fieldwork / Research Superadmin."}
      />
      {canFieldwork
        ? <div className="workspace-queue-card">
            <div className="workspace-inline-note">
              <strong>Πώς λειτουργούν τα invitation links:</strong> ο προσωπικός σύνδεσμος δημιουργείται μόνο τη στιγμή της αποστολής. Αποθηκεύεται μόνο ασφαλές hash του token, όχι ο πλήρης σύνδεσμος. Γι’ αυτό βλέπετε την κατάσταση της πρόσκλησης και της αποστολής, αλλά δεν μπορεί να ανακτηθεί εκ των υστέρων ο ίδιος προσωπικός URL. Μια υπενθύμιση δημιουργεί νέο ασφαλή σύνδεσμο για την ίδια συμμετοχή.
            </div>
            {contacts.length === 0
              ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη επαφές στο ενεργό πλαίσιο." />
              : <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th align="left">Επιχείρηση</th>
                      <th align="left">Email</th>
                      <th align="left">Πηγή</th>
                      <th align="left">Περιοχή</th>
                      <th align="left">ΚΑΔ</th>
                      <th align="left">Κατάσταση επαφής</th>
                      <th align="left">Πρόσκληση / link</th>
                      <th align="left">Τελευταία αποστολή</th>
                    </tr></thead>
                    <tbody>
                      {contacts.map((contact) => <tr key={contact.contactPointId}>
                        <td>{contact.legalName || "—"}</td>
                        <td>{contact.email}</td>
                        <td>{contactSourceLabel(contact.sourceKind)}</td>
                        <td>{contact.regionCode || "—"}{contact.sectorCode ? " · " + contact.sectorCode : ""}</td>
                        <td>{contact.kadCodes.length ? contact.kadCodes.slice(0, 4).join(", ") : "—"}</td>
                        <td><WorkspaceStatusBadge status={contact.suppressionStatus} label={contact.suppressionStatus} /></td>
                        <td>
                          {contact.inviteId
                            ? <span><strong>{contact.inviteStatus || "created"}</strong><br /><small>{contact.fieldworkPhase || "—"} · link generated at send time</small></span>
                            : "Δεν έχει δημιουργηθεί"}
                        </td>
                        <td>
                          {contact.lastAttemptStatus
                            ? <span><strong>{contact.lastAttemptKind || "initial"} · {contact.lastAttemptStatus}</strong><br /><small>{contact.sentAt ? new Date(contact.sentAt).toLocaleString("el-GR") : "—"}</small></span>
                            : "—"}
                        </td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>}
            {contacts.length >= 250 && <div className="workspace-inline-note">Εμφανίζονται οι πρώτες 250 επαφές του ενεργού frame. Τα συνολικά μεγέθη παραμένουν στα metrics της μελέτης.</div>}
          </div>
        : <div className="workspace-inline-note">Δεν εμφανίζονται emails ή στοιχεία ταυτότητας χωρίς δικαίωμα Research Fieldwork.</div>}
    </div>

    <div id={"research-kad-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Population"
        title="Επισκόπηση ΚΑΔ"
        note="Κατανομή του ενεργού παγωμένου πληθυσμιακού πλαισίου ανά ερευνητικό τομέα και ακριβή ΚΑΔ."
      />
      <div className="analytics-workflow-grid">
        {kad.sectors.map((sector) => <article className="analytics-workflow-card" key={sector.sectorCode}>
          <span>{sector.sectorCode}</span>
          <strong>{sector.population.toLocaleString("el-GR")} επιχειρήσεις</strong>
          <small>{sector.contactableEmails.toLocaleString("el-GR")} με διαθέσιμο ενεργό email</small>
        </article>)}
      </div>
      <div className="workspace-queue-card">
        <div className="workspace-action-bar">
          <span><strong>Ακριβείς ΚΑΔ του frame</strong><br />Οι συχνότεροι ΚΑΔ που αντιστοιχούν στις επιχειρήσεις της μελέτης.</span>
        </div>
        {kad.codes.length === 0
          ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη ΚΑΔ στο ενεργό frame." />
          : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
                <thead><tr><th align="left">ΚΑΔ</th><th align="right">Επιχειρήσεις</th></tr></thead>
                <tbody>
                  {kad.codes.map((item) => <tr key={item.code}>
                    <td>{item.code}</td>
                    <td align="right">{item.population.toLocaleString("el-GR")}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
      </div>
    </div>

    <div id={"research-consent-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Privacy"
        title="Συγκαταθέσεις"
        note={canPrivacy
          ? "Η τρέχουσα κατάσταση υπολογίζεται από το τελευταίο καταγεγραμμένο συμβάν ανά συμμετοχή και σκοπό. Το email του συμμετέχοντα δεν συνδέεται με τη συγκατάθεση σε αυτή την προβολή."
          : "Το consent ledger είναι διαθέσιμο μόνο σε Research Privacy / Research Superadmin."}
      />
      {canPrivacy
        ? <>
            {consents.totals.length > 0 && <WorkspaceMetricStrip items={consents.totals.map((item) => ({
              label: consentLabel(item.consentKind),
              value: item.granted.toLocaleString("el-GR"),
              hint: item.declined.toLocaleString("el-GR") + " declined/revoked"
            }))} />}
            <div className="workspace-queue-card">
              {consents.recent.length === 0
                ? <WorkspaceEmptyState title="Δεν υπάρχουν ακόμη συμβάντα συγκατάθεσης." />
                : <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
                      <thead><tr>
                        <th align="left">Response</th>
                        <th align="left">Σκοπός</th>
                        <th align="left">Κατάσταση</th>
                        <th align="left">Έκδοση δήλωσης</th>
                        <th align="left">Πηγή</th>
                        <th align="left">Χρόνος</th>
                      </tr></thead>
                      <tbody>
                        {consents.recent.map((event, index) => <tr key={event.responseId + ":" + event.consentKind + ":" + event.occurredAt + ":" + index}>
                          <td>{shortId(event.responseId)}</td>
                          <td>{consentLabel(event.consentKind)}</td>
                          <td><WorkspaceStatusBadge status={event.granted ? "granted" : "declined"} label={event.granted ? "Granted" : "Declined / revoked"} /></td>
                          <td>{event.statementVersion}</td>
                          <td>{event.source}</td>
                          <td>{new Date(event.occurredAt).toLocaleString("el-GR")}</td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>}
            </div>
          </>
        : <div className="workspace-inline-note">Δεν εμφανίζονται consent records χωρίς δικαίωμα Research Privacy.</div>}
    </div>
  </>;
}
