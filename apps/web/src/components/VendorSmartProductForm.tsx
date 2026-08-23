"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  warrantyBasis?: string;
  categoryCode: string;
  categoryName: string;
  categoryPath: string;
  specifications?: Readonly<Record<string, unknown>>;
  variantAttributes?: Readonly<Record<string, unknown>>;
  score: number;
};
type VariantValue = string | number | boolean | readonly (string | number | boolean)[];
type VariantOption = { code: string; label: string };
type VariantAttributeSchema = {
  code: string;
  label: string;
  helpText?: string;
  dataType: "text" | "number" | "boolean" | "enum" | "dimension";
  valueMode: "free" | "controlled" | "mixed";
  unit?: string;
  requirementLevel: "required" | "recommended" | "optional";
  allowMultiple: boolean;
  variantAxisOrder: number;
  options: readonly VariantOption[];
};
type ProductTypeSchema = { code: string; name: string; isDefault: boolean; variantAttributes: readonly VariantAttributeSchema[] };
type ProductIdentitySchema = { categoryCode: string; categoryName: string; productTypes: readonly ProductTypeSchema[]; selectedProductTypeCode?: string };
type CanonicalDetachState = { categoryCode: string; productTypeCode: string; preserveVariantAttributes: boolean };

type Props = {
  csrfToken: string;
  categoryOptions: readonly CategoryOption[];
};

const cleanGtin = (value: string) => value.replace(/\D/g, "");
const lookupSignature = (title: string, gtin: string) => `${title.trim().replace(/\s+/g, " ").toLocaleLowerCase("el")}|${cleanGtin(gtin)}`;
const normalizedChoice = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu, "");

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  try { return JSON.stringify(value); } catch { return String(value); }
}

function mergedDetails(match: CanonicalMatch | null): Array<[string, string]> {
  if (!match) return [];
  const combined = { ...(match.specifications ?? {}), ...(match.variantAttributes ?? {}) };
  return Object.entries(combined)
    .map(([key, value]) => [key, displayValue(value)] as [string, string])
    .filter(([, value]) => Boolean(value));
}

function canonicalVariantValue(code: string, source: Readonly<Record<string, unknown>> | undefined): unknown {
  if (!source) return undefined;
  if (source[code] != null) return source[code];
  const aliases: Record<string, readonly string[]> = {
    manufacturer_colour: ["manufacturer_color", "colour", "color"],
    apparel_size: ["size"],
    footwear_size: ["size"],
    ring_size: ["size"],
    bicycle_frame_size: ["size"],
    pack_quantity: ["pack_count", "packcount"]
  };
  for (const alias of aliases[code] ?? []) if (source[alias] != null) return source[alias];
  return undefined;
}

function valueForSchema(attribute: VariantAttributeSchema, raw: unknown): VariantValue | undefined {
  if (raw == null || raw === "") return undefined;
  if (attribute.allowMultiple && Array.isArray(raw)) {
    return raw.map((item) => valueForSchema({ ...attribute, allowMultiple: false }, item)).filter((item): item is string | number | boolean => item != null && !Array.isArray(item));
  }
  if (attribute.dataType === "boolean") {
    if (typeof raw === "boolean") return raw;
    const normalized = normalizedChoice(raw);
    if (["true","yes","1","ναι"].includes(normalized)) return true;
    if (["false","no","0","οχι","όχι"].includes(normalized)) return false;
    return undefined;
  }
  if (attribute.dataType === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const matched = String(raw).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return matched ? Number(matched[0]) : undefined;
  }
  const value = String(raw).trim();
  if (!value) return undefined;
  if (attribute.dataType === "enum" || attribute.valueMode === "controlled") {
    const normalized = normalizedChoice(value);
    return attribute.options.find((option) => normalizedChoice(option.code) === normalized || normalizedChoice(option.label) === normalized)?.code;
  }
  return value;
}

function canonicalVariantPrefill(type: ProductTypeSchema | undefined, match: CanonicalMatch | null) {
  const next: Record<string, VariantValue> = {};
  if (!type || !match?.variantAttributes) return next;
  for (const attribute of type.variantAttributes) {
    const value = valueForSchema(attribute, canonicalVariantValue(attribute.code, match.variantAttributes));
    if (value != null && (!Array.isArray(value) || value.length)) next[attribute.code] = value;
  }
  return next;
}

