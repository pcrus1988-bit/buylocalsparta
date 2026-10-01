"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminMailFolder, AdminMailMessage, AdminMailWorkspace } from "../../../lib/admin-mail";
import styles from "./AdminMailClient.module.css";

type Props = Readonly<{ csrfToken: string; initialWorkspace: AdminMailWorkspace }>;
type ThreadPayload = Readonly<{ selectedId: string; messages: readonly AdminMailMessage[] }>;
type UploadRef = Readonly<{ objectKey: string; filename: string; contentType: string; byteSize: number }>;

const FOLDERS: ReadonlyArray<{ key: AdminMailFolder; label: string; icon: string }> = [
  { key: "inbox", label: "Inbox", icon: "↓" },
  { key: "sent", label: "Sent", icon: "↑" },
  { key: "starred", label: "Starred", icon: "★" },
  { key: "archive", label: "Archive", icon: "▣" },
  { key: "all", label: "All mail", icon: "≡" }
];

export function AdminMailClient({ csrfToken, initialWorkspace }: Props) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [folder, setFolder] = useState<AdminMailFolder>("inbox");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ThreadPayload | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const folderRef = useRef(folder);
  const queryRef = useRef(query);
  folderRef.current = folder;
  queryRef.current = query;

  const [composeOpen, setComposeOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string | undefined>();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [uploads, setUploads] = useState<UploadRef[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!initialWorkspace.readiness.inbound) return;
    let active = true;
    const run = async () => {
      try {
        await fetch("/api/admin/mail/sync", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ maxObjects: 100 })
        });
        if (active) await refresh(folderRef.current, queryRef.current, false);
      } catch {
        // Silent background sync; explicit Sync surfaces errors.
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
    // Initial readiness + CSRF are stable for this Admin session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csrfToken, initialWorkspace.readiness.inbound]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(folder, query, false), 320);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, query]);

  const selectedItem = useMemo(
    () => selected?.messages.find((item) => item.id === selected.selectedId) ?? selected?.messages.at(-1),
    [selected]
  );

  async function refresh(nextFolder = folder, nextQuery = query, showBusy = true) {
    if (showBusy) setLoadingList(true);
    setError("");
    try {
      const params = new URLSearchParams({ folder: nextFolder, limit: "60" });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/admin/mail?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as AdminMailWorkspace & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Mailbox refresh failed");
      setWorkspace(payload);
    } catch (cause) {
      setError(message(cause));
    } finally {
      if (showBusy) setLoadingList(false);
    }
  }

  async function sync(showNotice = true) {
    setSyncing(true);
    setError("");
    if (showNotice) setNotice("");
    try {
      const response = await fetch("/api/admin/mail/sync", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ maxObjects: 250 })
      });
      const payload = await response.json() as { ok?: boolean; scanned?: number; imported?: number; failed?: number; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Inbox sync failed");
      await refresh(folder, query, false);
      if (showNotice) setNotice(`S3 inbox synced · ${payload.imported ?? 0} new · ${payload.scanned ?? 0} checked${payload.failed ? ` · ${payload.failed} skipped` : ""}.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSyncing(false);
    }
  }

  async function openMessage(id: string) {
    setLoadingThread(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/mail/${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json() as ThreadPayload & { error?: string };
      if (!response.ok || !payload.messages) throw new Error(payload.error || "Message could not be opened");
      setSelected(payload);
      const opened = payload.messages.find((item) => item.id === id);
      if (opened?.direction === "inbound" && !opened.isRead) {
        await patchMessage(id, "mark_read", false);
        setSelected((current) => current ? {
          ...current,
          messages: current.messages.map((item) => item.id === id ? { ...item, isRead: true } : item)
        } : current);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setLoadingThread(false);
    }
  }

  async function patchMessage(id: string, action: "mark_read" | "mark_unread" | "star" | "unstar" | "archive" | "restore" | "delete", refreshList = true) {
    const response = await fetch(`/api/admin/mail/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ action })
    });
    const payload = await response.json() as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Mailbox action failed");
    if (refreshList) await refresh(folder, query, false);
  }

  async function action(id: string, kind: "mark_read" | "mark_unread" | "star" | "unstar" | "archive" | "restore" | "delete") {
    setError("");
    try {
      await patchMessage(id, kind);
      if (kind === "archive" || kind === "delete") setSelected(null);
      else if (selected) await openMessage(id);
    } catch (cause) {
      setError(message(cause));
    }
  }

  function newCompose() {
    setReplyToMessageId(undefined);
    setTo(""); setCc(""); setBcc(""); setSubject(""); setBody(""); setUploads([]);
    setComposeOpen(true); setError(""); setNotice("");
  }

  function reply() {
    const target = selectedItem;
    if (!target) return;
    const recipients = target.direction === "inbound"
      ? [target.replyTo[0]?.address || target.from.address]
      : target.to.map((item) => item.address);
    setReplyToMessageId(target.id);
    setTo(recipients.filter(Boolean).join(", "));
    setCc("");
    setBcc("");
    setSubject(/^re:/i.test(target.subject) ? target.subject : `Re: ${target.subject}`);
    setBody("");
    setUploads([]);
    setComposeOpen(true);
  }

  function forward() {
    const target = selectedItem;
    if (!target) return;
    const when = new Date(target.occurredAt).toLocaleString("el-GR");
    setReplyToMessageId(undefined);
    setTo(""); setCc(""); setBcc("");
    setSubject(/^fwd:/i.test(target.subject) ? target.subject : `Fwd: ${target.subject}`);
    setBody(`\n\n---------- Forwarded message ----------\nFrom: ${displayAddress(target.from)}\nDate: ${when}\nSubject: ${target.subject}\n\n${target.bodyText || target.preview}`);
    setUploads([]);
    setComposeOpen(true);
  }

  async function chooseFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const next: UploadRef[] = [];
      for (const file of Array.from(files).slice(0, 20 - uploads.length)) {
        const contentType = file.type || "application/octet-stream";
        const response = await fetch("/api/admin/mail/attachments/upload-url", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ filename: file.name, contentType, byteSize: file.size })
        });
        const signed = await response.json() as { objectKey?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
        if (!response.ok || !signed.objectKey || !signed.uploadUrl) throw new Error(signed.error || `Could not prepare ${file.name}`);
        const uploadResponse = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: signed.headers ?? { "content-type": contentType },
          body: file
        });
        if (!uploadResponse.ok) throw new Error(`S3 upload failed for ${file.name}`);
        next.push({ objectKey: signed.objectKey, filename: file.name, contentType, byteSize: file.size });
      }
      setUploads((current) => [...current, ...next]);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (!to.trim() && !cc.trim() && !bcc.trim()) return;
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          to: recipients(to),
          cc: recipients(cc),
          bcc: recipients(bcc),
          subject,
          text: body,
          replyToMessageId,
          attachments: uploads
        })
      });
      const payload = await response.json() as { id?: string; providerMessageId?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "SES send failed");
      setComposeOpen(false);
      setNotice(`Email sent through SES · ${payload.providerMessageId || payload.id}`);
      setFolder("sent");
      await refresh("sent", "", false);
      await openMessage(payload.id);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSending(false);
    }
  }

  const syncText = workspace.sync?.lastSuccessAt
    ? `Last sync ${relativeTime(workspace.sync.lastSuccessAt)} · ${workspace.sync.importedMessages} imported`
    : "Not synced yet";

  return <div className={styles.shell}>
    <section className={styles.hero}>
      <div>
        <div className={styles.eyebrow}>Admin · Communications</div>
        <h1 className={styles.heroTitle}>Mail</h1>
        <p className={styles.heroCopy}>Operational mailbox for incoming and outgoing KONTA MOY email. Incoming raw messages remain in S3; searchable mail state is indexed server-side and outgoing mail is sent through Amazon SES.</p>
      </div>
      <div className={styles.health}>
        <span className={styles.healthPill} data-ok={workspace.readiness.database}>Database</span>
        <span className={styles.healthPill} data-ok={workspace.readiness.inbound}>S3 Inbox</span>
        <span className={styles.healthPill} data-ok={workspace.readiness.outbound}>SES Send</span>
      </div>
    </section>

    {notice ? <div className={styles.notice}>{notice}</div> : null}
    {error ? <div className={styles.error}>{error}</div> : null}

    <section className={styles.mailbox} data-reader-open={Boolean(selected)}>
      <aside className={styles.sidebar}>
        <button type="button" className={styles.composeButton} onClick={newCompose} disabled={!workspace.readiness.outbound}>Compose</button>
        <nav className={styles.folderList} aria-label="Mail folders">
          {FOLDERS.map((item) => {
            const count = item.key === "inbox" ? workspace.counts.inbox
              : item.key === "sent" ? workspace.counts.sent
              : item.key === "starred" ? workspace.counts.starred
              : item.key === "archive" ? workspace.counts.archive : 0;
            return <button key={item.key} type="button" className={styles.folderButton} data-active={folder === item.key} title={item.label}
              onClick={() => { setFolder(item.key); setSelected(null); }}>
              <span>{item.icon} <span className="desktop-only">{item.label}</span></span>
              {count > 0 ? <span className={`${styles.folderCount} ${item.key === "inbox" && workspace.counts.unread > 0 ? styles.unreadCount : ""}`}>
                {item.key === "inbox" && workspace.counts.unread > 0 ? workspace.counts.unread : count}
              </span> : null}
            </button>;
          })}
        </nav>
        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.syncButton} onClick={() => void sync(true)} disabled={syncing || !workspace.readiness.inbound}>
            {syncing ? "Syncing…" : "Sync S3"}
          </button>
          <div className={styles.syncMeta}>{syncText}{workspace.sync?.lastError ? <><br />{workspace.sync.lastError}</> : null}</div>
        </div>
      </aside>

      <div className={styles.listPane}>
        <div className={styles.listTop}>
          <div className={styles.listHeading}>
            <strong>{folderLabel(folder)}</strong>
            <span>{loadingList ? "Loading…" : `${workspace.messages.length} shown`}</span>
          </div>
          <div className={styles.searchWrap}>
            <input className={styles.searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search sender, recipient, subject, message…" aria-label="Search email" />
            <button type="button" className={styles.iconButton} title="Refresh" onClick={() => void refresh()}>↻</button>
          </div>
        </div>
        <div className={styles.messageList}>
          {workspace.messages.length ? workspace.messages.map((item) => <div key={item.id} className={styles.messageRow}
            data-selected={selected?.selectedId === item.id} data-unread={!item.isRead && item.direction === "inbound"}
            role="button" tabIndex={0} onClick={() => void openMessage(item.id)}
            onKeyDown={(event) => { if (event.key === "Enter") void openMessage(item.id); }}>
            <button type="button" className={styles.star} data-active={item.isStarred} title={item.isStarred ? "Unstar" : "Star"}
              onClick={(event) => { event.stopPropagation(); void action(item.id, item.isStarred ? "unstar" : "star"); }}>★</button>
            <div className={styles.messageMain}>
              <div className={styles.messageHeader}>
                <span className={styles.messageSender}>{item.direction === "inbound" ? displayAddress(item.from) : `To: ${item.to.map(displayAddress).join(", ")}`}</span>
              </div>
              <div className={styles.messageSubject}>{item.subject}</div>
              <div className={styles.messagePreview}>{item.preview || "No text preview"}{item.hasAttachments ? <span className={styles.paperclip}> · 📎 {item.attachmentCount}</span> : null}</div>
            </div>
            <div className={styles.messageMeta}>
              <span className={styles.statusDot} data-status={item.deliveryStatus} />
              {formatListTime(item.occurredAt)}
            </div>
          </div>) : <div className={styles.emptyList}>{loadingList ? "Loading mail…" : "No messages in this view."}</div>}
        </div>
      </div>

      <div className={styles.reader}>
        {selected && selectedItem ? <div className={styles.readerInner}>
          <div className={styles.readerToolbar}>
            <div className={styles.toolbarGroup}>
              <button type="button" className={`${styles.quietButton} ${styles.mobileReaderBack}`} onClick={() => setSelected(null)}>←</button>
              <button type="button" className={styles.quietButton} onClick={reply} disabled={!workspace.readiness.outbound}>↩ Reply</button>
              <button type="button" className={styles.quietButton} onClick={forward} disabled={!workspace.readiness.outbound}>↗ Forward</button>
            </div>
            <div className={styles.toolbarGroup}>
              <button type="button" className={styles.quietButton}
                onClick={() => void action(selectedItem.id, selectedItem.isStarred ? "unstar" : "star")}>{selectedItem.isStarred ? "★ Starred" : "☆ Star"}</button>
              <button type="button" className={styles.quietButton}
                onClick={() => void action(selectedItem.id, selectedItem.archived ? "restore" : "archive")}>{selectedItem.archived ? "Restore" : "Archive"}</button>
              <button type="button" className={styles.quietButton} onClick={() => void action(selectedItem.id, "delete")}>Delete</button>
            </div>
          </div>
          <h2 className={styles.threadSubject}>{selectedItem.subject}</h2>
          <div className={styles.thread}>
            {selected.messages.map((mail) => <article className={styles.threadCard} data-direction={mail.direction} key={mail.id}>
              <div className={styles.threadHead}>
                <div>
                  <div className={styles.threadFrom}>{mail.direction === "outbound" ? `KONTA MOY → ${mail.to.map(displayAddress).join(", ")}` : displayAddress(mail.from)}</div>
                  <div className={styles.threadRecipients}>
                    {mail.direction === "inbound" ? `To: ${mail.to.map(displayAddress).join(", ") || "KONTA MOY"}` : `From: ${displayAddress(mail.from)}`}
                    {mail.cc.length ? ` · Cc: ${mail.cc.map(displayAddress).join(", ")}` : ""}
                  </div>
                </div>
                <div>
                  <span className={styles.deliveryBadge}>{mail.deliveryStatus}</span>
                  <div className={styles.threadTime}>{new Date(mail.occurredAt).toLocaleString("el-GR")}</div>
                </div>
              </div>
              <div className={styles.threadBody}>{mail.bodyText || mail.preview || "(No readable text body)"}</div>
              {mail.attachments.length ? <div className={styles.attachments}>
                {mail.attachments.map((attachment) => <a key={attachment.partIndex} className={styles.attachment}
                  href={`/api/admin/mail/${encodeURIComponent(mail.id)}/attachment/${attachment.partIndex}`}>
                  📎 {attachment.filename} · {formatBytes(attachment.byteSize)}
                </a>)}
              </div> : null}
            </article>)}
          </div>
        </div> : <div className={styles.readerEmpty}>{loadingThread ? "Opening message…" : <div><strong>Select an email</strong><br />Open a message to see its full conversation and attachments.</div>}</div>}
      </div>
    </section>

    {composeOpen ? <div className={styles.composeBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !sending) setComposeOpen(false);
    }}>
      <section className={styles.compose} role="dialog" aria-modal="true" aria-label="Compose email">
        <div className={styles.composeHead}>
          <span className={styles.composeTitle}>{replyToMessageId ? "Reply" : subject.toLowerCase().startsWith("fwd:") ? "Forward" : "New message"}</span>
          <button type="button" className={styles.closeButton} onClick={() => setComposeOpen(false)} disabled={sending}>×</button>
        </div>
        <div className={styles.composeFields}>
          <div className={styles.composeField}><label htmlFor="mail-to">To</label><input id="mail-to" value={to} onChange={(event) => setTo(event.target.value)} placeholder="email@example.com" autoFocus /></div>
          <div className={styles.composeField}><label htmlFor="mail-cc">Cc</label><input id="mail-cc" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="optional" /></div>
          <div className={styles.composeField}><label htmlFor="mail-bcc">Bcc</label><input id="mail-bcc" value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="optional" /></div>
          <div className={styles.composeField}><label htmlFor="mail-subject">Subject</label><input id="mail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={998} /></div>
        </div>
        <textarea className={styles.composeBody} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your message…" />
        {uploads.length ? <div className={styles.composeAttachments}>{uploads.map((file) => <span className={styles.uploadChip} key={file.objectKey}>
          📎 {file.filename} · {formatBytes(file.byteSize)}
          <button type="button" title="Remove attachment" onClick={() => setUploads((current) => current.filter((item) => item.objectKey !== file.objectKey))}>×</button>
        </span>)}</div> : null}
        <div className={styles.composeFoot}>
          <label className={styles.fileLabel}>📎 {uploading ? "Uploading…" : "Attach files"}
            <input type="file" multiple disabled={uploading || sending} onChange={(event) => { void chooseFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
          </label>
          <button type="button" className={styles.sendButton} disabled={sending || uploading || (!to.trim() && !cc.trim() && !bcc.trim()) || !subject.trim() || !body.trim()} onClick={() => void send()}>
            {sending ? "Sending through SES…" : "Send"}
          </button>
        </div>
      </section>
    </div> : null}
  </div>;
}

function folderLabel(folder: AdminMailFolder): string {
  return folder === "sent" ? "Sent" : folder === "starred" ? "Starred" : folder === "archive" ? "Archive" : folder === "all" ? "All mail" : "Inbox";
}
function recipients(value: string): string[] { return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean); }
function displayAddress(value: { name?: string; address: string }): string { return value.name ? `${value.name} <${value.address}>` : value.address; }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatListTime(epoch: number): string {
  const date = new Date(epoch);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString("el-GR", { day: "2-digit", month: "short" });
  return date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function relativeTime(epoch: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
