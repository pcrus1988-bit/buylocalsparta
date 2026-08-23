"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CategoryOption = { id: string; code: string; name: string; path: string; depth: number };
type CanonicalMatch = {
  canonicalVariantId: string;
  title: string;
  gtin?: string;
  description?: string;
  brand?: string;
  model?: string;
  mpn?: string;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  score: number;
};

type Props = {
  csrfToken: string;
  categoryOptions: readonly CategoryOption[];
};

const cleanGtin = (value: string) => value.replace(/\D/g, "");
const lookupSignature = (title: string, gtin: string) => `${title.trim().replace(/\s+/g, " ").toLocaleLowerCase("el")}|${cleanGtin(gtin)}`;

export function VendorSmartProductForm({ csrfToken, categoryOptions }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [gtin, setGtin] = useState("");
  const [variantNote, setVariantNote] = useState("");
  const [priceEuro, setPriceEuro] = useState("");
  const [stock, setStock] = useState("");
  const [safety, setSafety] = useState("0");
  const [selectedCanonical, setSelectedCanonical] = useState<CanonicalMatch | null>(null);
  const [matches, setMatches] = useState<readonly CanonicalMatch[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const signature = useMemo(() => lookupSignature(title, gtin), [title, gtin]);
  const enoughIdentity = title.trim().length >= 4 || cleanGtin(gtin).length >= 6;

  useEffect(() => {
    if (selectedCanonical || !enoughIdentity) {
      setLookupBusy(false);
      if (!enoughIdentity) {
        setMatches([]);
        setDialogOpen(false);
      }
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupBusy(true);
      try {
        const params = new URLSearchParams();
        if (title.trim()) params.set("title", title.trim());
        if (gtin.trim()) params.set("gtin", gtin.trim());
        const response = await fetch(`/api/vendor/catalog/canonical-matches?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { matches?: CanonicalMatch[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατός ο έλεγχος υπάρχοντος προϊόντος.");
        const next = payload.matches ?? [];
        setMatches(next);
        if (next.length > 0 && dismissedSignature !== signature) setDialogOpen(true);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατός ο έλεγχος υπάρχοντος προϊόντος.");
      } finally {
        if (!controller.signal.aborted) setLookupBusy(false);
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [title, gtin, signature, enoughIdentity, dismissedSignature, selectedCanonical]);

  function clearCanonicalLink() {
    if (selectedCanonical) {
      setSelectedCanonical(null);
      setMatches([]);
      setDismissedSignature("");
    }
  }

  function acceptCanonical(match: CanonicalMatch) {
    setTitle(match.title);
    setCategory(match.categoryCode);
    setBrand(match.brand ?? "");
    setModel(match.model ?? match.mpn ?? "");
    setGtin(match.gtin ?? "");
    setSelectedCanonical(match);
    setMatches([]);
    setDialogOpen(false);
    setDismissedSignature("");
    setError("");
  }

  function dismissMatches() {
    setDialogOpen(false);
    setDismissedSignature(signature);
  }

  function reset() {
    setTitle("");
    setCategory("");
    setSku("");
    setBrand("");
    setModel("");
    setGtin("");
    setVariantNote("");
    setPriceEuro("");
    setStock("");
    setSafety("0");
    setSelectedCanonical(null);
    setMatches([]);
    setDialogOpen(false);
    setDismissedSignature("");
  }

  const selectedCategoryMissing = Boolean(selectedCanonical && !categoryOptions.some((item) => item.code === selectedCanonical.categoryCode));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vendor/catalog/products", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({
          title,
          categoryCode: category,
          vendorSku: sku,
          brand,
          model,
          gtin,
          variantNote,
          canonicalVariantId: selectedCanonical?.canonicalVariantId,
          customerPriceMinor: Math.round(Number(priceEuro) * 100),
          stockOnHand: Number(stock),
          safetyStock: Number(safety || 0)
        })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να αποθηκεύσουμε το προϊόν.");
      reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν μπορέσαμε να αποθηκεύσουμε το προϊόν.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {dialogOpen && matches.length > 0 && <div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(15, 23, 42, .48)", display: "grid", placeItems: "center", padding: 20 }} onMouseDown={(event) => { if (event.target === event.currentTarget) dismissMatches(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="canonical-match-title" style={{ width: "min(680px, 100%)", maxHeight: "min(82vh, 760px)", overflow: "auto", background: "var(--surface, #fff)", borderRadius: 22, padding: 24, boxShadow: "0 28px 80px rgba(15, 23, 42, .24)" }}>
        <div className="eyebrow">Έξυπνη αναγνώριση προϊόντος</div>
        <h3 id="canonical-match-title" style={{ margin: "8px 0 6px" }}>Μήπως εννοείς κάποιο από αυτά;</h3>
        <p style={{ margin: "0 0 18px", opacity: .78 }}>Υπάρχει ήδη προϊόν στον κατάλογο ΚΟΝΤΑ ΜΟΥ. Επίλεξέ το για να συμπληρωθούν αυτόματα τα κοινά στοιχεία και να συνδεθεί αμέσως η δική σου προσφορά.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {matches.slice(0, 4).map((match) => <article key={match.canonicalVariantId} style={{ border: "1px solid rgba(100,116,139,.25)", borderRadius: 16, padding: 16, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div><strong style={{ display: "block", fontSize: "1.04rem" }}>{match.title}</strong><small>{match.categoryPath}</small></div>
              <span className="vendor-merchant-status">{match.score >= 900 ? "Πολύ ισχυρή αντιστοίχιση" : "Πιθανή αντιστοίχιση"}</span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".9rem" }}>
              {match.gtin && <span><strong>GTIN:</strong> {match.gtin}</span>}
              {match.brand && <span><strong>Μάρκα:</strong> {match.brand}</span>}
              {(match.model || match.mpn) && <span><strong>Μοντέλο:</strong> {match.model ?? match.mpn}</span>}
            </div>
            {match.description && <p style={{ margin: 0, opacity: .82, lineHeight: 1.45 }}>{match.description.length > 320 ? `${match.description.slice(0, 317)}…` : match.description}</p>}
            <div className="workspace-form-actions" style={{ marginTop: 2 }}><button type="button" className="button" onClick={() => acceptCanonical(match)}>Ναι — συμπλήρωσέ το</button></div>
          </article>)}
        </div>
        <div className="workspace-form-actions" style={{ marginTop: 18 }}><button type="button" className="button button-secondary" onClick={dismissMatches}>Κανένα από αυτά — συνέχισε ως νέο προϊόν</button></div>
      </div>
    </div>}

    <form onSubmit={submit}>
      {error && <div className="form-error vendor-error" role="alert" style={{ marginBottom: 14 }}><strong>Προσοχή.</strong> {error}</div>}
      {selectedCanonical && <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, border: "1px solid rgba(22,163,74,.3)", background: "rgba(22,163,74,.07)" }}>
        <strong>✓ Συνδέθηκε με υπάρχον canonical προϊόν</strong>
        <div style={{ marginTop: 4 }}>{selectedCanonical.title}{selectedCanonical.gtin ? ` · GTIN ${selectedCanonical.gtin}` : ""}</div>
        <small>Η τιμή, το απόθεμα, το SKU και η δική σου παραλλαγή παραμένουν στοιχεία του καταστήματός σου. Αν αλλάξεις τίτλο, κατηγορία, μάρκα, μοντέλο ή GTIN, θα γίνει νέος έλεγχος πριν κρατηθεί η σύνδεση.</small>
      </div>}
      <div className="workspace-form-grid">
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-title">Τίτλος προϊόντος</label>
          <input id="catalog-title" name="title" required value={title} autoComplete="off" onChange={(event) => { clearCanonicalLink(); setTitle(event.target.value); setError(""); }} />
          <small>{lookupBusy ? "Έλεγχος υπάρχοντος καταλόγου…" : !selectedCanonical && enoughIdentity && matches.length === 0 ? "Ο τίτλος ελέγχεται αυτόματα για υπάρχον canonical προϊόν." : "Αρκούν συνήθως λίγοι χαρακτηριστικοί χαρακτήρες ή ένας κωδικός μοντέλου, π.χ. BHT7316."}</small>
        </div>
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-category">Κατηγορία</label>
          <select id="catalog-category" name="category" required value={category} onChange={(event) => { clearCanonicalLink(); setCategory(event.target.value); }}>
            <option value="" disabled>Επίλεξε κατηγορία</option>
            {selectedCategoryMissing && selectedCanonical && <option value={selectedCanonical.categoryCode}>{selectedCanonical.categoryPath}</option>}
            {categoryOptions.map((item) => <option key={item.id} value={item.code}>{item.path}</option>)}
          </select>
        </div>
        <div className="workspace-form-field"><label htmlFor="catalog-sku">Δικό σου SKU</label><input id="catalog-sku" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-brand">Μάρκα</label><input id="catalog-brand" name="brand" value={brand} onChange={(event) => { clearCanonicalLink(); setBrand(event.target.value); }} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-model">Μοντέλο</label><input id="catalog-model" name="model" autoComplete="off" value={model} onChange={(event) => { clearCanonicalLink(); setModel(event.target.value); }} /></div>
        <div className="workspace-form-field">
          <label htmlFor="catalog-gtin">GTIN / EAN / ISBN</label>
          <input id="catalog-gtin" name="gtin" inputMode="numeric" autoComplete="off" placeholder="π.χ. 9781408855652" value={gtin} onChange={(event) => { clearCanonicalLink(); setGtin(event.target.value); setError(""); }} />
          <small>Ο πλήρης GTIN έχει προτεραιότητα στην αντιστοίχιση.</small>
        </div>
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-variant-note">Παραλλαγή / ποικιλία / δική σου σημείωση <span style={{ fontWeight: 400 }}>(προαιρετικό)</span></label>
          <input id="catalog-variant-note" name="variantNote" value={variantNote} onChange={(event) => setVariantNote(event.target.value)} placeholder="π.χ. 2,5 m, κόκκινο, συσκευασία 10 τεμ." />
          <small>Αυτό δεν αλλάζει το κοινό canonical προϊόν· περιγράφει τη συγκεκριμένη προσφορά ή παραλλαγή του καταστήματός σου.</small>
        </div>
        <div className="workspace-form-field"><label htmlFor="catalog-price">Τελική τιμή €</label><input id="catalog-price" name="priceEuro" required type="number" min="0" step="0.01" placeholder="44.90" value={priceEuro} onChange={(event) => setPriceEuro(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-stock">Φυσικό απόθεμα</label><input id="catalog-stock" name="stock" required type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-safety">Απόθεμα ασφαλείας</label><input id="catalog-safety" name="safety" type="number" min="0" step="1" value={safety} onChange={(event) => setSafety(event.target.value)} /></div>
      </div>
      <div className="workspace-form-actions"><button className="button" disabled={saving}>{saving ? "Αποθήκευση…" : selectedCanonical ? "Αποθήκευση συνδεδεμένης προσφοράς" : "Αποθήκευση προϊόντος"}</button></div>
    </form>
  </>;
}
