import Link from "next/link";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../lib/postgres-runtime";
import { WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type AlertRow = SqlRow & {
  id: string;
  title: string;
  body: string;
  created_at: Date | string;
  vendor_id: string | null;
  vendor_name: string | null;
  offer_id: string | null;
  canonical_id: string | null;
  product_title: string | null;
  previous_price_minor: number | string | null;
  price_minor: number | string | null;
  currency: string | null;
};

type HistoryRow = SqlRow & {
  id: string;
  vendor_id: string;
  vendor_name: string;
  offer_id: string;
  canonical_id: string;
  product_title: string;
  previous_price_minor: number | string | null;
  price_minor: number | string;
  currency: string;
  source: string;
  changed_at: Date | string;
};

type HistoryGroup = {
  key: string;
  vendorId: string;
  vendorName: string;
  canonicalId: string;
  productTitle: string;
  entries: HistoryRow[];
};

const asInt = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const euro = (minor: unknown, currency = "EUR") => new Intl.NumberFormat("el-GR", { style: "currency", currency }).format(asInt(minor) / 100);
const when = (value: Date | string) => new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

export async function AdminVendorPriceHistory() {
  if (!productionDatabaseConfigured()) return null;

  let alerts: AlertRow[] = [];
  let history: HistoryRow[] = [];
  try {
    const db = getProductionPostgresRuntime().sqlPool;
    const [alertResult, historyResult] = await Promise.all([
      db.query<AlertRow>(`
        SELECT
          n.public_id AS id,
          n.title,
          n.body,
          n.created_at,
          COALESCE(vb.public_id, n.payload->>'vendorId') AS vendor_id,
          vb.trading_name AS vendor_name,
          n.payload->>'offerId' AS offer_id,
          n.payload->>'canonicalVariantId' AS canonical_id,
          n.payload->>'productTitle' AS product_title,
          NULLIF(n.payload->>'previousPriceMinor','')::bigint AS previous_price_minor,
          NULLIF(n.payload->>'priceMinor','')::bigint AS price_minor,
          COALESCE(n.payload->>'currency','EUR') AS currency
        FROM notifications n
        LEFT JOIN vendor_businesses vb ON vb.public_id = n.payload->>'vendorId'
        WHERE n.channel='in_app' AND n.event_type='admin.vendor_price_changed'
        ORDER BY n.created_at DESC
        LIMIT 50
      `),
      db.query<HistoryRow>(`
        SELECT
          h.public_id AS id,
          vb.public_id AS vendor_id,
          vb.trading_name AS vendor_name,
          vo.public_id AS offer_id,
          cv.public_id AS canonical_id,
          COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title,
          h.previous_price_minor,
          h.price_minor,
          h.currency,
          h.source,
          h.changed_at
        FROM vendor_offer_price_history h
        JOIN vendor_businesses vb ON vb.id=h.vendor_id
        JOIN vendor_offers vo ON vo.id=h.offer_id
        JOIN canonical_variants cv ON cv.id=h.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        ORDER BY h.changed_at DESC, h.id DESC
        LIMIT 500
      `)
    ]);
    alerts = [...alertResult.rows];
    history = [...historyResult.rows];
  } catch {
    return null;
  }

  const grouped = new Map<string, HistoryGroup>();
  for (const row of history) {
    const key = `${row.vendor_id}:${row.canonical_id}`;
    const existing = grouped.get(key);
    if (existing) {
      if (existing.entries.length < 20) existing.entries.push(row);
      continue;
    }
    grouped.set(key, {
      key,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      canonicalId: row.canonical_id,
      productTitle: row.product_title,
      entries: [row]
    });
  }
  const groups = [...grouped.values()].slice(0, 80);

  return <>
    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Vendor pricing" title="Ειδοποιήσεις αλλαγών τιμών" note="Κάθε πραγματική αλλαγή τιμής από vendor δημιουργεί ξεχωριστή admin ειδοποίηση με παλιά και νέα τιμή." />
      {alerts.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχουν ακόμη αλλαγές τιμών από vendors.</strong><span>Οι επόμενες αλλαγές θα εμφανίζονται αυτόματα εδώ.</span></div> : <div className="workspace-queue-list">
        {alerts.map((item) => <article className="workspace-queue-card" key={item.id}>
          <div className="workspace-queue-head">
            <div><strong>{item.product_title || item.title}</strong><small>{item.vendor_name || item.vendor_id || "Vendor"} · {when(item.created_at)}</small></div>
            <span className="status-pill">Αλλαγή τιμής</span>
          </div>
          <p>{item.body}</p>
          <div className="workspace-queue-primary">
            <span>Πριν: <strong>{item.previous_price_minor === null ? "—" : euro(item.previous_price_minor, item.currency || "EUR")}</strong></span>
            <span>Τώρα: <strong>{euro(item.price_minor, item.currency || "EUR")}</strong></span>
            {item.canonical_id && <span>Canonical: <strong className="vendor-technical-id">{item.canonical_id}</strong></span>}
          </div>
          {item.vendor_id && <div className="workspace-action-bar"><span>Offer: <strong className="vendor-technical-id">{item.offer_id || "—"}</strong></span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(item.vendor_id)}/catalogue`}>Άνοιγμα vendor catalogue</Link></div></div>}
        </article>)}
      </div>}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Price audit trail" title="Εξέλιξη τιμής ανά canonical item και vendor" note="Immutable ιστορικό: κάθε vendor έχει τη δική του χρονοσειρά τιμής για το ίδιο canonical προϊόν. Η αρχική τιμή και όλες οι επόμενες αλλαγές παραμένουν διαθέσιμες." />
      {groups.length === 0 ? <div className="workspace-empty-state"><strong>Δεν υπάρχει ακόμη ιστορικό τιμών.</strong></div> : <div className="workspace-queue-list">
        {groups.map((group) => {
          const current = group.entries[0];
          return <details className="workspace-tool-panel" key={group.key}>
            <summary><span><strong>{group.productTitle}</strong><small>{group.vendorName} · Τρέχουσα {euro(current.price_minor, current.currency)} · {group.entries.length} καταγραφές στο πρόσφατο ιστορικό</small></span></summary>
            <div className="workspace-tool-body">
              <div className="workspace-compact-list">
                {group.entries.map((entry) => <div className="workspace-compact-row" key={entry.id}>
                  <strong>{when(entry.changed_at)}</strong>
                  <span>{entry.previous_price_minor === null ? "Αρχική καταγραφή" : `${euro(entry.previous_price_minor, entry.currency)} → ${euro(entry.price_minor, entry.currency)}`}</span>
                  <small>{entry.source}</small>
                </div>)}
              </div>
              <div className="workspace-action-bar"><span>Canonical: <strong className="vendor-technical-id">{group.canonicalId}</strong></span><div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/partners/${encodeURIComponent(group.vendorId)}/catalogue`}>Vendor catalogue</Link></div></div>
            </div>
          </details>;
        })}
      </div>}
    </section>
  </>;
}
