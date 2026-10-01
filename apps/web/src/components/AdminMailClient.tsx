"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

type Address = Readonly<{ name?: string; address: string }>;
type Folder = "inbox" | "sent" | "archive" | "trash";
type Summary = Readonly<{
  id: string;
  direction: "inbound" | "outbound";
  folder: Folder;
  from: Address;
  to: readonly Address[];
  subject: string;
  receivedAt: number;
  preview: string;
  unread: boolean;
  starred: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  byteSize: number;
}>;
type Detail = Summary & Readonly<{
  cc: readonly Address[];
  bcc: readonly Address[];
  replyTo: readonly Address[];
  text: string;
  htmlAvailable: boolean;
  internetMessageId?: string;
  inReplyTo?: string;
  references: readonly string[];
  attachments: readonly Readonly<{ partIndex: number; filename: string; contentType: string; byteSize: number }>[];
}>;
type MailListPayload = Readonly<{
  messages: readonly Summary[];
  counts: Record<Folder, number>;
  scanned: number;
  truncated: boolean;
  error?: string;
}>;
type ComposeState = Readonly<{
  mode: "new" | "reply" | "forward";
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo: string;
  references: string;
}>;

const FOLDERS: ReadonlyArray<{ id: Folder; label: string; icon: string }> = [
  { id: "inbox", label: "Inbox", icon: "↓" },
  { id: "sent", label: "Sent", icon: "↗" },
  { id: "archive", label: "Archive", icon: "▣" },
  { id: "trash", label: "Trash", icon: "⌫" }
];

const EMPTY_COMPOSE: ComposeState = {
  mode: "new",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  text: "",
  inReplyTo: "",
  references: ""
};

