"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./VendorDeliveryEligibilityPanel.module.css";

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

type Payload = Readonly<{ products?: readonly ProductSetting[]; error?: string }>;
type Filter = "all" | "delivery" | "pickup" | "custom";

export function VendorDeliveryEligibilityPanel({ csrfToken }: { csrfToken: string }) {
  const [products, setProducts] = useState<readonly ProductSetting[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkDelivery, setBulkDelivery] = useState(true);
  const [bulkPickup, setBulkPickup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string>();
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/vendor/catalog/delivery-eligibility", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error ?? "Δεν φορτώθηκαν οι ρυθμίσεις διάθεσης.");
      setProducts(payload.products ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν φορτώθηκαν οι ρυθμίσεις διάθεσης.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    return products.filter((product) => {
      if (filter === "delivery" && !product.deliveryEligible) return false;
      if (filter === "pickup" && !product.pickupEligible) return false;
      if (filter === "custom" && !product.explicitVendorChoice) return false;
      if (!needle) return true;
      return [product.title, product.vendorSku, product.canonicalVariantId]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("el").includes(needle));
    });
  }, [products, query, filter]);

  const deliveryCount = products.filter((product) => product.deliveryEligible).length;
  const pickupCount = products.filter((product) => product.pickupEligible).length;
  const selectedCount = selected.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((product) => selected.has(product.offerId));
  const bulkChoiceValid = bulkDelivery || bulkPickup;

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
      for (const product of filtered) {
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
    if (applyToAll && !window.confirm(`Να εφαρμοστεί η ρύθμιση σε όλα τα ${products.length.toLocaleString("el-GR")} προϊόντα;`)) return;

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
      setMessage(`Η ρύθμιση εφαρμόστηκε σε ${(payload.updatedCount ?? (applyToAll ? products.length : targetIds.length)).toLocaleString("el-GR")} προϊόντα.`);
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
        <p>Διαχειρίσου μαζικά τα προϊόντα και άλλαξε μόνο τις εξαιρέσεις μέσα στη λίστα. Η μαζική επιλογή ξεκινά με <strong>Παράδοση ενεργή</strong> και <strong>Παραλαβή ανενεργή</strong>.</p>
      </div>
      <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση προϊόντος / SKU" aria-label="Αναζήτηση προϊόντος ή SKU" />
    </div>

    <div className={styles.summary}>
      <span><strong>{products.length.toLocaleString("el-GR")}</strong> προϊόντα</span>
      <span><strong>{deliveryCount.toLocaleString("el-GR")}</strong> με παράδοση</span>
      <span><strong>{pickupCount.toLocaleString("el-GR")}</strong> με παραλαβή</span>
    </div>

    <div className={styles.filters} aria-label="Φίλτρα τρόπου διάθεσης">
      <button type="button" className={filter === "all" ? styles.filterActive : styles.filter} onClick={() => setFilter("all")}>Όλα</button>
      <button type="button" className={filter === "delivery" ? styles.filterActive : styles.filter} onClick={() => setFilter("delivery")}>Παράδοση</button>
      <button type="button" className={filter === "pickup" ? styles.filterActive : styles.filter} onClick={() => setFilter("pickup")}>Παραλαβή</button>
      <button type="button" className={filter === "custom" ? styles.filterActive : styles.filter} onClick={() => setFilter("custom")}>Χειροκίνητες αλλαγές</button>
    </div>

    <div className={styles.bulkBar}>
      <label className={styles.selectAll}>
        <input type="checkbox" checked={allFilteredSelected} disabled={filtered.length === 0 || loading || bulkBusy} onChange={(event) => toggleAllVisible(event.target.checked)} />
        <span>{selectedCount ? `${selectedCount.toLocaleString("el-GR")} επιλεγμένα` : "Επιλογή προβολής"}</span>
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
        <button className={styles.applyAllButton} type="button" disabled={bulkBusy || products.length === 0 || !bulkChoiceValid} onClick={() => void applyBulk(true)}>Σε όλα</button>
      </div>
    </div>

    {!bulkChoiceValid && <div className={styles.error}>Ενεργοποίησε Παράδοση ή Παραλαβή πριν εφαρμόσεις τη μαζική αλλαγή.</div>}
    {message && <div className={message.includes("δεν") || message.includes("Δεν") || message.includes("τουλάχιστον") ? styles.error : styles.notice} role="status">{message}</div>}

    {loading ? <div className={styles.empty}>Φόρτωση…</div> : filtered.length === 0 ? <div className={styles.empty}>Δεν βρέθηκαν προϊόντα.</div> : <div className={styles.list}>{filtered.map((product) => <div className={styles.row} key={product.offerId}>
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

    <div className={styles.footnote}>Οι ζώνες, η χωρητικότητα και η χρέωση παράδοσης συνεχίζουν να ελέγχονται από τις ρυθμίσεις Delivery. Εδώ ορίζεις μόνο αν κάθε προϊόν επιτρέπεται για Παράδοση και/ή Παραλαβή.</div>
  </section>;
}
