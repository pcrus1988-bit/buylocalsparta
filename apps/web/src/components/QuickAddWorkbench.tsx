"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./QuickAddWorkbench.module.css";

type Listed = {
  offerId: string; canonicalVariantId: string; title: string; vendorSku?: string; gtin?: string; brand?: string;
  categoryPath: string; retailPriceMinor: number; onHand: number; safetyStock: number; availableToSell: number;
  offerStatus: string; productVisible: boolean; effectiveVisible: boolean;
};
type Match = {
  canonicalVariantId: string; title: string; gtin?: string; description?: string; brand?: string; model?: string; mpn?: string; imageUrl?: string;
  categoryCode: string; categoryName: string; categoryPath: string; specifications: Record<string, unknown>;
  variantAttributes: Record<string, unknown>; score: number; listed?: Listed;
};
type LookupPayload = { matches?: Match[]; csrfToken?: string; error?: string };
type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;
type PendingPhoto = Readonly<{ file: File; previewUrl: string }>;
type ScanTarget = "lookup" | "ean";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function eanValue(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : undefined;
}

export function QuickAddWorkbench({ csrfToken }: { csrfToken: string }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [vendorSku, setVendorSku] = useState("");
  const [price, setPrice] = useState("0.00");
  const [stock, setStock] = useState("0");
  const [safetyStock, setSafetyStock] = useState("0");
  const [visible, setVisible] = useState(true);
  const [advice, setAdvice] = useState(true);
  const [gtinDraft, setGtinDraft] = useState("");
  const [photos, setPhotos] = useState<readonly PendingPhoto[]>([]);
  const [rightsOwner, setRightsOwner] = useState("");
  const [photoRightsConfirmed, setPhotoRightsConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const photosRef = useRef<readonly PendingPhoto[]>([]);

  function clearPhotos() {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    photosRef.current = [];
    setPhotos([]);
    setRightsOwner("");
    setPhotoRightsConfirmed(false);
  }

  function queuePhotos(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files).filter((file) => IMAGE_TYPES.has(file.type)).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    if (!incoming.length) { setMessage("Οι φωτογραφίες πρέπει να είναι JPEG, PNG ή WebP."); return; }
    setPhotos((current) => {
      const combined = [...current, ...incoming];
      const next = combined.slice(0, 8);
      combined.slice(8).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      photosRef.current = next;
      return next;
    });
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const removed = current[index];
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      photosRef.current = next;
      if (!next.length) { setRightsOwner(""); setPhotoRightsConfirmed(false); }
      return next;
    });
  }

  function pick(match: Match) {
    clearPhotos();
    setSelected(match);
    setVendorSku(match.listed?.vendorSku ?? "");
    setPrice(((match.listed?.retailPriceMinor ?? 0) / 100).toFixed(2));
    setStock(String(match.listed?.onHand ?? 0));
    setSafetyStock(String(match.listed?.safetyStock ?? 0));
    setVisible(match.listed?.productVisible ?? true);
    setAdvice(true);
    setGtinDraft(match.gtin ?? "");
    setMessage("");
  }

  async function lookup(raw = query, preferredId?: string) {
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
      const preferred = preferredId ? found.find((match) => match.canonicalVariantId === preferredId) : undefined;
      if (preferred) pick(preferred);
      else if (found.length === 1) pick(found[0]);
      if (!found.length) setMessage("Δεν βρέθηκε canonical προϊόν. Ζήτησε από Admin Quick Add να το δημιουργήσει.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Η αναζήτηση απέτυχε."); }
    finally { setBusy(false); }
  }

  function stopScanner() {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    scannerFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanTarget(null);
  }

  async function startScanner(target: ScanTarget) {
    setMessage("");
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Ο browser δεν υποστηρίζει αυτόματο barcode scan. Πληκτρολόγησε/επικόλλησε τον κωδικό στο πεδίο.");
      return;
    }
    try {
      setScanTarget(target);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("Η προεπισκόπηση κάμερας δεν είναι διαθέσιμη.");
      video.srcObject = stream;
      await video.play();
      video.scrollIntoView({ behavior: "smooth", block: "center" });
      const detector = new DetectorClass({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes.find((item) => item.rawValue)?.rawValue?.trim();
          if (raw) {
            if (target === "ean") {
              const ean = eanValue(raw);
              if (ean) {
                setGtinDraft(ean);
                stopScanner();
                setMessage(`EAN / GTIN ${ean} σαρώθηκε. Θα προστεθεί όταν αποθηκεύσεις το προϊόν.`);
                return;
              }
            } else {
              setQuery(raw);
              stopScanner();
              await lookup(raw);
              return;
            }
          }
        } catch { /* keep scanning */ }
        scannerFrameRef.current = requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch { setMessage("Δεν ήταν δυνατή η πρόσβαση στην κάμερα. Έλεγξε την άδεια κάμερας του browser."); stopScanner(); }
  }

  useEffect(() => () => {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  async function uploadPhotos(canonicalVariantId: string, title: string) {
    let uploaded = 0;
    for (const photo of photos) {
      const intentResponse = await fetch("/api/vendor/media/intents", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ canonicalVariantId, kind: "image", filename: photo.file.name, contentType: photo.file.type, byteSize: photo.file.size, altText: title, rightsOwner: rightsOwner.trim() })
      });
      const intent = await intentResponse.json() as { error?: string; uploadUrl?: string; headers?: Record<string, string>; intentId?: string; maxBytes?: number };
      if (!intentResponse.ok || !intent.uploadUrl || !intent.intentId) throw new Error(intent.error ?? "Δεν δημιουργήθηκε ασφαλές upload για τη φωτογραφία.");
      if (intent.maxBytes && photo.file.size > intent.maxBytes) throw new Error("Μία φωτογραφία είναι μεγαλύτερη από το επιτρεπόμενο όριο.");
      const put = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.headers ?? {}, body: photo.file });
      if (!put.ok) throw new Error("Η αποστολή φωτογραφίας στο ασφαλές storage απέτυχε.");
      const complete = await fetch("/api/vendor/media/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ intentId: intent.intentId })
      });
      const result = await complete.json() as { error?: string };
      if (!complete.ok) throw new Error(result.error ?? "Η ολοκλήρωση της φωτογραφίας απέτυχε.");
      uploaded += 1;
    }
    return uploaded;
  }

  async function save() {
    if (!selected) return;
    const euros = Number(price.replace(",", "."));
    const onHand = Number(stock), safety = Number(safetyStock);
    if (!Number.isFinite(euros) || euros < 0 || !Number.isInteger(onHand) || onHand < 0 || !Number.isInteger(safety) || safety < 0 || safety > onHand) {
      setMessage("Έλεγξε τιμή και ποσότητες."); return;
    }
    if (!selected.gtin && gtinDraft && !eanValue(gtinDraft)) { setMessage("Το EAN / GTIN πρέπει να έχει 8, 12, 13 ή 14 ψηφία."); return; }
    if (photos.length && (!rightsOwner.trim() || !photoRightsConfirmed)) { setMessage("Για τις νέες φωτογραφίες γράψε τον δικαιούχο και επιβεβαίωσε ότι έχεις δικαίωμα χρήσης."); return; }
    setBusy(true); setMessage("");
    let productSaved = false;
    try {
      const response = await fetch("/api/daily/quickadd", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ canonicalVariantId: selected.canonicalVariantId, gtin: selected.gtin ? undefined : gtinDraft.trim(), vendorSku, customerPriceMinor: Math.round(euros * 100), onHand, safetyStock: safety, visible, adviceAvailable: advice })
      });
      const payload = await response.json() as { error?: string; canonicalVariantId?: string; gtin?: string; gtinAdded?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση απέτυχε.");
      productSaved = true;
      let uploaded = 0;
      if (photos.length) uploaded = await uploadPhotos(payload.canonicalVariantId ?? selected.canonicalVariantId, selected.title);
      if (uploaded) clearPhotos();
      await lookup(payload.gtin || selected.gtin || gtinDraft || selected.title, payload.canonicalVariantId ?? selected.canonicalVariantId);
      setMessage(`${visible ? "Αποθηκεύτηκε και δημοσιεύτηκε στο κατάστημα." : "Αποθηκεύτηκε ως κρυφό προϊόν."}${payload.gtinAdded ? " Το νέο EAN προστέθηκε στο canonical." : ""}${uploaded ? ` ${uploaded} φωτογραφ${uploaded === 1 ? "ία στάλθηκε" : "ίες στάλθηκαν"} για ασφαλή έλεγχο.` : ""}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.";
      setMessage(productSaved ? `Το προϊόν αποθηκεύτηκε, αλλά οι φωτογραφίες δεν ολοκληρώθηκαν: ${detail}` : detail);
    }
    finally { setBusy(false); }
  }

  const scanner = (target: ScanTarget) => scanTarget === target && <div className={styles.scanner}><video ref={videoRef} playsInline muted /><div className={styles.scanLine} /><span>{target === "ean" ? "Σκάναρε το EAN / GTIN της συσκευασίας" : "Κράτησε το barcode μέσα στο πλαίσιο"}</span></div>;

  return <div className={styles.workbench}>
    <section className={styles.searchCard}>
      <div><span className={styles.eyebrow}>Item Research · Stock Check</span><h1>Quick Product</h1><p>Σκάναρε barcode ή αναζήτησε τίτλο / μοντέλο. Θα δεις αμέσως canonical στοιχεία, φωτογραφία και αν υπάρχει ήδη στο κατάστημά σου.</p></div>
      <div className={styles.searchRow}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void lookup(); }} placeholder="GTIN / EAN / τίτλος / μοντέλο" inputMode="search" autoComplete="off" />
        <button type="button" onClick={() => void lookup()} disabled={busy}>Αναζήτηση</button>
        <button type="button" className={styles.scanButton} onClick={() => scanTarget === "lookup" ? stopScanner() : void startScanner("lookup")}>{scanTarget === "lookup" ? "Κλείσιμο" : "▣ Scan"}</button>
      </div>
      {scanner("lookup")}
    </section>

    {message && <div className={styles.message}>{message}</div>}

    {!selected && matches.length > 0 && <section className={styles.results}><h2>Αποτελέσματα</h2>{matches.map((match) => <button type="button" className={styles.result} key={match.canonicalVariantId} onClick={() => pick(match)}>
      <span className={styles.resultImage}>{match.imageUrl ? <img src={match.imageUrl} alt="" /> : <i>Χωρίς εικόνα</i>}</span>
      <span className={styles.resultCopy}><strong>{match.title}</strong><small>{[match.brand, match.model, match.gtin].filter(Boolean).join(" · ")}</small><small>{match.categoryPath}</small></span>
      <b className={match.listed ? styles.inShop : styles.notInShop}>{match.listed ? "Στο κατάστημα" : "Δεν έχει προστεθεί"}</b>
    </button>)}</section>}

    {selected && <section className={styles.editor}>
      <div className={styles.identity}>
        <div><span className={styles.eyebrow}>Canonical product</span><h2>{selected.title}</h2><p>{selected.description || "Δεν υπάρχει ακόμη canonical περιγραφή."}</p></div>
        <span className={selected.listed ? styles.inShop : styles.notInShop}>{selected.listed ? "Ήδη στο Shop" : "Νέο για το Shop"}</span>
      </div>

      <div className={styles.mediaSection}>
        <div className={styles.heroImage}>{selected.imageUrl ? <img src={selected.imageUrl} alt={selected.title} /> : <div><strong>Χωρίς κύρια εικόνα</strong><span>Μπορείς να προσθέσεις φωτογραφίες τώρα.</span></div>}</div>
        <div className={styles.mediaControls}>
          <div><h3>Φωτογραφίες προϊόντος</h3><p>Τράβηξε φωτογραφία με την κάμερα ή επίλεξε έως 8 επιπλέον εικόνες.</p></div>
          <label className={styles.photoPicker}><span>📷 Λήψη ή προσθήκη φωτογραφιών</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => { queuePhotos(event.target.files); event.currentTarget.value = ""; }} /></label>
          {photos.length > 0 && <>
            <div className={styles.photoQueue}>{photos.map((photo, index) => <div key={`${photo.file.name}-${photo.file.lastModified}-${index}`}><img src={photo.previewUrl} alt="Προεπισκόπηση νέας φωτογραφίας" /><button type="button" onClick={() => removePhoto(index)} aria-label="Αφαίρεση φωτογραφίας">×</button></div>)}</div>
            <label className={styles.rightsOwner}><span>Δικαιούχος / πηγή δικαιώματος</span><input value={rightsOwner} onChange={(event) => setRightsOwner(event.target.value)} placeholder="π.χ. το κατάστημά μου / προμηθευτής" /></label>
            <label className={styles.rightsCheck}><input type="checkbox" checked={photoRightsConfirmed} onChange={(event) => setPhotoRightsConfirmed(event.target.checked)} /><span>Επιβεβαιώνω ότι έχω δικαίωμα να χρησιμοποιήσω αυτές τις φωτογραφίες.</span></label>
            <small>Οι νέες εικόνες περνούν ασφαλή σάρωση και έλεγχο πριν εμφανιστούν δημόσια.</small>
          </>}
        </div>
      </div>

      <div className={styles.facts}>
        <div className={styles.gtinFact}><span>GTIN / EAN</span>{selected.gtin ? <strong>{selected.gtin}</strong> : <><div className={styles.eanRow}><input value={gtinDraft} onChange={(event) => setGtinDraft(event.target.value)} inputMode="numeric" placeholder="Λείπει — σκάναρέ το" /><button type="button" onClick={() => scanTarget === "ean" ? stopScanner() : void startScanner("ean")}>{scanTarget === "ean" ? "Κλείσιμο" : "▣ Scan EAN"}</button></div><small>Το EAN θα προστεθεί μόνο αν περάσει checksum και δεν ανήκει σε άλλο canonical.</small></>}</div>
        <div><span>Brand</span><strong>{selected.brand ?? "—"}</strong></div>
        <div><span>Model / MPN</span><strong>{[selected.model, selected.mpn].filter(Boolean).join(" / ") || "—"}</strong></div><div><span>Category</span><strong>{selected.categoryPath}</strong></div>
      </div>
      {scanner("ean")}
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
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => { stopScanner(); clearPhotos(); setSelected(null); }}>Πίσω</button><button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Αποθήκευση…" : selected.listed ? "Ενημέρωση προϊόντος" : "Προσθήκη & δημοσίευση"}</button></div>
    </section>}
  </div>;
}
