"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminBrandRecord } from "../lib/admin-brand-runtime";
import { publicBrandLogoUrl } from "../lib/brand-logo";

function displayDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminBrandManagement({ brands, csrfToken }: { brands: readonly AdminBrandRecord[]; csrfToken: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [coverage, setCoverage] = useState<"all" | "with_logo" | "missing_logo">("all");
  const [busyId, setBusyId] = useState<string>();
  const [message, setMessage] = useState<string>();

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    return brands.filter((brand) => {
      if (coverage === "with_logo" && !brand.logoObjectKey) return false;
      if (coverage === "missing_logo" && brand.logoObjectKey) return false;
      if (!needle) return true;
      return [brand.name, brand.normalizedName, brand.website, brand.sourceDomain]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("el")
        .includes(needle);
    });
  }, [brands, coverage, query]);

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
    <div className="admin-brand-toolbar">
      <label>
        <span>Αναζήτηση brand</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} placeholder="Givenchy, POLO, domain…" />
      </label>
      <label>
        <span>Logo coverage</span>
        <select value={coverage} onChange={(event) => setCoverage(event.target.value as typeof coverage)}>
          <option value="all">Όλα</option>
          <option value="with_logo">Με λογότυπο</option>
          <option value="missing_logo">Χωρίς λογότυπο</option>
        </select>
      </label>
      <strong>{visible.length} brands</strong>
    </div>

    {message ? <p className="admin-brand-message" role="status">{message}</p> : null}

    <div className="admin-brand-table-wrap">
      <table className="admin-brand-table">
        <thead><tr><th>Brand</th><th>Products</th><th>Logo</th><th>Status</th><th>Website</th><th>Actions</th></tr></thead>
        <tbody>{visible.map((brand) => {
          const logoUrl = publicBrandLogoUrl(brand.logoObjectKey);
          const busy = busyId === brand.id;
          return <tr key={brand.id}>
            <td data-label="Brand"><strong>{brand.name}</strong><small>{brand.normalizedName}</small></td>
            <td data-label="Products"><strong>{brand.products.toLocaleString("el-GR")}</strong></td>
            <td data-label="Logo">
              <div className="admin-brand-logo-slot">
                {logoUrl ? <img src={logoUrl} alt={`Λογότυπο ${brand.name}`} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span>Missing</span>}
              </div>
              {logoUrl ? <a href={logoUrl} target="_blank" rel="noreferrer">Preview ↗</a> : null}
            </td>
            <td data-label="Status">
              <span className={`status-pill${brand.logoObjectKey ? " is-active" : ""}`}>{brand.status}</span>
              <small>{brand.enrichmentStatus ?? (brand.logoObjectKey ? "complete" : "missing")}</small>
            </td>
            <td data-label="Website">{brand.website ? <a href={brand.website} target="_blank" rel="noreferrer">{new URL(brand.website).hostname} ↗</a> : <span>—</span>}</td>
            <td data-label="Actions">
              <details className="admin-brand-actions">
                <summary>Manage</summary>
                <div>
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
                    <button className="button button-secondary" type="button" disabled={busy} onClick={() => void jsonAction(brand.id, "retry_enrichment")}>Retry enrichment</button>
                    {brand.logoObjectKey ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove the current ${brand.name} logo from storefront cards?`)) void jsonAction(brand.id, "remove_logo"); }}>Remove logo</button> : null}
                  </div>
                  <details className="admin-brand-provenance">
                    <summary>Source / provenance</summary>
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
      .admin-brand-manager{display:grid;gap:18px}.admin-brand-toolbar{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.admin-brand-toolbar label{display:grid;gap:6px;min-width:220px}.admin-brand-toolbar label span,.admin-brand-actions label span{font-size:12px;font-weight:700;color:#516159}.admin-brand-toolbar input,.admin-brand-toolbar select,.admin-brand-actions input{min-height:42px;border:1px solid #d6ddd9;border-radius:12px;padding:9px 11px;background:#fff}.admin-brand-toolbar strong{margin-left:auto;padding:10px 0}.admin-brand-message{margin:0;padding:11px 14px;border-radius:12px;background:#eef5f1}.admin-brand-table-wrap{overflow:auto;border:1px solid #dfe5e1;border-radius:18px;background:#fff}.admin-brand-table{width:100%;border-collapse:collapse;min-width:980px}.admin-brand-table th,.admin-brand-table td{padding:14px 12px;border-bottom:1px solid #edf0ee;text-align:left;vertical-align:top}.admin-brand-table th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#64736c;background:#f8faf9}.admin-brand-table td>strong,.admin-brand-table td>small{display:block}.admin-brand-table td small{margin-top:4px;color:#6b7972}.admin-brand-logo-slot{width:92px;height:34px;display:flex;align-items:center;justify-content:flex-start}.admin-brand-logo-slot img{display:block;max-width:88px;max-height:24px;width:auto;height:auto;object-fit:contain}.admin-brand-logo-slot img[hidden]{display:none}.admin-brand-logo-slot span{font-size:12px;color:#87938d}.admin-brand-table a{color:inherit;text-decoration:underline;text-underline-offset:2px}.admin-brand-actions{min-width:260px}.admin-brand-actions>summary{cursor:pointer;font-weight:700}.admin-brand-actions>div{display:grid;gap:12px;padding-top:12px}.admin-brand-actions form{display:grid;gap:8px}.admin-brand-actions label{display:grid;gap:5px}.admin-brand-action-row{display:flex;gap:8px;flex-wrap:wrap}.admin-brand-provenance summary{cursor:pointer;font-weight:650}.admin-brand-provenance dl{display:grid;gap:5px;margin:8px 0 0}.admin-brand-provenance dl div{display:grid;grid-template-columns:76px 1fr;gap:8px}.admin-brand-provenance dt{font-size:11px;color:#6b7972}.admin-brand-provenance dd{margin:0;font-size:12px;overflow-wrap:anywhere}@media(max-width:760px){.admin-brand-toolbar{align-items:stretch}.admin-brand-toolbar label{min-width:100%;}.admin-brand-toolbar strong{margin-left:0}.admin-brand-table-wrap{border:0;background:transparent;overflow:visible}.admin-brand-table{display:block;min-width:0}.admin-brand-table thead{display:none}.admin-brand-table tbody{display:grid;gap:12px}.admin-brand-table tr{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe5e1;border-radius:16px;background:#fff;padding:12px}.admin-brand-table td{display:block;border:0;padding:8px}.admin-brand-table td::before{content:attr(data-label);display:block;margin-bottom:5px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#718078}.admin-brand-table td:last-child{grid-column:1/-1}.admin-brand-actions{min-width:0}.admin-brand-logo-slot{height:28px}.admin-brand-logo-slot img{max-height:22px}}
    `}</style>
  </div>;
}