export function AdminMailClient({
  csrfToken,
  outboundReady,
  storageReady
}: {
  csrfToken: string;
  outboundReady: boolean;
  storageReady: boolean;
}) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [messages, setMessages] = useState<readonly Summary[]>([]);
  const [counts, setCounts] = useState<Record<Folder, number>>({ inbox: 0, sent: 0, archive: 0, trash: 0 });
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [sendBusy, setSendBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const composeTextRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadList = useCallback(async (targetFolder = folder, q = debouncedQuery, preserveSelection = false) => {
    if (!storageReady) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ folder: targetFolder, limit: "80" });
      if (q) params.set("q", q);
      const response = await fetch("/api/admin/mail?" + params.toString(), { cache: "no-store" });
      const data = await response.json() as MailListPayload;
      if (!response.ok) throw new Error(data.error || "Mailbox could not be loaded");
      setMessages(data.messages || []);
      setCounts(data.counts || { inbox: 0, sent: 0, archive: 0, trash: 0 });
      setTruncated(Boolean(data.truncated));
      setScanned(data.scanned || 0);
      if (!preserveSelection || !data.messages.some((item) => item.id === selectedId)) {
        setSelectedId(undefined);
        setDetail(undefined);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mailbox could not be loaded");
    } finally {
      setBusy(false);
    }
  }, [debouncedQuery, folder, selectedId, storageReady]);

  useEffect(() => { void loadList(folder, debouncedQuery); }, [folder, debouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        beginNew();
      }
      if (event.key === "Escape" && composeOpen) setComposeOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composeOpen]);

  async function openMessage(id: string) {
    setSelectedId(id);
    setDetailBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/mail/" + encodeURIComponent(id), { cache: "no-store" });
      const data = await response.json() as { message?: Detail; error?: string };
      if (!response.ok || !data.message) throw new Error(data.error || "Message could not be opened");
      setDetail(data.message);
      setMessages((current) => current.map((item) => item.id === id ? { ...item, unread: false } : item));
      setCounts((current) => ({ ...current, inbox: Math.max(0, current.inbox) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message could not be opened");
    } finally {
      setDetailBusy(false);
    }
  }

  async function updateState(patch: Record<string, boolean>, successMessage: string) {
    if (!selectedId) return;
    setError("");
    try {
      const response = await fetch("/api/admin/mail/" + encodeURIComponent(selectedId), {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(patch)
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Mailbox action failed");
      setNotice(successMessage);
      if ("starred" in patch && detail) setDetail({ ...detail, starred: patch.starred });
      if ("read" in patch && detail) setDetail({ ...detail, unread: !patch.read });
      if ("archived" in patch || "deleted" in patch) {
        setSelectedId(undefined);
        setDetail(undefined);
      }
      await loadList(folder, debouncedQuery, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mailbox action failed");
    }
  }

  function changeFolder(next: Folder) {
    setFolder(next);
    setSelectedId(undefined);
    setDetail(undefined);
    setNotice("");
  }

  function beginNew() {
    setCompose(EMPTY_COMPOSE);
    setAttachments([]);
    setShowCcBcc(false);
    setComposeOpen(true);
    setNotice("");
    window.setTimeout(() => composeTextRef.current?.focus(), 60);
  }

  function beginReply() {
    if (!detail) return;
    const recipient = detail.replyTo[0] || detail.from;
    const refs = [...detail.references, detail.internetMessageId].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);
    setCompose({
      mode: "reply",
      to: formatAddress(recipient),
      cc: "",
      bcc: "",
      subject: prefixedSubject(detail.subject, "Re:"),
      text: "\n\n" + quoteMessage(detail),
      inReplyTo: detail.internetMessageId || "",
      references: refs.join(" ")
    });
    setAttachments([]);
    setShowCcBcc(false);
    setComposeOpen(true);
    window.setTimeout(() => composeTextRef.current?.focus(), 60);
  }

  function beginForward() {
    if (!detail) return;
    setCompose({
      mode: "forward",
      to: "",
      cc: "",
      bcc: "",
      subject: prefixedSubject(detail.subject, "Fwd:"),
      text: "\n\n---------- Forwarded message ----------\n" +
        "From: " + formatAddress(detail.from) + "\n" +
        "Date: " + formatLongDate(detail.receivedAt) + "\n" +
        "Subject: " + detail.subject + "\n" +
        "To: " + detail.to.map(formatAddress).join(", ") + "\n\n" +
        (detail.text || "(No readable text body)"),
      inReplyTo: "",
      references: ""
    });
    setAttachments([]);
    setShowCcBcc(false);
    setComposeOpen(true);
    window.setTimeout(() => composeTextRef.current?.focus(), 60);
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files || []).slice(0, 8);
    setAttachments(next);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outboundReady || sendBusy) return;
    setSendBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.set("to", compose.to);
      form.set("cc", compose.cc);
      form.set("bcc", compose.bcc);
      form.set("subject", compose.subject);
      form.set("text", compose.text);
      if (compose.inReplyTo) form.set("inReplyTo", compose.inReplyTo);
      if (compose.references) form.set("references", compose.references);
      for (const file of attachments) form.append("attachments", file);

      const response = await fetch("/api/admin/mail/send", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: form
      });
      const data = await response.json() as { sent?: boolean; archived?: boolean; error?: string };
      if (!response.ok || !data.sent) throw new Error(data.error || "Email could not be sent");
      setComposeOpen(false);
      setCompose(EMPTY_COMPOSE);
      setAttachments([]);
      setNotice(data.archived === false ? "Email sent through SES. Sent-copy archiving needs S3 attention." : "Email sent and archived in Sent.");
      setFolder("sent");
      setQuery("");
      setDebouncedQuery("");
      window.setTimeout(() => { void loadList("sent", "", false); }, 120);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Email could not be sent");
    } finally {
      setSendBusy(false);
    }
  }

  const unreadLoaded = useMemo(() => messages.filter((message) => message.unread).length, [messages]);

  if (!storageReady) {
    return <section className="admin-mail-unavailable">
      <div className="admin-mail-unavailable-icon">✉</div>
      <div>
        <strong>Mailbox storage is not reachable</strong>
        <p>The Admin UI is ready, but S3 access must be available before inbox and sent mail can be loaded.</p>
      </div>
    </section>;
  }

  return <section className="admin-mail-workspace" aria-label="Admin mailbox">
    <aside className="admin-mail-folders">
      <button type="button" className="admin-mail-compose-button" onClick={beginNew} disabled={!outboundReady}>
        <span>＋</span> Compose
      </button>
      <nav aria-label="Mailbox folders">
        {FOLDERS.map((item) => <button
          type="button"
          key={item.id}
          className={folder === item.id ? "is-active" : ""}
          onClick={() => changeFolder(item.id)}
        >
          <span className="admin-mail-folder-icon">{item.icon}</span>
          <span>{item.label}</span>
          <b>{counts[item.id] || 0}</b>
        </button>)}
      </nav>
      <div className="admin-mail-folder-status">
        <span className={storageReady ? "is-ok" : "is-bad"}>{storageReady ? "S3 connected" : "S3 unavailable"}</span>
        <span className={outboundReady ? "is-ok" : "is-bad"}>{outboundReady ? "SES sending ready" : "SES sending unavailable"}</span>
      </div>
    </aside>

    <div className="admin-mail-list-pane">
      <header className="admin-mail-toolbar">
        <div className="admin-mail-search">
          <span>⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={"Search " + folder}
            aria-label={"Search " + folder}
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}>×</button>}
          <kbd>⌘K</kbd>
        </div>
        <button type="button" className="admin-mail-icon-button" aria-label="Refresh mailbox" onClick={() => void loadList(folder, debouncedQuery)} disabled={busy}>↻</button>
      </header>

      <div className="admin-mail-list-heading">
        <div><strong>{FOLDERS.find((item) => item.id === folder)?.label}</strong><small>{messages.length} loaded{folder === "inbox" && unreadLoaded ? " · " + unreadLoaded + " unread" : ""}</small></div>
        {truncated && <span title={"Scanned " + scanned + " recent mail objects"}>Recent view</span>}
      </div>

      {(notice || error) && <div className={"admin-mail-banner " + (error ? "is-error" : "is-success")}>
        <span>{error || notice}</span>
        <button type="button" aria-label="Dismiss" onClick={() => { setError(""); setNotice(""); }}>×</button>
      </div>}

      <div className="admin-mail-message-list" aria-busy={busy}>
        {busy && messages.length === 0 && <MailListSkeleton />}
        {!busy && messages.length === 0 && <div className="admin-mail-empty">
          <span>✉</span>
          <strong>{debouncedQuery ? "No matching email" : "This folder is empty"}</strong>
          <p>{debouncedQuery ? "Try a broader sender, recipient, subject or message search." : "Messages will appear here when this folder has mail."}</p>
        </div>}
        {messages.map((message) => <button
          type="button"
          key={message.id}
          className={"admin-mail-row" + (selectedId === message.id ? " is-selected" : "") + (message.unread ? " is-unread" : "")}
          onClick={() => void openMessage(message.id)}
        >
          <span className={"admin-mail-row-dot" + (message.unread ? " is-unread" : "")} />
          <span className="admin-mail-row-main">
            <span className="admin-mail-row-top">
              <strong>{message.direction === "inbound" ? displayAddress(message.from) : displayRecipients(message.to)}</strong>
              <time>{formatListDate(message.receivedAt)}</time>
            </span>
            <span className="admin-mail-row-subject">
              {message.starred && <i aria-label="Starred">★</i>}
              <b>{message.subject || "(no subject)"}</b>
              {message.hasAttachments && <em title={message.attachmentCount + " attachment(s)"}>⌕</em>}
            </span>
            <span className="admin-mail-row-preview">{message.preview || "No readable text preview"}</span>
          </span>
        </button>)}
      </div>
    </div>

    <article className={"admin-mail-reader" + (selectedId ? " has-message" : "")}>
      {!selectedId && <div className="admin-mail-reader-empty">
        <div>✉</div>
        <strong>Select a message</strong>
        <p>Read, reply, forward, download attachments or organize email without leaving Admin.</p>
      </div>}

      {selectedId && detailBusy && !detail && <div className="admin-mail-reader-loading"><span /><span /><span /><span /></div>}

      {detail && <div className="admin-mail-reader-content">
        <header className="admin-mail-reader-head">
          <div className="admin-mail-reader-actions">
            {detail.direction === "inbound" && <button type="button" onClick={beginReply}>↩ Reply</button>}
            <button type="button" onClick={beginForward}>↗ Forward</button>
            <button type="button" title={detail.starred ? "Unstar" : "Star"} onClick={() => void updateState({ starred: !detail.starred }, detail.starred ? "Star removed." : "Message starred.")}>{detail.starred ? "★" : "☆"}</button>
            {folder !== "archive" && folder !== "trash" && <button type="button" title="Archive" onClick={() => void updateState({ archived: true, deleted: false }, "Message archived.")}>▣</button>}
            {folder === "archive" && <button type="button" onClick={() => void updateState({ archived: false, deleted: false }, "Message restored.")}>Restore</button>}
            {folder !== "trash" && <button type="button" className="is-danger" title="Move to trash" onClick={() => void updateState({ deleted: true }, "Message moved to trash.")}>⌫</button>}
            {folder === "trash" && <button type="button" onClick={() => void updateState({ deleted: false, archived: false }, "Message restored.")}>Restore</button>}
            <button type="button" onClick={() => void updateState({ read: detail.unread }, detail.unread ? "Marked read." : "Marked unread.")}>{detail.unread ? "Mark read" : "Mark unread"}</button>
          </div>
          <h2>{detail.subject || "(no subject)"}</h2>
          <div className="admin-mail-address-block">
            <div className="admin-mail-avatar">{initials(detail.direction === "inbound" ? detail.from : detail.to[0])}</div>
            <div>
              <strong>{detail.direction === "inbound" ? displayAddress(detail.from) : displayRecipients(detail.to)}</strong>
              <small>{detail.direction === "inbound" ? "to " + displayRecipients(detail.to) : "from " + displayAddress(detail.from)}</small>
              {(detail.cc.length > 0 || detail.bcc.length > 0) && <small>{detail.cc.length ? "Cc " + displayRecipients(detail.cc) : ""}{detail.bcc.length ? " · Bcc " + displayRecipients(detail.bcc) : ""}</small>}
            </div>
            <time>{formatLongDate(detail.receivedAt)}</time>
          </div>
        </header>

        {detail.attachments.length > 0 && <div className="admin-mail-attachments">
          {detail.attachments.map((attachment) => <a
            key={attachment.partIndex}
            href={"/api/admin/mail/" + encodeURIComponent(detail.id) + "/attachments/" + attachment.partIndex}
            download={attachment.filename}
          >
            <span>▤</span>
            <span><strong>{attachment.filename}</strong><small>{attachment.contentType} · {formatBytes(attachment.byteSize)}</small></span>
            <b>↓</b>
          </a>)}
        </div>}

        {detail.htmlAvailable && <div className="admin-mail-safe-note">HTML email shown as safe readable text. External scripts and tracking content are not executed.</div>}
        <div className="admin-mail-body">{detail.text || "(No readable text body was found in this message.)"}</div>

        <footer className="admin-mail-reader-footer">
          {detail.direction === "inbound" && <button type="button" className="button" onClick={beginReply}>↩ Reply</button>}
          <button type="button" className="button button-secondary" onClick={beginForward}>↗ Forward</button>
        </footer>
      </div>}
    </article>

    {composeOpen && <div className="admin-mail-compose-layer" role="dialog" aria-modal="true" aria-label="Compose email">
      <button className="admin-mail-compose-backdrop" type="button" aria-label="Close compose" onClick={() => setComposeOpen(false)} />
      <form className="admin-mail-composer" onSubmit={sendMessage}>
        <header>
          <div><span>{compose.mode === "reply" ? "Reply" : compose.mode === "forward" ? "Forward" : "New message"}</span><strong>KONTA MOY Mail</strong></div>
          <button type="button" aria-label="Close compose" onClick={() => setComposeOpen(false)}>×</button>
        </header>
        <div className="admin-mail-compose-fields">
          <label><span>To</span><input type="text" required value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="name@example.com" /></label>
          {!showCcBcc && <button type="button" className="admin-mail-cc-toggle" onClick={() => setShowCcBcc(true)}>Cc / Bcc</button>}
          {showCcBcc && <>
            <label><span>Cc</span><input type="text" value={compose.cc} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} /></label>
            <label><span>Bcc</span><input type="text" value={compose.bcc} onChange={(event) => setCompose({ ...compose, bcc: event.target.value })} /></label>
          </>}
          <label><span>Subject</span><input type="text" required maxLength={240} value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} /></label>
        </div>
        <textarea ref={composeTextRef} required value={compose.text} onChange={(event) => setCompose({ ...compose, text: event.target.value })} placeholder="Write your message…" />
        <div className="admin-mail-compose-files">
          <label>
            <span>＋ Add files</span>
            <input type="file" multiple onChange={onFiles} />
          </label>
          {attachments.length > 0 && <div>{attachments.map((file, index) => <span key={file.name + index}>{file.name} <small>{formatBytes(file.size)}</small><button type="button" aria-label={"Remove " + file.name} onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}>×</button></span>)}</div>}
        </div>
        <footer>
          <button type="submit" className="button" disabled={sendBusy || !outboundReady}>{sendBusy ? "Sending…" : "Send with SES"}</button>
          <span>Up to 8 files · 8 MB each · 20 MB total</span>
          <button type="button" className="admin-mail-discard" onClick={() => setComposeOpen(false)}>Discard</button>
        </footer>
      </form>
    </div>}
  </section>;
}

