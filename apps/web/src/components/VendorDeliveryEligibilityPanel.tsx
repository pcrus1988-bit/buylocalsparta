"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./VendorDeliveryEligibilityPanel.module.css";

type ProductSetting = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  vendorSku?: string;
  deliveryEligible: boolean;
  pickupOnly: boolean;
  fulfilmentModes: readonly string[];
  explicitVendorChoice: boolean;
}>;

type Payload = Readonly<{ products?: readonly ProductSetting[]; error?: string }>;

export function VendorDeliveryEligibilityPanel({ csrfToken }: { csrfToken: string }) {
  const [products, setProducts] = useState<readonly ProductSetting[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyOfferId, setBusyOfferId] = useState<string>();
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/vendor/catalog/delivery-eligibility", { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error ?? "Δεν φορτώθηκαν οι ρυθμίσεις παράδοσης.");
      setProducts(payload.products ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν φορτώθηκαν οι ρυθμίσεις παράδοσης.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("el");
    if (!needle) return products;
    return products.filter((product) => [product.title, product.vendorSku, product.canonicalVariantId].filter(Boolean).some((value) => String(value).toLocaleLowerCase("el").includes(needle)));
  }, [products, query]);

  async function update(product: ProductSetting, deliveryEligible: boolean) {
    setBusyOfferId(product.offerId);
    setMessage("");
    const before = products;
    setProducts((current) => current.map((item) => item.offerId === product.offerId ? { ...item, deliveryEligible, pickupOnly: !deliveryEligible, explicitVendorChoice: true } : item));
    try {
      const response = await fetch("/api/vendor/catalog/delivery-eligibility", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ offerId: product.offerId, deliveryEligible })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η ρύθμιση δεν αποθηκεύτηκε.");
      setMessage(deliveryEligible ? "Το προϊόν είναι ξανά επιλέξιμο για τοπική παράδοση." : "Το προϊόν ορίστηκε ως μόνο για παραλαβή από κατάστημα.");
    } catch (error) {
      setProducts(before);
      setMessage(error instanceof Error ? error.message : "Η ρύθμιση δεν αποθηκεύτηκε.");
    } finally {
      setBusyOfferId(undefined);
    }
  }

  return <section className={styles.panel}>
    <div className={styles.header}>
      <div>
        <div className={styles.eyebrow}>Παραλαβή & παράδοση</div>
        <h3>Ποια προϊόντα μπορούν να παραδοθούν</h3>
        <p>Από προεπιλογή όλα τα προϊόντα είναι επιλέξιμα για τοπική παράδοση. Απενεργοποίησε την παράδοση μόνο για προϊόντα που θέλεις να δίνονται αποκλειστικά με παραλαβή από το κατάστημα.</p>
      </div>
      <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Αναζήτηση προϊόντος / SKU" />
    </div>
    <div className={styles.notice}>Η επιλογή εδώ δηλώνει αν το προϊόν επιτρέπεται να μπει σε τοπική παράδοση. Η πραγματική διαθεσιμότητα παράδοσης, οι ζώνες, η χωρητικότητα και η τιμολόγηση εξακολουθούν να ελέγχονται από τα υπάρχοντα Admin Delivery / Delivery συστήματα.</div>
    {message && <div className={message.includes("δεν") || message.includes("Δεν") ? styles.error : styles.notice}>{message}</div>}
    {loading ? <div className={styles.empty}>Φόρτωση…</div> : filtered.length === 0 ? <div className={styles.empty}>Δεν βρέθηκαν προϊόντα.</div> : <div className={styles.list}>{filtered.map((product) => <div className={styles.row} key={product.offerId}>
      <div className={styles.copy}>
        <strong>{product.title}</strong>
        <div className={styles.meta}><span>{product.vendorSku ? `SKU ${product.vendorSku}` : "Χωρίς SKU"}</span><span>·</span><span className={product.deliveryEligible ? styles.delivery : styles.pickup}>{product.deliveryEligible ? "Παραλαβή + τοπική παράδοση" : "Μόνο παραλαβή"}</span>{product.explicitVendorChoice && <><span>·</span><span>Ρύθμιση καταστήματος</span></>}</div>
      </div>
      <label className={styles.toggle}>
        <input type="checkbox" checked={product.deliveryEligible} disabled={busyOfferId === product.offerId} onChange={(event) => void update(product, event.target.checked)} />
        <span>Τοπική παράδοση</span>
      </label>
    </div>)}</div>}
  </section>;
}
