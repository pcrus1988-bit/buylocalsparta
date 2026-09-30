"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Metrics = Readonly<{
  orders: number;
  overdue: number;
  lowStock: number;
  activeProducts: number;
  purchases30d: number;
}>;

type Group = "all" | "today" | "products" | "customers" | "store" | "money";

type Action = Readonly<{
  id: string;
  group: Exclude<Group, "all">;
  label: string;
  description: string;
  href: string;
  icon: string;
  keywords: string;
  count?: number;
  attention?: boolean;
}>;

const GROUPS: ReadonlyArray<{ id: Group; label: string }> = [
  { id: "all", label: "Όλα" },
  { id: "today", label: "Σήμερα" },
  { id: "products", label: "Προϊόντα" },
  { id: "customers", label: "Πελάτες" },
  { id: "store", label: "Κατάστημα" },
  { id: "money", label: "Οικονομικά" }
];

function actionSet(metrics: Metrics): ReadonlyArray<Action> {
  return [
    {
      id: "orders",
      group: "today",
      label: "Παραγγελίες",
      description: "Αποδοχή, προετοιμασία και επόμενο βήμα.",
      href: "/vendor/orders",
      icon: "□",
      keywords: "παραγγελίες orders αποδοχή picking packed fulfillment",
      count: metrics.orders,
      attention: metrics.orders > 0
    },
    {
      id: "deadlines",
      group: "today",
      label: "Προθεσμίες",
      description: "Δες τι λήγει ή έχει ήδη καθυστερήσει.",
      href: "/vendor/notifications",
      icon: "!",
      keywords: "προθεσμίες notifications sla overdue εκπρόθεσμα",
      count: metrics.overdue,
      attention: metrics.overdue > 0
    },
    {
      id: "pickup",
      group: "today",
      label: "Παραλαβές",
      description: "Σάρωση και ολοκλήρωση παραλαβής.",
      href: "/vendor/pickup/scan",
      icon: "⌁",
      keywords: "pickup scan qr παραλαβή",
    },
    {
      id: "returns",
      group: "today",
      label: "Επιστροφές",
      description: "Repair, replacement και after-sales εργασίες.",
      href: "/vendor/returns",
      icon: "↩",
      keywords: "επιστροφές returns replacement repair refund"
    },
    {
      id: "catalog",
      group: "products",
      label: "Κατάλογος & απόθεμα",
      description: "Τιμές, stock, visibility και στοιχεία προϊόντων.",
      href: "/vendor/catalog",
      icon: "▦",
      keywords: "προϊόντα κατάλογος stock inventory τιμή price visibility",
      count: metrics.activeProducts
    },
    {
      id: "low-stock",
      group: "products",
      label: "Χαμηλό απόθεμα",
      description: "Προϊόντα που χρειάζονται έλεγχο stock.",
      href: "/vendor/catalog",
      icon: "↘",
      keywords: "χαμηλό απόθεμα low stock inventory",
      count: metrics.lowStock,
      attention: metrics.lowStock > 0
    },
    {
      id: "trust",
      group: "products",
      label: "Media & έγγραφα",
      description: "Φωτογραφίες, έγγραφα και στοιχεία εμπιστοσύνης.",
      href: "/vendor/trust",
      icon: "✓",
      keywords: "media έγγραφα εικόνες photos documents trust"
    },
    {
      id: "customers",
      group: "customers",
      label: "Μηνύματα & Ask Local",
      description: "Αιτήματα, συνομιλίες και ιδιωτικές προσφορές.",
      href: "/vendor/advice",
      icon: "◌",
      keywords: "πελάτες messages ask local μηνύματα αιτήματα προσφορές"
    },
    {
      id: "daily",
      group: "today",
      label: "KONTA MOY Daily",
      description: "Γρήγορη λειτουργία από κινητό, scan και stock.",
      href: "/daily",
      icon: "◈",
      keywords: "daily κινητό mobile scan quick add"
    },
    {
      id: "storefront",
      group: "store",
      label: "Δημόσιο κατάστημα",
      description: "Προφίλ, εικόνα και παρουσία του καταστήματος.",
      href: "/vendor/storefront",
      icon: "◫",
      keywords: "storefront κατάστημα profile δημόσιο εικόνα"
    },
    {
      id: "finance",
      group: "money",
      label: "Οικονομικά",
      description: "Πληρωμές, παραστατικά και εμπορική εικόνα.",
      href: "/vendor/finance",
      icon: "€",
      keywords: "finance οικονομικά πληρωμές invoices παραστατικά"
    },
    {
      id: "analytics",
      group: "money",
      label: "Απόδοση",
      description: "Πωλήσεις, conversion και απόδοση προϊόντων.",
      href: "/vendor/analytics",
      icon: "∿",
      keywords: "analytics στατιστικά performance πωλήσεις conversion",
      count: metrics.purchases30d
    }
  ];
}

