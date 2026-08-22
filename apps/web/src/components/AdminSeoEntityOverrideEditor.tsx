"use client";

import { useActionState, useMemo, useState } from "react";
import { updateSeoEntityOverrideAction, type SeoEntityOverrideActionState } from "../app/admin/seo/actions";
import type { AdminSeoEntityCandidate } from "../lib/admin-seo-runtime";
import type { SeoEntityOverridesSnapshot } from "../lib/seo-entity-overrides";
import { seoEntityKey } from "../lib/seo-entity-policy";

const INITIAL_STATE: SeoEntityOverrideActionState = { status: "idle" };

function DecisionField({ name, label, value, detail }: { name: string; label: string; value: string; detail: string }) {
  return <label>
    <span>{label}</span>
    <select name={name} defaultValue={value}>
      <option value="inherit">Inherit generated policy</option>
      <option value="allow">Allow when eligible</option>
      <option value="deny">Deny</option>
    </select>
    <small>{detail}</small>
  </label>;
}

export function AdminSeoEntityOverrideEditor({
  candidates,
  snapshot,
  csrfToken
}: {
  candidates: readonly AdminSeoEntityCandidate[];
  snapshot: SeoEntityOverridesSnapshot;
  csrfToken: string;
}) {
  const [state, action, pending] = useActionState(updateSeoEntityOverrideAction, INITIAL_STATE);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState(candidates[0]?.key ?? "");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("el");
    return normalized
      ? candidates.filter((candidate) => `${candidate.label} ${candidate.id} ${candidate.route}`.toLocaleLowerCase("el").includes(normalized))
      : candidates;
  }, [candidates, query]);
  const selected = candidates.find((candidate) => candidate.key === selectedKey) ?? filtered[0] ?? candidates[0];
  const override = selected ? snapshot.entries.find((entry) => seoEntityKey(entry) === selected.key) : undefined;

  if (!selected) return <div className="workspace-empty-state"><strong>No public SEO entities are available.</strong><span>The registry will populate from public routes, categories, products and vendor dossiers.</span></div>;

  const selectCandidates = filtered.some((candidate) => candidate.key === selected.key) ? filtered : [selected, ...filtered];

  return <div className="workspace-queue-card">
    <div className="workspace-queue-head">
      <div>
        <strong>Page/entity override registry</strong>
        <small>Version {snapshot.version} · {snapshot.entries.length} intentional overrides · {candidates.length} governed public entities</small>
      </div>
      <span className="status-pill">{snapshot.persistenceAvailable ? "editable" : "read-only fallback"}</span>
    </div>

    <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
      <label><span>Find an entity</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, public ID or route" /></label>
      <label><span>Selected entity</span><select value={selected.key} onChange={(event) => setSelectedKey(event.target.value)}>
        {selectCandidates.map((candidate) => <option value={candidate.key} key={candidate.key}>{candidate.label}</option>)}
      </select><small>{filtered.length} matching entities</small></label>
    </div>

    <form key={`${selected.key}:${snapshot.version}`} action={action} className="admin-json-form" style={{ marginTop: 20 }}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="expectedVersion" value={snapshot.version} />
      <input type="hidden" name="kind" value={selected.kind} />
      <input type="hidden" name="entityId" value={selected.id} />

      <div className="workspace-action-bar">
        <span><strong>{selected.route}</strong> · {!selected.entityAvailable ? "source entity missing" : override ? `reviewed ${new Date(override.lastReviewedAt).toLocaleString("el-GR", { timeZone: "Europe/Athens" })}` : "generated defaults only"}</span>
        <div className="workspace-action-buttons">
          <span className="status-pill">{selected.indexAllowed ? "index" : "noindex"}</span>
          <span className="status-pill">{selected.sitemapAllowed ? "sitemap" : "not in sitemap"}</span>
          <span className="status-pill">{selected.schemaAllowed ? "schema" : "no schema"}</span>
        </div>
      </div>

      <div className="admin-domain-card-grid" style={{ marginTop: 20 }}>
        <DecisionField name="indexDecision" label="Index decision" value={override?.indexDecision ?? "inherit"} detail="Allow cannot bypass the global switch, missing public admission or hard Research blockers." />
        <DecisionField name="sitemapDecision" label="Sitemap decision" value={override?.sitemapDecision ?? "inherit"} detail="A family-level sitemap switch and final index eligibility remain authoritative." />
        <DecisionField name="schemaDecision" label="Structured-data decision" value={override?.schemaDecision ?? "inherit"} detail="Schema is emitted only for eligible Product and LocalBusiness entities." />
        <label><span>Quality status</span><select name="qualityStatus" defaultValue={override?.qualityStatus ?? "unreviewed"}>
          <option value="unreviewed">Unreviewed</option>
          <option value="approved">Approved</option>
          <option value="needs_work">Needs work</option>
          <option value="suppressed">Suppressed</option>
        </select><small>Suppressed forces noindex, sitemap exclusion and schema removal.</small></label>
      </div>

      <details className="workspace-tool-panel" style={{ marginTop: 20 }} open>
        <summary><span><strong>Search snippet</strong><small>Leave fields empty to keep the generated title and description.</small></span></summary>
        <div className="workspace-tool-body admin-json-form">
          <label><span>SEO title</span><input name="title" defaultValue={override?.title ?? ""} maxLength={140} placeholder={selected.generatedTitle} /></label>
          <label><span>Meta description</span><textarea name="description" rows={3} defaultValue={override?.description ?? ""} maxLength={320} placeholder={selected.generatedDescription ?? "Generated page description"} /></label>
          <div className="workspace-queue-card" aria-label="Search snippet preview">
            <small>{selected.route}</small>
            <strong>{override?.title ?? selected.generatedTitle}</strong>
            <span>{override?.description ?? selected.generatedDescription ?? "Generated description from the public entity."}</span>
          </div>
        </div>
      </details>

      <details className="workspace-tool-panel" style={{ marginTop: 20 }}>
        <summary><span><strong>Canonical, Open Graph & editorial fields</strong><small>Strict same-origin canonical control plus social-preview and internal review context.</small></span></summary>
        <div className="workspace-tool-body admin-json-form">
          <label><span>Canonical override</span><input name="canonicalPath" defaultValue={override?.canonicalPath ?? ""} placeholder={selected.route} /><small>Same governed origin only; no query or fragment. Empty means self-canonical.</small></label>
          <label><span>Open Graph title</span><input name="openGraphTitle" defaultValue={override?.openGraphTitle ?? ""} maxLength={140} /></label>
          <label><span>Open Graph description</span><textarea name="openGraphDescription" rows={3} defaultValue={override?.openGraphDescription ?? ""} maxLength={320} /></label>
          <label><span>Open Graph image</span><input name="openGraphImage" defaultValue={override?.openGraphImage ?? ""} placeholder="/api/media/… or https://…" /></label>
          <label><span>Internal-search keywords</span><textarea name="keywords" rows={3} defaultValue={override?.keywords.join("\n") ?? ""} placeholder="One per line or comma-separated" /></label>
          <label><span>Editorial label</span><input name="editorialLabel" defaultValue={override?.editorialLabel ?? ""} maxLength={120} placeholder="Internal review label; not public metadata" /></label>
        </div>
      </details>

      <label style={{ marginTop: 20 }}><span>Reason for this entity change</span><textarea name="reason" rows={3} minLength={10} maxLength={500} placeholder="Required audit reason (minimum 10 characters)" required /></label>
      <div className="workspace-action-bar" style={{ marginTop: 20 }}>
        <span>Saving records reviewer, timestamp, reason and before/after state. Deleting restores generated defaults.</span>
        <div className="workspace-action-buttons">
          {override ? <button className="button button-secondary" name="intent" value="delete" disabled={pending || !snapshot.persistenceAvailable}>Delete override</button> : null}
          <button className="button" name="intent" value="save" disabled={pending || !snapshot.persistenceAvailable || !selected.entityAvailable}>{pending ? "Saving…" : "Save override"}</button>
        </div>
      </div>
      {state.message ? <p className={state.status === "error" ? "form-error" : "workspace-inline-note"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  </div>;
}
