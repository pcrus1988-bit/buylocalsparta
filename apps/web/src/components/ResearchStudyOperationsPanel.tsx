import type { ResearchSurveyOperationsOverview, ResearchSurveyOperationsSection } from "../lib/research-survey-runtime";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "./WorkspacePagePrimitives";

const KAD_GROUPS: Record<string, { label: string; prefixes: string }> = {
  food_groceries: { label: "Σούπερ μάρκετ, τρόφιμα, ποτά & παντοπωλεία", prefixes: "47.11 · 47.2*" },
  general_merchandise: { label: "Γενικό λιανικό / πολυκαταστήματα", prefixes: "47.19" },
  fuel_retail: { label: "Πρατήρια καυσίμων", prefixes: "47.3*" },
  pharmacy_medical: { label: "Φαρμακεία & ιατρικά / ορθοπεδικά είδη", prefixes: "47.73 · 47.74" },
  retail_intermediation: { label: "Διαμεσολάβηση λιανικής", prefixes: "47.9*" },
  other_retail: { label: "Άλλες κατηγορίες λιανικού εμπορίου", prefixes: "υπόλοιποι ΚΑΔ 47.*" },
  fashion_footwear: { label: "Μόδα & Υπόδηση", prefixes: "47.71 · 47.72" },
  beauty_personal_care: { label: "Ομορφιά & Προσωπική φροντίδα", prefixes: "47.75" },
  home_living: { label: "Σπίτι & Είδη κατοικίας", prefixes: "47.51 · 47.53 · 47.54 · 47.55 · 47.59" },
  diy_building: { label: "DIY & Δομικά", prefixes: "47.52" },
  electronics: { label: "Ηλεκτρονικά", prefixes: "47.40 · 47.41 · 47.42 · 47.43" },
  sports_books_hobby: { label: "Αθλητισμός, βιβλίο & hobby", prefixes: "47.61 · 47.62 · 47.63 · 47.64 · 47.65 · 47.69" },
  jewellery_watches: { label: "Κοσμήματα & Ρολόγια", prefixes: "47.77" },
  flowers_pets: { label: "Άνθη & Κατοικίδια", prefixes: "47.76" },
  second_hand: { label: "Μεταχειρισμένα", prefixes: "47.79" },
  automotive_trade: { label: "Εμπόριο αυτοκίνησης", prefixes: "47.8" },
  other_non_food_retail: { label: "Λοιπό λιανικό μη τροφίμων", prefixes: "λοιποί επιλέξιμοι ΚΑΔ" },
  unknown: { label: "Χωρίς ταξινόμηση", prefixes: "—" }
};

const CONSENT_LABELS: Record<string, string> = {
  research_participation: "Συμμετοχή στην έρευνα",
  results_notification: "Ενημέρωση όταν δημοσιευτούν τα αποτελέσματα",
  thank_you_code: "Λήψη κωδικού ευχαριστίας"
};

function dateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("el-GR") : "—";
}

function templatePurpose(value: string): string {
  return value === "research_reminder" ? "Υπενθύμιση" : "Αρχική πρόσκληση";
}

function invitationState(value?: string): string {
  const labels: Record<string, string> = {
    created: "Έτοιμη",
    sent: "Απεστάλη",
    opened: "Ανοίχθηκε",
    started: "Ξεκίνησε",
    completed: "Ολοκληρώθηκε",
    expired: "Έληξε",
    suppressed: "Αποκλείστηκε"
  };
  return labels[value || ""] || value || "—";
}