export function VendorDashboardTools({ metrics }: { metrics: Metrics }) {
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const actions = useMemo(() => actionSet(metrics), [metrics]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    return actions.filter((item) => {
      if (group !== "all" && item.group !== group) return false;
      if (attentionOnly && !item.attention) return false;
      if (!needle) return true;
      return `${item.label} ${item.description} ${item.keywords}`.toLocaleLowerCase("el").includes(needle);
    });
  }, [actions, attentionOnly, group, query]);

  const urgent = actions.filter((item) => item.attention);

  return <>
    <section className="shell vendor-section vendor-command-centre" id="vendor-command-centre">
      <div className="vendor-command-centre-head">
        <div>
          <div className="eyebrow">Command centre</div>
          <h2>Βρες την εργασία σου σε δευτερόλεπτα</h2>
          <p>Αναζήτησε λειτουργία ή φιλτράρισε ανά σκοπό. Οι κάρτες δεν φορτώνουν νέο operational dataset — χρησιμοποιούν την ήδη διαθέσιμη εικόνα της αρχικής.</p>
        </div>
        <label className="vendor-attention-toggle">
          <input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} />
          <span>Μόνο ό,τι χρειάζεται προσοχή</span>
        </label>
      </div>

      <div className="vendor-command-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Αναζήτηση: παραγγελία, stock, Ask Local, οικονομικά…"
          aria-label="Αναζήτηση εργαλείων συνεργάτη"
        />
        {query && <button type="button" onClick={() => setQuery("")}>Καθαρισμός</button>}
      </div>

      <div className="vendor-command-filters" role="tablist" aria-label="Φίλτρα εργαλείων">
        {GROUPS.map((item) => <button
          key={item.id}
          type="button"
          className={group === item.id ? "is-active" : ""}
          aria-pressed={group === item.id}
          onClick={() => setGroup(item.id)}
        >{item.label}</button>)}
      </div>

      {filtered.length > 0 ? <div className="vendor-command-grid">
        {filtered.map((item) => <Link className={`vendor-tool-card${item.attention ? " is-attention" : ""}`} href={item.href} key={item.id}>
          <span className="vendor-tool-icon" aria-hidden="true">{item.icon}</span>
          <div>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </div>
          {typeof item.count === "number" && <b>{item.count.toLocaleString("el-GR")}</b>}
          <span className="vendor-tool-arrow" aria-hidden="true">→</span>
        </Link>)}
      </div> : <div className="workspace-empty-state">
        <strong>Δεν βρέθηκε αντίστοιχο εργαλείο.</strong>
        <p>Δοκίμασε άλλη λέξη ή αφαίρεσε το φίλτρο προσοχής.</p>
      </div>}
    </section>

    <button
      className={`vendor-floating-command${urgent.length ? " has-attention" : ""}`}
      type="button"
      aria-expanded={drawerOpen}
      aria-controls="vendor-floating-drawer"
      onClick={() => setDrawerOpen((current) => !current)}
    >
      <span aria-hidden="true">⌘</span>
      <strong>Ενέργειες</strong>
      {urgent.length > 0 && <b>{urgent.length}</b>}
    </button>

    {drawerOpen && <div className="vendor-floating-layer" id="vendor-floating-drawer">
      <button className="vendor-floating-backdrop" type="button" aria-label="Κλείσιμο γρήγορων ενεργειών" onClick={() => setDrawerOpen(false)} />
      <aside className="vendor-floating-sheet" role="dialog" aria-modal="true" aria-label="Γρήγορες ενέργειες συνεργάτη">
        <div className="vendor-floating-sheet-head">
          <div><span className="eyebrow">Γρήγορες ενέργειες</span><strong>Τι θέλεις να κάνεις;</strong></div>
          <button type="button" onClick={() => setDrawerOpen(false)}>Κλείσιμο</button>
        </div>
        <div className="vendor-floating-sheet-grid">
          {actions.slice(0, 8).map((item) => <Link href={item.href} key={item.id} onClick={() => setDrawerOpen(false)}>
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.label}</strong>
            {item.attention && <b>{item.count}</b>}
          </Link>)}
        </div>
        <a className="vendor-floating-all" href="#vendor-command-centre" onClick={() => setDrawerOpen(false)}>Όλα τα εργαλεία και αναζήτηση ↓</a>
      </aside>
    </div>}
  </>;
}
