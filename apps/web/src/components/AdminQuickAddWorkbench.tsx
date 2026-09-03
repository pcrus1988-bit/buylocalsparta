"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AdminQuickAddWorkbench.module.css";

type Vendor = Readonly<{ id: string; name: string; status: string }>;
type Category = Readonly<{ code: string; name: string; path: string }>;
type Listed = Readonly<{ offerId: string; vendorSku?: string; priceMinor: number; onHand: number; safetyStock: number; visible: boolean; status: string }>;
type Match = Readonly<{
  id: string;
  title: string;
  description?: string;
  gtin?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  imageUrl?: string;
  categoryCode: string;
  categoryPath: string;
  active: boolean;
  listed?: Listed;
}>;
type IcecatPreview = Readonly<{
  gtin: string;
  found: boolean;
  status: string;
  productId?: string;
  sourceProductId?: string;
  title?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  imageUrl?: string;
  categoryLabel?: string;
  qualityStatus?: string;
  greekCompleteness?: number;
  specifications: readonly Readonly<{ name: string; value: string }>[];
}>;
type Draft = {
  title: string;
  description: string;
  gtin: string;
  brand: string;
  model: string;
  mpn: string;
  categoryCode: string;
  vendorSku: string;
  price: string;
  onHand: string;
  safetyStock: string;
  visible: boolean;
};
type Notice = Readonly<{ tone: "success" | "error" | "info"; text: string }>;
type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;
type PendingPhoto = Readonly<{ file: File; previewUrl: string }>;
type ScanTarget = "lookup" | "ean";

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  gtin: "",
  brand: "",
  model: "",
  mpn: "",
  categoryCode: "",
  vendorSku: "",
  price: "0.00",
  onHand: "0",
  safetyStock: "0",
  visible: true
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function barcodeValue(value: string): string | undefined {
  const compact = value.replace(/[\s-]/g, "");
  const digits = compact.replace(/\D/g, "");
  return compact === digits && digits.length >= 6 ? digits : undefined;
}

function eanValue(value: string): string | undefined {
  const digits = value.replace(/\D/g, "");
  return [8, 12, 13, 14].includes(digits.length) ? digits : undefined;
}

function draftFromMatch(match: Match): Draft {
  return {
    title: match.title,
    description: match.description ?? "",
    gtin: match.gtin ?? "",
    brand: match.brand ?? "",
    model: match.model ?? "",
    mpn: match.mpn ?? "",
    categoryCode: match.categoryCode,
    vendorSku: match.listed?.vendorSku ?? "",
    price: ((match.listed?.priceMinor ?? 0) / 100).toFixed(2),
    onHand: String(match.listed?.onHand ?? 0),
    safetyStock: String(match.listed?.safetyStock ?? 0),
    visible: match.listed?.visible ?? true
  };
}

function draftWithIcecat(current: Draft, preview: IcecatPreview, existingCanonical: boolean): Draft {
  return {
    title: preview.title ?? current.title,
    description: preview.description ?? current.description,
    gtin: existingCanonical && current.gtin ? current.gtin : preview.gtin || current.gtin,
    brand: existingCanonical ? current.brand : preview.brand ?? current.brand,
    model: preview.model ?? current.model,
    mpn: preview.mpn ?? current.mpn,
    categoryCode: current.categoryCode,
    // Icecat is catalogue evidence only. These vendor/commercial fields are deliberately preserved.
    vendorSku: current.vendorSku,
    price: current.price,
    onHand: current.onHand,
    safetyStock: current.safetyStock,
    visible: current.visible
  };
}

function icecatQuality(preview: IcecatPreview): string | undefined {
  if (preview.greekCompleteness === undefined) return preview.qualityStatus;
  const percentage = preview.greekCompleteness <= 1 ? preview.greekCompleteness * 100 : preview.greekCompleteness;
  return `${preview.qualityStatus ?? "quality"} · ${Math.round(percentage)}% EL`;
}