export function VendorSmartProductForm({ csrfToken, categoryOptions }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [productTypeCode, setProductTypeCode] = useState("");
  const [variantAttributes, setVariantAttributes] = useState<Record<string, VariantValue>>({});
  const [identitySchema, setIdentitySchema] = useState<ProductIdentitySchema | null>(null);
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [sku, setSku] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [mpn, setMpn] = useState("");
  const [gtin, setGtin] = useState("");
  const [description, setDescription] = useState("");
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
  const canonicalDetachState = useRef<CanonicalDetachState | null>(null);

  const signature = useMemo(() => lookupSignature(title, gtin), [title, gtin]);
  const enoughIdentity = title.trim().length >= 4 || cleanGtin(gtin).length >= 6;
  const canonicalDetails = useMemo(() => mergedDetails(selectedCanonical), [selectedCanonical]);
  const activeProductType = useMemo(() => identitySchema?.productTypes.find((type) => type.code === productTypeCode), [identitySchema, productTypeCode]);

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

  useEffect(() => {
    if (!category) {
      canonicalDetachState.current = null;
      setIdentitySchema(null);
      setProductTypeCode("");
      setVariantAttributes({});
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setSchemaBusy(true);
      try {
        const params = new URLSearchParams({ categoryCode: category });
        if (selectedCanonical?.canonicalVariantId) params.set("canonicalVariantId", selectedCanonical.canonicalVariantId);
        const response = await fetch(`/api/vendor/catalog/product-schema?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json() as { schema?: ProductIdentitySchema; error?: string };
        if (!response.ok || !payload.schema) throw new Error(payload.error ?? "Δεν ήταν δυνατή η φόρτωση των χαρακτηριστικών παραλλαγής.");
        const schema = payload.schema;
        const detached = !selectedCanonical && canonicalDetachState.current?.categoryCode === category ? canonicalDetachState.current : null;
        const preservedTypeCode = detached?.productTypeCode && schema.productTypes.some((type) => type.code === detached.productTypeCode) ? detached.productTypeCode : undefined;
        const nextTypeCode = schema.selectedProductTypeCode ?? preservedTypeCode ?? (schema.productTypes.length === 1 ? schema.productTypes[0].code : "");
        const resolvedTypeCode = preservedTypeCode ?? nextTypeCode;
        const nextType = schema.productTypes.find((type) => type.code === resolvedTypeCode);
        setIdentitySchema(schema);
        setProductTypeCode(resolvedTypeCode);
        if (selectedCanonical) setVariantAttributes(canonicalVariantPrefill(nextType, selectedCanonical));
        else if (!(detached?.preserveVariantAttributes && preservedTypeCode)) setVariantAttributes({});
        canonicalDetachState.current = null;
      } catch (cause) {
        if (!controller.signal.aborted) {
          const preserveCurrent = !selectedCanonical && canonicalDetachState.current?.categoryCode === category;
          if (!preserveCurrent) {
            setIdentitySchema(null);
            setProductTypeCode("");
            setVariantAttributes({});
          }
          canonicalDetachState.current = null;
          setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η φόρτωση των χαρακτηριστικών παραλλαγής.");
        }
      } finally {
        if (!controller.signal.aborted) setSchemaBusy(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [category, selectedCanonical]);

  function clearCanonicalLink(options: { productTypeCode?: string; preserveVariantAttributes?: boolean } = {}) {
    if (selectedCanonical) {
      canonicalDetachState.current = {
        categoryCode: category,
        productTypeCode: options.productTypeCode ?? productTypeCode,
        preserveVariantAttributes: options.preserveVariantAttributes ?? true
      };
      setSelectedCanonical(null);
      setMatches([]);
      setDismissedSignature("");
    }
  }

  function acceptCanonical(match: CanonicalMatch) {
    canonicalDetachState.current = null;
    setTitle(match.title);
    setCategory(match.categoryCode);
    setBrand(match.brand ?? "");
    setModel(match.model ?? "");
    setMpn(match.mpn ?? "");
    setGtin(match.gtin ?? "");
    setDescription(match.description ?? "");
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
    canonicalDetachState.current = null;
    setTitle("");
    setCategory("");
    setProductTypeCode("");
    setVariantAttributes({});
    setIdentitySchema(null);
    setSku("");
    setBrand("");
    setModel("");
    setMpn("");
    setGtin("");
    setDescription("");
    setVariantNote("");
    setPriceEuro("");
    setStock("");
    setSafety("0");
    setSelectedCanonical(null);
    setMatches([]);
    setDialogOpen(false);
    setDismissedSignature("");
  }

  function updateVariantAttribute(attribute: VariantAttributeSchema, value: VariantValue | undefined) {
    clearCanonicalLink();
    setVariantAttributes((current) => {
      const next = { ...current };
      if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) delete next[attribute.code];
      else next[attribute.code] = value;
      return next;
    });
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
          productTypeCode,
          vendorSku: sku,
          brand,
          model,
          mpn,
          gtin,
          variantAttributes,
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
      <div role="dialog" aria-modal="true" aria-labelledby="canonical-match-title" style={{ width: "min(720px, 100%)", maxHeight: "min(84vh, 800px)", overflow: "auto", background: "var(--surface, #fff)", borderRadius: 22, padding: 24, boxShadow: "0 28px 80px rgba(15, 23, 42, .24)" }}>
        <div className="eyebrow">Έξυπνη αναγνώριση προϊόντος</div>
        <h3 id="canonical-match-title" style={{ margin: "8px 0 6px" }}>Μήπως εννοείς κάποιο από αυτά;</h3>
        <p style={{ margin: "0 0 18px", opacity: .78 }}>Υπάρχει ήδη προϊόν στον κατάλογο ΚΟΝΤΑ ΜΟΥ. Επίλεξέ το για να συμπληρωθούν αυτόματα τα κοινά στοιχεία και τα δομημένα χαρακτηριστικά της συγκεκριμένης παραλλαγής.</p>
        <div style={{ display: "grid", gap: 12 }}>
          {matches.slice(0, 4).map((match) => {
            const details = mergedDetails(match);
            return <article key={match.canonicalVariantId} style={{ border: "1px solid rgba(100,116,139,.25)", borderRadius: 16, padding: 16, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div><strong style={{ display: "block", fontSize: "1.04rem" }}>{match.title}</strong><small>{match.categoryPath}</small></div>
                <span className="vendor-merchant-status">{match.score >= 900 ? "Πολύ ισχυρή αντιστοίχιση" : "Πιθανή αντιστοίχιση"}</span>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: ".9rem" }}>
                {match.gtin && <span><strong>GTIN:</strong> {match.gtin}</span>}
                {match.brand && <span><strong>Μάρκα:</strong> {match.brand}</span>}
                {match.model && <span><strong>Μοντέλο:</strong> {match.model}</span>}
                {match.mpn && <span><strong>MPN:</strong> {match.mpn}</span>}
              </div>
              {match.description && <p style={{ margin: 0, opacity: .82, lineHeight: 1.45 }}>{match.description.length > 360 ? `${match.description.slice(0, 357)}…` : match.description}</p>}
              {details.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{details.slice(0, 8).map(([key, value]) => <span key={key} style={{ border: "1px solid rgba(100,116,139,.22)", borderRadius: 999, padding: "4px 9px", fontSize: ".82rem" }}><strong>{key}:</strong> {value}</span>)}</div>}
              <div className="workspace-form-actions" style={{ marginTop: 2 }}><button type="button" className="button" onClick={() => acceptCanonical(match)}>Ναι — συμπλήρωσέ το</button></div>
            </article>;
          })}
        </div>
        <div className="workspace-form-actions" style={{ marginTop: 18 }}><button type="button" className="button button-secondary" onClick={dismissMatches}>Κανένα από αυτά — συνέχισε ως νέο προϊόν</button></div>
      </div>
    </div>}

    <form onSubmit={submit}>
      {error && <div className="form-error vendor-error" role="alert" style={{ marginBottom: 14 }}><strong>Προσοχή.</strong> {error}</div>}
      {selectedCanonical && <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, border: "1px solid rgba(22,163,74,.3)", background: "rgba(22,163,74,.07)" }}>
        <strong>✓ Συνδέθηκε με υπάρχον canonical προϊόν</strong>
        <div style={{ marginTop: 4 }}>{selectedCanonical.title}{selectedCanonical.gtin ? ` · GTIN ${selectedCanonical.gtin}` : ""}</div>
        <small>Τα κοινά στοιχεία και η ταυτότητα παραλλαγής ελέγχονται από το canonical προϊόν. Τιμή, απόθεμα και SKU παραμένουν στοιχεία του καταστήματός σου.</small>
      </div>}
      <div className="workspace-form-grid">
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-title">Τίτλος προϊόντος</label>
          <input id="catalog-title" name="title" required value={title} autoComplete="off" onChange={(event) => { clearCanonicalLink(); setTitle(event.target.value); setError(""); }} />
          <small>{lookupBusy ? "Έλεγχος υπάρχοντος καταλόγου…" : !selectedCanonical && enoughIdentity && matches.length === 0 ? "Ο τίτλος ελέγχεται αυτόματα για υπάρχον canonical προϊόν." : "Αρκούν συνήθως λίγοι χαρακτηριστικοί χαρακτήρες ή ένας κωδικός μοντέλου, π.χ. BHT7316."}</small>
        </div>
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-category">Κατηγορία</label>
          <select id="catalog-category" name="category" required value={category} onChange={(event) => { clearCanonicalLink(); setCategory(event.target.value); setProductTypeCode(""); setVariantAttributes({}); }}>
            <option value="" disabled>Επίλεξε κατηγορία</option>
            {selectedCategoryMissing && selectedCanonical && <option value={selectedCanonical.categoryCode}>{selectedCanonical.categoryPath}</option>}
            {categoryOptions.map((item) => <option key={item.id} value={item.code}>{item.path}</option>)}
          </select>
        </div>

        {schemaBusy && <div className="workspace-form-field span-2"><small>Φόρτωση δομημένων χαρακτηριστικών προϊόντος…</small></div>}
        {!schemaBusy && identitySchema && identitySchema.productTypes.length > 1 && <div className="workspace-form-field span-2">
          <label htmlFor="catalog-product-type">Τύπος προϊόντος</label>
          <select id="catalog-product-type" required value={productTypeCode} onChange={(event) => { const nextType = event.target.value; clearCanonicalLink({ productTypeCode: nextType, preserveVariantAttributes: false }); setProductTypeCode(nextType); setVariantAttributes({}); }}>
            <option value="" disabled>Επίλεξε τύπο προϊόντος</option>
            {identitySchema.productTypes.map((type) => <option key={type.code} value={type.code}>{type.name}{type.isDefault ? " · προτεινόμενο" : ""}</option>)}
          </select>
          <small>Ο τύπος προϊόντος καθορίζει ποια χαρακτηριστικά δημιουργούν διαφορετική παραλλαγή.</small>
        </div>}

        <div className="workspace-form-field"><label htmlFor="catalog-sku">Δικό σου SKU</label><input id="catalog-sku" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-brand">Μάρκα</label><input id="catalog-brand" name="brand" value={brand} onChange={(event) => { clearCanonicalLink(); setBrand(event.target.value); }} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-model">Μοντέλο</label><input id="catalog-model" name="model" autoComplete="off" value={model} onChange={(event) => { clearCanonicalLink(); setModel(event.target.value); }} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-mpn">MPN / κωδικός κατασκευαστή</label><input id="catalog-mpn" name="mpn" autoComplete="off" value={mpn} onChange={(event) => { clearCanonicalLink(); setMpn(event.target.value); }} /></div>
        <div className="workspace-form-field">
          <label htmlFor="catalog-gtin">GTIN / EAN / ISBN</label>
          <input id="catalog-gtin" name="gtin" inputMode="numeric" autoComplete="off" placeholder="π.χ. 9781408855652" value={gtin} onChange={(event) => { clearCanonicalLink(); setGtin(event.target.value); setError(""); }} />
          <small>{selectedCanonical && !selectedCanonical.gtin ? "Δεν υπάρχει GTIN αποθηκευμένο στο canonical προϊόν." : "Ο πλήρης GTIN έχει προτεραιότητα στην αντιστοίχιση."}</small>
        </div>

        {activeProductType?.variantAttributes.length ? <div className="workspace-form-field span-2" style={{ border: "1px solid rgba(59,130,246,.22)", borderRadius: 16, padding: 16 }}>
          <label style={{ fontSize: "1rem" }}>Χαρακτηριστικά που ορίζουν την παραλλαγή</label>
          <small style={{ display: "block", marginBottom: 12 }}>Συμπλήρωσέ τα ξεχωριστά. Το ΚΟΝΤΑ ΜΟΥ τα χρησιμοποιεί για να μην συγχέει διαφορετικά μεγέθη, χρώματα, χωρητικότητες ή συσκευασίες.</small>
          <div className="workspace-form-grid">
            {activeProductType.variantAttributes.map((attribute) => {
              const value = variantAttributes[attribute.code];
              const required = attribute.requirementLevel === "required";
              const id = `catalog-variant-${attribute.code}`;
              const suffix = attribute.unit ? ` (${attribute.unit})` : "";
              return <div className="workspace-form-field" key={attribute.code}>
                <label htmlFor={id}>{attribute.label}{suffix}{required ? " *" : ""}</label>
                {(attribute.dataType === "enum" || attribute.valueMode === "controlled") && attribute.options.length > 0 ? (
                  attribute.allowMultiple ? <select id={id} multiple required={required} value={Array.isArray(value) ? value.map(String) : []} onChange={(event) => updateVariantAttribute(attribute, [...event.target.selectedOptions].map((option) => option.value))}>
                    {attribute.options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                  </select> : <select id={id} required={required} value={value == null || Array.isArray(value) ? "" : String(value)} onChange={(event) => updateVariantAttribute(attribute, event.target.value || undefined)}>
                    <option value="">Επίλεξε…</option>
                    {attribute.options.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                  </select>
                ) : attribute.dataType === "boolean" ? <select id={id} required={required} value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => updateVariantAttribute(attribute, event.target.value === "" ? undefined : event.target.value === "true")}>
                  <option value="">Επίλεξε…</option><option value="true">Ναι</option><option value="false">Όχι</option>
                </select> : <input id={id} required={required} type={attribute.dataType === "number" ? "number" : "text"} step={attribute.dataType === "number" ? "any" : undefined} value={value == null || Array.isArray(value) ? "" : String(value)} onChange={(event) => updateVariantAttribute(attribute, event.target.value === "" ? undefined : attribute.dataType === "number" ? Number(event.target.value) : event.target.value)} />}
                <small>{attribute.helpText ?? `${required ? "Υποχρεωτικό" : attribute.requirementLevel === "recommended" ? "Προτεινόμενο" : "Προαιρετικό"} στοιχείο ταυτότητας παραλλαγής.`}</small>
              </div>;
            })}
          </div>
        </div> : null}

        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-description">Περιγραφή canonical προϊόντος</label>
          <textarea id="catalog-description" name="description" value={description} readOnly rows={4} placeholder={selectedCanonical ? "Δεν υπάρχει αποθηκευμένη περιγραφή." : "Η περιγραφή θα συμπληρωθεί όταν επιλεγεί υπάρχον canonical προϊόν."} />
          <small>Η κοινή περιγραφή δεν αλλάζει από την προσφορά του vendor.</small>
        </div>
        {selectedCanonical?.warrantyBasis && <div className="workspace-form-field span-2"><label>Εγγύηση / βάση εγγύησης</label><input value={selectedCanonical.warrantyBasis} readOnly /></div>}
        {canonicalDetails.length > 0 && <div className="workspace-form-field span-2">
          <label>Τεχνικά χαρακτηριστικά canonical προϊόντος</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            {canonicalDetails.map(([key, value]) => <div key={key} style={{ border: "1px solid rgba(100,116,139,.22)", borderRadius: 12, padding: "9px 11px" }}><small style={{ display: "block", opacity: .72 }}>{key}</small><strong>{value}</strong></div>)}
          </div>
        </div>}
        <div className="workspace-form-field span-2">
          <label htmlFor="catalog-variant-note">Πρόσθετη σημείωση προσφοράς <span style={{ fontWeight: 400 }}>(προαιρετικό)</span></label>
          <input id="catalog-variant-note" name="variantNote" value={variantNote} onChange={(event) => setVariantNote(event.target.value)} placeholder="π.χ. ειδική συσκευασία καταστήματος ή χρήσιμη πληροφορία παραλαβής" />
          <small>Η σημείωση δεν χρησιμοποιείται για canonical matching. Μέγεθος, χρώμα, χωρητικότητα και άλλα στοιχεία ταυτότητας μπαίνουν στα δομημένα πεδία παραπάνω.</small>
        </div>
        <div className="workspace-form-field"><label htmlFor="catalog-price">Τελική τιμή €</label><input id="catalog-price" name="priceEuro" required type="number" min="0" step="0.01" placeholder="44.90" value={priceEuro} onChange={(event) => setPriceEuro(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-stock">Φυσικό απόθεμα</label><input id="catalog-stock" name="stock" required type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
        <div className="workspace-form-field"><label htmlFor="catalog-safety">Απόθεμα ασφαλείας</label><input id="catalog-safety" name="safety" type="number" min="0" step="1" value={safety} onChange={(event) => setSafety(event.target.value)} /></div>
      </div>
      <div className="workspace-form-actions"><button className="button" disabled={saving || schemaBusy}>{saving ? "Αποθήκευση…" : selectedCanonical ? "Αποθήκευση συνδεδεμένης προσφοράς" : "Αποθήκευση προϊόντος"}</button></div>
    </form>
  </>;
}