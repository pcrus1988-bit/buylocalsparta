import type { ReactNode } from "react";
import type { ResearchAdminOperationalWorkspace } from "../lib/research-survey-admin-directory";
import { ResearchInviteLinkControl } from "./ResearchInviteLinkControl";
import { WorkspaceEmptyState, WorkspaceSectionHeading, WorkspaceStatusBadge } from "./WorkspacePagePrimitives";

const consentLabels: Record<string,string> = {
  research_participation: "Συμμετοχή στην έρευνα",
  results_notification: "Ενημέρωση για αποτελέσματα",
  thank_you_code: "Κωδικός ευχαριστίας",
  marketing: "Εμπορική επικοινωνία"
};

const sectorLabels: Record<string,string> = {
  fashion_footwear: "Ένδυση & υπόδηση",
  beauty_personal_care: "Ομορφιά & προσωπική φροντίδα",
  home_living: "Σπίτι & είδη διαβίωσης",
  diy_building: "DIY & δομικά",
  electronics: "Ηλεκτρονικά",
  sports_books_hobby: "Αθλητισμός, βιβλία & hobby",
  jewellery_watches: "Κοσμήματα & ρολόγια",
  flowers_pets: "Άνθη & κατοικίδια",
  second_hand: "Μεταχειρισμένα",
  automotive_trade: "Εμπόριο αυτοκινήτου",
  other_non_food_retail: "Λοιπό λιανεμπόριο"
};

function dateTime(value?: string): string {
  return value ? new Date(value).toLocaleString("el-GR") : "—";
}

function shortRef(value: string): string {
  return value.startsWith("gemi:") ? value.slice(5) : value;
}

function sectorLabel(value: string): string {
  return sectorLabels[value] ?? value.replaceAll("_"," ");
}

function compactTable(children: ReactNode) {
  return <div style={{ overflowX: "auto", width: "100%" }}>
    <table style={{ borderCollapse: "collapse", minWidth: 840, width: "100%" }}>{children}</table>
  </div>;
}

function th(label: string) {
  return <th style={{ padding: "10px 8px", textAlign: "left", verticalAlign: "bottom" }}>{label}</th>;
}

function td(children: ReactNode) {
  return <td style={{ borderTop: "1px solid var(--border-subtle, rgba(0,0,0,.12))", padding: "10px 8px", verticalAlign: "top" }}>{children}</td>;
}

