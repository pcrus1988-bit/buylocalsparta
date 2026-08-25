"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export type AdminDashboardWidgetSize = "small" | "medium" | "wide";
export type AdminDashboardWidgetTone = "default" | "positive" | "attention" | "critical";

export type AdminDashboardWidget = Readonly<{
  id: string;
  label: string;
  eyebrow: string;
  href: string;
  source: string;
  value?: string | number;
  detail?: string;
  tone?: AdminDashboardWidgetTone;
  defaultSize?: AdminDashboardWidgetSize;
  defaultVisible?: boolean;
  stats?: ReadonlyArray<Readonly<{ label: string; value: string | number }>>;
  items?: ReadonlyArray<Readonly<{ label: string; detail?: string; value?: string | number; href?: string }>>;
}>;

type LayoutEntry = Readonly<{ id: string; size: AdminDashboardWidgetSize; visible: boolean }>;
type SavedView = Readonly<{ id: string; name: string; layout: ReadonlyArray<LayoutEntry> }>;
type StoredDashboardState = Readonly<{ version: 1; activeViewId?: string; views: ReadonlyArray<SavedView> }>;

const STORAGE_KEY = "konta-mou:admin-dashboard-views:v1";
const SIZE_ORDER: ReadonlyArray<AdminDashboardWidgetSize> = ["small", "medium", "wide"];

function defaultLayout(widgets: ReadonlyArray<AdminDashboardWidget>): LayoutEntry[] {
  return widgets.map((widget) => ({
    id: widget.id,
    size: widget.defaultSize ?? "medium",
    visible: widget.defaultVisible ?? false
  }));
}

function mergeLayout(widgets: ReadonlyArray<AdminDashboardWidget>, candidate?: ReadonlyArray<LayoutEntry>): LayoutEntry[] {
  const fallback = defaultLayout(widgets);
  if (!candidate) return fallback;
  const byId = new Map(candidate.map((entry) => [entry.id, entry]));
  const ordered: LayoutEntry[] = [];
  for (const entry of candidate) {
    const widget = widgets.find((item) => item.id === entry.id);
    if (!widget) continue;
    ordered.push({ id: widget.id, size: SIZE_ORDER.includes(entry.size) ? entry.size : widget.defaultSize ?? "medium", visible: entry.visible !== false });
  }
  for (const entry of fallback) if (!byId.has(entry.id)) ordered.push(entry);
  return ordered;
}

function readStoredState(): StoredDashboardState | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredDashboardState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.views)) return undefined;
    return { version: 1, activeViewId: typeof parsed.activeViewId === "string" ? parsed.activeViewId : undefined, views: parsed.views as ReadonlyArray<SavedView> };
  } catch {
    return undefined;
  }
}

function writeStoredState(state: StoredDashboardState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* browser storage can be unavailable */ }
}

