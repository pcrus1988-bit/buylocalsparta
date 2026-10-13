"use client";

import { useEffect, useMemo, useState } from "react";
import { renderAdminMailHtml, type AdminMailFormat } from "../../../lib/admin-mail-template";

const starterHtml = [
  '<h2 style="margin:0 0 16px;color:#173e2a">Καλημέρα σας,</h2>',
  '<p>Σας ευχαριστούμε για το ενδιαφέρον σας για το KONTA MOY.</p>',
  '<p>Εδώ μπορείτε να προσθέσετε κείμενο, συνδέσμους, εικόνες και δικά σας HTML στοιχεία.</p>',
  '<p><a href="https://kontamou.site/hubs/join" style="display:inline-block;background:#173e2a;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:8px">Ξεκινήστε εδώ</a></p>'
].join("\n");

export function AdminMailComposerFields({ initialText = "" }: Readonly<{ initialText?: string }>) {
  const [format, setFormat] = useState<AdminMailFormat>("branded");
  const [text, setText] = useState(initialText);
  const [html, setHtml] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const activeContent = format === "html" ? html : text;
  const characterLimit = format === "html" ? 120_000 : 500_000;
  const remaining = characterLimit - activeContent.length;

  useEffect(() => {
    if (!fullPreviewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullPreviewOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullPreviewOpen]);

  const preview = useMemo(() => {
    try {
      return { html: renderAdminMailHtml({ format, text, html }), error: "" };
    } catch (cause) {
      return { html: undefined, error: cause instanceof Error ? cause.message : "Invalid HTML email" };
    }
  }, [format, text, html]);

  return <div className="admin-mail-editor admin-mail-compose-full">
    <div className="admin-mail-editor-toolbar">
      <div>
        <strong>Message editor</strong>
        <small>Choose the message format. Preview shows the exact KONTA MOY header and footer used for sending.</small>
      </div>
      <div className="admin-mail-editor-modes" role="group" aria-label="Email format">
        <button type="button" className={format === "branded" ? "is-active" : ""} aria-pressed={format === "branded"} onClick={() => setFormat("branded")}>KONTA MOY template</button>
        <button type="button" className={format === "html" ? "is-active" : ""} aria-pressed={format === "html"} onClick={() => setFormat("html")}>HTML</button>
        <button type="button" className={format === "plain" ? "is-active" : ""} aria-pressed={format === "plain"} onClick={() => setFormat("plain")}>Plain text</button>
      </div>
    </div>
    <input type="hidden" name="format" value={format} />
    <div className="admin-mail-editor-columns">
      <div className={editorExpanded ? "admin-mail-editor-source is-expanded" : "admin-mail-editor-source"}>
        <div className="admin-mail-editor-source-top">
          <span>The editor scrolls independently; your email is not shortened by the preview.</span>
          <button type="button" onClick={() => setEditorExpanded((value) => !value)} aria-expanded={editorExpanded}>
            {editorExpanded ? "Compact editor" : "Expand editor"}
          </button>
        </div>
        {format === "html" ? <>
          <label htmlFor="admin-mail-html-body">HTML body</label>
          <p>Enter an HTML fragment. The KONTA MOY branding and footer will be applied automatically. Scripts and interactive forms are not allowed.</p>
          <textarea id="admin-mail-html-body" name="html" value={html} onChange={(event) => setHtml(event.target.value)} rows={16} maxLength={120000} spellCheck={false} required placeholder="<h2>Welcome</h2><p>Your message…</p>" />
          <button type="button" className="admin-mail-editor-example" onClick={() => setHtml(starterHtml)}>Insert sample HTML</button>
        </> : <>
          <label htmlFor="admin-mail-text-body">{format === "branded" ? "Message content" : "Plain-text email"}</label>
          <p>{format === "branded" ? "Write normally; paragraphs, links and line breaks are formatted inside the branded email." : "Send without a styled header or footer."}</p>
          <textarea id="admin-mail-text-body" name="body" value={text} onChange={(event) => setText(event.target.value)} rows={16} maxLength={500000} required placeholder="Write your message here…" />
        </>}
        <div className="admin-mail-editor-character-count" role="status" aria-label="Email body length">
          <span>{activeContent.length.toLocaleString("en-US")} / {characterLimit.toLocaleString("en-US")} characters</span>
          <span className={remaining < characterLimit * 0.1 ? "is-near-limit" : ""}>
            {remaining.toLocaleString("en-US")} available
          </span>
        </div>
        <p className="admin-mail-editor-scroll-note">Paste long emails here. Expand the editor or scroll inside the text field to inspect the entire message.</p>
      </div>
      <div className="admin-mail-editor-preview-column">
        <div className="admin-mail-editor-preview-header">
          <div><strong>Live preview</strong><small>{format === "plain" ? "Text-only" : "Email client preview"}</small></div>
          <div className="admin-mail-editor-preview-actions">
            {format !== "plain" ? <button type="button" onClick={() => setMobilePreview((value) => !value)}>{mobilePreview ? "Desktop" : "Mobile"}</button> : null}
            <button type="button" onClick={() => setShowPreview((value) => !value)} aria-expanded={showPreview}>{showPreview ? "Hide" : "Preview"}</button>
            <button type="button" onClick={() => setFullPreviewOpen(true)}>Full preview</button>
          </div>
        </div>
        {showPreview ? <div className="admin-mail-editor-preview-surface">
          {preview.error ? <p className="admin-mail-editor-preview-error" role="alert">{preview.error}</p> : format === "plain"
            ? <pre className="admin-mail-editor-text-preview">{text || "Your plain-text email will appear here."}</pre>
            : <iframe
                className={mobilePreview ? "admin-mail-editor-preview-frame is-mobile" : "admin-mail-editor-preview-frame"}
                title="KONTA MOY outbound email preview"
                srcDoc={preview.html || ""}
                sandbox=""
                referrerPolicy="no-referrer"
              />}
        </div> : null}
        <small className="admin-mail-editor-preview-caption">The preview scrolls independently and does not shorten the email. Use “Full preview” to see it in a larger view. Preview never sends a message.</small>
      </div>
    </div>
    {fullPreviewOpen ? <div className="admin-mail-editor-full-preview-backdrop" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Full email preview" className="admin-mail-editor-full-preview">
        <header>
          <div><strong>Full email preview</strong><small>Scroll to review all the content. No message will be sent.</small></div>
          <button type="button" autoFocus onClick={() => setFullPreviewOpen(false)}>Close preview ×</button>
        </header>
        {preview.error ? <p className="admin-mail-editor-preview-error" role="alert">{preview.error}</p> : format === "plain"
          ? <pre className="admin-mail-editor-text-preview">{text || "Your plain-text email will appear here."}</pre>
          : <iframe
              title="KONTA MOY full email preview"
              srcDoc={preview.html || ""}
              sandbox=""
              referrerPolicy="no-referrer"
            />}
      </section>
    </div> : null}
  </div>;
}
