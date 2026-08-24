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
  categoryCode: string;
  categoryPath: string;
  active: boolean;
  listed?: Listed;
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

const EMPTY_DRAFT: Draft = { title: "", description: "", gtin: "", brand: "", model: "", mpn: "", categoryCode: "", vendorSku: "", price: "0.00", onHand: "0", safetyStock: "0", visible: true };

function barcodeValue(value: string): string | undefined {
  const compact = value.replace(/[\s-]/g, "");
  const digits = compact.replace(/\D/g, "");
  return compact === digits && digits.length >= 6 ? digits : undefined;
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

export function AdminQuickAddWorkbench({ vendors, categories, csrfToken }: { vendors: readonly Vendor[]; categories: readonly Category[]; csrfToken: string }) {
  const [vendorId, setVendorId] = useState("");
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [matches, setMatches] = useState<readonly Match[]>([]);
  const [selected, setSelected] = useState<Match | null>(null);
  const [mode, setMode] = useState<"idle" | "existing" | "create">("idle");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerFrameRef = useRef<number | null>(null);

  function patchDraft(patch: Partial<Draft>) { setDraft((current) => ({ ...current, ...patch })); }

  function stopScanner() {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    scannerFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  useEffect(() => () => {
    if (scannerFrameRef.current !== null) cancelAnimationFrame(scannerFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function choose(match: Match) {
    setSelected(match);
    setDraft(draftFromMatch(match));
    setMode("existing");
    setNotice(null);
  }

  function resetResult() {
    setSearchedQuery(null);
    setMatches([]);
    setSelected(null);
    setMode("idle");
    setDraft(EMPTY_DRAFT);
  }

  async function lookup(raw = query, preferredId?: string) {
    const value = raw.trim();
    if (!vendorId) { setNotice({ tone: "error", text: "Επίλεξε πρώτα το κατάστημα στο οποίο θα ανατεθεί το προϊόν." }); return; }
    if (value.length < 3) { setNotice({ tone: "error", text: "Γράψε τουλάχιστον 3 χαρακτήρες ή σκάναρε ολόκληρο barcode." }); return; }
    setBusy("lookup");
    setNotice(null);
    setSearchedQuery(null);
    setMatches([]);
    setSelected(null);
    setMode("idle");
    try {
      const barcode = barcodeValue(value);
      const params = new URLSearchParams({ vendorId, ...(barcode ? { gtin: barcode } : { q: value }) });
      const response = await fetch(`/api/admin/quickadd?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { matches?: Match[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η αναζήτηση απέτυχε.");
      const found = payload.matches ?? [];
      setSearchedQuery(value);
      setMatches(found);
      const preferred = preferredId ? found.find((item) => item.id === preferredId) : undefined;
      if (preferred) choose(preferred);
      else if (found.length === 1) choose(found[0]);
      else if (found.length === 0) setNotice({ tone: "info", text: "Δεν βρέθηκε canonical προϊόν. Έλεγξε τον κωδικό και δημιούργησε νέο μόνο αν είναι πράγματι διαφορετικό προϊόν." });
    } catch (error) {
      setSearchedQuery(null);
      setMatches([]);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Η αναζήτηση απέτυχε." });
    } finally { setBusy(null); }
  }

  function beginCreate() {
    const barcode = barcodeValue(query.trim());
    setSelected(null);
    setDraft({ ...EMPTY_DRAFT, gtin: barcode ?? "", title: barcode ? "" : query.trim() });
    setMode("create");
    setNotice(null);
  }

  async function startScanner() {
    if (!vendorId) { setNotice({ tone: "error", text: "Επίλεξε πρώτα κατάστημα και μετά άνοιξε την κάμερα." }); return; }
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
    if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) {
      setNotice({ tone: "error", text: "Ο browser δεν υποστηρίζει αυτόματο barcode scan. Πληκτρολόγησε ή επικόλλησε τον κωδικό." });
      return;
    }
    try {
      setNotice(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setScanning(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const video = videoRef.current;
      if (!video) throw new Error("Η προεπισκόπηση κάμερας δεν είναι διαθέσιμη.");
      video.srcObject = stream;
      await video.play();
      const detector = new DetectorClass({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes.find((item) => item.rawValue)?.rawValue?.trim();
          if (raw) {
            setQuery(raw);
            stopScanner();
            await lookup(raw);
            return;
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

  async function save() {
    if (!vendorId) { setNotice({ tone: "error", text: "Επίλεξε κατάστημα." }); return; }
    const title = draft.title.trim();
    const categoryCode = draft.categoryCode.trim();
    const euros = Number(draft.price.replace(",", "."));
    const onHand = Number(draft.onHand);
    const safetyStock = Number(draft.safetyStock);
    if (!title || !categoryCode) { setNotice({ tone: "error", text: "Τίτλος και κατηγορία είναι υποχρεωτικά." }); return; }
    if (!Number.isFinite(euros) || euros < 0 || !Number.isInteger(onHand) || onHand < 0 || !Number.isInteger(safetyStock) || safetyStock < 0 || safetyStock > onHand) {
      setNotice({ tone: "error", text: "Έλεγξε τιμή, stock και safety stock. Το safety stock δεν μπορεί να υπερβαίνει το stock." }); return;
    }
    if (draft.visible && euros <= 0) { setNotice({ tone: "error", text: "Για δημόσια εμφάνιση χρειάζεται τιμή μεγαλύτερη από €0. Κλείσε τη δημοσίευση αν θέλεις να το προετοιμάσεις ως κρυφό." }); return; }
    setBusy("save");
    setNotice(null);
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
      const payload = await response.json() as { error?: string; canonicalVariantId?: string; createdCanonical?: boolean; reusedExactGtin?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Η αποθήκευση απέτυχε.");
      const identity = draft.gtin.trim() || title;
      if (payload.canonicalVariantId) await lookup(identity, payload.canonicalVariantId);
      setNotice({
        tone: "success",
        text: payload.reusedExactGtin
          ? "Βρέθηκε ίδιο GTIN: επαναχρησιμοποιήθηκε το canonical και ενημερώθηκε το vendor offer."
          : payload.createdCanonical
            ? "Το canonical προϊόν δημιουργήθηκε και ανατέθηκε στο κατάστημα."
            : "Το canonical προϊόν και το vendor offer ενημερώθηκαν επιτυχώς."
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Η αποθήκευση απέτυχε." });
    } finally { setBusy(null); }
  }

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId);
  const editorOpen = mode === "existing" || mode === "create";

  return <div className={styles.workbench}>
    <section className={styles.setupCard}>
      <label className={styles.vendorField}>
        <span>1 · Κατάστημα</span>
        <select value={vendorId} onChange={(event) => { setVendorId(event.target.value); resetResult(); setNotice(null); }}>
          <option value="">Επίλεξε vendor shop…</option>
          {vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name} · {vendor.status}</option>)}
        </select>
      </label>
      {selectedVendor && <div className={styles.vendorStatus}><span>Selected shop</span><strong>{selectedVendor.name}</strong><small>{selectedVendor.status} · {selectedVendor.id}</small></div>}
    </section>

    <section className={styles.searchCard}>
      <div className={styles.cardHeading}><div><span>2 · Product identity</span><h2>Σκάναρε ή αναζήτησε πρώτα</h2></div><b>Duplicate-safe</b></div>
      <div className={styles.searchRow}>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setSearchedQuery(null); setMatches([]); }} onKeyDown={(event) => { if (event.key === "Enter") void lookup(); }} placeholder="GTIN / EAN / τίτλος / model / MPN" aria-label="Αναζήτηση canonical προϊόντος" inputMode="search" autoComplete="off" />
        <button className={styles.primaryButton} type="button" onClick={() => void lookup()} disabled={busy !== null}>{busy === "lookup" ? "Αναζήτηση…" : "Αναζήτηση"}</button>
        <button className={styles.secondaryButton} type="button" onClick={() => scanning ? stopScanner() : void startScanner()} disabled={busy === "save"}>{scanning ? "Κλείσιμο" : "▣ Scan"}</button>
      </div>
      {scanning && <div className={styles.scanner}><video ref={videoRef} playsInline muted /><div /><span>Κράτησε το barcode μέσα στο πλαίσιο</span></div>}
    </section>

    {notice && <div className={`${styles.notice} ${styles[notice.tone]}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}

    {mode === "idle" && matches.length > 0 && <section className={styles.resultsCard}>
      <div className={styles.cardHeading}><div><span>Canonical catalogue</span><h2>{matches.length} αποτελέσματα</h2></div></div>
      <div className={styles.results}>{matches.map((match) => <button type="button" className={styles.result} key={match.id} onClick={() => choose(match)}>
        <span><strong>{match.title}</strong><small>{[match.brand, match.model, match.mpn, match.gtin].filter(Boolean).join(" · ") || "Χωρίς πρόσθετο identifier"}</small><small>{match.categoryPath}</small></span>
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

      {mode === "existing" && <div className={styles.identityNote}>Το canonical identity προστατεύεται: GTIN, brand και category εμφανίζονται εδώ αλλά δεν αλλάζουν από γρήγορη ενημέρωση. Τίτλος, περιγραφή, model, MPN και vendor offer μπορούν να ενημερωθούν.</div>}

      <div className={styles.formSection}>
        <h3>Canonical στοιχεία</h3>
        <div className={styles.formGrid}>
          <label className={styles.wide}><span>Τίτλος *</span><input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} /></label>
          <label className={styles.wide}><span>Περιγραφή</span><textarea value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} rows={4} /></label>
          <label><span>GTIN / EAN</span><input value={draft.gtin} onChange={(event) => patchDraft({ gtin: event.target.value })} inputMode="numeric" disabled={mode === "existing"} /></label>
          <label><span>Brand</span><input value={draft.brand} onChange={(event) => patchDraft({ brand: event.target.value })} disabled={mode === "existing"} /></label>
          <label><span>Model</span><input value={draft.model} onChange={(event) => patchDraft({ model: event.target.value })} /></label>
          <label><span>MPN</span><input value={draft.mpn} onChange={(event) => patchDraft({ mpn: event.target.value })} /></label>
          <label className={styles.wide}><span>Κατηγορία *</span><select value={draft.categoryCode} onChange={(event) => patchDraft({ categoryCode: event.target.value })} disabled={mode === "existing"}><option value="">Επίλεξε assignable category…</option>{categories.map((category) => <option value={category.code} key={category.code}>{category.path}</option>)}</select></label>
        </div>
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
        <button type="button" className={styles.secondaryButton} onClick={() => { setMode("idle"); setSelected(null); }} disabled={busy !== null}>Πίσω στα αποτελέσματα</button>
        <button type="button" className={styles.primaryButton} onClick={() => void save()} disabled={busy !== null}>{busy === "save" ? "Αποθήκευση…" : mode === "create" ? "Δημιουργία canonical & ανάθεση" : selected?.listed ? "Ενημέρωση προϊόντος & stock" : "Ανάθεση στο κατάστημα"}</button>
      </div>
    </section>}
  </div>;
}
