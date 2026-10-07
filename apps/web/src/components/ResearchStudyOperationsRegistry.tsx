"use client";

import { useMemo, useState } from "react";
import type { ResearchAdminStudyOperations } from "../lib/research-survey-runtime";

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("el-GR", { dateStyle: "short", timeStyle: "short" });
}

function contactStatusLabel(status: string): string {
  return ({
    active: "Ενεργό",
    suppressed: "Εξαιρέθηκε",
    invalid: "Μη έγκυρο",
    bounced: "Επιστροφή email"
  } as Record<string, string>)[status] ?? status;
}

function inviteStatusLabel(status: string): string {
  return ({
    created: "Δημιουργήθηκε",
    sent: "Εστάλη",
    opened: "Άνοιξε",
    started: "Ξεκίνησε",
    completed: "Ολοκληρώθηκε",
    expired: "Έληξε",
    suppressed: "Εξαιρέθηκε"
  } as Record<string, string>)[status] ?? status;
}

function consentLabel(kind: string): string {
  return ({
    research_participation: "Συμμετοχή στην έρευνα",
    results_notification: "Ενημέρωση αποτελεσμάτων",
    thank_you_code: "Κωδικός ευχαριστίας"
  } as Record<string, string>)[kind] ?? kind;
}

export function ResearchStudyOperationsRegistry({
  slug,
  csrfToken,
  operations
}: {
  slug: string;
  csrfToken: string;
  operations: ResearchAdminStudyOperations;
}) {
  const [busyInviteId, setBusyInviteId] = useState<string>();
  const [linkState, setLinkState] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [message, setMessage] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");

  const contacts = useMemo(() => {
    const q = contactQuery.trim().toLocaleLowerCase("el-GR");
    if (!q) return operations.contacts;
    return operations.contacts.filter((item) =>
      [item.businessName, item.email, item.sourceRecordRef, item.regionCode, item.sectorCode, ...item.activityCodes]
        .join(" ")
        .toLocaleLowerCase("el-GR")
        .includes(q)
    );
  }, [contactQuery, operations.contacts]);

  const invitations = useMemo(() => {
    const q = inviteQuery.trim().toLocaleLowerCase("el-GR");
    if (!q) return operations.invitations;
    return operations.invitations.filter((item) =>
      [item.businessName, item.email, item.sourceRecordRef, item.fieldworkPhase, item.status, item.responseStatus]
        .join(" ")
        .toLocaleLowerCase("el-GR")
        .includes(q)
    );
  }, [inviteQuery, operations.invitations]);

  async function reissueLink(inviteId: string) {
    setBusyInviteId(inviteId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "reissue_invite_link", inviteId })
      });
      const result = await response.json() as { token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.token || !result.expiresAt) throw new Error(result.error || "Δεν δημιουργήθηκε νέος σύνδεσμος.");
      const url = window.location.origin + "/research/" + encodeURIComponent(slug) + "/t/" + encodeURIComponent(result.token);
      setLinkState((current) => ({ ...current, [inviteId]: { url, expiresAt: result.expiresAt! } }));
      setMessage("Δημιουργήθηκε νέος προσωρινός προσωπικός σύνδεσμος. Εμφανίζεται μόνο σε αυτή τη συνεδρία.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν δημιουργήθηκε νέος σύνδεσμος.");
    } finally {
      setBusyInviteId(undefined);
    }
  }

  async function copyLink(inviteId: string) {
    const value = linkState[inviteId]?.url;
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setMessage("Ο σύνδεσμος αντιγράφηκε.");
  }

  return <div style={{ display: "grid", gap: 28 }}>
    <section id={"research-templates-" + slug} className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span>
          <strong>Ιστορικό email</strong><br />
          Κάθε αποθηκευμένη έκδοση μένει αμετάβλητη. Η επεξεργασία στο παραπάνω πεδίο δημιουργεί νέα έκδοση ώστε να γνωρίζουμε ακριβώς ποιο κείμενο χρησιμοποιήθηκε σε κάθε αποστολή.
        </span>
        <strong>{operations.templates.length.toLocaleString("el-GR")} έκδοση(εις)</strong>
      </div>
      {operations.templates.length === 0
        ? <div className="workspace-inline-note">Δεν υπάρχει ακόμη αποθηκευμένη έκδοση email.</div>
        : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>
                <th align="left">Χρήση</th><th align="left">Έκδοση</th><th align="left">Θέμα</th><th align="left">Κατάσταση</th><th align="left">Αποθήκευση</th>
              </tr></thead>
              <tbody>{operations.templates.map((item) => <tr key={item.id}>
                <td>{item.purpose === "research_reminder" ? "Υπενθύμιση" : "Πρόσκληση"}</td>
                <td><strong>{item.version}</strong></td>
                <td>{item.subject}</td>
                <td>{item.status === "locked" ? "Κλειδωμένη" : item.status}</td>
                <td>{formatDate(item.lockedAt || item.createdAt)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </section>

    <section id={"research-contacts-" + slug} className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span>
          <strong>Επαφές τρέχοντος πλαισίου</strong><br />
          Εδώ φαίνονται οι email επαφές που έχουν εισαχθεί στο Research frame, μαζί με την επιχείρηση, την πηγή, τον ΚΑΔ και την κατάσταση επικοινωνίας. Η προβολή περιορίζεται στο Research Admin.
        </span>
        <strong>{operations.contacts.length.toLocaleString("el-GR")} εμφανίζονται</strong>
      </div>
      <div className="workspace-action-bar">
        <input
          aria-label="Αναζήτηση επαφών έρευνας"
          onChange={(event) => setContactQuery(event.target.value)}
          placeholder="Αναζήτηση επιχείρησης, email, ΓΕΜΗ ή ΚΑΔ"
          type="search"
          value={contactQuery}
          style={{ width: "min(100%, 520px)" }}
        />
      </div>
      {contacts.length === 0
        ? <div className="workspace-inline-note">Δεν βρέθηκαν επαφές στο τρέχον πλαίσιο.</div>
        : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead><tr>
                <th align="left">Επιχείρηση</th><th align="left">Email</th><th align="left">ΚΑΔ</th><th align="left">Περιοχή</th><th align="left">Πηγή</th><th align="left">Κατάσταση</th>
              </tr></thead>
              <tbody>{contacts.map((item) => <tr key={item.id}>
                <td><strong>{item.businessName || "—"}</strong><br /><small>{item.sourceRecordRef || "—"}</small></td>
                <td>{item.email}</td>
                <td>{item.activityCodes.length ? item.activityCodes.join(", ") : item.sectorCode || "—"}</td>
                <td>{item.regionCode || "—"}</td>
                <td>{item.sourceKind === "gemi_public_registry" ? "ΓΕΜΗ" : item.sourceKind}</td>
                <td>{contactStatusLabel(item.suppressionStatus)}</td>
              </tr>)}</tbody>
            </table>
          </div>}
      {operations.contacts.length >= 100 && <div className="workspace-inline-note">Η λίστα δείχνει τις πρώτες 100 επαφές. Η αναζήτηση εφαρμόζεται σε αυτές· τα συνολικά μεγέθη παραμένουν στα metrics της μελέτης.</div>}
    </section>

    <section id={"research-invitations-" + slug} className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span>
          <strong>Προσκλήσεις & προσωπικοί σύνδεσμοι</strong><br />
          Οι σύνδεσμοι που αποστέλλονται με email δεν αποθηκεύονται ως αναγνώσιμο κείμενο. Για χειροκίνητη αποστολή μπορείτε να εκδώσετε νέο προσωρινό προσωπικό σύνδεσμο· εμφανίζεται εδώ μόνο μετά την έκδοση και λήγει το αργότερο σε 24 ώρες.
        </span>
        <strong>{operations.invitations.length.toLocaleString("el-GR")} εμφανίζονται</strong>
      </div>
      <div className="workspace-action-bar">
        <input
          aria-label="Αναζήτηση προσκλήσεων έρευνας"
          onChange={(event) => setInviteQuery(event.target.value)}
          placeholder="Αναζήτηση επιχείρησης, email ή κατάστασης"
          type="search"
          value={inviteQuery}
          style={{ width: "min(100%, 520px)" }}
        />
      </div>
      {invitations.length === 0
        ? <div className="workspace-inline-note">Δεν έχουν δημιουργηθεί προσκλήσεις για το τρέχον wave.</div>
        : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
              <thead><tr>
                <th align="left">Επιχείρηση</th><th align="left">Email</th><th align="left">Φάση</th><th align="left">Κατάσταση</th><th align="left">Αποστολή / άνοιγμα</th><th align="left">Σύνδεσμος</th>
              </tr></thead>
              <tbody>{invitations.map((item) => {
                const canReissue = ["created","sent","opened","started"].includes(item.status);
                const link = linkState[item.id];
                return <tr key={item.id}>
                  <td><strong>{item.businessName || "—"}</strong><br /><small>{item.sourceRecordRef || "—"}</small></td>
                  <td>{item.email || "—"}</td>
                  <td>{item.fieldworkPhase === "pilot" ? "Pilot" : "Κύρια"}</td>
                  <td>{inviteStatusLabel(item.status)}{item.responseStatus ? <><br /><small>Απάντηση: {item.responseStatus}</small></> : null}</td>
                  <td>{formatDate(item.sentAt)}<br /><small>Άνοιγμα: {formatDate(item.firstOpenedAt)} · attempts {item.attemptCount}</small></td>
                  <td style={{ minWidth: 300 }}>
                    {link
                      ? <div style={{ display: "grid", gap: 6 }}>
                          <input aria-label="Προσωρινός προσωπικός σύνδεσμος" readOnly value={link.url} />
                          <div className="workspace-action-buttons">
                            <button className="button button-secondary" onClick={() => void copyLink(item.id)} type="button">Αντιγραφή</button>
                            <small>Λήξη {formatDate(link.expiresAt)}</small>
                          </div>
                        </div>
                      : <button
                          className="button button-secondary"
                          disabled={!canReissue || Boolean(busyInviteId)}
                          onClick={() => void reissueLink(item.id)}
                          type="button"
                        >{busyInviteId === item.id ? "Έκδοση…" : canReissue ? "Έκδοση προσωρινού link" : "Δεν είναι διαθέσιμο"}</button>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
      {message && <div className="workspace-inline-note">{message}</div>}
    </section>

    <section id={"research-kad-" + slug} className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span>
          <strong>ΚΑΔ · κάλυψη πληθυσμού</strong><br />
          Πόσες επιχειρήσεις του παγωμένου πλαισίου αντιστοιχούν σε κάθε ΚΑΔ και σε πόσες υπάρχει ενεργό email επικοινωνίας.
        </span>
        <strong>{operations.kadOverview.length.toLocaleString("el-GR")} ΚΑΔ</strong>
      </div>
      {operations.kadOverview.length === 0
        ? <div className="workspace-inline-note">Δεν υπάρχουν ακόμη ΚΑΔ στο παγωμένο πλαίσιο.</div>
        : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr><th align="left">ΚΑΔ</th><th align="right">Επιχειρήσεις</th><th align="right">Με ενεργό email</th><th align="right">Κάλυψη email</th></tr></thead>
              <tbody>{operations.kadOverview.map((item) => <tr key={item.code}>
                <td><strong>{item.code}</strong></td>
                <td align="right">{item.businesses.toLocaleString("el-GR")}</td>
                <td align="right">{item.contactable.toLocaleString("el-GR")}</td>
                <td align="right">{item.businesses > 0 ? new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(item.contactable / item.businesses) : "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </section>

    <section id={"research-consent-" + slug} className="workspace-queue-card">
      <div className="workspace-action-bar">
        <span>
          <strong>Συγκατάθεση</strong><br />
          Η συγκατάθεση συμμετοχής και οι δύο προαιρετικές επιλογές της έρευνας εμφανίζονται χωριστά. Εμπορική επικοινωνία δεν αποτελεί Research consent.
        </span>
        <strong>{operations.consent.responseCount.toLocaleString("el-GR")} απάντηση(εις)</strong>
      </div>
      <div className="analytics-workflow-grid">
        {operations.consent.summary.map((item) => <article className="analytics-workflow-card" key={item.kind}>
          <span>{consentLabel(item.kind)}</span>
          <strong>{item.granted.toLocaleString("el-GR")} Ναι</strong>
          <small>{item.declined.toLocaleString("el-GR")} Όχι · {item.notSet.toLocaleString("el-GR")} χωρίς επιλογή</small>
        </article>)}
      </div>
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr><th align="left">Χρόνος</th><th align="left">Επιλογή</th><th align="left">Απόφαση</th><th align="left">Έκδοση δήλωσης</th><th align="left">Απάντηση</th></tr></thead>
          <tbody>{operations.consent.recentEvents.map((event) => <tr key={event.id}>
            <td>{formatDate(event.occurredAt)}</td>
            <td>{consentLabel(event.kind)}</td>
            <td><strong>{event.granted ? "Ναι" : "Όχι"}</strong></td>
            <td>{event.statementVersion}</td>
            <td><small>{event.responseId.slice(0, 8)}… · {event.responseStatus}</small></td>
          </tr>)}</tbody>
        </table>
      </div>
      {operations.consent.recentEvents.length === 0 && <div className="workspace-inline-note">Δεν υπάρχουν ακόμη καταγεγραμμένα consent events.</div>}
    </section>
  </div>;
}
