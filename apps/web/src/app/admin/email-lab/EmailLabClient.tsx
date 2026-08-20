"use client";

import { useMemo, useState } from "react";

type TemplateItem = Readonly<{
  eventType: string;
  locale: "el" | "en";
  purpose: "transactional" | "service" | "marketing";
  subject: string;
  body: string;
  revision: number;
  customized: boolean;
  source: "template" | "observed";
  variables: readonly string[];
  updatedAt: string;
}>;

type Props = Readonly<{
  csrfToken: string;
  initialTemplates: readonly TemplateItem[];
  deliveryConfigured: boolean;
}>;

const keyOf = (item: Pick<TemplateItem, "eventType" | "locale">) => `${item.eventType}:${item.locale}`;

export function EmailLabClient({ csrfToken, initialTemplates, deliveryConfigured }: Props) {
  const [templates, setTemplates] = useState<readonly TemplateItem[]>(initialTemplates);
  const [selectedKey, setSelectedKey] = useState(initialTemplates[0] ? keyOf(initialTemplates[0]) : "");
  const [subject, setSubject] = useState(initialTemplates[0]?.subject ?? "");
  const [body, setBody] = useState(initialTemplates[0]?.body ?? "");
  const [recipient, setRecipient] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"save" | "send" | "reset" | "refresh" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selected = templates.find((item) => keyOf(item) === selectedKey);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? templates.filter((item) => item.eventType.toLowerCase().includes(q) || item.subject.toLowerCase().includes(q)) : templates;
  }, [templates, query]);

  function choose(item: TemplateItem) {
    setSelectedKey(keyOf(item));
    setSubject(item.subject);
    setBody(item.body);
    setNotice("");
    setError("");
  }

  async function refresh(selectKey = selectedKey) {
    setBusy("refresh"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/email-lab", { cache: "no-store" });
      const payload = await response.json() as { templates?: TemplateItem[]; error?: string };
      if (!response.ok || !payload.templates) throw new Error(payload.error || "Refresh failed");
      setTemplates(payload.templates);
      const next = payload.templates.find((item) => keyOf(item) === selectKey) ?? payload.templates[0];
      if (next) choose(next);
      else { setSelectedKey(""); setSubject(""); setBody(""); }
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }

  async function save() {
    if (!selected) return;
    setBusy("save"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/email-lab", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ eventType: selected.eventType, locale: selected.locale, subject, body })
      });
      const payload = await response.json() as { template?: TemplateItem; error?: string };
      if (!response.ok || !payload.template) throw new Error(payload.error || "Save failed");
      const saved = payload.template;
      setTemplates((current) => current.map((item) => keyOf(item) === keyOf(saved) ? saved : item));
      setSubject(saved.subject); setBody(saved.body);
      setNotice(`Αποθηκεύτηκε revision v${saved.revision}. Θα χρησιμοποιηθεί στα επόμενα automatic emails.`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }

  async function reset() {
    if (!selected) return;
    setBusy("reset"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/email-lab", {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ eventType: selected.eventType, locale: selected.locale })
      });
      const payload = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Reset failed");
      setNotice("Η Admin έκδοση απενεργοποιήθηκε. Χρησιμοποιείται ξανά το generated email copy.");
      await refresh(selectedKey);
    } catch (cause) { setError(message(cause)); setBusy(null); }
  }

  async function sendTest() {
    if (!selected) return;
    setBusy("send"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/email-lab/test", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ to: recipient, eventType: selected.eventType, locale: selected.locale, purpose: selected.purpose, subject, body })
      });
      const payload = await response.json() as { ok?: boolean; providerMessageId?: string; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Test send failed");
      setNotice(`Test email εστάλη επιτυχώς${payload.providerMessageId ? ` · ${payload.providerMessageId}` : ""}.`);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(null); }
  }

  if (!templates.length) return <div className="workspace-empty-state"><strong>Δεν έχουν παρατηρηθεί ακόμη automatic email events.</strong><span>Το πρώτο πραγματικό ή queued email event θα προστεθεί αυτόματα στο catalogue.</span></div>;

  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20, alignItems: "start" }}>
    <aside className="workspace-queue-card" style={{ position: "sticky", top: 18, maxHeight: "82vh", overflow: "auto" }}>
      <div className="workspace-queue-head"><div><strong>Email events</strong><small>{templates.length} διαθέσιμα</small></div><button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => refresh()}>↻</button></div>
      <label style={{ display: "grid", gap: 6, margin: "14px 0" }}><span style={{ fontSize: 12, fontWeight: 800 }}>Αναζήτηση</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="order., vendor., tax..." /></label>
      <div style={{ display: "grid", gap: 8 }}>
        {filtered.map((item) => <button key={keyOf(item)} type="button" onClick={() => choose(item)} style={{ textAlign: "left", padding: 12, borderRadius: 14, border: selectedKey === keyOf(item) ? "2px solid currentColor" : "1px solid #d6cfbf", background: item.customized ? "#fff7e8" : "#fffdf8", cursor: "pointer" }}>
          <strong style={{ display: "block", overflowWrap: "anywhere" }}>{item.eventType}</strong>
          <small>{item.locale.toUpperCase()} · {item.customized ? `Admin v${item.revision}` : item.source === "observed" ? "Observed" : `Generated v${item.revision}`}</small>
        </button>)}
      </div>
    </aside>

    {selected ? <div style={{ display: "grid", gap: 18 }}>
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{selected.eventType}</strong><small>{selected.purpose} · {selected.locale.toUpperCase()} · {selected.customized ? `custom revision v${selected.revision}` : "generated copy"}</small></div><span className="status-pill">{selected.customized ? "CUSTOM" : "AUTO"}</span></div>
        <p style={{ marginTop: 12 }}>Το header, CTA styling, πλήρη εταιρικά στοιχεία/footer και το customer local-business thank-you παραμένουν κεντρικά προστατευμένα.</p>
        {selected.variables.length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>{selected.variables.map((variable) => <code key={variable} style={{ padding: "5px 8px", borderRadius: 999, background: "#f4f0e8" }}>{`{{${variable}}}`}</code>)}</div> : null}
      </article>

      <article className="workspace-queue-card" style={{ display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 7 }}><strong>Subject</strong><input value={subject} maxLength={240} onChange={(event) => setSubject(event.target.value)} /></label>
        <label style={{ display: "grid", gap: 7 }}><strong>Message content</strong><textarea value={body} rows={15} onChange={(event) => setBody(event.target.value)} style={{ resize: "vertical", minHeight: 280 }} /></label>
        <div className="workspace-action-bar"><span>Save = νέα immutable revision</span><div className="workspace-action-buttons"><button className="button button-secondary" type="button" disabled={busy !== null || !selected.customized} onClick={reset}>Reset generated</button><button className="button" type="button" disabled={busy !== null || !subject.trim() || !body.trim()} onClick={save}>{busy === "save" ? "Saving…" : "Save template"}</button></div></div>
      </article>

      <article className="workspace-queue-card" style={{ display: "grid", gap: 12 }}>
        <div className="workspace-queue-head"><div><strong>Send review email</strong><small>Η διεύθυνση χρησιμοποιείται μόνο ως test destination και δεν αποθηκεύεται στο template catalogue.</small></div><span className="status-pill">TEST</span></div>
        <label style={{ display: "grid", gap: 7 }}><strong>Recipient email</strong><input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="review@example.com" /></label>
        {!deliveryConfigured ? <p style={{ margin: 0 }}>Η αποστολή Resend δεν είναι configured σε αυτό το environment.</p> : null}
        <div className="workspace-action-bar"><span>Στέλνει το draft που βλέπεις, ακόμη και πριν το Save.</span><div className="workspace-action-buttons"><button className="button" type="button" disabled={busy !== null || !deliveryConfigured || !recipient.trim() || !subject.trim() || !body.trim()} onClick={sendTest}>{busy === "send" ? "Sending…" : "Send test email"}</button></div></div>
      </article>

      {notice ? <div className="workspace-empty-state"><strong>{notice}</strong></div> : null}
      {error ? <div className="workspace-empty-state"><strong>Σφάλμα</strong><span>{error}</span></div> : null}
    </div> : null}
  </div>;
}

function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
