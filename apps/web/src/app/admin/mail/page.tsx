import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import {
  adminMailConfiguration,
  adminMailWorkspace,
  syncAdminInboundMail,
  type AdminMailThreadMessage,
  type AdminMailWorkspace
} from "../../../lib/admin-mail-runtime";
import {
  bulkMailAction,
  sendMailAction,
  syncMailboxAction,
  toggleArchiveMailAction,
  toggleDeleteMailAction,
  toggleReadMailAction,
  toggleStarMailAction
} from "./actions";

export const metadata: Metadata = { title: "Admin · Mail", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const fmtDate = (value?: number) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

const compactDate = (value?: number) => value
  ? new Intl.DateTimeFormat("el-GR", {
      day: "2-digit",
      month: "short",
      ...(new Date(value).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
      timeZone: "Europe/Athens"
    }).format(new Date(value))
  : "—";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

type MailView = Readonly<{
  q: string;
  read: AdminMailWorkspace["filters"]["read"];
  direction: AdminMailWorkspace["filters"]["direction"];
  status: AdminMailWorkspace["filters"]["status"];
  attachments: AdminMailWorkspace["filters"]["attachments"];
  sort: AdminMailWorkspace["filters"]["sort"];
}>;

function appendViewParams(params: URLSearchParams, view: MailView): void {
  if (view.q) params.set("q", view.q);
  if (view.read !== "all") params.set("read", view.read);
  if (view.direction !== "all") params.set("direction", view.direction);
  if (view.status !== "all") params.set("status", view.status);
  if (view.attachments !== "all") params.set("attachments", view.attachments);
  if (view.sort !== "newest") params.set("sort", view.sort);
}

function folderHref(folder: string, view: MailView): string {
  const params = new URLSearchParams({ folder });
  appendViewParams(params, view);
  return `/admin/mail?${params.toString()}`;
}

function messageHref(folder: string, messageId: string, view: MailView): string {
  const params = new URLSearchParams({ folder, message: messageId });
  appendViewParams(params, view);
  return `/admin/mail?${params.toString()}`;
}

function composeHref(folder: string, messageId: string | undefined, mode: "compose" | "reply" | "forward", view: MailView): string {
  const params = new URLSearchParams({ folder, compose: "1", mode });
  if (messageId) params.set("message", messageId);
  appendViewParams(params, view);
  return `/admin/mail?${params.toString()}#compose`;
}

function emptyWorkspace(
  configurationMessage: string,
  fromAddresses: readonly string[],
  folder: AdminMailWorkspace["folder"],
  q: string,
  filters: AdminMailWorkspace["filters"]
): AdminMailWorkspace {
  return {
    configured: false,
    configurationMessage,
    fromAddresses,
    folder,
    query: q,
    filters,
    messages: [],
    thread: [],
    metrics: { inbox: 0, unread: 0, sent: 0, starred: 0, archived: 0, trash: 0, all: 0 }
  };
}

function replyRecipient(message: AdminMailThreadMessage | undefined): string {
  if (!message) return "";
  if (message.direction === "incoming") return message.replyTo || message.from;
  return message.to[0] || "";
}

function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

function forwardSubject(subject: string): string {
  return /^\s*(fw|fwd)\s*:/i.test(subject) ? subject : `Fwd: ${subject}`;
}

function forwardBody(message: AdminMailThreadMessage): string {
  const timestamp = fmtDate(message.receivedAt || message.sentAt);
  return [
    "",
    "",
    "---------- Forwarded message ----------",
    `From: ${message.from}`,
    `Date: ${timestamp}`,
    `Subject: ${message.subject}`,
    `To: ${message.to.join(", ")}`,
    message.cc.length ? `Cc: ${message.cc.join(", ")}` : undefined,
    "",
    message.bodyText
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export default async function AdminMailPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "notifications.manage")) redirect("/admin");

  const params = await searchParams;
  const folder = one(params.folder);
  const query = one(params.q).slice(0, 200);
  const selectedId = one(params.message) || undefined;
  const requestedFilters: AdminMailWorkspace["filters"] = {
    read: one(params.read) === "read" || one(params.read) === "unread" ? one(params.read) as "read" | "unread" : "all",
    direction: one(params.direction) === "incoming" || one(params.direction) === "outgoing" ? one(params.direction) as "incoming" | "outgoing" : "all",
    status: ["received", "sent", "queued", "failed"].includes(one(params.status)) ? one(params.status) as "received" | "sent" | "queued" | "failed" : "all",
    attachments: one(params.attachments) === "with" || one(params.attachments) === "without" ? one(params.attachments) as "with" | "without" : "all",
    sort: ["oldest", "sender", "subject"].includes(one(params.sort)) ? one(params.sort) as "oldest" | "sender" | "subject" : "newest"
  };
  const configuration = adminMailConfiguration();
  let syncNotice = "";
  if (configuration.configured) {
    try {
      const sync = await syncAdminInboundMail({ maxNew: 25 });
      const notices: string[] = [];
      if (sync.indexed > 0) notices.push(`${sync.indexed} new message${sync.indexed === 1 ? "" : "s"} indexed from S3.`);
      if (sync.failed > 0) notices.push(`${sync.failed} inbound object${sync.failed === 1 ? "" : "s"} quarantined for review; later S3 mail will continue syncing.`);
      syncNotice = notices.join(" ");
    } catch (error) {
      syncNotice = error instanceof Error ? error.message : "Inbound S3 sync failed.";
    }
  }

  let workspace: AdminMailWorkspace;
  try {
    workspace = configuration.configured
      ? await adminMailWorkspace(principal, { folder, q: query, selectedId, ...requestedFilters })
      : emptyWorkspace(
          configuration.message,
          configuration.fromAddresses,
          folder === "sent" || folder === "starred" || folder === "archive" || folder === "trash" || folder === "all" ? folder : "inbox",
          query,
          requestedFilters
        );
  } catch (error) {
    workspace = emptyWorkspace(
      error instanceof Error ? `Mailbox data is not ready: ${error.message}` : "Mailbox data is not ready.",
      configuration.fromAddresses,
      folder === "sent" || folder === "starred" || folder === "archive" || folder === "trash" || folder === "all" ? folder : "inbox",
      query,
      requestedFilters
    );
  }

  const selected = workspace.thread.find((message) => message.id === workspace.selectedId)
    || workspace.thread.at(-1);
  const modeRaw = one(params.mode);
  const composeOpen = one(params.compose) === "1" || modeRaw === "reply" || modeRaw === "forward";
  const mode: "compose" | "reply" | "forward" = modeRaw === "reply" || modeRaw === "forward" ? modeRaw : "compose";
  const composeTo = mode === "reply" ? replyRecipient(selected) : "";
  const composeSubject = selected ? (mode === "reply" ? replySubject(selected.subject) : mode === "forward" ? forwardSubject(selected.subject) : "") : "";
  const composeBody = selected && mode === "forward" ? forwardBody(selected) : "";
  const error = one(params.error);
  const sent = one(params.sent) === "1";
  const view: MailView = { q: workspace.query, ...workspace.filters };
  const clearView: MailView = { q: "", read: "all", direction: "all", status: "all", attachments: "all", sort: "newest" };

  const folders = [
    { id: "inbox", label: "Inbox", value: workspace.metrics.inbox, secondary: workspace.metrics.unread ? `${workspace.metrics.unread} unread` : "" },
    { id: "sent", label: "Sent", value: workspace.metrics.sent, secondary: "" },
    { id: "starred", label: "Starred", value: workspace.metrics.starred, secondary: "" },
    { id: "archive", label: "Archive", value: workspace.metrics.archived, secondary: "" },
    { id: "trash", label: "Trash", value: workspace.metrics.trash, secondary: "" },
    { id: "all", label: "All mail", value: workspace.metrics.all, secondary: "" }
  ];

  return <main className="vendor-app admin-app admin-mail-page">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell admin-mail-hero">
      <div>
        <div className="eyebrow">Content · Communications</div>
        <h1>Mail</h1>
        <p>Incoming and outgoing KONTA MOU email in one operational workspace. Inbound mail stays authoritative in AWS S3; operator messages are sent through AWS SES.</p>
      </div>
      <div className="admin-mail-hero-actions">
        <Link className="button" href={composeHref(workspace.folder, workspace.selectedId, "compose", view)}>Compose</Link>
        <form action={syncMailboxAction}>
          <input type="hidden" name="csrfToken" value={principal.csrfToken} />
          <button className="button button-secondary" type="submit">Sync inbox</button>
        </form>
      </div>
    </section>

    {error ? <section className="shell admin-mail-banner admin-mail-banner-error" role="alert"><strong>Mail action failed</strong><span>{error}</span></section> : null}
    {sent ? <section className="shell admin-mail-banner admin-mail-banner-success" role="status"><strong>Sent through SES</strong><span>The message is now in Sent.</span></section> : null}
    {syncNotice ? <section className="shell admin-mail-banner" role="status"><strong>Inbound sync</strong><span>{syncNotice}</span></section> : null}
    {!workspace.configured ? <section className="shell admin-mail-banner admin-mail-banner-error"><strong>Mailbox not ready</strong><span>{workspace.configurationMessage}</span></section> : null}

    <section className="shell admin-mail-status-row">
      <span className={workspace.configured ? "admin-mail-dot is-ready" : "admin-mail-dot"} aria-hidden="true" />
      <strong>{workspace.configured ? "SES + S3 connected" : "SES + S3 configuration required"}</strong>
      <span>{workspace.configurationMessage}</span>
      {workspace.lastInboundAt ? <span>Last inbound: {fmtDate(workspace.lastInboundAt)}</span> : null}
    </section>

    <section className="shell admin-mail-shell" aria-label="Admin mailbox">
      <aside className="admin-mail-folders" aria-label="Mail folders">
        <Link className="admin-mail-compose-button" href={composeHref(workspace.folder, workspace.selectedId, "compose", view)}>＋ Compose</Link>
        <nav>
          {folders.map((item) => <Link key={item.id} className={workspace.folder === item.id ? "is-active" : ""} href={folderHref(item.id, view)}>
            <span>{item.label}{item.secondary ? <small>{item.secondary}</small> : null}</span>
            <strong>{item.value}</strong>
          </Link>)}
        </nav>
        <div className="admin-mail-folder-note">
          <strong>Mailboxes</strong>
          {workspace.fromAddresses.map((address) => <span key={address}>{address}</span>)}
        </div>
      </aside>

      <div className="admin-mail-list-pane">
        <form className="admin-mail-search admin-mail-filter-form" action="/admin/mail" method="get">
          <input type="hidden" name="folder" value={workspace.folder} />
          <label className="admin-mail-search-field">
            <span className="sr-only">Search mail</span>
            <input name="q" type="search" defaultValue={workspace.query} placeholder="Search sender, recipient, subject or preview…" />
          </label>
          <label><span>Read</span><select name="read" defaultValue={workspace.filters.read}>
            <option value="all">All</option><option value="unread">Unread</option><option value="read">Read</option>
          </select></label>
          <label><span>Direction</span><select name="direction" defaultValue={workspace.filters.direction}>
            <option value="all">All</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option>
          </select></label>
          <label><span>Status</span><select name="status" defaultValue={workspace.filters.status}>
            <option value="all">All</option><option value="received">Received</option><option value="sent">Sent</option><option value="queued">Queued</option><option value="failed">Failed</option>
          </select></label>
          <label><span>Attachments</span><select name="attachments" defaultValue={workspace.filters.attachments}>
            <option value="all">All</option><option value="with">With files</option><option value="without">No files</option>
          </select></label>
          <label><span>Sort</span><select name="sort" defaultValue={workspace.filters.sort}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="sender">Sender A–Z</option><option value="subject">Subject A–Z</option>
          </select></label>
          <button type="submit">Apply</button>
          <Link href={folderHref(workspace.folder, clearView)}>Reset</Link>
        </form>

        <form id="admin-mail-bulk-form" className="admin-mail-bulk" action={bulkMailAction}>
          <input type="hidden" name="csrfToken" value={principal.csrfToken} />
          <strong>Selected emails</strong>
          <select name="bulkAction" defaultValue="read" aria-label="Bulk action">
            <option value="read">Mark read</option>
            <option value="unread">Mark unread</option>
            <option value="star">Add star</option>
            <option value="unstar">Remove star</option>
            <option value="archive">Move → Archive</option>
            <option value="inbox">Move → Inbox / restore</option>
            <option value="trash">Delete → Trash</option>
            <option value="restore">Restore from Trash</option>
          </select>
          <button type="submit">Apply action</button>
          <small>Tick one or more messages below.</small>
        </form>

        <div className="admin-mail-list" role="list">
          {workspace.messages.length === 0 ? <div className="admin-mail-empty">
            <strong>No messages here.</strong>
            <span>{workspace.query ? "Try a different search." : "New mail will appear after SES stores it in S3 and the inbox sync runs."}</span>
          </div> : workspace.messages.map((message) => {
            const active = workspace.selectedId === message.id;
            const timestamp = message.receivedAt || message.sentAt;
            const identity = message.direction === "incoming" ? message.from : `To: ${message.to.join(", ")}`;
            return <article key={message.id} role="listitem" className={`admin-mail-row${active ? " is-active" : ""}${!message.isRead && message.direction === "incoming" ? " is-unread" : ""}`}>
              <div className="admin-mail-row-actions">
                <input
                  className="admin-mail-select"
                  type="checkbox"
                  name="messageIds"
                  value={message.id}
                  form="admin-mail-bulk-form"
                  aria-label={`Select ${message.subject}`}
                />
                <form action={toggleStarMailAction}>
                  <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                  <input type="hidden" name="messageId" value={message.id} />
                  <input type="hidden" name="value" value={message.isStarred ? "false" : "true"} />
                  <button type="submit" title={message.isStarred ? "Remove star" : "Star"} aria-label={message.isStarred ? "Remove star" : "Star"}>{message.isStarred ? "★" : "☆"}</button>
                </form>
              </div>
              <Link className="admin-mail-row-main" href={messageHref(workspace.folder, message.id, view)}>
                <div className="admin-mail-row-top"><strong>{identity}</strong><time>{compactDate(timestamp)}</time></div>
                <div className="admin-mail-row-subject"><span>{message.subject}</span>{message.attachmentCount ? <small>📎 {message.attachmentCount}</small> : null}</div>
                <p>{message.preview || "No preview available."}</p>
                <div className="admin-mail-row-meta">
                  <span>{message.direction === "incoming" ? "Incoming" : message.status === "sent" ? "Sent" : message.status === "queued" ? "Sending" : "Send failed"}</span>
                  {message.direction === "outgoing" && message.status !== "sent" ? <span className="needs-attention">{message.status === "queued" ? "Awaiting SES confirmation" : "Delivery needs attention"}</span> : null}
                  {message.spamVerdict && message.spamVerdict !== "PASS" ? <span className="needs-attention">Spam: {message.spamVerdict}</span> : null}
                  {message.virusVerdict && message.virusVerdict !== "PASS" ? <span className="needs-attention">Virus: {message.virusVerdict}</span> : null}
                </div>
              </Link>
            </article>;
          })}
        </div>
      </div>

      <div className="admin-mail-reader">
        {!workspace.selectedId || workspace.thread.length === 0 ? <div className="admin-mail-empty admin-mail-empty-reader">
          <strong>Select a message</strong>
          <span>The full conversation will open here.</span>
        </div> : <>
          <header className="admin-mail-thread-head">
            <div>
              <small>Conversation</small>
              <h2>{selected?.subject || "Mail thread"}</h2>
              <span>{workspace.thread.length} message{workspace.thread.length === 1 ? "" : "s"}</span>
            </div>
            {selected ? <div className="admin-mail-thread-actions">
              <Link className="button button-secondary" href={composeHref(workspace.folder, selected.id, "reply", view)}>Reply</Link>
              <Link className="button button-secondary" href={composeHref(workspace.folder, selected.id, "forward", view)}>Forward</Link>
              {!selected.deleted ? <form action={toggleArchiveMailAction}>
                <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                <input type="hidden" name="messageId" value={selected.id} />
                <input type="hidden" name="value" value={selected.archived ? "false" : "true"} />
                <button className="button button-secondary" type="submit">{selected.archived ? "Move to Inbox" : "Archive"}</button>
              </form> : null}
              <form action={toggleDeleteMailAction}>
                <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                <input type="hidden" name="messageId" value={selected.id} />
                <input type="hidden" name="value" value={selected.deleted ? "false" : "true"} />
                <button className={`button button-secondary${selected.deleted ? "" : " admin-mail-delete-button"}`} type="submit">{selected.deleted ? "Restore" : "Delete"}</button>
              </form>
              {selected.direction === "incoming" && !selected.deleted ? <form action={toggleReadMailAction}>
                <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                <input type="hidden" name="messageId" value={selected.id} />
                <input type="hidden" name="value" value={selected.isRead ? "false" : "true"} />
                <button className="button button-secondary" type="submit">{selected.isRead ? "Unread" : "Read"}</button>
              </form> : null}
            </div> : null}
          </header>

          <div className="admin-mail-thread">
            {workspace.thread.map((message) => <article className={`admin-mail-message ${message.direction}`} key={message.id}>
              <header>
                <div>
                  <strong>{message.direction === "incoming" ? message.from : `KONTA MOU · ${message.from}`}</strong>
                  <span>To: {message.to.join(", ") || "—"}</span>
                  {message.cc.length ? <span>Cc: {message.cc.join(", ")}</span> : null}
                </div>
                <div>
                  <time>{fmtDate(message.receivedAt || message.sentAt)}</time>
                  <span className={`admin-mail-direction ${message.direction}`}>{message.direction === "incoming" ? "IN" : "OUT"}</span>
                  {message.direction === "outgoing" && message.status !== "sent" ? <span className="needs-attention">{message.status.toUpperCase()}</span> : null}
                </div>
              </header>
              {(message.spamVerdict || message.virusVerdict) ? <div className="admin-mail-verdicts">
                {message.spamVerdict ? <span className={message.spamVerdict === "PASS" ? "is-pass" : "needs-attention"}>Spam {message.spamVerdict}</span> : null}
                {message.virusVerdict ? <span className={message.virusVerdict === "PASS" ? "is-pass" : "needs-attention"}>Virus {message.virusVerdict}</span> : null}
              </div> : null}
              <pre>{message.bodyText}</pre>
              {message.attachments.length ? <div className="admin-mail-attachments">
                {message.attachments.map((attachment) => message.direction === "incoming" && (!message.virusVerdict || message.virusVerdict === "PASS")
                  ? <a key={attachment.index} href={`/api/admin/mail/attachment/${encodeURIComponent(message.id)}/${attachment.index}`}>
                      <strong>{attachment.filename}</strong><span>{attachment.contentType} · {Math.max(1, Math.round(attachment.byteSize / 1024))} KB</span>
                    </a>
                  : <span className="admin-mail-attachment-static" key={attachment.index}><strong>{attachment.filename}</strong><span>{message.direction === "incoming" ? "Blocked by SES virus screening" : `${attachment.contentType} · ${Math.max(1, Math.round(attachment.byteSize / 1024))} KB`}</span></span>)}
              </div> : null}
            </article>)}
          </div>
        </>}
      </div>
    </section>

    <section id="compose" className={`shell admin-mail-compose${composeOpen ? " is-open" : ""}`}>
      <details open={composeOpen}>
        <summary><span>{mode === "reply" ? "Reply" : mode === "forward" ? "Forward" : "New message"}</span><small>Send through AWS SES</small></summary>
        <form action={sendMailAction}>
          <input type="hidden" name="csrfToken" value={principal.csrfToken} />
          {mode === "reply" && selected ? <input type="hidden" name="inReplyToId" value={selected.id} /> : null}
          <div className="admin-mail-compose-grid">
            <label><span>From</span><select name="from" defaultValue={workspace.fromAddresses[0] || ""} required>{workspace.fromAddresses.map((address) => <option key={address} value={address}>{address}</option>)}</select></label>
            <label className="admin-mail-compose-wide"><span>To</span><input name="to" type="text" defaultValue={composeTo} placeholder="name@example.com" required /></label>
            <label><span>Cc</span><input name="cc" type="text" placeholder="Optional" /></label>
            <label><span>Bcc</span><input name="bcc" type="text" placeholder="Optional" /></label>
            <label className="admin-mail-compose-full"><span>Subject</span><input name="subject" type="text" defaultValue={composeSubject} maxLength={240} required /></label>
            <label className="admin-mail-compose-full"><span>Message</span><textarea name="body" rows={14} defaultValue={composeBody} required /></label>
            <label className="admin-mail-compose-full admin-mail-file"><span>Attachments</span><input name="attachments" type="file" multiple /><small>Up to 8 files, maximum 3 MB total.</small></label>
          </div>
          <div className="admin-mail-compose-actions">
            <button className="button" type="submit" disabled={!workspace.configured}>Send with SES</button>
            <Link className="button button-secondary" href={workspace.selectedId ? messageHref(workspace.folder, workspace.selectedId, view) : folderHref(workspace.folder, view)}>Close</Link>
          </div>
        </form>
      </details>
    </section>
  </main>;
}
