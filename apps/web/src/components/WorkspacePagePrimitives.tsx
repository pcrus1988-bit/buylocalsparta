import type { ReactNode } from "react";

export type WorkspaceMetric = Readonly<{
  label: string;
  value: ReactNode;
  tone?: "default" | "attention" | "positive";
  hint?: string;
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
