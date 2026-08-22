"use client";

import { useActionState } from "react";
import { updateSeoGlobalSettingsAction, type SeoSettingsActionState } from "../app/admin/seo/actions";
import type { SeoSettingsSnapshot } from "../lib/seo-settings";

const INITIAL_STATE: SeoSettingsActionState = { status: "idle" };

function Switch({ name, label, detail, enabled, danger = false }: {
  name: string;
  label: string;
  detail: string;
  enabled: boolean;
  danger?: boolean;
}) {
  return <label className="workspace-compact-row" style={{ cursor: "pointer" }}>
    <span><strong>{label}</strong><small>{detail}</small></span>
    <input name={name} type="checkbox" defaultChecked={enabled} style={{ width: 20, height: 20, accentColor: danger ? "#b42318" : undefined }} />
  </label>;
}

export function AdminSeoSettingsEditor({ snapshot, csrfToken }: { snapshot: SeoSettingsSnapshot; csrfToken: string }) {
  const [state, action, pending] = useActionState(updateSeoGlobalSettingsAction, INITIAL_STATE);
  const settings = snapshot.settings;

  return <form action={action} className="workspace-queue-card admin-json-form">
    <input type="hidden" name="csrfToken" value={csrfToken} />
    <input type="hidden" name="expectedVersion" value={snapshot.version} />

    <div className="workspace-queue-head">
      <div>
        <strong>Global search defaults</strong>
        <small>Version {snapshot.version} · {snapshot.source === "database" ? "persisted configuration" : "safe application defaults"}{snapshot.updatedAt ? ` · updated ${new Date(snapshot.updatedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}` : ""}</small>
      </div>
      <span className="status-pill">{snapshot.persistenceAvailable ? "editable" : "read-only fallback"}</span>
    </div>

    <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
      <label><span>Canonical origin</span><input name="canonicalOrigin" type="url" defaultValue={settings.canonicalOrigin} required /></label>
      <label><span>Site name</span><input name="siteName" defaultValue={settings.siteName} maxLength={80} required /></label>
      <label><span>Default page title</span><input name="defaultTitle" defaultValue={settings.defaultTitle} maxLength={140} required /></label>
      <label><span>Title template</span><input name="titleTemplate" defaultValue={settings.titleTemplate} maxLength={140} required /><small>Must contain exactly one <code>%s</code>.</small></label>
    </div>

    <label style={{ marginTop: 16 }}><span>Default meta description</span><textarea name="defaultDescription" rows={3} defaultValue={settings.defaultDescription} maxLength={320} required /></label>

    <details className="workspace-tool-panel" style={{ marginTop: 20 }}>
      <summary><span><strong>Open Graph & Google verification</strong><small>Fallback social-preview wording, image and optional verification value.</small></span></summary>
      <div className="workspace-tool-body admin-json-form">
        <label><span>Open Graph title</span><input name="defaultOpenGraphTitle" defaultValue={settings.defaultOpenGraphTitle} maxLength={140} required /></label>
        <label><span>Open Graph description</span><textarea name="defaultOpenGraphDescription" rows={3} defaultValue={settings.defaultOpenGraphDescription} maxLength={320} required /></label>
        <label><span>Open Graph image</span><input name="defaultOpenGraphImage" defaultValue={settings.defaultOpenGraphImage ?? ""} placeholder="/brand/example.webp or https://…" /></label>
        <label><span>Google site verification</span><input name="googleSiteVerification" defaultValue={settings.googleSiteVerification ?? ""} autoComplete="off" /></label>
      </div>
    </details>

    <div className="workspace-compact-list" style={{ marginTop: 20 }}>
      <Switch name="indexingEnabled" label="Site-wide indexing master switch" detail="Emergency control for global noindex and sitemap promotion. Public HTML stays crawlable so engines can process noindex; authentication is unaffected." enabled={settings.indexingEnabled} danger />
      <Switch name="researchVendorIndexingEnabled" label="Research-vendor indexing" detail="Allows Model C records that pass the quality gate to become index eligible." enabled={settings.researchVendorIndexingEnabled} />
      <Switch name="publicMediaCrawlEnabled" label="Approved public-media crawling" detail="Publishes the /api/media/ crawler exception while media approval remains authoritative." enabled={settings.publicMediaCrawlEnabled} />
    </div>

    <label style={{ marginTop: 16 }}><span>Research-vendor minimum quality score</span><input name="researchVendorMinimumScore" type="number" min={3} max={7} step={1} defaultValue={settings.researchVendorMinimumScore} required /><small>Required identity/address/classification blockers still apply independently of score.</small></label>

    <details className="workspace-tool-panel" style={{ marginTop: 20 }} open>
      <summary><span><strong>Sitemap entity controls</strong><small>Controls active sitemap submission, not human visibility or authentication.</small></span></summary>
      <div className="workspace-tool-body workspace-compact-list">
        <Switch name="sitemapStaticPages" label="Static public pages" detail="Homepage and curated public information/discovery routes." enabled={settings.sitemap.staticPages} />
        <Switch name="sitemapCategories" label="Category pages" detail="Curated category landing pages." enabled={settings.sitemap.categories} />
        <Switch name="sitemapProducts" label="Canonical products" detail="Products admitted by the public catalogue projection." enabled={settings.sitemap.products} />
        <Switch name="sitemapPartnerVendors" label="Partner businesses" detail="Active partner storefront dossiers." enabled={settings.sitemap.partnerVendors} />
        <Switch name="sitemapResearchVendors" label="Research businesses" detail="Only quality-gated Model C dossiers; the global Research switch also applies." enabled={settings.sitemap.researchVendors} />
      </div>
    </details>

    <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
      <label><span>Reason for this change</span><textarea name="reason" rows={3} minLength={10} maxLength={500} placeholder="Required audit reason (minimum 10 characters)" required /></label>
      <label><span>Emergency confirmation</span><input name="emergencyConfirmation" autoComplete="off" placeholder="Only when disabling global indexing" /><small>Turning the master switch off requires: <code>NOINDEX WHOLE SITE</code></small></label>
    </div>

    <div className="workspace-action-bar" style={{ marginTop: 20 }}>
      <span>All changes are version-checked and recorded with actor, timestamp, reason and before/after state.</span>
      <div className="workspace-action-buttons"><button className="button" disabled={pending || !snapshot.persistenceAvailable}>{pending ? "Saving…" : "Save SEO settings"}</button></div>
    </div>
    {state.message ? <p className={state.status === "error" ? "form-error" : "workspace-inline-note"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