export function ResearchStudyOperationsPanel({
  data,
  slug,
  section = "all"
}: {
  data: ResearchSurveyOperationsOverview;
  slug: string;
  section?: ResearchSurveyOperationsSection;
}) {
  if (!data.databaseConfigured || !data.studyFound) return null;
  const show = (value: Exclude<ResearchSurveyOperationsSection, "all">) => section === "all" || section === value;

  return <>
    {show("contacts") && <section className="shell vendor-section" id={"survey-contacts-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Επαφές"
        title="Λίστα email του τρέχοντος πλαισίου"
        note={data.canViewContactValues
          ? `Εμφανίζονται έως 200 από ${data.totalContacts.toLocaleString("el-GR")} email. Η προβολή πλήρων διευθύνσεων καταγράφεται για λόγους ιδιωτικότητας.`
          : "Δεν έχετε δικαίωμα προβολής των πλήρων διευθύνσεων email. Οι υπόλοιπες πληροφορίες παραμένουν ορατές."}
      />
      {data.contacts.length === 0 ? <div className="workspace-inline-note">Δεν υπάρχουν ακόμη email στο τρέχον πλαίσιο.</div> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: 10 }}>Email</th>
            <th style={{ textAlign: "left", padding: 10 }}>Επιχείρηση</th>
            <th style={{ textAlign: "left", padding: 10 }}>Περιοχή</th>
            <th style={{ textAlign: "left", padding: 10 }}>ΚΑΔ</th>
            <th style={{ textAlign: "left", padding: 10 }}>Πηγή</th>
            <th style={{ textAlign: "left", padding: 10 }}>Επικοινωνία</th>
            <th style={{ textAlign: "left", padding: 10 }}>Πρόσκληση</th>
          </tr></thead>
          <tbody>{data.contacts.map((contact) => <tr key={contact.id}>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{contact.email || "Περιορισμένη προβολή"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{contact.legalName || "—"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{[contact.municipality, contact.prefecture].filter(Boolean).join(" · ") || "—"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{contact.kadCodes || "—"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{contact.source || "—"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>
              <WorkspaceStatusBadge status={contact.status} label={contact.status} />
            </td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>
              {contact.inviteId ? invitationState(contact.inviteStatus) : "Δεν έχει δημιουργηθεί"}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}

    {show("invitations") && <section className="shell vendor-section" id={"survey-invitations-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Προσκλήσεις"
        title="Προσωπικοί σύνδεσμοι συμμετοχής"
        note="Ο αναγνώσιμος προσωπικός σύνδεσμος δεν αποθηκεύεται στο admin. Δημιουργείται κατά την αποστολή και στη βάση μένει μόνο ασφαλές αποτύπωμα. Εδώ βλέπετε σε ποιον αντιστοιχεί η πρόσκληση, την κατάστασή της και πότε λήγει."
      />
      <div className="workspace-inline-note">
        Αν χρειαστεί νέος σύνδεσμος, γίνεται ασφαλής επανέκδοση για την ίδια πρόσκληση. Δεν δημιουργείται δεύτερη συμμετοχή και δεν εμφανίζεται παλιό token στο back office.
      </div>
      {data.invitations.length === 0 ? <div className="workspace-inline-note">Δεν έχουν δημιουργηθεί ακόμη προσκλήσεις.</div> : <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr>
            <th style={{ textAlign: "left", padding: 10 }}>Παραλήπτης</th>
            <th style={{ textAlign: "left", padding: 10 }}>Κατάσταση</th>
            <th style={{ textAlign: "left", padding: 10 }}>Απεστάλη</th>
            <th style={{ textAlign: "left", padding: 10 }}>Λήξη</th>
            <th style={{ textAlign: "left", padding: 10 }}>Απάντηση</th>
            <th style={{ textAlign: "left", padding: 10 }}>Κωδικός πρόσκλησης</th>
          </tr></thead>
          <tbody>{data.invitations.map((invite) => <tr key={invite.id}>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{invite.email || "Περιορισμένη προβολή"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{invitationState(invite.status)}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{dateTime(invite.sentAt)}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{dateTime(invite.expiresAt)}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)" }}>{invite.responseStatus || "—"}</td>
            <td style={{ padding: 10, borderTop: "1px solid var(--border, #e8e5df)", fontFamily: "monospace" }}>{invite.id.slice(0, 12)}…</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>}

    {show("kad") && <section className="shell vendor-section" id={"survey-kad-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="ΚΑΔ"
        title="Σύνθεση του ερευνητικού πλαισίου"
        note="Καλύπτονται οι τρέχοντες ΚΑΔ λιανικού 47.*, μαζί με τρόφιμα, φαρμακεία και λοιπές καταναλωτικές πωλήσεις. Τα στοιχεία ανανεώνονται μόνο όταν ολοκληρωθεί νέο μητρώο ΓΕΜΗ· οι υφιστάμενες προσκλήσεις και τα δείγματα δεν αλλάζουν αυτόματα."
      />
      <div className="analytics-workflow-grid">
        {data.kadGroups.map((group) => {
          const meta = KAD_GROUPS[group.sectorCode] || { label: group.sectorCode, prefixes: "—" };
          return <article className="analytics-workflow-card" key={group.sectorCode}>
            <span>{meta.prefixes}</span>
            <strong>{meta.label}</strong>
            <small>
              {group.population.toLocaleString("el-GR")} επιχειρήσεις · {group.contactable.toLocaleString("el-GR")} με ενεργό email · {group.selected.toLocaleString("el-GR")} στο δείγμα
            </small>
          </article>;
        })}
      </div>
    </section>}

    {show("consents") && <section className="shell vendor-section" id={"survey-consent-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Συγκατάθεση"
        title="Τρέχουσα εικόνα επιλογών συμμετεχόντων"
        note="Η προβολή βασίζεται στην τελευταία καταγεγραμμένη επιλογή κάθε συμμετέχοντα. Αλλαγές δεν διαγράφουν το ιστορικό."
      />
      {data.consents.length === 0 ? <div className="workspace-inline-note">Δεν υπάρχουν ακόμη καταγεγραμμένες επιλογές συγκατάθεσης.</div> : <div className="analytics-workflow-grid">
        {data.consents.map((item) => <article className="analytics-workflow-card" key={item.kind}>
          <span>{CONSENT_LABELS[item.kind] || item.kind}</span>
          <strong>{item.granted.toLocaleString("el-GR")} Ναι</strong>
          <small>{item.declined.toLocaleString("el-GR")} Όχι · {item.total.toLocaleString("el-GR")} συνολικά</small>
        </article>)}
      </div>}
    </section>}

    {show("templates") && <section className="shell vendor-section" id={"survey-template-history-" + slug}>
      <WorkspaceSectionHeading
        eyebrow="Ιστορικό email"
        title="Εκδόσεις πρόσκλησης και υπενθύμισης"
        note="Κάθε αποθήκευση δημιουργεί νέα έκδοση. Οι εκδόσεις που έχουν ήδη χρησιμοποιηθεί παραμένουν αμετάβλητες ώστε να μπορεί να αναπαραχθεί ακριβώς τι έλαβε κάθε δείγμα."
      />
      {data.templates.length === 0 ? <div className="workspace-inline-note">Δεν έχει αποθηκευτεί ακόμη πρότυπο email.</div> : <div style={{ display: "grid", gap: 12 }}>
        {data.templates.map((template) => <article className="workspace-queue-card" key={template.purpose + ":" + template.version}>
          <div className="workspace-action-bar">
            <span>
              <strong>{templatePurpose(template.purpose)} · {template.version}</strong><br />
              {template.subject || "Χωρίς θέμα"}
            </span>
            <WorkspaceStatusBadge status={template.status} label={template.status} />
          </div>
          <div className="workspace-inline-note" style={{ whiteSpace: "pre-wrap" }}>
            {template.bodyText.length > 520 ? template.bodyText.slice(0, 520) + "…" : template.bodyText}
          </div>
          <small>{dateTime(template.lockedAt || template.createdAt)}</small>
        </article>)}
      </div>}
    </section>}
  </>;
}
