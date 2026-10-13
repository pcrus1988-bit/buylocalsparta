"use client";

import { useMemo, useState } from "react";
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
      <div className="admin-mail-editor-source">
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
      </div>
      <div className="admin-mail-editor-preview-column">
        <div className="admin-mail-editor-preview-header">
          <div><strong>Live preview</strong><small>{format === "plain" ? "Text-only" : "Email client preview"}</small></div>
          <div className="admin-mail-editor-preview-actions">
            {format !== "plain" ? <button type="button" onClick={() => setMobilePreview((value) => !value)}>{mobilePreview ? "Desktop" : "Mobile"}</button> : null}
            <button type="button" onClick={() => setShowPreview((value) => !value)} aria-expanded={showPreview}>{showPreview ? "Hide" : "Preview"}</button>
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
        <small className="admin-mail-editor-preview-caption">Preview never sends a message. Sending still requires clicking “Send with SES”.</small>
      </div>
    </div>
  </div>;
}