export function AdminDashboardCanvas({ widgets }: Readonly<{ widgets: ReadonlyArray<AdminDashboardWidget> }>) {
  const initial = useMemo(() => defaultLayout(widgets), [widgets]);
  const [layout, setLayout] = useState<LayoutEntry[]>(initial);
  const [views, setViews] = useState<ReadonlyArray<SavedView>>([]);
  const [activeViewId, setActiveViewId] = useState<string>("default");
  const [customizing, setCustomizing] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    const stored = readStoredState();
    if (!stored) return;
    const validViews = stored.views.filter((view) => view && typeof view.id === "string" && typeof view.name === "string" && Array.isArray(view.layout));
    setViews(validViews);
    const active = validViews.find((view) => view.id === stored.activeViewId);
    if (active) {
      setActiveViewId(active.id);
      setLayout(mergeLayout(widgets, active.layout));
    }
  }, [widgets]);

  const widgetById = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets]);
  const visibleEntries = layout.filter((entry) => entry.visible && widgetById.has(entry.id));
  const hiddenEntries = layout.filter((entry) => !entry.visible && widgetById.has(entry.id));

  function updateEntry(id: string, updater: (entry: LayoutEntry) => LayoutEntry) {
    setSavedNotice(false);
    setLayout((current) => current.map((entry) => entry.id === id ? updater(entry) : entry));
  }

  function move(id: string, direction: -1 | 1) {
    setSavedNotice(false);
    setLayout((current) => {
      const visibleIds = current.filter((entry) => entry.visible && widgetById.has(entry.id)).map((entry) => entry.id);
      const visibleIndex = visibleIds.indexOf(id);
      const targetId = visibleIds[visibleIndex + direction];
      if (visibleIndex < 0 || !targetId) return current;
      const index = current.findIndex((entry) => entry.id === id);
      const target = current.findIndex((entry) => entry.id === targetId);
      if (index < 0 || target < 0) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function selectView(id: string) {
    if (id === "default") {
      setActiveViewId("default");
      setLayout(initial);
      writeStoredState({ version: 1, views, activeViewId: undefined });
      return;
    }
    const selected = views.find((view) => view.id === id);
    if (!selected) return;
    setActiveViewId(selected.id);
    setLayout(mergeLayout(widgets, selected.layout));
    writeStoredState({ version: 1, views, activeViewId: selected.id });
  }

  function saveCurrentView() {
    const trimmed = viewName.trim();
    const existing = activeViewId === "default" ? undefined : views.find((view) => view.id === activeViewId);
    const id = existing?.id ?? `view-${Date.now()}`;
    const name = trimmed || existing?.name || `Προβολή ${views.length + 1}`;
    const saved: SavedView = { id, name, layout };
    const nextViews = existing ? views.map((view) => view.id === existing.id ? saved : view) : [...views, saved];
    setViews(nextViews);
    setActiveViewId(id);
    setViewName("");
    setSavedNotice(true);
    writeStoredState({ version: 1, views: nextViews, activeViewId: id });
  }

  function saveAsNewView() {
    const id = `view-${Date.now()}`;
    const name = viewName.trim() || `Προβολή ${views.length + 1}`;
    const saved: SavedView = { id, name, layout };
    const nextViews = [...views, saved];
    setViews(nextViews);
    setActiveViewId(id);
    setViewName("");
    setSavedNotice(true);
    writeStoredState({ version: 1, views: nextViews, activeViewId: id });
  }

  function deleteActiveView() {
    if (activeViewId === "default") return;
    const nextViews = views.filter((view) => view.id !== activeViewId);
    setViews(nextViews);
    setActiveViewId("default");
    setLayout(initial);
    setSavedNotice(false);
    writeStoredState({ version: 1, views: nextViews });
  }

  function resetLayout() {
    setLayout(initial);
    setActiveViewId("default");
    setSavedNotice(false);
  }

  return <section className="shell admin-dashboard-shell">
    <div className="admin-dashboard-toolbar">
      <div className="admin-dashboard-view-picker">
        <span>Προβολή</span>
        <select value={activeViewId} onChange={(event) => selectView(event.target.value)} aria-label="Επιλογή αποθηκευμένης προβολής">
          <option value="default">Καθαρή προβολή</option>
          {views.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}
        </select>
      </div>
      <button className={`admin-dashboard-customize-toggle${customizing ? " is-active" : ""}`} type="button" onClick={() => setCustomizing((value) => !value)} aria-pressed={customizing}>{customizing ? "Τέλος προσαρμογής" : "Προσαρμογή"}</button>
    </div>

    {customizing ? <div className="admin-dashboard-editor">
      <div className="admin-dashboard-editor-copy"><strong>Διαμόρφωση dashboard</strong><span>Διάλεξε περιεχόμενο, μέγεθος και σειρά. Οι αλλαγές γίνονται ορατές αμέσως, αλλά αποθηκεύονται μόνο όταν το ζητήσεις.</span></div>
      <div className="admin-dashboard-save-controls">
        <input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder={activeViewId === "default" ? "Όνομα νέας προβολής" : "Νέο όνομα (προαιρετικό)"} aria-label="Όνομα προβολής" />
        <button type="button" onClick={saveCurrentView}>{activeViewId === "default" ? "Αποθήκευση προβολής" : "Ενημέρωση προβολής"}</button>
        {activeViewId !== "default" ? <button type="button" onClick={saveAsNewView}>Αποθήκευση ως νέα</button> : null}
        <button type="button" onClick={resetLayout}>Επαναφορά</button>
        {activeViewId !== "default" ? <button className="is-danger" type="button" onClick={deleteActiveView}>Διαγραφή</button> : null}
      </div>
      {savedNotice ? <span className="admin-dashboard-saved-notice">Η προβολή αποθηκεύτηκε σε αυτή τη συσκευή.</span> : null}
      {hiddenEntries.length ? <div className="admin-dashboard-widget-library"><span>Διαθέσιμα widgets</span><div>{hiddenEntries.map((entry) => {
        const widget = widgetById.get(entry.id)!;
        return <button type="button" key={entry.id} onClick={() => updateEntry(entry.id, (current) => ({ ...current, visible: true }))}><b>+</b>{widget.label}<small>{widget.source}</small></button>;
      })}</div></div> : null}
    </div> : null}

    <div className={`admin-dashboard-canvas${customizing ? " is-customizing" : ""}`}>
      {visibleEntries.map((entry, index) => {
        const widget = widgetById.get(entry.id)!;
        return <article className={`admin-dashboard-widget size-${entry.size} tone-${widget.tone ?? "default"}`} key={entry.id}>
          {customizing ? <div className="admin-dashboard-widget-controls" aria-label={`Ρυθμίσεις ${widget.label}`}>
            <button type="button" onClick={() => move(entry.id, -1)} disabled={index === 0} aria-label="Μετακίνηση αριστερά">←</button>
            <button type="button" onClick={() => move(entry.id, 1)} disabled={index === visibleEntries.length - 1} aria-label="Μετακίνηση δεξιά">→</button>
            {SIZE_ORDER.map((size) => <button type="button" className={entry.size === size ? "is-active" : undefined} onClick={() => updateEntry(entry.id, (current) => ({ ...current, size }))} key={size}>{size === "small" ? "S" : size === "medium" ? "M" : "L"}</button>)}
            <button type="button" onClick={() => updateEntry(entry.id, (current) => ({ ...current, visible: false }))} aria-label="Απόκρυψη widget">×</button>
          </div> : null}
          <div className="admin-dashboard-widget-head">
            <div><span>{widget.eyebrow}</span><h2>{widget.label}</h2></div>
            <Link href={widget.href} title={`Άνοιγμα ${widget.source}`}><span>{widget.source}</span><i aria-hidden="true">↗</i></Link>
          </div>
          {widget.value !== undefined ? <div className="admin-dashboard-widget-value">{widget.value}</div> : null}
          {widget.detail ? <p className="admin-dashboard-widget-detail">{widget.detail}</p> : null}
          {widget.stats?.length ? <div className="admin-dashboard-widget-stats">{widget.stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div> : null}
          {widget.items?.length ? <div className="admin-dashboard-widget-list">{widget.items.map((item, itemIndex) => {
            const content = <><span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>{item.value !== undefined ? <b>{item.value}</b> : null}</>;
            return item.href ? <Link href={item.href} key={`${item.label}-${itemIndex}`}>{content}</Link> : <div key={`${item.label}-${itemIndex}`}>{content}</div>;
          })}</div> : null}
          <Link className="admin-dashboard-widget-open" href={widget.href}>Άνοιγμα <span aria-hidden="true">→</span></Link>
        </article>;
      })}
    </div>
  </section>;
}