function MailListSkeleton() {
  return <div className="admin-mail-skeleton" aria-label="Loading mail">
    {Array.from({ length: 7 }, (_, index) => <div key={index}><span /><span /><span /></div>)}
  </div>;
}

function displayAddress(value?: Address): string {
  if (!value) return "Unknown";
  return value.name?.trim() || value.address || "Unknown";
}

function displayRecipients(values: readonly Address[]): string {
  if (!values.length) return "No recipient";
  const shown = values.slice(0, 2).map(displayAddress).join(", ");
  return values.length > 2 ? shown + " +" + (values.length - 2) : shown;
}

function formatAddress(value?: Address): string {
  if (!value) return "";
  return value.name ? value.name + " <" + value.address + ">" : value.address;
}

function initials(value?: Address): string {
  const source = value?.name || value?.address || "?";
  const pieces = source.replace(/@.*$/, "").trim().split(/\s+/).filter(Boolean);
  return (pieces.length > 1 ? pieces[0][0] + pieces[pieces.length - 1][0] : source.slice(0, 2)).toUpperCase();
}

function prefixedSubject(subject: string, prefix: "Re:" | "Fwd:"): string {
  const normalized = subject.trim() || "(no subject)";
  if (prefix === "Re:" && /^\s*re\s*:/i.test(normalized)) return normalized;
  if (prefix === "Fwd:" && /^\s*(fw|fwd)\s*:/i.test(normalized)) return normalized;
  return prefix + " " + normalized;
}

function quoteMessage(detail: Detail): string {
  const source = (detail.text || "(No readable text body)").split("\n").map((line) => "> " + line).join("\n");
  return "On " + formatLongDate(detail.receivedAt) + ", " + formatAddress(detail.from) + " wrote:\n" + source;
}

function formatListDate(value: number): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat("el-GR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Athens" }).format(date);
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", timeZone: "Europe/Athens" }).format(date);
  return new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Europe/Athens" }).format(date);
}

function formatLongDate(value: number): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return Math.round(value) + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10 * 1024 ? 1 : 0) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}
