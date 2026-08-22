"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ContentEditorTranslation = Readonly<{
  locale: "el" | "en";
  title: string;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  blocks: readonly unknown[];
}>;

type Props = Readonly<{
  pageId: string;
  pageType: "home" | "standard" | "landing" | "legal" | "local_landing";
  status: string;
  scheduledAt?: number;
  csrfToken: string;
  translations: Readonly<Partial<Record<"el" | "en", ContentEditorTranslation>>>;
  canWrite: boolean;
}>;

function localDateTime(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function blankTranslation(locale: "el" | "en"): ContentEditorTranslation {
  return { locale, title: "", seoTitle: "", seoDescription: "", noindex: false, blocks: [] };
}

export function AdminContentPageEditor({ pageId, pageType, status, scheduledAt, csrfToken, translations, canWrite }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [englishEnabled, setEnglishEnabled] = useState(Boolean(translations.en));
  const el = useMemo(() => translations.el ?? blankTranslation("el"), [translations.el]);
  const en = useMemo(() => translations.en ?? blankTranslation("en"), [translations.en]);

  async function submitUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const locales: ("el" | "en")[] = englishEnabled ? ["el", "en"] : ["el"];
      const output = locales.map((locale) => ({
        locale,
        title: String(form.get(`${locale}.title`) ?? ""),
        seoTitle: String(form.get(`${locale}.seoTitle`) ?? ""),
        seoDescription: String(form.get(`${locale}.seoDescription`) ?? ""),
        noindex: form.get(`${locale}.noindex`) === "on",
        ogTitle: String(form.get(`${locale}.ogTitle`) ?? ""),
        ogDescription: String(form.get(`${locale}.ogDescription`) ?? ""),
        ogImage: String(form.get(`${locale}.ogImage`) ?? ""),
        blocks: JSON.parse(String(form.get(`${locale}.blocks`) ?? "[]")) as unknown
      }));
      const response = await fetch(`/api/admin/content/${encodeURIComponent(pageId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ pageType: String(form.get("pageType") ?? "standard"), reason: String(form.get("reason") ?? ""), translations: output })
      });
      const payload = await response.json() as { result?: { version?: number }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Content update failed.");
      setMessage(`Saved as version ${payload.result?.version ?? "new"}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof SyntaxError ? "Blocks must be valid JSON arrays." : caught instanceof Error ? caught.message : "Content update failed.");
    } finally { setBusy(false); }
  }

  async function submitSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("scheduledAt") ?? "");
    try {
      const scheduled = new Date(raw).getTime();
      if (!Number.isFinite(scheduled)) throw new Error("Choose a valid future publication time.");
      const response = await fetch(`/api/admin/content/${encodeURIComponent(pageId)}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ scheduledAt: scheduled, reason: String(form.get("scheduleReason") ?? "") })
      });
      const payload = await response.json() as { result?: { version?: number }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Scheduling failed.");
      setMessage(`Publication scheduled. Version ${payload.result?.version ?? "updated"}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scheduling failed.");
    } finally { setBusy(false); }
  }

  function translationFields(locale: "el" | "en", value: ContentEditorTranslation) {
    const label = locale === "el" ? "Greek" : "English";
    return <fieldset className="workspace-tool-panel" style={{ marginTop: 16 }}>
      <legend><strong>{label} content & search metadata</strong></legend>
      <label><span>Page title</span><input name={`${locale}.title`} defaultValue={value.title} required /></label>
      <label><span>SEO title <small>max 120 chars</small></span><input name={`${locale}.seoTitle`} defaultValue={value.seoTitle} maxLength={120} required /></label>
      <label><span>SEO description <small>max 320 chars</small></span><textarea name={`${locale}.seoDescription`} defaultValue={value.seoDescription} rows={3} maxLength={320} required /></label>
      <label className="admin-checkbox-row"><input name={`${locale}.noindex`} type="checkbox" defaultChecked={value.noindex} /><span>Tell search engines not to index this translation</span></label>
      <label><span>Open Graph title</span><input name={`${locale}.ogTitle`} defaultValue={value.ogTitle ?? ""} /></label>
      <label><span>Open Graph description</span><textarea name={`${locale}.ogDescription`} defaultValue={value.ogDescription ?? ""} rows={2} /></label>
      <label><span>Open Graph image <small>internal path or HTTPS URL</small></span><input name={`${locale}.ogImage`} defaultValue={value.ogImage ?? ""} placeholder="/images/... or https://..." /></label>
      <label><span>Content blocks <small>validated CMS block JSON</small></span><textarea name={`${locale}.blocks`} defaultValue={JSON.stringify(value.blocks, null, 2)} rows={16} spellCheck={false} required /></label>
    </fieldset>;
  }

  return <div>
    <form className="admin-json-form" onSubmit={submitUpdate}>
      <label><span>Page type</span><select name="pageType" defaultValue={pageType} disabled={!canWrite || busy}><option value="home">Home</option><option value="standard">Standard</option><option value="landing">Landing</option><option value="legal">Legal</option><option value="local_landing">Local landing</option></select></label>
      {translationFields("el", el)}
      <label className="admin-checkbox-row" style={{ marginTop: 16 }}><input type="checkbox" checked={englishEnabled} onChange={(event) => setEnglishEnabled(event.currentTarget.checked)} disabled={!canWrite || busy} /><span>Maintain an English translation</span></label>
      {englishEnabled ? translationFields("en", en) : null}
      <label><span>Change reason <small>stored with the immutable revision</small></span><input name="reason" placeholder="What changed and why?" minLength={3} required disabled={!canWrite || busy} /></label>
      <button className="button" disabled={!canWrite || busy}>{busy ? "Saving…" : "Save new version"}</button>
    </form>

    <form className="admin-json-form" onSubmit={submitSchedule} style={{ marginTop: 24 }}>
      <strong>Scheduled publication</strong>
      <small>Current state: {status}{scheduledAt ? ` · ${new Date(scheduledAt).toLocaleString("el-GR")}` : ""}. The maintenance scheduler releases due pages automatically.</small>
      <label><span>Publish at</span><input name="scheduledAt" type="datetime-local" defaultValue={localDateTime(scheduledAt)} required disabled={!canWrite || busy} /></label>
      <label><span>Scheduling note</span><input name="scheduleReason" placeholder="Campaign launch, legal update, event…" disabled={!canWrite || busy} /></label>
      <button className="button button-secondary" disabled={!canWrite || busy}>{busy ? "Working…" : "Schedule publication"}</button>
    </form>

    {!canWrite ? <p style={{ marginTop: 12 }}>This Admin role has read-only content access.</p> : null}
    {message ? <p className="form-success" role="status">{message}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </div>;
}
