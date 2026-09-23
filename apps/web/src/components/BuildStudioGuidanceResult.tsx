"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuildGuidanceScenarioRequest } from "../lib/build-guidance-scenario-map";
import {
  BuildStudioProductChooser,
  type BuildStudioCandidate,
  type BuildStudioProjectKit,
  type ProjectKitItem
} from "./BuildStudioProductChooser";
import { useCart } from "./CartProvider";
import styles from "./PaintBuildStudioExperience.module.css";
import { paintBuildCategoryLabel, paintBuildGreekText, paintBuildPackageLabel, paintBuildProductTitle } from "../lib/paint-build-greek-presentation";

type SourceLayer = "GENERAL_GUIDANCE" | "MANUFACTURER_VITEX" | "MANUFACTURER" | "KONTA_MOU_RULE";

type GuidanceItem = {
  key: string;
  sourceLayer: SourceLayer;
  textEl: string;
  severity?: string;
};

type CustomerGuide = {
  status: "ready" | "blocked" | "review_required" | "guidance_partial" | "scenario_not_found";
  blocked: boolean;
  guidanceConflict: boolean;
  beforeYouStart: GuidanceItem[];
  preparation: GuidanceItem[];
  whatYouNeed: GuidanceItem[];
  stepByStep: GuidanceItem[];
  manufacturerInstructions: GuidanceItem[];
  timings: GuidanceItem[];
  avoid: GuidanceItem[];
  warnings: GuidanceItem[];
  afterApplication: GuidanceItem[];
  quantity: {
    status: "manufacturer_not_selected" | "manufacturer_data_missing" | "manufacturer_data_available";
    explanationEl: string;
  };
};

type QuantityEstimate = {
  status: "available" | "missing_manufacturer_values" | "manufacturer_not_selected";
  areaM2: number;
  unit?: "L";
  min?: number;
  max?: number;
  coatsMin?: number;
  coatsMax?: number;
  basisEl: string;
};

type MutableKitItem = ProjectKitItem & { selected: boolean; quantity: number };

type KitItemDetail = Readonly<{
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
  price: string;
  imageUrl?: string;
  imageAlt?: string;
  sku?: string;
  gtin?: string;
  color?: string;
  size?: string;
  brand?: string;
  categoryLabel?: string;
  description?: string;
  availableToSell?: number;
  url?: string;
}>;

function sourceLabel(layer: SourceLayer): string {
  if (layer === "GENERAL_GUIDANCE") return "Γενική τεχνική καθοδήγηση";
  if (layer === "MANUFACTURER_VITEX") return "Οδηγίες κατασκευαστή · VITEX";
  if (layer === "MANUFACTURER") return "Οδηγίες κατασκευαστή";
  return "KONTA MOU · κανόνας ασφάλειας / ροής";
}

