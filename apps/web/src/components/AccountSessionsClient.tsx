"use client";

import { useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

type ActiveSession = Readonly<{
  id: string;
  current: boolean;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}>;

type AccountSessionsClientProps = Readonly<{
  initialSessions: readonly ActiveSession[];
  csrfToken: string;
  ready: boolean;
  readinessMessage: string;
}>;

function formatDate(value: number): string {
  return new Date(value).toLocaleString("el-GR", { dateStyle: "medium", timeStyle: "short" });
}

export function AccountSessionsClient({ initialSessions, csrfToken, ready, readinessMessage }: AccountSessionsClientProps) {
  const [sessions, setSessions] = useState<readonly ActiveSession[]>(initialSessions);
  const [busySessionId, setBusySessionId] = useState("");
  const [allBusy, setAllBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const otherSessions = sessions.filter((session) => !session.current);

  async function revokeOne(sessionId: string) {
    setError("");
    setStatus("");
    setBusySessionId(sessionId);
    try {
      const response = await fetch(`/api/account/security/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const body = await response.json() as { revoked?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η συνεδρία δεν αποσυνδέθηκε.");
      if (!body.revoked) throw new Error("Η συνεδρία είχε ήδη λήξει ή αποσυνδεθεί.");
      setSessions((current) => current.filter((session) => session.id !== sessionId));
      setStatus("Η επιλεγμένη άλλη συνεδρία αποσυνδέθηκε.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η συνεδρία δεν αποσυνδέθηκε.");
    } finally {
      setBusySessionId("");
    }
  }

  async function revokeOthers() {
    setError("");
    setStatus("");
    setAllBusy(true);
    try {
      const response = await fetch("/api/account/security/sessions", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const body = await response.json() as { revokedCount?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Οι άλλες συνεδρίες δεν αποσυνδέθηκαν.");
      const revokedCount = body.revokedCount ?? 0;
      setSessions((current) => current.filter((session) => session.current));
      setStatus(revokedCount > 0 ? `Αποσυνδέθηκαν ${revokedCount} άλλες ενεργές συνεδρίες.` : "Δεν υπήρχαν άλλες ενεργές συνεδρίες.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Οι άλλες συνεδρίες δεν αποσυνδέθηκαν.");
    } finally {
      setAllBusy(false);
    }
  }

  return <section className="shell customer-account-page customer-sessions-page">
    <div className="customer-page-heading">
      <div><div className="eyebrow">Ενεργές συνεδρίες</div><h2>Πού είναι συνδεδεμένος ο λογαριασμός σου</h2></div>
      <p>Δες τις ενεργές συνδέσεις και αποσύνδεσε όσες δεν αναγνωρίζεις. Δεν εμφανίζονται διευθύνσεις IP, token ή αναγνωριστικά συσκευής.</p>
    </div>

    {!ready ? <div className="customer-action-card is-progress" role="status"><span className="customer-action-icon" aria-hidden="true">●</span><div className="customer-action-copy"><strong>Η διαχείριση συνεδριών δεν είναι διαθέσιμη εδώ</strong><p>{readinessMessage}</p></div></div> : <>
      <div className="customer-session-toolbar">
        <div><strong>{sessions.length} ενεργές συνεδρίες</strong><small>{otherSessions.length ? `${otherSessions.length} άλλες εκτός από αυτή.` : "Μόνο αυτή η συνεδρία είναι ενεργή."}</small></div>
        {otherSessions.length > 0 && <button className="button button-secondary" type="button" disabled={allBusy || Boolean(busySessionId)} onClick={() => void revokeOthers()}>{allBusy ? "Αποσύνδεση…" : "Αποσύνδεση όλων των άλλων"}</button>}
      </div>

      <div className="customer-session-list" aria-live="polite">
        {sessions.map((session) => <article className={`customer-session-card${session.current ? " is-current" : ""}`} key={session.id}>
          <div className="customer-session-card-heading">
            <div><strong>{session.current ? "Αυτή η συνεδρία" : "Άλλη ενεργή συνεδρία"}</strong><small>{session.current ? "Η σύνδεση που χρησιμοποιείς τώρα." : "Ενεργή σύνδεση του ίδιου λογαριασμού."}</small></div>
            <span className={session.current ? "status-pill" : "status-pill warning"}>{session.current ? "Τρέχουσα" : "Άλλη"}</span>
          </div>
          <dl className="customer-session-meta">
            <div><dt>Έναρξη</dt><dd>{formatDate(session.createdAt)}</dd></div>
            <div><dt>Τελευταία δραστηριότητα</dt><dd>{formatDate(session.lastSeenAt)}</dd></div>
            <div><dt>Λήξη</dt><dd>{formatDate(session.expiresAt)}</dd></div>
          </dl>
          {!session.current && <button className="button button-secondary" type="button" disabled={allBusy || busySessionId === session.id} onClick={() => void revokeOne(session.id)}>{busySessionId === session.id ? "Αποσύνδεση…" : "Αποσύνδεση αυτής"}</button>}
        </article>)}
      </div>
    </>}

    {error && <p className="account-action-error" role="alert">{error}</p>}
    {status && <p className="privacy-status" role="status">{status}</p>}
    <CustomerHowItWorks title="Τι σημαίνει ενεργή συνεδρία;"><p>Κάθε επιτυχής σύνδεση δημιουργεί μια προσωρινή συνεδρία. Η τρέχουσα επισημαίνεται ξεχωριστά. Αν αποσυνδέσεις μια άλλη συνεδρία, το αντίστοιχο πρόγραμμα περιήγησης θα χρειαστεί νέα σύνδεση. Αλλαγή κωδικού ή επιβεβαιωμένη αλλαγή email αποσυνδέει όλες τις συνεδρίες.</p></CustomerHowItWorks>
  </section>;
}
