import type { ReactNode } from "react";

export type WorkspaceMetric = Readonly<{
  label: string;
  value: ReactNode;
  tone?: "default" | "attention" | "positive";
  hint?: string | undefined;
}>;

export type WorkspaceFilterOption = Readonly<{ value: string; label: string }>;
export type WorkspaceFilter = Readonly<{
  name: string;
  label: string;
  value: string;
  options: readonly WorkspaceFilterOption[];
}>;

export function WorkspaceMetricStrip({
  items,
  ariaLabel = "Σύνοψη εργασίας"
}: Readonly<{ items: readonly WorkspaceMetric[]; ariaLabel?: string }>) {
  return <div className="workspace-page-metrics" aria-label={ariaLabel}>
    {items.map((item) => <div className={`workspace-page-metric${item.tone && item.tone !== "default" ? ` is-${item.tone}` : ""}`} key={item.label}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      {item.hint && <small>{item.hint}</small>}
    </div>)}
  </div>;
}

export function WorkspaceSectionHeading({
  eyebrow,
  title,
  note,
  action
}: Readonly<{ eyebrow: string; title: string; note?: string; action?: ReactNode }>) {
  return <div className="workspace-page-section-heading">
    <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
    <div className="workspace-page-section-side">{note && <p>{note}</p>}{action}</div>
  </div>;
}

export function WorkspaceEmptyState({
  eyebrow = "Δεν υπάρχει εργασία",
  title,
  body,
  action
}: Readonly<{ eyebrow?: string; title: string; body?: string; action?: ReactNode }>) {
  return <div className="workspace-page-empty">
    <div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3>{body && <p>{body}</p>}</div>
    {action && <div className="workspace-page-empty-action">{action}</div>}
  </div>;
}

export function WorkspaceRecordDetails({
  label = "Λεπτομέρειες",
  children,
  open = false
}: Readonly<{ label?: string; children: ReactNode; open?: boolean }>) {
  return <details className="workspace-record-details" open={open}>
    <summary>{label}</summary>
    <div>{children}</div>
  </details>;
}

export function WorkspaceFilterBar({
  action,
  query,
  queryPlaceholder = "Αναζήτηση…",
  filters = [],
  resultLabel,
  resetHref
}: Readonly<{
  action: string;
  query?: string;
  queryPlaceholder?: string;
  filters?: readonly WorkspaceFilter[];
  resultLabel?: string;
  resetHref?: string;
}>) {
  const active = Boolean(query?.trim()) || filters.some((filter) => filter.value && filter.value !== "all");
  return <div className="workspace-filter-shell">
    <form className="workspace-filter-bar" action={action} method="get" role="search">
      <label className="workspace-filter-search">
        <span>Αναζήτηση</span>
        <input name="q" type="search" defaultValue={query ?? ""} placeholder={queryPlaceholder} />
      </label>
      {filters.map((filter) => <label className="workspace-filter-field" key={filter.name}>
        <span>{filter.label}</span>
        <select name={filter.name} defaultValue={filter.value}>
          {filter.options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </label>)}
      <button className="button workspace-filter-submit" type="submit">Εφαρμογή</button>
      {active && resetHref && <a className="workspace-filter-reset" href={resetHref}>Καθαρισμός</a>}
    </form>
    {resultLabel && <div className="workspace-filter-result" aria-live="polite">{resultLabel}</div>}
  </div>;
}

function inferStatusTone(status: string): "neutral" | "positive" | "attention" | "danger" {
  const value = status.toLowerCase();
  if (["active", "approved", "completed", "fulfilled", "paid", "delivered", "visible", "linked", "test_ready"].some((token) => value.includes(token))) return "positive";
  if (["rejected", "cancelled", "restricted", "blocked", "failed", "closed"].some((token) => value.includes(token))) return "danger";
  if (["pending", "review", "requested", "matched", "payable", "approval_required", "booked", "draft", "onboarding", "submitted", "ready"].some((token) => value.includes(token))) return "attention";
  return "neutral";
}

export function WorkspaceStatusBadge({ status, label, tone }: Readonly<{ status: string; label?: string; tone?: "neutral" | "positive" | "attention" | "danger" }>) {
  const resolvedTone = tone ?? inferStatusTone(status);
  return <span className={`status-pill workspace-status-badge is-${resolvedTone}`} data-status={status}>{label ?? status.replaceAll("_", " ")}</span>;
}
