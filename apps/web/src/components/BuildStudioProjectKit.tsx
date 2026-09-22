"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import type { BuildStudioCandidate } from "./BuildStudioProductChooser";
import styles from "./BuildStudioProjectKit.module.css";

type GuideItem = Readonly<{
  key: string;
  sourceLayer: string;
  textEl: string;
}>;

export type BuildStudioProjectKitLine = Readonly<{
  key: string;
  role: "main" | "system" | "accessory";
  label: string;
  reasonEl: string;
  required: boolean;
  preselected: boolean;
  sourceLayer: "MANUFACTURER" | "KONTA_MOU_RULE";
  quantity: number;
  quantityCalculated?: boolean;
  canonicalVariantId?: string;
  title?: string;
  brand?: string;
  priceMinor?: number;
  price?: string;
  imageUrl?: string;
  imageAlt?: string;
  cartable: boolean;
  vendorName?: string;
  packAmount?: number;
  packUnit?: string;
  purchaseVolume?: number;
  availabilityNote?: string;
}>;

type ProjectKitResponse = Readonly<{
  product: Readonly<{
    id: string;
    title: string;
    brand: string;
    imageUrl?: string;
    priceMinor: number;
    price?: string;
    vendorName?: string;
    cartable: boolean;
    packAmount?: number;
    packUnit?: string;
  }>;
  quantityEstimate: Readonly<{
    status: "available" | "missing_manufacturer_values" | "manufacturer_not_selected";
    areaM2: number;
    unit?: "L";
    min?: number;
    max?: number;
    coatsMin?: number;
    coatsMax?: number;
    basisEl: string;
  }>;
  purchasePlan: Readonly<{
    units: number;
    packAmount?: number;
    packUnit?: string;
    purchaseVolume?: number;
  }>;
  technical: Readonly<{
    applicationMethods: readonly string[];
    recommendedPrimers: readonly string[];
    requiredSystemComponents: readonly string[];
    preparation: readonly GuideItem[];
    instructions: readonly GuideItem[];
    timings: readonly GuideItem[];
    warnings: readonly GuideItem[];
    avoid: readonly GuideItem[];
  }>;
  lines: readonly BuildStudioProjectKitLine[];
  notes: Readonly<{
    accessoryQuantities: string;
    technicalQuantities: string;
  }>;
}>;

type ProjectKitRequest = Readonly<{
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
  manufacturerProductId: string;
  catalogueId: string;
  areaM2: number;
}>;

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function useProjectKit(input: ProjectKitRequest | undefined) {
  const [data, setData] = useState<ProjectKitResponse>();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!input) {
      setData(undefined);
      setState("idle");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    setData(undefined);
    void fetch("/api/build-studio/project-kit", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(input)
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`project kit: ${response.status}`);
        return response.json() as Promise<ProjectKitResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Paint Build project kit unavailable", error);
        setState("error");
      });
    return () => controller.abort();
  }, [input?.scenarioKey, input?.manufacturerProductId, input?.catalogueId, input?.areaM2, JSON.stringify(input?.facts ?? {})]);

  return { data, state };
}

function QuantitySummary({ data }: { data: ProjectKitResponse }) {
  const quantity = data.quantityEstimate;
  if (quantity.status !== "available" || quantity.min == null || quantity.max == null) {
    return (
      <div className={styles.quantityBox}>
        <small>ΠΟΣΟΤΗΤΑ ΕΡΓΟΥ</small>
        <strong>Χρειάζεται επιβεβαίωση</strong>
        <p>{quantity.basisEl}</p>
      </div>
    );
  }
  const range = quantity.min === quantity.max ? `${quantity.min} L` : `${quantity.min}–${quantity.max} L`;
  return (
    <div className={styles.quantityBox}>
      <small>ΑΥΤΟΜΑΤΟΣ ΥΠΟΛΟΓΙΣΜΟΣ</small>
      <strong>{range}</strong>
      <p>
        Για την επιλεγμένη συσκευασία προτείνονται <b>{data.purchasePlan.units} τεμ.</b>
        {data.purchasePlan.purchaseVolume ? ` · σύνολο ${data.purchasePlan.purchaseVolume} L` : ""}.
      </p>
    </div>
  );
}

