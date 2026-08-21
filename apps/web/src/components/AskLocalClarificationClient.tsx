"use client";

import { useEffect, useState } from "react";
import type { AskLocalRequestView } from "../lib/ask-local-service";
import type { AskLocalClarificationMessage } from "../lib/ask-local-clarification-service";

const when = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function AskLocalClarificationClient({
  requestId,
  status,
  csrfToken,
  onRequestsChanged
}: {
  requestId: string;
  status: string;
  csrfToken: string;
  onRequestsChanged: (requests: readonly AskLocalRequestView[]) => void;
}) {
  const [messages, setMessages] = useState<readonly AskLocalClarificationMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/account/ask-local/clarifications?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { messages?: readonly AskLocalClarificationMessage[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Η συζήτηση διευκρίνισης δεν φορτώθηκε.");
        if (!cancelled) setMessages(payload.messages ?? []);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Η συζήτηση διευκρίνισης δεν φορτώθηκε."); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [requestId, status]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const reply = String(data.get("reply") ?? "").trim();
    if (!reply) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/ask-local/clarifications", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ requestId, reply })
      });
      const payload = await response.json() as { messages?: readonly AskLocalClarificationMessage[]; requests?: readonly AskLocalRequestView[]; error?: string };
      if (!response.ok || !payload.requests) throw new Error(payload.error ?? "Η απάντηση δεν στάλθηκε.");
      setMessages(payload.messages ?? []);
      onRequestsChanged(payload.requests);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η απάντηση δεν στάλθηκε.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded && status !== "needs_info") return null;
  if (loaded && messages.length === 0 && status !== "needs_info") return null;

  return <section className="ask-local-clarification" aria-label="Διευκρινίσεις Ask Local">
    <div className="ask-local-clarification-head"><strong>Διευκρινίσεις με το κατάστημα</strong><small>Η συζήτηση ανήκει μόνο σε αυτό το Ask Local αίτημα.</small></div>
    {messages.length > 0 && <div className="ask-local-clarification-messages">{messages.map((message) => <div className={`ask-local-clarification-message is-${message.senderType}`} key={message.id}>
      <strong>{message.senderType === "vendor" ? "Κατάστημα" : message.senderType === "customer" ? "Εσύ" : "KONTA MOY"}</strong>
      <span>{message.body}</span><small>{when(message.createdAt)}</small>
    </div>)}</div>}
    {status === "needs_info" && <form className="ask-local-clarification-reply" onSubmit={submit}>
      <label><span>Η απάντησή σου</span><textarea name="reply" minLength={3} maxLength={2000} required rows={3} placeholder="Γράψε τη διευκρίνιση που ζήτησε το κατάστημα…" /></label>
      <p>Μόλις απαντήσεις, το αίτημα επιστρέφει αυτόματα στο κατάστημα και ξεκινά νέα 24ωρη προθεσμία απάντησης.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Αποστολή…" : "Αποστολή διευκρίνισης"}</button>
    </form>}
    {status !== "needs_info" && messages.length > 0 && <p className="account-muted">Η διευκρίνιση ολοκληρώθηκε. Το αίτημα έχει επιστρέψει στο επόμενο βήμα της ροής.</p>}
  </section>;
}