export function AdminQuickAddWorkbench({ vendors, categories, csrfToken }: { vendors: readonly Vendor[]; categories: readonly Category[]; csrfToken: string }) {
  const [vendorId, setVendorId] = useState("");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [matches, setMatches] = useState<readonly Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [mode, setMode] = useState<"idle" | "existing" | "create">("idle");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [icecat, setIcecat] = useState<IcecatPreview | null>(null);
  const [icecatBusy, setIcecatBusy] = useState(false);
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [photos, setPhotos] = useState<readonly PendingPhoto[]>([]);
  const [photoRightsConfirmed, setPhotoRightsConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);
  const photosRef = useRef<readonly PendingPhoto[]>([]);

  function patchDraft(patch: Partial<Draft>) { setDraft((current) => ({ ...current, ...patch })); }

  function clearPhotos() {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    photosRef.current = [];
    setPhotos([]);
    setPhotoRightsConfirmed(false);
  }

  function queuePhotos(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files)
      .filter((file) => IMAGE_TYPES.has(file.type))
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    if (!incoming.length) {
      setNotice({ tone: "error", text: "Οι φωτογραφίες πρέπει να είναι JPEG, PNG ή WebP." });
      return;
    }
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
      if (!next.length) setPhotoRightsConfirmed(false);
      return next;
    });
  }

  function stopScanner() {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    scannerFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanTarget(null);
  }

  useEffect(() => () => {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

  function choose(match: Match) {
    clearPhotos();
    setSelected(match);
    setDraft(draftFromMatch(match));
    setMode("existing");
    setNotice(null);
  }

  function resetResult() {
    clearPhotos();
    setSearchedQuery(null);
    setMatches([]);
    setSelected(null);
    setMode("idle");
    setDraft(EMPTY_DRAFT);
    setIcecat(null);
  }

  async function loadIcecat(raw: string) {
    const ean = eanValue(raw);
    if (!ean) {
      setIcecat(null);
      setNotice({ tone: "error", text: "Για Icecat lookup χρειάζεται έγκυρο μήκος EAN / GTIN (8, 12, 13 ή 14 ψηφία)." });
      return;
    }
    setIcecatBusy(true);
    try {
      const params = new URLSearchParams({ icecatGtin: ean });
      const response = await fetch(`/api/admin/quickadd?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { icecat?: IcecatPreview; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Το Icecat lookup απέτυχε.");
      setIcecat(payload.icecat ?? null);
      if (payload.icecat?.found) {
        setNotice({ tone: "info", text: payload.icecat.title ? "Βρέθηκαν Icecat στοιχεία. Έλεγξέ τα και πάτησε Apply Icecat data για να τα εφαρμόσεις." : `Το EAN υπάρχει στο Icecat index, αλλά τα detail στοιχεία δεν είναι ακόμη έτοιμα (${payload.icecat.status}).` });
      } else {
        setNotice({ tone: "info", text: payload.icecat?.status === "invalid_gtin" ? "Το GTIN δεν περνά τον έλεγχο checksum." : "Δεν βρέθηκαν διαθέσιμα Icecat στοιχεία για αυτό το EAN / GTIN." });
      }
    } catch (error) {
      setIcecat(null);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Το Icecat lookup απέτυχε." });
    } finally {
      setIcecatBusy(false);
    }
  }

  async function lookup(raw = query, preferredId?: string) {
    const value = raw.trim();
    if (!vendorId) {
      setNotice({ tone: "error", text: "Επίλεξε πρώτα το κατάστημα στο οποίο θα ανατεθεί το προϊόν." });
      return;
    }
    if (value.length < 3) {
      setNotice({ tone: "error", text: "Γράψε τουλάχιστον 3 χαρακτήρες ή σκάναρε ολόκληρο barcode." });
      return;
    }
    setBusy("lookup");
    setNotice(null);
    setSearchedQuery(null);
    setMatches([]);
    setSelected(null);
    setMode("idle");
    setIcecat(null);
    try {
      const barcode = barcodeValue(value);
      const params = new URLSearchParams({ vendorId, ...(barcode ? { gtin: barcode } : { q: value }) });
      const response = await fetch(`/api/admin/quickadd?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { matches?: Match[]; icecat?: IcecatPreview; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αναζήτηση απέτυχε.");
      const found = payload.matches ?? [];
      setSearchedQuery(value);
      setMatches(found);
      setIcecat(payload.icecat ?? null);
      const preferred = preferredId ? found.find((item) => item.id === preferredId) : undefined;
      if (preferred) choose(preferred);
      else if (found.length === 1) choose(found[0]);
      else if (found.length === 0) setNotice({ tone: "info", text: payload.icecat?.found ? "Δεν βρέθηκε canonical προϊόν, αλλά υπάρχει Icecat evidence. Έλεγξέ το πριν δημιουργήσεις νέο canonical." : "Δεν βρέθηκε canonical προϊόν. Έλεγξε τον κωδικό και δημιούργησε νέο μόνο αν είναι πράγματι διαφορετικό προϊόν." });
    } catch (error) {
      setSearchedQuery(null);
      setMatches([]);
      setIcecat(null);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Η αναζήτηση απέτυχε." });
    } finally {
      setBusy(null);
    }
  }

  function beginCreate() {
    clearPhotos();
    const barcode = barcodeValue(query.trim());
    setSelected(null);
    setDraft({ ...EMPTY_DRAFT, gtin: barcode ?? "", title: barcode ? "" : query.trim() });
    setMode("create");
    setNotice(null);
  }

  function applyIcecatData() {
    if (!icecat?.found || !icecat.title) return;
    if (mode === "idle" && matches.length > 0) {
      setNotice({ tone: "info", text: "Επίλεξε πρώτα το σωστό canonical αποτέλεσμα. Το Icecat δεν δημιουργεί νέο canonical όταν υπάρχουν πιθανά matches." });
      return;
    }
    if (mode === "idle") {
      clearPhotos();
      const base = { ...EMPTY_DRAFT, gtin: icecat.gtin };
      setSelected(null);
      setDraft(draftWithIcecat(base, icecat, false));
      setMode("create");
    } else {
      setDraft((current) => draftWithIcecat(current, icecat, mode === "existing"));
    }
    setNotice({ tone: "success", text: "Τα διαθέσιμα Icecat catalogue fields εφαρμόστηκαν. Vendor SKU, τιμή, stock, safety stock και visibility έμειναν αμετάβλητα." });
  }

  async function startScanner(target: ScanTarget) {
    if (!vendorId) {
      setNotice({ tone: "error", text: "Επίλεξε πρώτα κατάστημα και μετά άνοιξε την κάμερα." });
      return;
    }
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setNotice({ tone: "error", text: "Ο browser δεν υποστηρίζει αυτόματο barcode scan. Πληκτρολόγησε ή επικόλλησε τον κωδικό." });
      return;
    }
    try {
      setNotice(null);
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
                patchDraft({ gtin: ean });
                stopScanner();
                await loadIcecat(ean);
                return;
              }
            } else {
              setQuery(raw);
              stopScanner();
              await lookup(raw);
              return;
            }
          }
        } catch { /* Continue scanning until a readable code is available. */ }
        scannerFrameRef.current = requestAnimationFrame(() => void scan());
      };
      void scan();
    } catch (error) {
      stopScanner();
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Δεν ήταν δυνατή η πρόσβαση στην κάμερα." });
    }
  }

  async function uploadAdminPhotos(canonicalVariantId: string, title: string) {
    const vendor = vendors.find((item) => item.id === vendorId);
    if (!vendor) throw new Error("Δεν βρέθηκε το επιλεγμένο κατάστημα για τις φωτογραφίες.");
    let uploaded = 0;
    for (const photo of photos) {
      const intentResponse = await fetch("/api/admin/quickadd/media/intents", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          vendorId,
          canonicalVariantId,
          filename: photo.file.name,
          contentType: photo.file.type,
          byteSize: photo.file.size,
          altText: title,
          rightsOwner: vendor.name
        })
      });
      const intent = await intentResponse.json() as { error?: string; uploadUrl?: string; headers?: Record<string, string>; intentId?: string; maxBytes?: number };
      if (!intentResponse.ok || !intent.uploadUrl || !intent.intentId) throw new Error(intent.error ?? "Δεν δημιουργήθηκε ασφαλές upload για τη φωτογραφία.");
      if (intent.maxBytes && photo.file.size > intent.maxBytes) throw new Error("Μία φωτογραφία είναι μεγαλύτερη από το επιτρεπόμενο όριο.");
      const put = await fetch(intent.uploadUrl, { method: "PUT", headers: intent.headers ?? {}, body: photo.file });
      if (!put.ok) throw new Error("Η αποστολή φωτογραφίας στο ασφαλές storage απέτυχε.");
      const complete = await fetch("/api/admin/quickadd/media/complete", {
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
    if (!vendorId) {
      setNotice({ tone: "error", text: "Επίλεξε κατάστημα." });
      return;
    }
    const title = draft.title.trim();
    const categoryCode = draft.categoryCode.trim();
    const euros = Number(draft.price.replace(",", "."));
    const onHand = Number(draft.onHand);
    const safetyStock = Number(draft.safetyStock);
    if (!title || !categoryCode) {
      setNotice({ tone: "error", text: "Τίτλος και κατηγορία είναι υποχρεωτικά." });
      return;
    }
    if (!Number.isFinite(euros) || euros < 0 || !Number.isInteger(onHand) || onHand < 0 || !Number.isInteger(safetyStock) || safetyStock < 0 || safetyStock > onHand) {
      setNotice({ tone: "error", text: "Έλεγξε τιμή, stock και safety stock. Το safety stock δεν μπορεί να υπερβαίνει το stock." });
      return;
    }
    if (draft.visible && euros <= 0) {
      setNotice({ tone: "error", text: "Για δημόσια εμφάνιση χρειάζεται τιμή μεγαλύτερη από €0. Κλείσε τη δημοσίευση αν θέλεις να το προετοιμάσεις ως κρυφό." });
      return;
    }
    if (photos.length && !photoRightsConfirmed) {
      setNotice({ tone: "error", text: "Επιβεβαίωσε το δικαίωμα χρήσης πριν ανεβάσεις τις νέες φωτογραφίες." });
      return;
    }
    setBusy("save");
    setNotice(null);
    let productSaved = false;
    try {
      const response = await fetch("/api/admin/quickadd", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          vendorId,
          canonicalVariantId: mode === "existing" ? selected?.id : undefined,
          title,
          description: draft.description.trim(),
          gtin: draft.gtin.trim(),
          brand: draft.brand.trim(),
          model: draft.model.trim(),
          mpn: draft.mpn.trim(),
          categoryCode,
          vendorSku: draft.vendorSku.trim(),
          customerPriceMinor: Math.round(euros * 100),
          onHand,
          safetyStock,
          visible: draft.visible
        })
      });
      const payload = await response.json() as { error?: string; canonicalVariantId?: string; createdCanonical?: boolean; reusedExactGtin?: boolean; gtinAdded?: boolean; gtin?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση απέτυχε.");
      productSaved = true;
      let uploaded = 0;
      if (photos.length && payload.canonicalVariantId) uploaded = await uploadAdminPhotos(payload.canonicalVariantId, title);
      if (uploaded) clearPhotos();
      const identity = payload.gtin || draft.gtin.trim() || title;
      if (payload.canonicalVariantId) await lookup(identity, payload.canonicalVariantId);
      const baseMessage = payload.reusedExactGtin
        ? "Βρέθηκε ίδιο GTIN: επαναχρησιμοποιήθηκε το canonical και ενημερώθηκε το vendor offer."
        : payload.createdCanonical
          ? "Το canonical προϊόν δημιουργήθηκε και ανατέθηκε στο κατάστημα."
          : "Το canonical προϊόν και το vendor offer ενημερώθηκαν επιτυχώς.";
      setNotice({
        tone: "success",
        text: `${baseMessage}${payload.gtinAdded ? " Το EAN προστέθηκε στο canonical." : ""}${uploaded ? ` ${uploaded} νέα φωτογραφ${uploaded === 1 ? "ία ανέβηκε" : "ίες ανέβηκαν"} και μπήκε σε ασφαλή έλεγχο.` : ""}`
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Η αποθήκευση απέτυχε.";
      setNotice({ tone: "error", text: productSaved ? `Το προϊόν αποθηκεύτηκε, αλλά η αποστολή φωτογραφιών δεν ολοκληρώθηκε: ${detail}` : detail });
    } finally {
      setBusy(null);
    }
  }

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
  const editorOpen = mode === "existing" || mode === "create";
  const canApplyIcecat = Boolean(icecat?.found && icecat.title && (editorOpen || matches.length === 0));
  const quality = icecat ? icecatQuality(icecat) : undefined;

  const scanner = (target: ScanTarget) => scanTarget === target && <div className={styles.scanner}>
    <video ref={videoRef} playsInline muted />
    <div />
    <span>{target === "ean" ? "Σκάναρε το EAN / GTIN της συσκευασίας" : "Κράτησε το barcode μέσα στο πλαίσιο"}</span>
  </div>;

  return <div className={styles.workbench}>
    <section className={styles.setupCard}>
      <label className={styles.vendorField}>
        <span>1 · Κατάστημα</span>
        <select value={vendorId} onChange={(event) => { stopScanner(); setVendorId(event.target.value); resetResult(); setNotice(null); }}>
          <option value="">Επίλεξε vendor shop…</option>
          {vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name} · {vendor.status}</option>)}
        </select>
      </label>
      {selectedVendor && <div className={styles.vendorStatus}><span>Selected shop</span><strong>{selectedVendor.name}</strong><small>{selectedVendor.status} · {selectedVendor.id}</small></div>}
    </section>

    <section className={styles.searchCard}>
      <div className={styles.cardHeading}><div><span>2 · Product identity</span><h2>Σκάναρε ή αναζήτησε πρώτα</h2></div><b>Duplicate-safe</b></div>
      <div className={styles.searchRow}>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setSearchedQuery(null); setMatches([]); setIcecat(null); }} onKeyDown={(event) => { if (event.key === "Enter") void lookup(); }} placeholder="GTIN / EAN / τίτλος / model / MPN" aria-label="Αναζήτηση canonical προϊόντος" inputMode="search" autoComplete="off" />
        <button className={styles.primaryButton} type="button" onClick={() => void lookup()} disabled={busy !== null}>{busy === "lookup" ? "Αναζήτηση…" : "Αναζήτηση"}</button>
        <button className={styles.secondaryButton} type="button" onClick={() => scanTarget === "lookup" ? stopScanner() : void startScanner("lookup")} disabled={busy === "save"}>{scanTarget === "lookup" ? "Κλείσιμο" : "▣ Scan"}</button>
      </div>
      {scanner("lookup")}
    </section>

    {notice && <div className={`${styles.notice} ${styles[notice.tone]}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}

    {icecat && <section className={styles.icecatCard} aria-label="Icecat product evidence">
      <div className={styles.icecatHeader}>
        <div><span>Open Icecat · governed source evidence</span><h2>{icecat.title ?? `GTIN ${icecat.gtin}`}</h2></div>
        <div className={styles.icecatBadges}><b>{icecat.status}</b>{quality && <small>{quality}</small>}</div>
      </div>
      <div className={styles.icecatBody}>
        <div className={styles.icecatImage}>{icecat.imageUrl ? <img src={icecat.imageUrl} alt="" /> : <span>Icecat image not available</span>}</div>
        <div className={styles.icecatDetails}>
          {!icecat.found && <p>Δεν υπάρχει ενεργό Open Icecat index match για αυτό το GTIN ή ο κωδικός δεν είναι έγκυρος.</p>}
          {icecat.found && <>
            <dl>
              <div><dt>GTIN</dt><dd>{icecat.gtin}</dd></div>
              {icecat.brand && <div><dt>Brand</dt><dd>{icecat.brand}</dd></div>}
              {icecat.model && <div><dt>Model</dt><dd>{icecat.model}</dd></div>}
              {icecat.mpn && <div><dt>MPN</dt><dd>{icecat.mpn}</dd></div>}
              {icecat.categoryLabel && <div><dt>Icecat category</dt><dd>{icecat.categoryLabel}</dd></div>}
            </dl>
            {icecat.description && <p>{icecat.description}</p>}
            {icecat.specifications.length > 0 && <div className={styles.icecatSpecs}>{icecat.specifications.map((specification) => <span key={`${specification.name}-${specification.value}`}><b>{specification.name}</b>{specification.value}</span>)}</div>}
          </>}
        </div>
      </div>
      <div className={styles.icecatActions}>
        <p>Apply ενημερώνει μόνο catalogue fields. Vendor SKU, τιμή, stock, safety stock και visibility δεν αλλάζουν. Η Icecat category εμφανίζεται ως evidence και δεν αντικαθιστά αυτόματα την governed KONTA ΜΟΥ category.</p>
        <button type="button" className={styles.primaryButton} onClick={applyIcecatData} disabled={!canApplyIcecat || icecatBusy}>{icecatBusy ? "Icecat lookup…" : "Apply Icecat data"}</button>
      </div>
    </section>}

    {mode === "idle" && matches.length > 0 && <section className={styles.resultsCard}>
      <div className={styles.cardHeading}><div><span>Canonical catalogue</span><h2>{matches.length} αποτελέσματα</h2></div></div>
      <div className={styles.results}>{matches.map((match) => <button type="button" className={styles.result} key={match.id} onClick={() => choose(match)}>
        <span className={styles.resultImage}>{match.imageUrl ? <img src={match.imageUrl} alt="" /> : <i>Χωρίς εικόνα</i>}</span>
        <span className={styles.resultCopy}><strong>{match.title}</strong><small>{[match.brand, match.model, match.mpn, match.gtin].filter(Boolean).join(" · ") || "Χωρίς πρόσθετο identifier"}</small><small>{match.categoryPath}</small></span>
        <span className={styles.resultMeta}><b className={match.listed ? styles.listed : styles.unlisted}>{match.listed ? "Στο κατάστημα" : "Δεν έχει ανατεθεί"}</b><small>{match.active ? "canonical active" : "canonical inactive"}</small></span>
      </button>)}</div>
      <div className={styles.newProductBar}><span>Κανένα αποτέλεσμα δεν είναι το σωστό προϊόν;</span><button type="button" className={styles.secondaryButton} onClick={beginCreate}>Δημιουργία διαφορετικού canonical</button></div>
    </section>}

    {mode === "idle" && matches.length === 0 && searchedQuery === query.trim() && query.trim().length >= 3 && vendorId && <section className={styles.emptyCard}>
      <div><strong>Νέο προϊόν;</strong><span>Δημιούργησε canonical μόνο αφού επιβεβαιώσεις ότι GTIN, model και MPN δεν αντιστοιχούν σε υπάρχον αποτέλεσμα.</span></div>
      <button type="button" className={styles.primaryButton} onClick={beginCreate}>Νέο canonical + ανάθεση</button>
    </section>}

    {editorOpen && <section className={styles.editorCard}>
      <div className={styles.cardHeading}>
        <div><span>3 · {mode === "create" ? "New canonical" : "Existing canonical"}</span><h2>{mode === "create" ? "Δημιουργία και ανάθεση" : selected?.title}</h2></div>
        <b className={selected?.listed ? styles.listed : styles.unlisted}>{selected?.listed ? "Update offer" : "Add to shop"}</b>
      </div>

      {mode === "existing" && <div className={styles.identityNote}>Το canonical identity προστατεύεται: υπάρχον GTIN, brand και category δεν αντικαθίστανται από Quick Add ή Icecat. Αν το GTIN / EAN λείπει, μπορείς να το προσθέσεις μία φορά με scan και έλεγχο checksum.</div>}

      <div className={styles.mediaSection}>
        <div className={styles.heroImage}>{selected?.imageUrl ? <img src={selected.imageUrl} alt={selected.title} /> : icecat?.imageUrl ? <img src={icecat.imageUrl} alt="Icecat preview" /> : <div><strong>Χωρίς κύρια εικόνα</strong><span>Πρόσθεσε φωτογραφία από κάμερα ή αρχείο.</span></div>}</div>
        <div className={styles.mediaControls}>
          <div><h3>Φωτογραφίες προϊόντος</h3><p>Η υπάρχουσα εικόνα εμφανίζεται αριστερά. Μπορείς να τραβήξεις ή να ανεβάσεις έως 8 επιπλέον φωτογραφίες.</p></div>
          <label className={styles.photoPicker}><span>📷 Λήψη ή προσθήκη φωτογραφιών</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => { queuePhotos(event.target.files); event.currentTarget.value = ""; }} /></label>
          {photos.length > 0 && <>
            <div className={styles.photoQueue}>{photos.map((photo, index) => <div key={`${photo.file.name}-${photo.file.lastModified}-${index}`}><img src={photo.previewUrl} alt="Προεπισκόπηση νέας φωτογραφίας" /><button type="button" onClick={() => removePhoto(index)} aria-label="Αφαίρεση φωτογραφίας">×</button></div>)}</div>
            <label className={styles.rightsCheck}><input type="checkbox" checked={photoRightsConfirmed} onChange={(event) => setPhotoRightsConfirmed(event.target.checked)} /><span>Επιβεβαιώνω ότι το επιλεγμένο κατάστημα έχει δικαίωμα χρήσης αυτών των φωτογραφιών.</span></label>
            <small>Μετά το upload οι εικόνες περνούν ασφαλή σάρωση πριν χρησιμοποιηθούν δημόσια.</small>
          </>}
        </div>
      </div>

      <div className={styles.formSection}>
        <div className={styles.formSectionHeading}><h3>Canonical στοιχεία</h3><button type="button" className={styles.secondaryButton} onClick={() => void loadIcecat(draft.gtin)} disabled={busy !== null || icecatBusy || !eanValue(draft.gtin)}>{icecatBusy ? "Icecat lookup…" : "Lookup in Icecat"}</button></div>
        <div className={styles.formGrid}>
          <label className={styles.wide}><span>Τίτλος *</span><input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} /></label>
          <label className={styles.wide}><span>Περιγραφή</span><textarea value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} rows={4} /></label>
          <label><span>GTIN / EAN</span><div className={styles.inlineField}><input value={draft.gtin} onChange={(event) => { patchDraft({ gtin: event.target.value }); if (icecat?.gtin !== eanValue(event.target.value)) setIcecat(null); }} onBlur={() => { const ean = eanValue(draft.gtin); if (ean && icecat?.gtin !== ean) void loadIcecat(ean); }} inputMode="numeric" disabled={mode === "existing" && Boolean(selected?.gtin)} />{(mode === "create" || !selected?.gtin) && <button type="button" className={styles.miniButton} onClick={() => scanTarget === "ean" ? stopScanner() : void startScanner("ean")} disabled={busy !== null || icecatBusy}>{scanTarget === "ean" ? "Κλείσιμο" : "▣ Scan EAN"}</button>}</div></label>
          <label><span>Brand</span><input value={draft.brand} onChange={(event) => patchDraft({ brand: event.target.value })} disabled={mode === "existing"} /></label>
          <label><span>Model</span><input value={draft.model} onChange={(event) => patchDraft({ model: event.target.value })} /></label>
          <label><span>MPN</span><input value={draft.mpn} onChange={(event) => patchDraft({ mpn: event.target.value })} /></label>
          <label className={styles.wide}><span>Κατηγορία *</span><select value={draft.categoryCode} onChange={(event) => patchDraft({ categoryCode: event.target.value })} disabled={mode === "existing"}><option value="">Επίλεξε assignable category…</option>{categories.map((category) => <option value={category.code} key={category.code}>{category.path}</option>)}</select></label>
        </div>
        {scanner("ean")}
      </div>

      <div className={styles.formSection}>
        <h3>Vendor offer & απόθεμα</h3>
        <div className={styles.formGrid}>
          <label><span>Vendor SKU</span><input value={draft.vendorSku} onChange={(event) => patchDraft({ vendorSku: event.target.value })} /></label>
          <label><span>Τιμή λιανικής (€)</span><input value={draft.price} onChange={(event) => patchDraft({ price: event.target.value })} inputMode="decimal" /></label>
          <label><span>Stock τώρα</span><input value={draft.onHand} onChange={(event) => patchDraft({ onHand: event.target.value })} inputMode="numeric" /></label>
          <label><span>Safety stock</span><input value={draft.safetyStock} onChange={(event) => patchDraft({ safetyStock: event.target.value })} inputMode="numeric" /></label>
        </div>
        <label className={styles.publishSwitch}><input type="checkbox" checked={draft.visible} onChange={(event) => patchDraft({ visible: event.target.checked })} /><span><strong>Δημοσίευση στο vendor shop</strong><small>Σε inactive/demo vendor το offer προετοιμάζεται, αλλά το κατάστημα παραμένει εκτός δημόσιας αγοράς μέχρι την ενεργοποίησή του.</small></span></label>
      </div>

      {selected?.listed && <div className={styles.currentOffer}><span>Current offer</span><strong>{selected.listed.status} · stock {selected.listed.onHand} · €{(selected.listed.priceMinor / 100).toFixed(2)}</strong><small>{selected.listed.offerId}</small></div>}

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={() => { stopScanner(); clearPhotos(); setMode("idle"); setSelected(null); }} disabled={busy !== null}>Πίσω στα αποτελέσματα</button>
        <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={busy !== null || icecatBusy}>{busy === "save" ? "Αποθήκευση…" : mode === "create" ? "Δημιουργία canonical & ανάθεση" : selected?.listed ? "Ενημέρωση προϊόντος & stock" : "Ανάθεση στο κατάστημα"}</button>
      </div>
    </section>}
  </div>;
}