export function BuildStudioProductDetailsOverlay({
  product,
  scenarioKey,
  facts,
  areaM2,
  onClose,
  onChoose
}: {
  product: BuildStudioCandidate;
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
  areaM2: number;
  onClose: () => void;
  onChoose: (product: BuildStudioCandidate) => void;
}) {
  const request = useMemo<ProjectKitRequest>(() => ({
    scenarioKey,
    facts,
    manufacturerProductId: product.manufacturerProductId,
    catalogueId: product.id,
    areaM2
  }), [scenarioKey, facts, product.manufacturerProductId, product.id, areaM2]);
  const { data, state } = useProjectKit(request);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Λεπτομέρειες προϊόντος Paint & Build">
      <button type="button" className={styles.overlayBackdrop} onClick={onClose} aria-label="Κλείσιμο" />
      <div className={styles.detailSheet}>
        <div className={styles.sheetHeader}>
          <div><small>PAINT & BUILD · VERIFIED PRODUCT</small><strong>Λεπτομέρειες προϊόντος</strong></div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο">×</button>
        </div>

        <div className={styles.detailHero}>
          <div className={styles.detailImage}>
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.mediaAlt || product.title} />
              : <span aria-hidden="true">{product.title.slice(0, 1)}</span>}
          </div>
          <div className={styles.detailCopy}>
            <small>{product.brand || "VITEX"}</small>
            <h2>{product.title}</h2>
            <strong>{product.price}</strong>
            <p>{product.vendorName ? `Ανατεθειμένο κατάστημα: ${product.vendorName}` : "KONTA MOY Paint & Build"}</p>
          </div>
        </div>

        {state === "loading" ? <div className={styles.loading}>Υπολογίζω ποσότητα και τεχνικές απαιτήσεις…</div> : null}
        {state === "error" ? <div className={styles.error}>Δεν ήταν δυνατή η φόρτωση του project kit. Δοκίμασε ξανά.</div> : null}

        {data ? (
          <>
            <QuantitySummary data={data} />
            <div className={styles.detailColumns}>
              <div>
                <small>ΓΙΑΤΙ ΤΑΙΡΙΑΖΕΙ</small>
                <strong>Επαληθευμένη συμβατότητα</strong>
                <p>Η επιλογή πέρασε τον manufacturer eligibility rule για το συγκεκριμένο σενάριο έργου.</p>
              </div>
              <div>
                <small>ΕΦΑΡΜΟΓΗ</small>
                <strong>{data.technical.applicationMethods.length ? data.technical.applicationMethods.join(" · ") : "Σύμφωνα με TDS"}</strong>
                <p>{data.notes.technicalQuantities}</p>
              </div>
            </div>

            <div className={styles.instructions}>
              {data.technical.preparation.slice(0, 3).map((item) => <p key={item.key}><b>Προεργασία:</b> {item.textEl}</p>)}
              {data.technical.instructions.slice(0, 4).map((item) => <p key={item.key}><b>Οδηγία:</b> {item.textEl}</p>)}
              {data.technical.timings.slice(0, 3).map((item) => <p key={item.key}><b>Χρόνος:</b> {item.textEl}</p>)}
            </div>

            {!data.product.cartable ? (
              <div className={styles.notice}>
                Το προϊόν μπορεί να επιλεγεί για το έργο και το PDF, αλλά η τρέχουσα ανάθεση καταστήματος είναι ακόμη σε λειτουργία επιβεβαίωσης και όχι checkout.
              </div>
            ) : null}
          </>
        ) : null}

        <div className={styles.sheetActions}>
          <button type="button" className={styles.secondary} onClick={onClose}>ΠΙΣΩ ΣΤΙΣ ΕΠΙΛΟΓΕΣ</button>
          <button type="button" className={styles.primary} disabled={state !== "ready"} onClick={() => onChoose(product)}>
            ΕΠΙΛΟΓΗ ΓΙΑ ΤΟ ΕΡΓΟ ΜΟΥ
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuildStudioProjectKit({
  product,
  scenarioKey,
  facts,
  areaM2,
  onBack,
  onCreatePdf
}: {
  product: BuildStudioCandidate;
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
  areaM2: number;
  onBack: () => void;
  onCreatePdf: (lines: readonly (BuildStudioProjectKitLine & { selected: boolean })[]) => Promise<void> | void;
}) {
  const { addItem } = useCart();
  const request = useMemo<ProjectKitRequest>(() => ({
    scenarioKey,
    facts,
    manufacturerProductId: product.manufacturerProductId,
    catalogueId: product.id,
    areaM2
  }), [scenarioKey, facts, product.manufacturerProductId, product.id, areaM2]);
  const { data, state } = useProjectKit(request);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartMessage, setCartMessage] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSelected(Object.fromEntries(data.lines.map((line) => [line.key, line.required || line.preselected])));
    setQuantities(Object.fromEntries(data.lines.map((line) => [line.key, Math.max(1, line.quantity)])));
  }, [data]);

  const activeLines = useMemo(() => {
    if (!data) return [];
    return data.lines.filter((line) => selected[line.key] === true);
  }, [data, selected]);

  const totalMinor = activeLines.reduce((sum, line) => {
    const price = line.priceMinor ?? 0;
    const quantity = quantities[line.key] ?? line.quantity;
    return sum + price * quantity;
  }, 0);
  const incompleteRequired = data.lines.filter((line) =>
    line.required && (selected[line.key] !== true || !line.cartable)
  );
  const missingSelected = activeLines.filter((line) => !line.cartable);
  const cartableLines = activeLines.filter((line) =>
    line.cartable
    && line.canonicalVariantId
    && line.title
    && typeof line.priceMinor === "number"
    && line.priceMinor > 0
    && line.price
  );

  function quantity(line: BuildStudioProjectKitLine): number {
    return Math.max(1, quantities[line.key] ?? line.quantity);
  }

  function updateQuantity(line: BuildStudioProjectKitLine, next: number) {
    setQuantities((current) => ({ ...current, [line.key]: Math.max(1, Math.min(99, Math.trunc(next || 1))) }));
  }

  function addProjectToCart() {
    for (const line of cartableLines) {
      addItem({
        canonicalVariantId: line.canonicalVariantId!,
        title: line.title!,
        priceMinor: line.priceMinor!,
        price: line.price!,
        imageUrl: line.imageUrl,
        imageAlt: line.imageAlt
      }, quantity(line));
    }
    if (missingSelected.length) {
      setCartMessage(`Προστέθηκαν ${cartableLines.length} διαθέσιμα είδη. ${missingSelected.length} επιλεγμένα είδη χρειάζονται ακόμη εμπορική διαθεσιμότητα/επιβεβαίωση.`);
    } else {
      setCartMessage("Ολόκληρο το επιλεγμένο project kit προστέθηκε στο καλάθι.");
    }
  }

  async function createPdf() {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      await onCreatePdf(data.lines.map((line) => ({
        ...line,
        quantity: quantity(line),
        selected: selected[line.key] === true
      })));
    } finally {
      setPdfBusy(false);
    }
  }

  if (state === "loading" || state === "idle") {
    return <section className={styles.kitScreen}><div className={styles.loading}>Χτίζω το πλήρες project kit…</div></section>;
  }
  if (state === "error" || !data) {
    return <section className={styles.kitScreen}><div className={styles.error}>Το project kit δεν είναι διαθέσιμο αυτή τη στιγμή.</div><button type="button" className={styles.secondary} onClick={onBack}>ΠΙΣΩ</button></section>;
  }

  return (
    <section className={styles.kitScreen}>
      <div className={styles.kitIntro}>
        <span>06 · PROJECT KIT</span>
        <h1>Όλα όσα χρειάζεσαι<br /><em>για το έργο.</em></h1>
        <p>Το κύριο προϊόν και οι τεχνικές ποσότητες προέρχονται από επαληθευμένα manufacturer δεδομένα. Τα εργαλεία και τα προστατευτικά είναι προτάσεις KONTA MOY και μπορείς να τα αλλάξεις ή να τα αφαιρέσεις.</p>
      </div>

      <div className={styles.kitSummary}>
        <div className={styles.summaryProduct}>
          {data.product.imageUrl ? <img src={data.product.imageUrl} alt={data.product.title} /> : null}
          <div><small>{data.product.brand}</small><strong>{data.product.title}</strong><span>{data.product.price || "Τιμή προς επιβεβαίωση"}</span></div>
        </div>
        <QuantitySummary data={data} />
      </div>

      <div className={styles.lineGroups}>
        {(["main", "system", "accessory"] as const).map((role) => {
          const group = data.lines.filter((line) => line.role === role);
          if (!group.length) return null;
          return (
            <div className={styles.lineGroup} key={role}>
              <div className={styles.groupTitle}>
                <span>{role === "main" ? "01" : role === "system" ? "02" : "03"}</span>
                <div><small>{role === "main" ? "MAIN MATERIAL" : role === "system" ? "SYSTEM MATERIALS" : "TOOLS & PROTECTION"}</small><strong>{role === "main" ? "Κύριο προϊόν" : role === "system" ? "Στοιχεία συστήματος" : "Εργαλεία & προστασία"}</strong></div>
              </div>
              {group.map((line) => {
                const checked = selected[line.key] === true;
                const locked = line.role === "main";
                return (
                  <article className={checked ? styles.kitLineSelected : styles.kitLine} key={line.key}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        onChange={(event) => setSelected((current) => ({ ...current, [line.key]: event.target.checked }))}
                      />
                      <span aria-hidden="true">{checked ? "✓" : ""}</span>
                    </label>
                    <div className={styles.lineImage}>
                      {line.imageUrl ? <img src={line.imageUrl} alt={line.imageAlt || line.title || line.label} /> : <i aria-hidden="true">+</i>}
                    </div>
                    <div className={styles.lineCopy}>
                      <small>{line.required ? "ΑΠΑΡΑΙΤΗΤΟ" : "ΠΡΟΤΕΙΝΟΜΕΝΟ"} · {line.sourceLayer === "MANUFACTURER" ? "MANUFACTURER" : "KONTA MOY"}</small>
                      <strong>{line.title || line.label}</strong>
                      <p>{line.reasonEl}</p>
                      {line.availabilityNote ? <em>{line.availabilityNote}</em> : null}
                    </div>
                    <div className={styles.lineControls}>
                      <span>{line.price || (line.priceMinor ? euro(line.priceMinor) : "—")}</span>
                      <div>
                        <button type="button" onClick={() => updateQuantity(line, quantity(line) - 1)}>−</button>
                        <input
                          aria-label={`Ποσότητα ${line.title || line.label}`}
                          type="number"
                          min={1}
                          max={99}
                          value={quantity(line)}
                          onChange={(event) => updateQuantity(line, Number(event.target.value))}
                        />
                        <button type="button" onClick={() => updateQuantity(line, quantity(line) + 1)}>+</button>
                      </div>
                      {line.quantityCalculated ? <small>ΑΥΤΟΜΑΤΑ</small> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>

      {incompleteRequired.length ? (
        <div className={styles.notice}>
          <strong>Το project kit δεν είναι ακόμη πλήρες.</strong>
          <p>
            {incompleteRequired.length} απαραίτητο είδος/είδη είτε έχουν αφαιρεθεί από την επιλογή είτε δεν είναι ακόμη checkout-ready.
            Το PDF θα καταγράψει ακριβώς αυτή την κατάσταση αντί να παρουσιάσει το έργο ως πλήρες.
          </p>
        </div>
      ) : null}

      <div className={styles.totalBar}>
        <div><small>ΕΝΔΕΙΚΤΙΚΟ ΣΥΝΟΛΟ ΕΠΙΛΕΓΜΕΝΩΝ</small><strong>{totalMinor > 0 ? euro(totalMinor) : "—"}</strong><span>{activeLines.length} επιλεγμένα είδη</span></div>
        <div className={styles.totalActions}>
          <button type="button" className={styles.secondary} onClick={onBack}>ΑΛΛΑΓΗ ΠΡΟΪΟΝΤΟΣ</button>
          <button type="button" className={styles.pdfAction} disabled={pdfBusy} onClick={() => void createPdf()}>
            {pdfBusy ? "ΔΗΜΙΟΥΡΓΙΑ PDF…" : "ΔΗΜΙΟΥΡΓΙΑ PDF ΕΡΓΟΥ"}
          </button>
          <button type="button" className={styles.primary} disabled={!cartableLines.length} onClick={addProjectToCart}>
            {missingSelected.length ? "ΠΡΟΣΘΗΚΗ ΔΙΑΘΕΣΙΜΩΝ ΣΤΟ ΚΑΛΑΘΙ" : "ΠΡΟΣΘΗΚΗ ΟΛΟΥ ΤΟΥ ΕΡΓΟΥ ΣΤΟ ΚΑΛΑΘΙ"}
          </button>
        </div>
      </div>
      {cartMessage ? <div className={styles.cartMessage} role="status">{cartMessage}</div> : null}
    </section>
  );
}
