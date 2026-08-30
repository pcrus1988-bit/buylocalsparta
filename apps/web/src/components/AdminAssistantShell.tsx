"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ADMIN_ACTION_COMPLETED_EVENT, type AdminActionCompletedDetail } from "../lib/admin-action-events";
import type { AdminAssistantClientContext, AdminAssistantConversationSummary, AdminAssistantResponsePayload, AdminAssistantSnapshot, AdminAssistantStoredMessage } from "../lib/admin-assistant/types";

type UiMessage = Readonly<{ id: string; role: "user" | "assistant"; content: string; payload?: AdminAssistantResponsePayload }>;

function clientContext(pathname: string, queryString: string): AdminAssistantClientContext {
  const params = new URLSearchParams(queryString);
  const filters: Record<string, string> = {};
  for (const [key, value] of [...params.entries()].slice(0, 12)) filters[key] = value.slice(0, 250);
  return { route: pathname || "/admin", filters, searchQuery: filters.q, selectedTab: filters.tab ?? filters.view };
}

function uiFromStored(message: AdminAssistantStoredMessage): UiMessage {
  return { id: message.id, role: message.role, content: message.content, payload: message.structured };
}

export function AdminAssistantShell({ children, csrfToken }: { children: ReactNode; csrfToken: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const context = useMemo(() => clientContext(pathname, queryString), [pathname, queryString]);
  const routeKey = `${context.route}?${queryString}`;
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<AdminAssistantSnapshot>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [history, setHistory] = useState<readonly AdminAssistantConversationSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transitionNotice, setTransitionNotice] = useState("");
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const previousContextLabel = useRef<string | undefined>(undefined);

  useEffect(() => {
    const storedOpen = window.localStorage.getItem("kontamou.admin.assistant.open");
    const storedConversation = window.localStorage.getItem("kontamou.admin.assistant.conversation");
    if (storedOpen === "true") setOpen(true);
    if (storedConversation) setConversationId(storedConversation);
  }, []);

  useEffect(() => { window.localStorage.setItem("kontamou.admin.assistant.open", String(open)); }, [open]);
  useEffect(() => {
    if (conversationId) window.localStorage.setItem("kontamou.admin.assistant.conversation", conversationId);
    else window.localStorage.removeItem("kontamou.admin.assistant.conversation");
  }, [conversationId]);

  const loadSnapshot = useCallback(async (activity = "Checking KONTA MOY data…") => {
    setStatus(activity); setError("");
    try {
      const response = await fetch("/api/admin/assistant/context", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(context) });
      const data = await response.json() as { snapshot?: AdminAssistantSnapshot; error?: string };
      if (!response.ok || !data.snapshot) throw new Error(data.error ?? "Assistant context unavailable");
      const previous = previousContextLabel.current;
      setSnapshot(data.snapshot);
      previousContextLabel.current = data.snapshot.context.contextLabel;
      if (previous && previous !== data.snapshot.context.contextLabel) setTransitionNotice(`Context changed to ${data.snapshot.context.contextLabel}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Assistant context unavailable"); }
    finally { setStatus(""); }
  }, [context, csrfToken]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/assistant/conversations", { headers: { accept: "application/json" } });
      const data = await response.json() as { conversations?: AdminAssistantConversationSummary[] };
      if (response.ok) setHistory(data.conversations ?? []);
    } catch { /* history is non-critical */ }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { void loadSnapshot("Refreshing page context…"); }, 180);
    return () => window.clearTimeout(timer);
  }, [open, routeKey, loadSnapshot]);

  useEffect(() => {
    if (!open) return;
    void loadHistory();
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open, loadHistory]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && open) { setOpen(false); window.setTimeout(() => openButtonRef.current?.focus(), 0); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onAdminAction(event: Event) {
      const detail = (event as CustomEvent<AdminActionCompletedDetail>).detail;
      if (!open) return;
      setTransitionNotice(`Admin action completed: ${detail.actionType}. Re-checking impact…`);
      window.setTimeout(() => { void loadSnapshot("Evaluating the latest Admin action…"); }, 350);
    }
    window.addEventListener(ADMIN_ACTION_COMPLETED_EVENT, onAdminAction);
    return () => window.removeEventListener(ADMIN_ACTION_COMPLETED_EVENT, onAdminAction);
  }, [open, loadSnapshot]);

  async function loadConversation(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/assistant/conversations?id=${encodeURIComponent(id)}`);
      const data = await response.json() as { messages?: AdminAssistantStoredMessage[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Conversation unavailable");
      setConversationId(id); setMessages((data.messages ?? []).map(uiFromStored)); setHistoryOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Conversation unavailable"); }
    finally { setBusy(false); }
  }

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(undefined); setMessages([]); setHistoryOpen(false); setInput(""); setError("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendQuestion(question: string) {
    const normalized = question.trim();
    if (!normalized || busy) return;
    const userMessage: UiMessage = { id: `local-user-${Date.now()}`, role: "user", content: normalized };
    setMessages((current) => [...current, userMessage]); setInput(""); setBusy(true); setError(""); setStatus("Checking KONTA MOY data…");
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/admin/assistant/message", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify({ conversationId, message: normalized, context }), signal: controller.signal });
      setStatus(response.ok ? "Preparing recommendation…" : "");
      const data = await response.json() as { conversationId?: string; answer?: AdminAssistantResponsePayload; message?: AdminAssistantStoredMessage; snapshot?: AdminAssistantSnapshot; error?: string };
      if (!response.ok || !data.answer || !data.conversationId) throw new Error(data.error ?? "Assistant request failed");
      setConversationId(data.conversationId); if (data.snapshot) setSnapshot(data.snapshot);
      setMessages((current) => [...current, { id: data.message?.id ?? `assistant-${Date.now()}`, role: "assistant", content: data.answer!.summary, payload: data.answer }]);
      void loadHistory();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") setError("Assistant operation stopped.");
      else setError(cause instanceof Error ? cause.message : "Assistant request failed");
    } finally { abortRef.current = null; setBusy(false); setStatus(""); }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void sendQuestion(input); }
  function closePanel() { setOpen(false); window.setTimeout(() => openButtonRef.current?.focus(), 0); }

  return <div className={`admin-assistant-shell${open ? " is-open" : " is-collapsed"}`} data-open={open ? "true" : "false"}>
    <div className="admin-assistant-workspace">{children}</div>
    {!open && <button ref={openButtonRef} type="button" className="admin-assistant-fab" aria-label="Open KONTA MOY Assistant" aria-expanded="false" onClick={() => setOpen(true)}><span>KM</span><b>AI</b></button>}
    {open && <button type="button" className="admin-assistant-backdrop" aria-label="Close KONTA MOY Assistant" onClick={closePanel} />}
    <aside className="admin-assistant-panel" aria-label="KONTA MOY Assistant" aria-hidden={!open}>
      <header className="admin-assistant-header">
        <div><span>KONTA MOY</span><strong>Personal Assistant</strong><small>{snapshot?.context.contextLabel ?? "Reading current Admin context…"}</small></div>
        <div className="admin-assistant-header-actions"><button type="button" onClick={() => setHistoryOpen((value) => !value)} aria-pressed={historyOpen}>History</button><button type="button" onClick={newConversation}>New</button><button type="button" className="admin-assistant-close" aria-label="Close assistant" onClick={closePanel}>×</button></div>
      </header>

      {historyOpen ? <section className="admin-assistant-history" aria-label="Recent assistant conversations">
        <div className="admin-assistant-section-title"><strong>Recent investigations</strong><span>{history.length}</span></div>
        {history.length ? history.map((item) => <button type="button" key={item.id} className={item.id === conversationId ? "is-current" : ""} onClick={() => void loadConversation(item.id)}><strong>{item.title}</strong><small>{item.lastRoute ?? "Admin"} · {new Date(item.updatedAt).toLocaleString("el-GR")}</small></button>) : <p>No saved assistant conversations yet.</p>}
      </section> : <>
        <div className="admin-assistant-scroll">
          {transitionNotice && <div className="admin-assistant-transition" role="status"><span>{transitionNotice}</span><button type="button" aria-label="Dismiss context notice" onClick={() => setTransitionNotice("")}>×</button></div>}
          {snapshot && <section className="admin-assistant-briefing">
            <div className="admin-assistant-section-title"><strong>Current context</strong><span>{snapshot.findings.length ? `${snapshot.findings.length} finding${snapshot.findings.length === 1 ? "" : "s"}` : "clear"}</span></div>
            <p className="admin-assistant-summary">{snapshot.summary}</p>
            {snapshot.findings.length > 0 && <div className="admin-assistant-findings">{snapshot.findings.map((item) => <article key={item.id} data-severity={item.severity}>
              <div><span>{item.severity}</span>{item.affectedCount !== undefined && <b>{item.affectedCount.toLocaleString("el-GR")}</b>}</div>
              <strong>{item.title}</strong><p>{item.detail}</p>
              {item.recommendation && <small><b>Next:</b> {item.recommendation}</small>}
              {item.href && <Link href={item.href}>Inspect →</Link>}
            </article>)}</div>}
            {snapshot.recentActions.length > 0 && <details className="admin-assistant-recent"><summary>Recent Admin actions</summary>{snapshot.recentActions.slice(0, 5).map((action, index) => <div key={`${action.action}-${action.entityId}-${index}`}><strong>{action.action}</strong><span>{action.entityType} · {action.entityId}</span></div>)}</details>}
          </section>}

          {messages.length > 0 && <section className="admin-assistant-conversation" aria-label="Assistant conversation">{messages.map((message) => <article key={message.id} className={`admin-assistant-message is-${message.role}`}>
            <span>{message.role === "user" ? "You" : "KONTA MOY"}</span><p>{message.payload?.summary ?? message.content}</p>
            {message.payload?.facts?.length ? <div className="admin-assistant-message-facts"><strong>Facts</strong>{message.payload.facts.map((fact, index) => <small key={`${message.id}-fact-${index}`}>{fact}</small>)}</div> : null}
            {message.payload?.interpretation && <div className="admin-assistant-message-note"><strong>Interpretation</strong><small>{message.payload.interpretation}</small></div>}
            {message.payload?.recommendations?.length ? <div className="admin-assistant-message-note"><strong>Recommendations</strong>{message.payload.recommendations.map((item, index) => <small key={`${message.id}-rec-${index}`}>{item}</small>)}</div> : null}
            {message.payload?.sources?.length ? <div className="admin-assistant-sources"><strong>External/public information</strong>{message.payload.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title} ↗</a>)}</div> : null}
          </article>)}</section>}

          {snapshot && messages.length === 0 && <section className="admin-assistant-questions"><div className="admin-assistant-section-title"><strong>Useful questions</strong></div>{snapshot.suggestedQuestions.map((question) => <button type="button" key={question} onClick={() => void sendQuestion(question)}>{question}</button>)}</section>}
          {error && <div className="admin-assistant-error" role="alert">{error}<button type="button" onClick={() => void loadSnapshot("Retrying context…")}>Retry</button></div>}
        </div>

        <footer className="admin-assistant-composer">
          {status && <div className="admin-assistant-activity" role="status"><i aria-hidden="true" />{status}{busy && <button type="button" onClick={() => abortRef.current?.abort()}>Stop</button>}</div>}
          <form onSubmit={submit}><input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="Ask about this Admin context…" aria-label="Ask KONTA MOY Assistant" disabled={busy} /><button type="submit" disabled={busy || !input.trim()}>Send</button></form>
          <small>Facts come from authorised KONTA MOY tools. External sources are labeled separately.</small>
        </footer>
      </>}
    </aside>
  </div>;
}