function GuideList({ title, items }: { title: string; items: GuidanceItem[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.resultColumn}>
      <h2>{title}</h2>
      <ol>
        {items.map((item) => (
          <li key={item.key}>
            <small>{sourceLabel(item.sourceLayer)}</small>
            <div>{item.textEl}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function displayMoney(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function unresolvedText(value: Readonly<Record<string, unknown>>): string {
  const title = typeof value.title === "string" ? value.title : "Απαιτούμενο υλικό";
  const reason = typeof value.reason === "string" ? value.reason : "unresolved";
  if (reason === "required_component_quantity_unverified") return `${title}: δεν υπάρχει ακόμη επαληθευμένος αυτόματος υπολογισμός ποσότητας.`;
  if (reason === "required_component_not_available") return `${title}: δεν υπάρχει διαθέσιμη εμπορική παραλλαγή.`;
  if (reason === "required_component_pack_plan_unavailable") return `${title}: δεν βρέθηκε ασφαλής συνδυασμός συσκευασιών.`;
  return `${title}: απαιτείται τεχνική ολοκλήρωση.`;
}


function kitRoleLabel(item: ProjectKitItem): string {
  if (item.required) return "ΑΠΑΡΑΙΤΗΤΟ ΥΛΙΚΟ";
  if (item.role === "recommended_working") return "ΠΡΟΤΕΙΝΟΜΕΝΟ ΥΛΙΚΟ ΕΡΓΑΣΙΑΣ";
  return "ΠΡΟΑΙΡΕΤΙΚΟ ΠΡΟΣΘΕΤΟ";
}

function KitItemDetailsOverlay({ item, onClose }: { item: MutableKitItem; onClose: () => void }) {
  const [detail, setDetail] = useState<KitItemDetail>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setDetail(undefined);
    void fetch("/api/cart/candidate", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: item.canonicalVariantId })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`project-kit item detail: ${response.status}`);
        return response.json() as Promise<{ item?: KitItemDetail }>;
      })
      .then((payload) => {
        if (controller.signal.aborted || !payload.item) return;
        setDetail(payload.item);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [item.canonicalVariantId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const imageUrl = detail?.imageUrl ?? item.imageUrl;
  const productUrl = detail?.url ?? `/product/${encodeURIComponent(item.canonicalVariantId)}`;

  return (
    <div className={styles.kitDetailOverlay} role="dialog" aria-modal="true" aria-label={`Λεπτομέρειες ${item.title}`}>
      <div className={styles.kitDetailShell}>
        <button type="button" className={styles.kitDetailClose} onClick={onClose} aria-label="Κλείσιμο">×</button>
        {state === "loading" ? <div className={styles.kitDetailLoading}>Φορτώνω τις λεπτομέρειες του προϊόντος…</div> : null}
        {state === "error" ? (
          <div className={styles.kitDetailLoading}>
            <strong>{item.title}</strong>
            <p>Οι πρόσθετες πληροφορίες δεν είναι διαθέσιμες αυτή τη στιγμή. Το προϊόν παραμένει στο έργο με τα στοιχεία που έχουν ήδη επιβεβαιωθεί.</p>
          </div>
        ) : null}
        {state === "ready" && detail ? (
          <>
            <div className={styles.kitDetailHero}>
              <div className={styles.kitDetailImage}>
                {imageUrl ? <img src={imageUrl} alt={detail.imageAlt ?? item.title} /> : <span aria-hidden="true">{item.title.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className={styles.kitDetailCopy}>
                <small>{kitRoleLabel(item)}</small>
                <h2>{paintBuildProductTitle(item.title || detail.title)}</h2>
                <div className={styles.kitDetailMeta}>
                  {detail.brand ? <span><b>Μάρκα</b>{detail.brand}</span> : null}
                  {detail.categoryLabel ? <span><b>Κατηγορία</b>{paintBuildCategoryLabel(detail.categoryLabel)}</span> : null}
                  {detail.color ? <span><b>Χρώμα</b>{detail.color}</span> : null}
                  {detail.size ? <span><b>Μέγεθος / συσκευασία</b>{detail.size}</span> : null}
                  <span><b>Τιμή</b>{detail.price}</span>
                  <span><b>Ποσότητα έργου</b>{item.quantity}</span>
                </div>
              </div>
            </div>
            <div className={styles.kitDetailBody}>
              <div>
                <h3>Γιατί βρίσκεται στο έργο σου</h3>
                <p>{item.reasonEl}</p>
                <small>{item.sourceLayer === "MANUFACTURER_VITEX" ? "Επαληθευμένο σύστημα VITEX" : "Πρόταση ΚΟΝΤΑ ΜΟΥ βάσει των αναγκών του έργου"}</small>
              </div>
              {detail.description ? <div><h3>Περιγραφή προϊόντος</h3><p>{paintBuildGreekText(detail.description)}</p></div> : null}
              {(detail.sku || detail.gtin || detail.availableToSell != null) ? (
                <div className={styles.kitDetailFacts}>
                  {detail.sku ? <span><b>Κωδικός</b>{detail.sku}</span> : null}
                  {detail.gtin ? <span><b>GTIN</b>{detail.gtin}</span> : null}
                  {detail.availableToSell != null ? <span><b>Διαθέσιμο απόθεμα</b>{detail.availableToSell} τεμ.</span> : null}
                </div>
              ) : null}
            </div>
            <div className={styles.kitDetailActions}>
              <a href={productUrl}>ΑΝΟΙΞΕ ΤΗ ΣΕΛΙΔΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ</a>
              <button type="button" onClick={onClose}>ΕΠΙΣΤΡΟΦΗ ΣΤΟ ΕΡΓΟ</button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProjectKitScreen({
  eyebrow,
  title,
  summary,
  colour,
  projectType,
  areaM2,
  scenarioRequest,
  selectedProduct,
  projectKit,
  onChangeProduct,
  onRestart
}: {
  eyebrow: string;
  title: string;
  summary: string;
  colour?: string;
  projectType: "paint" | "waterproofing" | "insulation" | "repair";
  areaM2: number;
  scenarioRequest: BuildGuidanceScenarioRequest;
  selectedProduct: BuildStudioCandidate;
  projectKit: BuildStudioProjectKit;
  onChangeProduct: () => void;
  onRestart: () => void;
}) {
  const { addItem } = useCart();
  const sourceItems = projectKit.kit?.items ?? [];
  const [items, setItems] = useState<MutableKitItem[]>(() => sourceItems.map((item) => ({ ...item })));
  const [cartState, setCartState] = useState<"idle" | "loading" | "added" | "error">("idle");
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [snapshotId, setSnapshotId] = useState("");
  const [detailItem, setDetailItem] = useState<MutableKitItem>();
  const recommendedQuantity = useMemo(
    () => new Map(sourceItems.filter((item) => item.required).map((item) => [item.canonicalVariantId, item.quantity])),
    [sourceItems]
  );

  useEffect(() => {
    setItems(sourceItems.map((item) => ({ ...item })));
    setCartState("idle");
    setPdfState("idle");
    setSnapshotId("");
    setDetailItem(undefined);
  }, [projectKit, sourceItems]);

  const unresolvedRequired = projectKit.kit?.unresolvedRequired ?? [];
  const requiredComplete = items
    .filter((item) => item.required)
    .every((item) => item.selected && item.quantity >= (recommendedQuantity.get(item.canonicalVariantId) ?? 1));
  const complete = Boolean(projectKit.kit?.complete) && requiredComplete && unresolvedRequired.length === 0;
  const selectedItems = items.filter((item) => item.selected);
  const totalMinor = selectedItems.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const requiredItems = items.filter((item) => item.role === "required_system");
  const recommendedItems = items.filter((item) => item.role === "recommended_working");
  const optionalItems = items.filter((item) => item.role === "optional_extra");
  const missingAccessories = projectKit.kit?.unavailableAccessorySlots ?? [];

  function toggleItem(id: string) {
    setCartState("idle");
    setSnapshotId("");
    setItems((current) => current.map((item) => item.canonicalVariantId === id ? { ...item, selected: !item.selected } : item));
  }

  function setItemQuantity(id: string, quantity: number) {
    setCartState("idle");
    setSnapshotId("");
    const safe = Math.max(1, Math.min(99, Number.isFinite(quantity) ? Math.trunc(quantity) : 1));
    setItems((current) => current.map((item) => item.canonicalVariantId === id ? { ...item, quantity: safe } : item));
  }

  async function addProjectToCart() {
    if (!selectedItems.length) return;
    setCartState("loading");
    try {
      const resolved = await Promise.all(selectedItems.map(async (item) => {
        const response = await fetch("/api/cart/candidate", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ id: item.canonicalVariantId })
        });
        if (!response.ok) throw new Error("cart candidate unavailable");
        const payload = await response.json() as {
          item?: {
            canonicalVariantId: string;
            title: string;
            priceMinor: number;
            price: string;
            imageUrl?: string;
            imageAlt?: string;
            sku?: string;
            gtin?: string;
            color?: string;
            size?: string;
          };
        };
        if (!payload.item) throw new Error("cart candidate missing");
        return { cartItem: payload.item, quantity: item.quantity };
      }));
      for (const entry of resolved) addItem(entry.cartItem, entry.quantity);
      setCartState("added");
    } catch {
      setCartState("error");
    }
  }

  function snapshotKit() {
    return {
      complete,
      items: items.map((item) => ({
        canonicalVariantId: item.canonicalVariantId,
        title: item.title,
        priceMinor: item.priceMinor,
        price: item.price,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        selected: item.selected,
        required: item.required,
        role: item.role,
        sourceLayer: item.sourceLayer,
        reasonEl: item.reasonEl
      })),
      unresolvedRequired: unresolvedRequired.map(unresolvedText),
      unavailableAccessorySlots: missingAccessories.map((slot) => slot.label)
    };
  }

  async function ensureSnapshot(): Promise<string> {
    if (snapshotId) return snapshotId;
    const selectedVariant = projectKit.family.variants.find((variant) => variant.id === selectedProduct.id);
    const selectedImageUrl = selectedProduct.mediaId
      ? `/api/media/${encodeURIComponent(selectedProduct.mediaId)}`
      : selectedProduct.imageUrl ?? selectedVariant?.imageUrl;
    const response = await fetch("/api/build-studio/snapshot", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey: scenarioRequest.scenarioKey,
        facts: scenarioRequest.facts,
        manufacturerProductId: selectedProduct.manufacturerProductId,
        project: {
          title,
          projectType,
          areaM2,
          colour,
          summary,
          selectedProduct: {
            manufacturerProductId: selectedProduct.manufacturerProductId,
            catalogueId: selectedProduct.id,
            slug: selectedProduct.slug,
            url: selectedProduct.url,
            title: selectedProduct.title,
            brand: selectedProduct.brand,
            price: selectedProduct.price,
            mediaId: selectedProduct.mediaId,
            imageUrl: selectedImageUrl,
            imageAlt: selectedProduct.mediaAlt,
            colour: selectedVariant?.colourHint ?? selectedVariant?.tintBaseHint,
            size: selectedVariant ? `${selectedVariant.packValue}${selectedVariant.packUnit}` : undefined,
            packValue: selectedVariant?.packValue,
            packUnit: selectedVariant?.packUnit,
            tintBase: selectedVariant?.tintBaseHint,
            finish: selectedVariant?.finishHint
          },
          kit: snapshotKit()
        }
      })
    });
    if (!response.ok) throw new Error("snapshot failed");
    const payload = await response.json() as { snapshotId?: string };
    if (!payload.snapshotId) throw new Error("snapshot missing");
    setSnapshotId(payload.snapshotId);
    return payload.snapshotId;
  }

  async function downloadPdf() {
    setPdfState("loading");
    try {
      const id = await ensureSnapshot();
      const response = await fetch(`/api/build-studio/project-guide?snapshotId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("pdf failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "konta-mou-paint-build-project-kit.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  function renderItem(item: MutableKitItem) {
    const minimum = recommendedQuantity.get(item.canonicalVariantId);
    const shortfall = item.required && item.selected && minimum != null && item.quantity < minimum;
    return (
      <div className={styles.kitItem} key={item.canonicalVariantId}>
        <label className={styles.kitCheck}>
          <input type="checkbox" checked={item.selected} onChange={() => toggleItem(item.canonicalVariantId)} />
          <span />
        </label>
        <div className={styles.kitItemCopy}>
          <div className={styles.kitItemTitle}>
            <strong>{item.title}</strong>
            {item.required ? <b>ΑΠΑΡΑΙΤΗΤΟ ΓΙΑ ΤΟ ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΥΣΤΗΜΑ</b> : null}
          </div>
          <small>{item.sourceLayer === "MANUFACTURER_VITEX" ? "VITEX · επαληθευμένο σύστημα" : "ΚΟΝΤΑ ΜΟΥ · κανόνες υλικών έργου"}</small>
          <p>{item.reasonEl}</p>
          <button type="button" className={styles.kitDetailButton} onClick={() => setDetailItem(item)}>ΔΕΣ ΛΕΠΤΟΜΕΡΕΙΕΣ</button>
          {shortfall ? <em>Η ποσότητα είναι μικρότερη από την υπολογισμένη απαίτηση· το έργο θεωρείται ελλιπές.</em> : null}
        </div>
        <div className={styles.kitQuantity}>
          <button type="button" onClick={() => setItemQuantity(item.canonicalVariantId, item.quantity - 1)} aria-label="Μείωση ποσότητας">−</button>
          <input type="number" min={1} max={99} value={item.quantity} onChange={(event) => setItemQuantity(item.canonicalVariantId, Number(event.target.value))} />
          <button type="button" onClick={() => setItemQuantity(item.canonicalVariantId, item.quantity + 1)} aria-label="Αύξηση ποσότητας">+</button>
        </div>
        <div className={styles.kitPrice}><strong>{displayMoney(item.priceMinor * item.quantity)}</strong><small>{item.quantity} × {item.price}</small></div>
      </div>
    );
  }

  return (
    <section className={styles.resultScreen}>
      <div className={styles.resultIntro}>
        <span className={styles.kicker}>{eyebrow}</span>
        <h1>Το έργο σου</h1>
        <p>{title} · {summary}</p>
        <div className={complete ? styles.kitComplete : styles.kitIncomplete}>
          <strong>{complete ? "ΕΠΑΛΗΘΕΥΜΕΝΟ ΣΥΣΤΗΜΑ · ΠΛΗΡΕΣ" : "ΤΟ ΕΡΓΟ ΕΙΝΑΙ ΕΛΛΙΠΕΣ"}</strong>
          <span>{complete ? "Όλα τα απαιτούμενα υλικά και οι υπολογισμένες ποσότητες παραμένουν επιλεγμένα." : "Ένα απαιτούμενο υλικό λείπει, έχει αφαιρεθεί ή δεν έχει ακόμη επαληθευμένη αυτόματη ποσότητα."}</span>
        </div>
        {colour ? <div className={styles.resultSwatch}><span style={{ background: colour }} /><div><small>ΤΟ ΧΡΩΜΑ ΣΟΥ</small><strong>{colour}</strong></div></div> : null}
      </div>

      <div className={styles.kitSummaryGrid}>
        <div><small>ΕΠΙΦΑΝΕΙΑ</small><strong>{areaM2} m²</strong></div>
        <div><small>ΘΕΩΡΗΤΙΚΗ ΑΠΑΙΤΗΣΗ</small><strong>{projectKit.quantityEstimate.status === "available" ? `${projectKit.quantityEstimate.min}–${projectKit.quantityEstimate.max} L` : "Μη διαθέσιμη"}</strong></div>
        <div><small>ΠΡΟΤΕΙΝΟΜΕΝΗ ΑΓΟΡΑ</small><strong>{projectKit.packPlan ? projectKit.packPlan.lines.map((line) => `${line.quantity}×${paintBuildPackageLabel(`${line.variant.packValue}${line.variant.packUnit}`)}`).join(" + ") : "Απαιτείται συμπλήρωση δεδομένων"}</strong></div>
      </div>

      {requiredItems.length ? <div className={styles.kitGroup}><div className={styles.kitGroupHead}><span>01</span><div><small>ΣΥΣΤΗΜΑ VITEX</small><h2>Απαιτούμενα υλικά συστήματος</h2></div></div>{requiredItems.map(renderItem)}</div> : null}

      {unresolvedRequired.length ? (
        <div className={styles.warningPanel}>
          <strong>Υπάρχουν απαιτούμενα υλικά που δεν μπορούν ακόμη να μπουν αυτόματα στο kit.</strong>
          {unresolvedRequired.map((item, index) => <p key={index}>{unresolvedText(item)}</p>)}
        </div>
      ) : null}

      <div className={styles.kitGroup}>
        <div className={styles.kitGroupHead}><span>02</span><div><small>ΚΑΝΟΝΕΣ ΚΟΝΤΑ ΜΟΥ</small><h2>Προτεινόμενα υλικά εργασίας</h2></div></div>
        {recommendedItems.length ? recommendedItems.map(renderItem) : <p className={styles.kitEmpty}>Δεν υπάρχουν ακόμη πραγματικά διαθέσιμα προϊόντα στις αντίστοιχες κατηγορίες του καταλόγου.</p>}
      </div>

      <div className={styles.kitGroup}>
        <div className={styles.kitGroupHead}><span>03</span><div><small>ΠΡΟΑΙΡΕΤΙΚΑ</small><h2>Προαιρετικά extras</h2></div></div>
        {optionalItems.length ? optionalItems.map(renderItem) : <p className={styles.kitEmpty}>Δεν υπάρχουν ακόμη διαθέσιμα προαιρετικά αξεσουάρ για αυτό το έργο.</p>}
      </div>

      {missingAccessories.length ? (
        <details className={styles.catalogueGap}>
          <summary>Κενά καταλόγου για αξεσουάρ ({missingAccessories.length})</summary>
          <p>Οι παρακάτω ανάγκες έχουν κανόνα έργου, αλλά δεν υπάρχει ακόμη πωλήσιμο canonical προϊόν στη σωστή κατηγορία. Δεν εμφανίζουμε ψεύτικα προϊόντα.</p>
          <ul>{missingAccessories.map((slot) => <li key={slot.ruleKey}>{slot.label}</li>)}</ul>
        </details>
      ) : null}

      <div className={styles.kitFooter}>
        <div>
          <small>ΕΚΤΙΜΩΜΕΝΟ ΣΥΝΟΛΟ ΕΡΓΟΥ</small>
          <strong>{displayMoney(totalMinor)}</strong>
          <span>{selectedItems.length} επιλεγμένα είδη · τιμές κατά τη δημιουργία του kit</span>
        </div>
        <div className={styles.kitActions}>
          <button type="button" className={styles.primaryAction} disabled={!selectedItems.length || cartState === "loading"} onClick={() => void addProjectToCart()}>
            {cartState === "loading" ? "ΕΛΕΓΧΟΣ ΔΙΑΘΕΣΙΜΟΤΗΤΑΣ…" : cartState === "added" ? "ΠΡΟΣΤΕΘΗΚΕ ΣΤΟ ΚΑΛΑΘΙ ✓" : "ΠΡΟΣΘΗΚΗ ΟΛΟΥ ΤΟΥ ΕΡΓΟΥ ΣΤΟ ΚΑΛΑΘΙ"}
          </button>
          <button type="button" className={styles.secondaryAction} disabled={pdfState === "loading"} onClick={() => void downloadPdf()}>
            {pdfState === "loading" ? "ΔΗΜΙΟΥΡΓΙΑ PDF…" : "ΔΗΜΙΟΥΡΓΙΑ PDF ΕΡΓΟΥ"}
          </button>
        </div>
        {cartState === "error" ? <small role="alert">Κάποιο επιλεγμένο προϊόν δεν είναι πλέον διαθέσιμο ή άλλαξε. Το καλάθι δεν ενημερώθηκε μερικώς.</small> : null}
        {pdfState === "error" ? <small role="alert">Το PDF δεν δημιουργήθηκε. Δοκίμασε ξανά.</small> : null}
        {!complete ? <p>Μπορείς να προσθέσεις τα επιλεγμένα προϊόντα ή να δημιουργήσεις PDF, αλλά το Studio θα διατηρήσει εμφανή την ένδειξη ότι το επαληθευμένο σύστημα είναι ελλιπές.</p> : null}
      </div>

      <div className={styles.resultActions}>
        <button type="button" className={styles.secondaryAction} onClick={onChangeProduct}>ΑΛΛΑΓΗ ΠΡΟΪΟΝΤΟΣ</button>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
      {detailItem ? <KitItemDetailsOverlay item={detailItem} onClose={() => setDetailItem(undefined)} /> : null}
    </section>
  );
}

export function BuildStudioGuidanceResult({
  eyebrow,
  title,
  summary,
  projectType,
  areaM2,
  scenarioRequest,
  candidateTerms,
  colour,
  onRestart
}: {
  eyebrow: string;
  title: string;
  summary: string;
  projectType: "paint" | "waterproofing" | "insulation" | "repair";
  areaM2: number;
  scenarioRequest: BuildGuidanceScenarioRequest | null;
  candidateTerms: readonly string[];
  colour?: string;
  onRestart: () => void;
}) {
  const [guide, setGuide] = useState<CustomerGuide | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<BuildStudioCandidate>();
  const [projectKit, setProjectKit] = useState<BuildStudioProjectKit>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unsupported" | "error">(
    scenarioRequest ? "loading" : "unsupported"
  );

  const scenarioKey = scenarioRequest?.scenarioKey ?? "";
  const factsJson = JSON.stringify(scenarioRequest?.facts ?? {});

  useEffect(() => {
    setSelectedProduct(undefined);
    setProjectKit(undefined);
  }, [scenarioKey, factsJson]);

  useEffect(() => {
    if (!scenarioKey) {
      setGuide(null);
      setLoadState("unsupported");
      return;
    }
    const controller = new AbortController();
    setGuide(null);
    setLoadState("loading");
    void fetch("/api/build-studio/guidance", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey,
        facts: JSON.parse(factsJson) as Record<string, unknown>,
        manufacturerProductId: null
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Guidance request failed: ${response.status}`);
        return response.json() as Promise<{ customerGuide?: CustomerGuide }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload.customerGuide) throw new Error("Guidance response is incomplete");
        setGuide(payload.customerGuide);
        setLoadState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGuide(null);
        setLoadState("error");
      });
    return () => controller.abort();
  }, [scenarioKey, factsJson]);

  if (projectKit && selectedProduct && scenarioRequest) {
    return (
      <ProjectKitScreen
        eyebrow={eyebrow}
        title={title}
        summary={summary}
        colour={colour}
        projectType={projectType}
        areaM2={areaM2}
        scenarioRequest={scenarioRequest}
        selectedProduct={selectedProduct}
        projectKit={projectKit}
        onChangeProduct={() => {
          setProjectKit(undefined);
          setSelectedProduct(undefined);
        }}
        onRestart={onRestart}
      />
    );
  }

  const canChooseProduct = loadState === "ready" && guide && !guide.blocked && !guide.guidanceConflict;

  return (
    <section className={styles.resultScreen}>
      <div className={styles.resultIntro}>
        <span className={styles.kicker}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        {colour ? <div className={styles.resultSwatch}><span style={{ background: colour }} /><div><small>ΤΟ ΧΡΩΜΑ ΣΟΥ</small><strong>{colour}</strong></div></div> : null}
      </div>

      {loadState === "loading" ? <div className={styles.warningPanel} role="status"><strong>Ελέγχω την επαληθευμένη τεχνική καθοδήγηση…</strong><p>Οι οδηγίες φορτώνονται από τη βάση τεκμηρίωσης του Paint & Build Studio.</p></div> : null}
      {loadState === "unsupported" ? <div className={styles.warningPanel}><strong>Η τεχνική καθοδήγηση για αυτόν τον συνδυασμό δεν έχει ακόμη επαληθευτεί.</strong><p>Το Studio σταματά εδώ αντί να εμφανίσει υποθετικές οδηγίες ή προϊόντα.</p></div> : null}
      {loadState === "error" ? <div className={styles.warningPanel}><strong>Η επαληθευμένη τεχνική καθοδήγηση δεν είναι διαθέσιμη αυτή τη στιγμή.</strong><p>Για ασφάλεια δεν εμφανίζουμε μη τεκμηριωμένο fallback.</p></div> : null}
      {loadState === "ready" && guide?.guidanceConflict ? <div className={styles.warningPanel}><strong>Απαιτείται τεχνικός έλεγχος των οδηγιών.</strong><p>Υπάρχει σύγκρουση μεταξύ πηγών και το Studio δεν την επιλύει σιωπηρά.</p></div> : null}

      {loadState === "ready" && guide?.blocked ? (
        <>
          <div className={styles.warningPanel}><strong>Μην προχωρήσεις ακόμη σε επιλογή προϊόντος.</strong><p>Έχει ενεργοποιηθεί κανόνας ΚΟΝΤΑ ΜΟΥ που απαιτεί πρώτα έλεγχο ή αποκατάσταση της αιτίας.</p></div>
          <div className={styles.resultCard}><GuideList title="Πριν ξεκινήσεις" items={guide.beforeYouStart} /><GuideList title="Προσοχή" items={guide.warnings} /></div>
        </>
      ) : null}

      {canChooseProduct ? (
        <BuildStudioProductChooser
          terms={candidateTerms}
          scenarioKey={scenarioKey}
          facts={scenarioRequest?.facts ?? {}}
          areaM2={areaM2}
          onProjectKitReady={(kit, product) => {
            setSelectedProduct(product);
            setProjectKit(kit);
            window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 40);
          }}
        />
      ) : null}

      <div className={styles.resultActions}>
        <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
    </section>
  );
}
