"use client";

import { useEffect, useState } from "react";
import styles from "./VendorDeliveryEligibilityPanel.module.css";

const PAGE_SIZE = 40;

type ProductSetting = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  deliveryEligible: boolean;
  pickupEligible: boolean;
  pickupOnly: boolean;
  fulfilmentModes: readonly string[];
  explicitVendorChoice: boolean;
}>;

type Summary = Readonly<{ total: number; delivery: number; pickup: number; custom: number }>;
type Payload = Readonly<{
  products?: readonly ProductSetting[];
  summary?: Summary;
  filteredTotal?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  hasPrevious?: boolean;
  error?: string;
}>;
type Filter = "all" | "delivery" | "pickup" | "custom";

const EMPTY_SUMMARY: Summary = { total: 0, delivery: 0, pickup: 0, custom: 0 };

export function VendorDeliveryEligibilityPanel({ csrfToken }: { csrfToken: string }) {
  const [products, setProducts] = useState<readonly ProductSetting[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkDelivery, setBulkDelivery] = useState(true);
  const [bulkPickup, setBulkPickup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string>();
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOffset(0);
      setSearch(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
          filter
        });
        if (search) params.set("q", search);
        const response = await fetch(`/api/vendor/catalog/delivery-eligibility?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json() as Payload;
        if (!response.ok) throw new Error(payload.error ?? "Δεν φορτώθηκαν οι ρυθμίσεις διάθεσης.");
        if (cancelled) return;
        setProducts(payload.products ?? []);
        setSummary(payload.summary ?? EMPTY_SUMMARY);
        setFilteredTotal(payload.filteredTotal ?? 0);
        setHasMore(Boolean(payload.hasMore));
        setHasPrevious(Boolean(payload.hasPrevious));
        setSelected(new Set());
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Δεν φορτώθηκαν οι ρυθμίσεις διάθεσης.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => { cancelled = true; };
  }, [filter, offset, reloadKey, search]);

  const selectedCount = selected.size;
  const allPageSelected = products.length > 0 && products.every((product) => selected.has(product.offerId));
  const bulkChoiceValid = bulkDelivery || bulkPickup;
  const pageStart = filteredTotal === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + products.length, filteredTotal);

  function chooseFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    setOffset(0);
    setMessage("");
  }

  function toggleSelection(offerId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(offerId);
      else next.delete(offerId);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const product of products) {
        if (checked) next.add(product.offerId);
        else next.delete(product.offerId);
      }
      return next;
    });
  }

  async function update(product: ProductSetting, key: "deliveryEligible" | "pickupEligible", checked: boolean) {
    const deliveryEligible = key === "deliveryEligible" ? checked : product.deliveryEligible;
    const pickupEligible = key === "pickupEligible" ? checked : product.pickupEligible;
    if (!deliveryEligible && !pickupEligible) {
      setMessage("Κράτησε ενεργό τουλάχιστον έναν τρόπο διάθεσης: Παράδοση ή Παραλαβή.");
      return;
    }

    setBusyOfferId(product.offerId);
    setMessage("");
    const before = products;
    setProducts((current) => current.map((item) => item.offerId === product.offerId ? {
      ...item,
      deliveryEligible,
      pickupEligible,
      pickupOnly: pickupEligible && !deliveryEligible,
      explicitVendorChoice: true
    } : item));
    try {
      const response = await fetch("/api/vendor/catalog/delivery-eligibility", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ offerId: product.offerId, deliveryEligible, pickupEligible })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ρύθμιση δεν αποθηκεύτηκε.");
      setMessage(`Αποθηκεύτηκε για «${product.title}».`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setProducts(before);
      setMessage(error instanceof Error ? error.message : "Η ρύθμιση δεν αποθηκεύτηκε.");
    } finally {
      setBusyOfferId(undefined);
    }
  }

  async function applyBulk(applyToAll: boolean) {
    if (!bulkChoiceValid) {
      setMessage("Κράτησε ενεργό τουλάχιστον έναν τρόπο διάθεσης: Παράδοση ή Παραλαβή.");
      return;
    }
    if (!applyToAll && selectedCount === 0) {
      setMessage("Επίλεξε τουλάχιστον ένα προϊόν.");
      return;
    }
    if (applyToAll && !window.confirm(`Να εφαρμοστεί η ρύθμιση σε όλα τα ${summary.total.toLocaleString("el-GR")} προϊόντα;`)) return;

    setBulkBusy(true);
    setMessage("");
    const before = products;
    const targetIds = [...selected];
    setProducts((current) => current.map((item) => applyToAll || selected.has(item.offerId) ? {
      ...item,
      deliveryEligible: bulkDelivery,
      pickupEligible: bulkPickup,
      pickupOnly: bulkPickup && !bulkDelivery,
      explicitVendorChoice: true
    } : item));
    try {
      const response = await fetch("/api/vendor/catalog/delivery-eligibility", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          offerIds: applyToAll ? undefined : targetIds,
          applyToAll,
          deliveryEligible: bulkDelivery,
          pickupEligible: bulkPickup
        })
      });
      const payload = await response.json() as { error?: string; updatedCount?: number };
      if (!response.ok) throw new Error(payload.error ?? "Η μαζική αλλαγή δεν αποθηκεύτηκε.");
      setSelected(new Set());
      setMessage(`Η ρύθμιση εφαρμόστηκε σε ${(payload.updatedCount ?? (applyToAll ? summary.total : targetIds.length)).toLocaleString("el-GR")} προϊόντα.`);
      setReloadKey((value) => value + 1);
    } catch (error) {
      setProducts(before);
      setMessage(error instanceof Error ? error.message : "Η μαζική αλλαγή δεν αποθηκεύτηκε.");
    } finally {
      setBulkBusy(false);
    }
  }

  return <section className={styles.panel}>
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Παραλαβή & παράδοση</div>
        <h3>Τρόποι διάθεσης προϊόντων</h3>
        <p>Φορτώνονται μόνο <strong>{PAGE_SIZE}</strong> προϊόντα κάθε φορά. Αναζήτηση και φίλτρα εκτελούνται στη βάση, ενώ η μαζική αλλαγή μπορεί να εφαρμοστεί σε όλο τον κατάλογο χωρίς να φορτωθούν όλα τα προϊόντα στο κινητό.</p>
      </div>
      <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση προϊόντος / SKU" aria-label="Αναζήτηση προϊόντος ή SKU" />
    </div>

    <div className={styles.summary}>
      <span><strong>{summary.total.toLocaleString("el-GR")}</strong> προϊόντα</span>
      <span><strong>{summary.delivery.toLocaleString("el-GR")}</strong> με παράδοση</span>
      <span><strong>{summary.pickup.toLocaleString("el-GR")}</strong> με παραλαβή</span>
      <span><strong>{summary.custom.toLocaleString("el-GR")}</strong> χειροκίνητα</span>
    </div>

    <div className={styles.filters} aria-label="Φίλτρα τρόπου διάθεσης">
      <button type="button" className={filter === "all" ? styles.filterActive : styles.filter} onClick={() => chooseFilter("all")}>Όλα</button>
      <button type="button" className={filter === "delivery" ? styles.filterActive : styles.filter} onClick={() => chooseFilter("delivery")}>Παράδοση</button>
      <button type="button" className={filter === "pickup" ? styles.filterActive : styles.filter} onClick={() => chooseFilter("pickup")}>Παραλαβή</button>
      <button type="button" className={filter === "custom" ? styles.filterActive : styles.filter} onClick={() => chooseFilter("custom")}>Χειροκίνητες αλλαγές</button>
    </div>

    <div className={styles.bulkBar}>
      <label className={styles.selectAll}>
        <input type="checkbox" checked={allPageSelected} disabled={products.length === 0 || loading || bulkBusy} onChange={(event) => toggleAllVisible(event.target.checked)} />
        <span>{selectedCount ? `${selectedCount.toLocaleString("el-GR")} επιλεγμένα` : "Επιλογή σελίδας"}</span>
      </label>
      <div className={styles.bulkModes}>
        <span className={styles.bulkLabel}>Μαζική αλλαγή</span>
        <label className={bulkDelivery ? styles.modeActive : styles.mode}>
          <input type="checkbox" checked={bulkDelivery} disabled={bulkBusy} onChange={(event) => setBulkDelivery(event.target.checked)} />
          <span>Παράδοση</span>
        </label>
        <label className={bulkPickup ? styles.modeActive : styles.mode}>
          <input type="checkbox" checked={bulkPickup} disabled={bulkBusy} onChange={(event) => setBulkPickup(event.target.checked)} />
          <span>Παραλαβή</span>
        </label>
      </div>
      <div className={styles.bulkActions}>
        <button className={styles.applyButton} type="button" disabled={bulkBusy || selectedCount === 0 || !bulkChoiceValid} onClick={() => void applyBulk(false)}>Στα επιλεγμένα</button>
        <button className={styles.applyAllButton} type="button" disabled={bulkBusy || summary.total === 0 || !bulkChoiceValid} onClick={() => void applyBulk(true)}>Σε όλα</button>
      </div>
    </div>

    {!bulkChoiceValid && <div className={styles.error}>Ενεργοποίησε Παράδοση ή Παραλαβή πριν εφαρμόσεις τη μαζική αλλαγή.</div>}
    {message && <div className={message.includes("δεν") || message.includes("Δεν") || message.includes("τουλάχιστον") ? styles.error : styles.notice} role="status">{message}</div>}

    {loading ? <div className={styles.empty}>Φόρτωση έως {PAGE_SIZE} προϊόντων…</div> : products.length === 0 ? <div className={styles.empty}>Δεν βρέθηκαν προϊόντα.</div> : <div className={styles.list}>{products.map((product) => <div className={styles.row} key={product.offerId}>
      <label className={styles.rowSelect} aria-label={`Επιλογή ${product.title}`}>
        <input type="checkbox" checked={selected.has(product.offerId)} disabled={bulkBusy} onChange={(event) => toggleSelection(product.offerId, event.target.checked)} />
      </label>
      <div className={styles.copy}>
        <strong title={product.title}>{product.title}</strong>
        <div className={styles.meta}>
          <span>{product.vendorSku ? `SKU ${product.vendorSku}` : "Χωρίς SKU"}</span>
          {product.explicitVendorChoice && <span className={styles.customBadge}>Χειροκίνητο</span>}
        </div>
      </div>
      <div className={styles.rowModes}>
        <label className={product.deliveryEligible ? styles.modeActive : styles.mode} title="Διαθέσιμο για τοπική παράδοση">
          <input type="checkbox" checked={product.deliveryEligible} disabled={busyOfferId === product.offerId || bulkBusy} onChange={(event) => void update(product, "deliveryEligible", event.target.checked)} />
          <span>Παράδοση</span>
        </label>
        <label className={product.pickupEligible ? styles.modeActive : styles.mode} title="Διαθέσιμο για παραλαβή από κατάστημα">
          <input type="checkbox" checked={product.pickupEligible} disabled={busyOfferId === product.offerId || bulkBusy} onChange={(event) => void update(product, "pickupEligible", event.target.checked)} />
          <span>Παραλαβή</span>
        </label>
      </div>
    </div>)}</div>}

    <div className={styles.filters} aria-label="Σελιδοποίηση προϊόντων">
      <button type="button" className={styles.filter} disabled={!hasPrevious || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>← Προηγούμενα</button>
      <span className={styles.bulkLabel}>{pageStart.toLocaleString("el-GR")}–{pageEnd.toLocaleString("el-GR")} από {filteredTotal.toLocaleString("el-GR")}</span>
      <button type="button" className={styles.filter} disabled={!hasMore || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Επόμενα →</button>
    </div>

    <div className={styles.footnote}>Η σελίδα δεν κατεβάζει πλέον όλο τον κατάλογο για να εμφανίσει Παραλαβή/Παράδοση. Οι ζώνες, η χωρητικότητα και η χρέωση παράδοσης συνεχίζουν να ελέγχονται από τις ρυθμίσεις τοπικής παράδοσης.</div>
  </section>;
}
