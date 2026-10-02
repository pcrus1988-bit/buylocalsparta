"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminBrandRecord } from "../lib/admin-brand-runtime";
import { BRAND_GUIDE_STATUSES, brandGuideStatusLabel, type BrandGuideStatus } from "../lib/brand-guide";
import { publicBrandLogoUrl } from "../lib/brand-logo";

function displayDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function websiteHost(value?: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).hostname; } catch { return value; }
}

function lineList(values: readonly string[]): string {
  return values.join("\n");
}

export function AdminBrandManagement({
  brands,
  csrfToken,
  query,
  coverage,
  guide,
  filteredTotal
}: {
  brands: readonly AdminBrandRecord[];
  csrfToken: string;
  query: string;
  coverage: "all" | "with_logo" | "missing_logo";
  guide: "all" | BrandGuideStatus;
  filteredTotal: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function jsonAction(brandId: string, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(brandId);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/catalogue/brands", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ brandId, action, ...extra })
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Brand action failed");
      setMessage(payload.message ?? "Η αλλαγή αποθηκεύτηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Brand action failed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function bulkAction(action: string) {
    setBusyId("__bulk__");
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/catalogue/brands", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action })
      });
      const payload = await response.json() as { error?: string; message?: string; queued?: number };
      if (!response.ok) throw new Error(payload.error ?? "Bulk brand action failed");
      setMessage(payload.message ?? "Η ενέργεια ολοκληρώθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk brand action failed");
    } finally {
      setBusyId(undefined);
    }
  }

  async function saveGuide(event: React.FormEvent<HTMLFormElement>, brandId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await jsonAction(brandId, "save_guide", {
      description: String(data.get("description") ?? ""),
      countryCode: String(data.get("countryCode") ?? ""),
      foundedYear: String(data.get("foundedYear") ?? ""),
      parentCompany: String(data.get("parentCompany") ?? ""),
      brandStory: String(data.get("brandStory") ?? ""),
      whyItStandsOut: String(data.get("whyItStandsOut") ?? ""),
      knownFor: String(data.get("knownFor") ?? ""),
      signatureProducts: String(data.get("signatureProducts") ?? ""),
      notableInnovations: String(data.get("notableInnovations") ?? ""),
      primaryCategories: String(data.get("primaryCategories") ?? ""),
      productFamilies: String(data.get("productFamilies") ?? ""),
      styleTags: String(data.get("styleTags") ?? ""),
      audience: String(data.get("audience") ?? ""),
      pricePosition: String(data.get("pricePosition") ?? ""),
      sourceUrls: String(data.get("sourceUrls") ?? ""),
      status: String(data.get("status") ?? "draft"),
      seoIndexable: data.get("seoIndexable") === "on"
    });
  }

  async function replaceLogo(event: React.FormEvent<HTMLFormElement>, brandId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("brandId", brandId);
    data.set("action", "replace_logo");
    setBusyId(brandId);
    setMessage(undefined);
    try {
      const response = await fetch("/api/admin/catalogue/brands", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body: data
      });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "Logo upload failed");
      form.reset();
      setMessage(payload.message ?? "Το λογότυπο αντικαταστάθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setBusyId(undefined);
    }
  }

  return <div className="admin-brand-manager">
    <form className="admin-brand-toolbar" method="get" action="/admin/catalogue/brands">
      <label>
        <span>Αναζήτηση brand</span>
        <input name="q" type="search" defaultValue={query} maxLength={120} placeholder="Givenchy, POLO, domain…" />
      </label>
      <label>
        <span>Logo coverage</span>
        <select name="coverage" defaultValue={coverage}>
          <option value="all">Όλα</option>
          <option value="with_logo">Με λογότυπο</option>
          <option value="missing_logo">Χωρίς λογότυπο</option>
        </select>
      </label>
      <label>
        <span>Brand Guide</span>
        <select name="guide" defaultValue={guide}>
          <option value="all">Όλα</option>
          {BRAND_GUIDE_STATUSES.map((status) => <option value={status} key={status}>{brandGuideStatusLabel(status)}</option>)}
        </select>
      </label>
      <button className="button button-secondary" type="submit">Filter</button>
      {(query || coverage !== "all" || guide !== "all") ? <a className="button button-secondary" href="/admin/catalogue/brands">Clear</a> : null}
      <button
        className="button button-secondary"
        type="button"
        disabled={busyId === "__bulk__"}
        onClick={() => {
          if (window.confirm("Να μπουν έως 100 επιλέξιμα brands στην ουρά για AI Brand Guide draft; Δεν δημοσιεύονται αυτόματα.")) {
            void bulkAction("queue_missing_guides");
          }
        }}
      >{busyId === "__bulk__" ? "Queuing…" : "Queue 100 AI drafts"}</button>
      <strong>{filteredTotal.toLocaleString("el-GR")} brands</strong>
    </form>
    <p className="admin-brand-queue-note">Η bulk ουρά περιλαμβάνει μόνο active brands με official website, live προϊόντα και μη τελικό Brand Guide. Τα AI drafts παραμένουν <strong>needs review / noindex</strong> μέχρι χειροκίνητη έγκριση.</p>

    {message ? <p className="admin-brand-message" role="status">{message}</p> : null}

    <div className="admin-brand-table-wrap">
      <table className="admin-brand-table">
        <thead><tr><th>Brand</th><th>Products</th><th>Logo</th><th>Brand Guide</th><th>Website</th><th>Actions</th></tr></thead>
        <tbody>{brands.map((brand) => {
          const logoUrl = publicBrandLogoUrl(brand.logoObjectKey, brand.logoExternalUrl);
          const busy = busyId === brand.id;
          const host = websiteHost(brand.website);
          const sources = brand.guide.sourceUrls.map((source) => source.url);
          return <tr key={brand.id}>
            <td data-label="Brand">
              <strong>{brand.name}</strong>
              <small>{brand.normalizedName}</small>
              {brand.publicSlug ? <a href={`/brands/${brand.publicSlug}`} target="_blank" rel="noreferrer">Public guide ↗</a> : null}
            </td>
            <td data-label="Products"><strong>{brand.products.toLocaleString("el-GR")}</strong></td>
            <td data-label="Logo">
              <div className="admin-brand-logo-slot">
                {logoUrl ? <img src={logoUrl} alt={`Λογότυπο ${brand.name}`} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span>Missing</span>}
              </div>
              {logoUrl ? <a href={logoUrl} target="_blank" rel="noreferrer">Preview ↗</a> : null}
            </td>
            <td data-label="Brand Guide">
              <span className={`status-pill${brand.guide.status === "published" || brand.guide.status === "ready" ? " is-active" : ""}`}>{brandGuideStatusLabel(brand.guide.status)}</span>
              <small>{brand.guideQualityScore}% content readiness</small>
              <small>{brand.guide.seoIndexable ? "SEO indexing requested" : "SEO noindex"}</small>
              {brand.guide.agentStatus ? <small>Agent: {brand.guide.agentStatus}</small> : null}
            </td>
            <td data-label="Website">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer">{host ?? brand.website} ↗</a> : <span>—</span>}</td>
            <td data-label="Actions">
              <details className="admin-brand-actions">
                <summary>Manage</summary>
                <div>
                  <details className="admin-brand-panel" open={brand.guide.status !== "empty"}>
                    <summary>Brand Guide content</summary>
                    <form className="admin-brand-guide-form" onSubmit={(event) => void saveGuide(event, brand.id)}>
                      <div className="admin-brand-form-grid">
                        <label><span>Status</span><select name="status" defaultValue={brand.guide.status}>{BRAND_GUIDE_STATUSES.map((status) => <option value={status} key={status}>{brandGuideStatusLabel(status)}</option>)}</select></label>
                        <label><span>Country (ISO-2)</span><input name="countryCode" defaultValue={brand.countryCode ?? ""} maxLength={2} placeholder="IT" /></label>
                        <label><span>Founded</span><input name="foundedYear" type="number" min="1000" max={new Date().getFullYear()} defaultValue={brand.guide.foundedYear ?? ""} /></label>
                        <label><span>Parent company</span><input name="parentCompany" defaultValue={brand.guide.parentCompany ?? ""} /></label>
                      </div>
                      <label><span>Short introduction</span><textarea name="description" rows={3} defaultValue={brand.description ?? ""} placeholder="Σύντομη, χρήσιμη εισαγωγή για το brand…" /></label>
                      <label><span>Why it stands out</span><textarea name="whyItStandsOut" rows={4} defaultValue={brand.guide.whyItStandsOut ?? ""} placeholder="Τι διαφοροποιεί πραγματικά το brand;" /></label>
                      <label><span>Brand story</span><textarea name="brandStory" rows={4} defaultValue={brand.guide.brandStory ?? ""} /></label>
                      <div className="admin-brand-form-grid">
                        <label><span>Known for · one per line</span><textarea name="knownFor" rows={3} defaultValue={lineList(brand.guide.knownFor)} /></label>
                        <label><span>Product families · one per line</span><textarea name="productFamilies" rows={3} defaultValue={lineList(brand.guide.productFamilies)} /></label>
                        <label><span>Style tags · one per line</span><textarea name="styleTags" rows={3} defaultValue={lineList(brand.guide.styleTags)} /></label>
                        <label><span>Audience · one per line</span><textarea name="audience" rows={3} defaultValue={lineList(brand.guide.audience)} /></label>
                      </div>
                      <details>
                        <summary>Additional enrichment fields</summary>
                        <div className="admin-brand-extra-fields">
                          <label><span>Signature products · one per line</span><textarea name="signatureProducts" rows={3} defaultValue={lineList(brand.guide.signatureProducts)} /></label>
                          <label><span>Notable innovations · one per line</span><textarea name="notableInnovations" rows={3} defaultValue={lineList(brand.guide.notableInnovations)} /></label>
                          <label><span>Primary categories · one per line</span><textarea name="primaryCategories" rows={3} defaultValue={lineList(brand.guide.primaryCategories)} /></label>
                          <label><span>Price positioning</span><input name="pricePosition" defaultValue={brand.guide.pricePosition ?? ""} /></label>
                        </div>
                      </details>
                      <label><span>Verified sources · one HTTPS URL per line</span><textarea name="sourceUrls" rows={3} defaultValue={lineList(sources)} placeholder="https://official-brand.example/about" /></label>
                      <label className="admin-brand-checkbox"><input name="seoIndexable" type="checkbox" defaultChecked={brand.guide.seoIndexable} /><span>Request SEO indexing after the hard quality gate passes</span></label>
                      <div className="admin-brand-action-row">
                        <button className="button" disabled={busy}>Save Brand Guide</button>
                        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void jsonAction(brand.id, "queue_guide_enrichment")}>Queue AI enrichment</button>
                      </div>
                    </form>
                  </details>

                  <details className="admin-brand-panel">
                    <summary>Identity, website &amp; logo</summary>
                    <div className="admin-brand-panel-body">
                      <form onSubmit={(event) => { event.preventDefault(); const website = new FormData(event.currentTarget).get("website"); void jsonAction(brand.id, "website", { website: String(website ?? "") }); }}>
                        <label><span>Official website</span><input name="website" type="url" defaultValue={brand.website ?? ""} placeholder="https://brand.example" /></label>
                        <button className="button button-secondary" disabled={busy}>Save website</button>
                      </form>
                      <form onSubmit={(event) => void replaceLogo(event, brand.id)}>
                        <label><span>Logo file</span><input name="logo" type="file" accept=".svg,.png,.webp,image/svg+xml,image/png,image/webp" required /></label>
                        <label><span>Source URL (optional)</span><input name="sourceUrl" type="url" placeholder="https://official.example/logo.svg" /></label>
                        <button className="button button-secondary" disabled={busy}>Replace logo</button>
                      </form>
                      <div className="admin-brand-action-row">
                        <button className="button button-secondary" type="button" disabled={busy} onClick={() => void jsonAction(brand.id, "retry_enrichment")}>Retry logo enrichment</button>
                        {logoUrl ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove the current ${brand.name} logo from storefront cards?`)) void jsonAction(brand.id, "remove_logo"); }}>Remove logo</button> : null}
                      </div>
                    </div>
                  </details>

                  <details className="admin-brand-provenance">
                    <summary>Logo source / provenance</summary>
                    <dl>
                      <div><dt>Source</dt><dd>{brand.sourceUrl ? <a href={brand.sourceUrl} target="_blank" rel="noreferrer">{brand.sourceDomain ?? "Official source"} ↗</a> : "—"}</dd></div>
                      <div><dt>Type</dt><dd>{brand.sourceType ?? "—"}</dd></div>
                      <div><dt>Discovery</dt><dd>{brand.sourceDiscovery ?? "—"}</dd></div>
                      <div><dt>Verified</dt><dd>{displayDate(brand.verifiedAt)}</dd></div>
                      <div><dt>Reason</dt><dd>{brand.enrichmentReason ?? "—"}</dd></div>
                    </dl>
                  </details>
                </div>
              </details>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>

    <style jsx>{`
      .admin-brand-manager{display:grid;gap:18px}
      .admin-brand-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}
      .admin-brand-toolbar label{display:grid;gap:6px;min-width:190px}
      .admin-brand-toolbar label span,.admin-brand-actions label span{font-size:12px;font-weight:700;color:#516159}
      .admin-brand-toolbar input,.admin-brand-toolbar select,.admin-brand-actions input,.admin-brand-actions select,.admin-brand-actions textarea{width:100%;box-sizing:border-box;min-height:42px;border:1px solid #d6ddd9;border-radius:12px;padding:9px 11px;background:#fff;font:inherit}
      .admin-brand-actions textarea{resize:vertical;line-height:1.45}
      .admin-brand-toolbar strong{margin-left:auto;padding:10px 0}
.admin-brand-queue-note{margin:-8px 0 0;color:#61716a;font-size:12px;line-height:1.5}
            .admin-brand-message{margin:0;padding:11px 14px;border-radius:12px;background:#eef5f1}
      .admin-brand-table-wrap{overflow:auto;border:1px solid #dfe5e1;border-radius:18px;background:#fff}
      .admin-brand-table{width:100%;border-collapse:collapse;min-width:1120px}
      .admin-brand-table th,.admin-brand-table td{padding:14px 12px;border-bottom:1px solid #edf0ee;text-align:left;vertical-align:top}
      .admin-brand-table th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#64736c;background:#f8faf9}
      .admin-brand-table td>strong,.admin-brand-table td>small{display:block}
      .admin-brand-table td small{margin-top:4px;color:#6b7972}
      .admin-brand-logo-slot{width:92px;height:34px;display:flex;align-items:center;justify-content:flex-start}
      .admin-brand-logo-slot img{display:block;max-width:88px;max-height:24px;width:auto;height:auto;object-fit:contain}
      .admin-brand-logo-slot img[hidden]{display:none}
      .admin-brand-logo-slot span{font-size:12px;color:#87938d}
      .admin-brand-table a{color:inherit;text-decoration:underline;text-underline-offset:2px}
      .admin-brand-actions{min-width:320px}
      .admin-brand-actions>summary,.admin-brand-panel>summary,.admin-brand-provenance summary{cursor:pointer;font-weight:700}
      .admin-brand-actions>div{display:grid;gap:12px;padding-top:12px}
      .admin-brand-actions form{display:grid;gap:8px}
      .admin-brand-actions label{display:grid;gap:5px}
      .admin-brand-action-row{display:flex;gap:8px;flex-wrap:wrap}
      .admin-brand-panel{border:1px solid #e2e7e4;border-radius:12px;padding:10px}
      .admin-brand-panel-body,.admin-brand-guide-form{display:grid;gap:12px;padding-top:12px}
      .admin-brand-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .admin-brand-extra-fields{display:grid;gap:10px;padding-top:10px}
      .admin-brand-checkbox{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:8px}
      .admin-brand-checkbox input{width:18px!important;min-height:18px!important;height:18px}
      .admin-brand-provenance dl{display:grid;gap:5px;margin:8px 0 0}
      .admin-brand-provenance dl div{display:grid;grid-template-columns:76px 1fr;gap:8px}
      .admin-brand-provenance dt{font-size:11px;color:#6b7972}
      .admin-brand-provenance dd{margin:0;font-size:12px;overflow-wrap:anywhere}
      @media(max-width:760px){
        .admin-brand-toolbar{align-items:stretch}
        .admin-brand-toolbar label{min-width:100%}
        .admin-brand-toolbar strong{margin-left:0}
        .admin-brand-table-wrap{border:0;background:transparent;overflow:visible}
        .admin-brand-table{display:block;min-width:0}
        .admin-brand-table thead{display:none}
        .admin-brand-table tbody{display:grid;gap:12px}
        .admin-brand-table tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe5e1;border-radius:16px;background:#fff;padding:12px}
        .admin-brand-table td{display:block;border:0;padding:8px}
        .admin-brand-table td::before{content:attr(data-label);display:block;margin-bottom:5px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#718078}
        .admin-brand-table td:last-child{grid-column:1/-1}
        .admin-brand-actions{min-width:0}
        .admin-brand-logo-slot{height:28px}
        .admin-brand-logo-slot img{max-height:22px}
        .admin-brand-form-grid{grid-template-columns:1fr}
      }
    `}</style>
  </div>;
}
