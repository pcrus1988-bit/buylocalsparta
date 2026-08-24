"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./QuickAddWorkbench.module.css";

type Listed = {
  offerId: string; canonicalVariantId: string; title: string; vendorSku?: string; gtin?: string; brand?: string;
  categoryPath: string; retailPriceMinor: number; onHand: number; safetyStock: number; availableToSell: number;
  offerStatus: string; productVisible: boolean; effectiveVisible: boolean;
};
type Match = {
  canonicalVariantId: string; title: string; gtin?: string; description?: string; brand?: string; model?: string; mpn?: string;
  categoryCode: string; categoryName: string; categoryPath: string; specifications: Record<string, unknown>;
  variantAttributes: Record<string, unknown>; score: number; listed?: Listed;
};
type LookupPayload = { matches?: Match[]; csrfToken?: string; error?: string };

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

export function QuickAddWorkbench({ csrfToken }: { csrfToken: string }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [vendorSku, setVendorSku] = useState("");
  const [price, setPrice] = useState("0.00");
  const [stock, setStock] = useState("0");
  const [safetyStock, setSafetyStock] = useState("0");
  const [visible, setVisible] = useState(true);
  const [advice, setAdvice] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function pick(match: Match) {
    setSelected(match);
    setVendorSku(match.listed?.vendorSku ?? "");
    setPrice(((match.listed?.retailPriceMinor ?? 0) / 100).toFixed(2));
    setStock(String(match.listed?.onHand ?? 0));
    setSafetyStock(String(match.listed?.safetyStock ?? 0));
    setVisible(match.listed?.productVisible ?? true);
    setAdvice(true);
    setMessage("");
  }

  async function lookup(raw = query) {
    const value = raw.trim();
    if (value.length < 4) { setMessage("Γράψε τίτλο/μοντέλο ή σκάναρε πλήρες barcode."); return; }
    setBusy(true); setMessage(""); setSelected(null);
    try {
      const digits = value.replace(/\D/g, "");
      const looksBarcode = digits === value.replace(/[\s-]/g, "") && digits.length >= 6;
      const params = new URLSearchParams(looksBarcode ? { gtin: digits } : { q: value });
      const response = await fetch(`/api/daily/quickadd?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as LookupPayload;
      if (!response.ok) throw new Error(payload.error ?? "Η αναζήτηση απέτυχε.");
      const found = payload.matches ?? [];
      setMatches(found);
      if (found.length === 1) pick(found[0]);
      if (!found.length) setMessage("Δεν βρέθηκε canonical προϊόν. Ζήτησε από Admin Quick Add να το δημιουργήσει.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η αναζήτηση απέτυχε."); }
    finally { setBusy(false); }
  }

  function stopScanner() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    setMessage("");
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Ο browser δεν υποστηρίζει αυτόματο barcode scan. Πληκτρολόγησε/επικόλλησε τον κωδικό στο πεδίο.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream; setScanning(true);
      requestAnimationFrame(async () => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new DetectorClass({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
        const scan = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes.find((item) => item.rawValue)?.rawValue?.trim();
            if (raw) { setQuery(raw); stopScanner(); await lookup(raw); return; }
          } catch { /* keep scanning */ }
          requestAnimationFrame(() => void scan());
        };
        void scan();
      });
    } catch { setMessage("Δεν ήταν δυνατή η πρόσβαση στην κάμερα. Έλεγξε την άδεια κάμερας του browser."); stopScanner(); }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function save() {
    if (!selected) return;
    const euros = Number(price.replace(",", "."));
    const onHand = Number(stock), safety = Number(safetyStock);
    if (!Number.isFinite(euros) || euros < 0 || !Number.isInteger(onHand) || onHand < 0 || !Number.isInteger(safety) || safety < 0) {
      setMessage("Έλεγξε τιμή και ποσότητες."); return;
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/daily/quickadd", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ canonicalVariantId: selected.canonicalVariantId, vendorSku, customerPriceMinor: Math.round(euros * 100), onHand, safetyStock: safety, visible, adviceAvailable: advice })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση απέτυχε.");
      setMessage(visible ? "Αποθηκεύτηκε και δημοσιεύτηκε στο κατάστημα." : "Αποθηκεύτηκε ως κρυφό προϊόν.");
      await lookup(selected.gtin ?? selected.title);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η αποθήκευση απέτυχε."); }
    finally { setBusy(false); }
  }

  return <div className={styles.workbench}>
    <section className={styles.searchCard}>
      <div><span className={styles.eyebrow}>Item Research · Stock Check</span><h1>Quick Product</h1><p>Σκάναρε barcode ή αναζήτησε τίτλο / μοντέλο. Θα δεις αμέσως canonical στοιχεία και αν υπάρχει ήδη στο κατάστημά σου.</p></div>
      <div className={styles.searchRow}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void lookup(); }} placeholder="GTIN / EAN / τίτλος / μοντέλο" inputMode="search" autoComplete="off" />
        <button type="button" onClick={() => void lookup()} disabled={busy}>Αναζήτηση</button>
        <button type="button" className={styles.scanButton} onClick={() => scanning ? stopScanner() : void startScanner()}>{scanning ? "Κλείσιμο" : "▣ Scan"}</button>
      </div>
      {scanning && <div className={styles.scanner}><video ref={videoRef} playsInline muted /><div className={styles.scanLine} /><span>Κράτησε το barcode μέσα στο πλαίσιο</span></div>}
    </section>

    {message && <div className={styles.message}>{message}</div>}

    {!selected && matches.length > 0 && <section className={styles.results}><h2>Αποτελέσματα</h2>{matches.map((match) => <button type="button" className={styles.result} key={match.canonicalVariantId} onClick={() => pick(match)}>
      <span><strong>{match.title}</strong><small>{[match.brand, match.model, match.gtin].filter(Boolean).join(" · ")}</small><small>{match.categoryPath}</small></span>
      <b className={match.listed ? styles.inShop : styles.notInShop}>{match.listed ? "Στο κατάστημα" : "Δεν έχει προστεθεί"}</b>
    </button>)}</section>}

    {selected && <section className={styles.editor}>
      <div className={styles.identity}>
        <div><span className={styles.eyebrow}>Canonical product</span><h2>{selected.title}</h2><p>{selected.description || "Δεν υπάρχει ακόμη canonical περιγραφή."}</p></div>
        <span className={selected.listed ? styles.inShop : styles.notInShop}>{selected.listed ? "Ήδη στο Shop" : "Νέο για το Shop"}</span>
      </div>
      <div className={styles.facts}>
        <div><span>GTIN</span><strong>{selected.gtin ?? "—"}</strong></div><div><span>Brand</span><strong>{selected.brand ?? "—"}</strong></div>
        <div><span>Model / MPN</span><strong>{[selected.model, selected.mpn].filter(Boolean).join(" / ") || "—"}</strong></div><div><span>Category</span><strong>{selected.categoryPath}</strong></div>
      </div>
      {Object.keys(selected.variantAttributes).length > 0 && <details><summary>Παραλλαγή & χαρακτηριστικά</summary><pre>{JSON.stringify(selected.variantAttributes, null, 2)}</pre></details>}
      <div className={styles.formGrid}>
        <label><span>SKU καταστήματος</span><input value={vendorSku} onChange={(e) => setVendorSku(e.target.value)} /></label>
        <label><span>Τιμή λιανικής (€)</span><input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></label>
        <label><span>Stock τώρα</span><input value={stock} onChange={(e) => setStock(e.target.value)} inputMode="numeric" /></label>
        <label><span>Safety stock</span><input value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} inputMode="numeric" /></label>
      </div>
      {selected.listed && <div className={styles.stockStatus}>Διαθέσιμα για πώληση τώρα: <strong>{selected.listed.availableToSell}</strong> · Offer: {selected.listed.offerStatus}</div>}
      <div className={styles.switches}>
        <label><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /><span>Δημοσίευση στο Shop</span></label>
        <label><input type="checkbox" checked={advice} onChange={(e) => setAdvice(e.target.checked)} /><span>Διαθέσιμο για συμβουλή</span></label>
      </div>
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => setSelected(null)}>Πίσω</button><button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Αποθήκευση…" : selected.listed ? "Ενημέρωση προϊόντος" : "Προσθήκη & δημοσίευση"}</button></div>
    </section>}
  </div>;
}