export function ResearchStudyOperationsDirectory({
  slug,
  csrfToken,
  workspace
}: {
  slug: string;
  csrfToken: string;
  workspace: ResearchAdminOperationalWorkspace;
}) {
  if (!workspace.databaseConfigured) return null;

  return <>
    <div className="workspace-queue-card" style={{ marginBottom: 22 }}>
      <div className="workspace-action-bar">
        <span>
          <strong>Research control centre</strong><br />
          Τα βασικά εργαλεία της μελέτης είναι πλέον ορατά ως ξεχωριστές ενότητες.
        </span>
        <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
          <a className="button button-secondary" href={"#email-" + slug}>Email</a>
          <a className="button button-secondary" href={"#contacts-" + slug}>Επαφές</a>
          <a className="button button-secondary" href={"#invites-" + slug}>Προσκλήσεις</a>
          <a className="button button-secondary" href={"#kad-" + slug}>ΚΑΔ</a>
          <a className="button button-secondary" href={"#consent-" + slug}>Συγκαταθέσεις</a>
        </div>
      </div>
    </div>

    <section id={"template-history-" + slug} className="workspace-queue-card">
      <WorkspaceSectionHeading
        eyebrow="Email"
        title="Ιστορικό εκδόσεων email"
        note="Οι ήδη κλειδωμένες εκδόσεις παραμένουν αμετάβλητες. Κάθε αλλαγή αποθηκεύεται ως νέα έκδοση ώστε να ξέρουμε ακριβώς ποιο κείμενο έλαβε κάθε δείγμα."
      />
      {workspace.templates.length === 0
        ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη έκδοση email." body="Δημιουργήστε την πρώτη έκδοση στην ενότητα Email της μελέτης." />
        : compactTable(<>
          <thead><tr>{th("Τύπος")}{th("Έκδοση")}{th("Θέμα")}{th("Κατάσταση")}{th("Κλείδωσε")}</tr></thead>
          <tbody>{workspace.templates.map((item) => <tr key={item.id}>
            {td(item.purpose === "research_reminder" ? "Υπενθύμιση" : "Πρόσκληση")}
            {td(<strong>{item.version}</strong>)}
            {td(item.subject)}
            {td(<WorkspaceStatusBadge status={item.status} label={item.status === "locked" ? "Κλειδωμένο" : item.status} />)}
            {td(dateTime(item.lockedAt ?? item.createdAt))}
          </tr>)}</tbody>
        </>)}
    </section>

    <section id={"contacts-" + slug} className="workspace-queue-card">
      <WorkspaceSectionHeading
        eyebrow="Επαφές"
        title={"Email contact directory · " + workspace.contactsTotal.toLocaleString("el-GR")}
        note={workspace.canViewContactValues
          ? "Οι επαφές συνδέονται με επιχειρήσεις του παγωμένου πλαισίου και εμφανίζονται εδώ μαζί με πηγή, ΚΑΔ, περιοχή, κατάσταση δείγματος και πρόσκλησης. Προβάλλονται έως 200 εγγραφές."
          : "Η λίστα επαφών υπάρχει, αλλά οι πλήρεις διευθύνσεις email εμφανίζονται μόνο σε ρόλους fieldwork/privacy."}
      />
      {workspace.contacts.length === 0
        ? <WorkspaceEmptyState title="Δεν υπάρχουν επαφές στο τρέχον frame." body="Οι επαφές δημιουργούνται από τις διαθέσιμες πηγές του παγωμένου πλαισίου. Δεν υπάρχει αυτή τη στιγμή ξεχωριστό CSV contact import." />
        : compactTable(<>
          <thead><tr>{th("Επιχείρηση")}{th("Email")}{th("ΓΕΜΗ")}{th("ΚΑΔ")}{th("Περιοχή")}{th("Πηγή")}{th("Κατάσταση")}{th("Δείγμα / πρόσκληση")}</tr></thead>
          <tbody>{workspace.contacts.map((item) => <tr key={item.id}>
            {td(<strong>{item.businessName}</strong>)}
            {td(item.email ?? "Κρυφό λόγω δικαιωμάτων")}
            {td(shortRef(item.gemiReference) || "—")}
            {td(item.kadCodes.length ? item.kadCodes.slice(0,4).join(", ") : "—")}
            {td([item.prefecture,item.municipality,item.city].filter(Boolean).join(" · ") || "—")}
            {td(item.sourceKind === "gemi_public_registry" ? "ΓΕΜΗ δημόσιο μητρώο" : item.sourceKind)}
            {td(<WorkspaceStatusBadge status={item.suppressionStatus} label={item.suppressionStatus} />)}
            {td(item.inviteStatus
              ? <><strong>{item.selected ? "Στο δείγμα" : "—"}</strong><br />Πρόσκληση: {item.inviteStatus}<br /><small>{dateTime(item.inviteSentAt)}</small></>
              : item.selected ? "Στο δείγμα · δεν έχει προσκληθεί" : "Δεν έχει επιλεγεί")}
          </tr>)}</tbody>
        </>)}
    </section>

    <section id={"invites-" + slug} className="workspace-queue-card">
      <WorkspaceSectionHeading
        eyebrow="Προσκλήσεις"
        title={"Invitation ledger · " + workspace.invitesTotal.toLocaleString("el-GR")}
        note="Κάθε επιλεγμένη επιχείρηση λαμβάνει μοναδικό προσωπικό link. Το αρχικό μυστικό token δημιουργείται τη στιγμή της αποστολής και αποθηκεύεται μόνο ως hash. Για χειροκίνητη αποστολή μπορείτε να εκδώσετε νέο προσωρινό link, το οποίο εμφανίζεται μόνο στην τρέχουσα συνεδρία και λήγει το αργότερο σε 24 ώρες."
      />
      {workspace.invites.length === 0
        ? <WorkspaceEmptyState
          title="Δεν έχει δημιουργηθεί ακόμη καμία πρόσκληση."
          body="Μόλις ξεκινήσει pilot/main fieldwork και σταλεί η πρώτη παρτίδα, εδώ θα εμφανιστούν οι επιχειρήσεις, η κατάσταση αποστολής και το ιστορικό. Δεν υπάρχει ακόμη link για προβολή επειδή δεν έχει εκδοθεί κανένα invitation token."
        />
        : compactTable(<>
          <thead><tr>{th("Επιχείρηση")}{th("Email")}{th("Φάση")}{th("Κατάσταση")}{th("Αποστολή")}{th("Άνοιγμα")}{th("Τελευταία προσπάθεια")}{th("Προσωρινός σύνδεσμος")}</tr></thead>
          <tbody>{workspace.invites.map((item) => <tr key={item.id}>
            {td(<strong>{item.businessName}</strong>)}
            {td(item.email ?? "Κρυφό λόγω δικαιωμάτων")}
            {td(item.fieldworkPhase === "pilot" ? "Pilot" : "Main")}
            {td(<WorkspaceStatusBadge status={item.status} label={item.status} />)}
            {td(dateTime(item.sentAt))}
            {td(dateTime(item.openedAt))}
            {td(<>{item.latestAttemptKind ?? "—"} · {item.latestAttemptStatus ?? "—"}<br /><small>{dateTime(item.latestAttemptAt)}</small></>)}
            {td(<ResearchInviteLinkControl
              slug={slug}
              inviteId={item.id}
              csrfToken={csrfToken}
              canReissue={["created","sent","opened","started"].includes(item.status)}
            />)}
          </tr>)}</tbody>
        </>)}
    </section>

    <section id={"kad-" + slug} className="workspace-queue-card">
      <WorkspaceSectionHeading
        eyebrow="ΚΑΔ"
        title="Κάλυψη πλαισίου ανά ΚΑΔ"
        note="Ο πίνακας δείχνει τι υπάρχει στο παγωμένο πλαίσιο, πόσες επιχειρήσεις έχουν ενεργό email, πόσες επιλέχθηκαν, προσκλήθηκαν και ολοκλήρωσαν."
      />
      {workspace.kad.length === 0
        ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη ΚΑΔ breakdown." body="Θα εμφανιστεί αφού δημιουργηθεί το frozen frame." />
        : compactTable(<>
          <thead><tr>{th("ΚΑΔ")}{th("Ομάδα")}{th("Frame")}{th("Με email")}{th("Στο δείγμα")}{th("Προσκλήθηκαν")}{th("Ολοκλήρωσαν")}</tr></thead>
          <tbody>{workspace.kad.map((item) => <tr key={item.sectorCode + ":" + item.kadCode}>
            {td(<strong>{item.kadCode}</strong>)}
            {td(sectorLabel(item.sectorCode))}
            {td(item.businesses.toLocaleString("el-GR"))}
            {td(item.contactable.toLocaleString("el-GR"))}
            {td(item.selected.toLocaleString("el-GR"))}
            {td(item.invited.toLocaleString("el-GR"))}
            {td(item.completed.toLocaleString("el-GR"))}
          </tr>)}</tbody>
        </>)}
    </section>

    <section id={"consent-" + slug} className="workspace-queue-card">
      <WorkspaceSectionHeading
        eyebrow="Συγκαταθέσεις"
        title="Consent ledger"
        note="Οι συγκαταθέσεις είναι versioned και χωριστές ανά σκοπό. Δεν συγχέουμε τη συμμετοχή στην έρευνα με ενημέρωση αποτελεσμάτων, κωδικό ευχαριστίας ή εμπορική επικοινωνία."
      />
      {workspace.consentSummary.length === 0
        ? <WorkspaceEmptyState
          title="Δεν υπάρχουν ακόμη consent records."
          body="Αυτό είναι αναμενόμενο όσο δεν υπάρχουν invitations/responses. Με την πρώτη συμμετοχή, η συγκατάθεση και η έκδοση του κειμένου θα εμφανίζονται εδώ αυτόματα."
        />
        : <>
          <div className="analytics-workflow-grid">
            {workspace.consentSummary.map((item) => <article className="analytics-workflow-card" key={item.consentKind}>
              <span>{consentLabels[item.consentKind] ?? item.consentKind}</span>
              <strong>{item.granted.toLocaleString("el-GR")} ναι · {item.declined.toLocaleString("el-GR")} όχι</strong>
              <small>{item.total.toLocaleString("el-GR")} τελευταίες επιλογές συμμετεχόντων</small>
            </article>)}
          </div>
          {workspace.recentConsentEvents.length > 0 && compactTable(<>
            <thead><tr>{th("Σκοπός")}{th("Επιλογή")}{th("Έκδοση κειμένου")}{th("Κατάσταση απάντησης")}{th("Χρόνος")}</tr></thead>
            <tbody>{workspace.recentConsentEvents.map((item) => <tr key={item.id}>
              {td(consentLabels[item.consentKind] ?? item.consentKind)}
              {td(item.granted ? "Ναι" : "Όχι")}
              {td(item.statementVersion)}
              {td(item.responseStatus)}
              {td(dateTime(item.occurredAt))}
            </tr>)}</tbody>
          </>)}
        </>}
    </section>
  </>;
}
