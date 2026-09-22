"use client";

import { useEffect, useState } from "react";
import type { BuildGuidanceScenarioRequest } from "../lib/build-guidance-scenario-map";
import { BuildStudioProductChooser, type BuildStudioCandidate } from "./BuildStudioProductChooser";
import {
  BuildStudioProductDetailsOverlay,
  BuildStudioProjectKit,
  type BuildStudioProjectKitLine
} from "./BuildStudioProjectKit";
import styles from "./PaintBuildStudioExperience.module.css";

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

function ProjectGuidanceScreen({
  eyebrow,
  title,
  summary,
  colour,
  guide,
  selectedProduct,
  quantity,
  snapshotId,
  pdfState,
  onDownloadPdf,
  onChangeProduct,
  onRestart
}: {
  eyebrow: string;
  title: string;
  summary: string;
  colour?: string;
  guide: CustomerGuide;
  selectedProduct: BuildStudioCandidate;
  quantity: QuantityEstimate;
  snapshotId: string;
  pdfState: "idle" | "loading" | "error";
  onDownloadPdf: () => void;
  onChangeProduct: () => void;
  onRestart: () => void;
}) {
  const quantityText = quantity.status === "available" && quantity.min != null && quantity.max != null
    ? quantity.min === quantity.max
      ? `${quantity.min} ${quantity.unit ?? ""}`
      : `${quantity.min}–${quantity.max} ${quantity.unit ?? ""}`
    : "Δεν υπολογίστηκε χωρίς πλήρη manufacturer values.";

  return (
    <section className={styles.resultScreen} data-project-snapshot={snapshotId}>
      <div className={styles.resultIntro}>
        <span className={styles.kicker}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        <div className={styles.confirmedBadge}>ΑΝΑΦΟΡΑ ΕΡΓΟΥ · {snapshotId}</div>
        {colour ? (
          <div className={styles.resultSwatch}>
            <span style={{ background: colour }} />
            <div><small>ΤΟ ΧΡΩΜΑ ΣΟΥ</small><strong>{colour}</strong></div>
          </div>
        ) : null}
      </div>

      <div className={styles.resultGroup}>
        <div className={styles.resultGroupHeader}>
          <span>01</span>
          <div><small>PROJECT</small><h2>ΤΟ ΕΡΓΟ ΣΟΥ</h2></div>
        </div>
        <div className={styles.resultCard}>
          <GuideList title="Πριν ξεκινήσεις" items={guide.beforeYouStart} />
          <GuideList title="Προετοιμασία" items={guide.preparation} />
        </div>
        <div className={styles.resultCard}>
          <GuideList title="Βήμα-βήμα" items={guide.stepByStep} />
          <GuideList title="Τι να αποφύγεις" items={guide.avoid} />
          <GuideList title="Προσοχή" items={guide.warnings} />
        </div>
        {guide.afterApplication.length ? (
          <div className={styles.resultCard}>
            <GuideList title="Μετά την εφαρμογή / Συντήρηση" items={guide.afterApplication} />
          </div>
        ) : null}
      </div>

      <div className={styles.resultGroup}>
        <div className={styles.resultGroupHeader}>
          <span>02</span>
          <div><small>MATERIALS</small><h2>ΤΑ ΥΛΙΚΑ ΣΟΥ</h2></div>
        </div>
        <div className={styles.materialSummary}>
          <div>
            <small>{selectedProduct.brand || selectedProduct.categoryLabel || "VITEX"}</small>
            <strong>{selectedProduct.title}</strong>
            <span>{selectedProduct.price}</span>
          </div>
          <div>
            <small>ΘΕΩΡΗΤΙΚΗ ΠΟΣΟΤΗΤΑ</small>
            <strong>{quantityText}</strong>
            <span>{quantity.basisEl}</span>
          </div>
        </div>
        <div className={styles.resultCard}>
          <GuideList title="Τι χρειάζεσαι" items={guide.whatYouNeed} />
        </div>
      </div>

      <div className={styles.resultGroup}>
        <div className={styles.resultGroupHeader}>
          <span>03</span>
          <div><small>PRODUCT INSTRUCTIONS</small><h2>ΟΔΗΓΙΕΣ ΓΙΑ ΤΑ ΠΡΟΪΟΝΤΑ ΠΟΥ ΕΠΕΛΕΞΕΣ</h2></div>
        </div>
        <div className={styles.resultCard}>
          <GuideList title="Οδηγίες προϊόντος" items={guide.manufacturerInstructions} />
          <GuideList title="Χρόνοι" items={guide.timings} />
          <div className={styles.resultColumn}>
            <h2>Ποσότητα</h2>
            <p className={styles.quantityCopy}>{guide.quantity.explanationEl}</p>
          </div>
        </div>
      </div>

      {guide.guidanceConflict ? (
        <div className={styles.warningPanel}>
          <strong>Απαιτείται τεχνικός έλεγχος των οδηγιών.</strong>
          <p>Υπάρχει σύγκρουση τεκμηριωμένης καθοδήγησης. Δεν γίνεται αυτόματη συγχώνευση.</p>
        </div>
      ) : null}

      <div className={styles.pdfPanel}>
        <div>
          <span>PROJECT DOSSIER</span>
          <strong>Κράτησε τον αναλυτικό οδηγό του έργου.</strong>
          <p>Το PDF χρησιμοποιεί το ίδιο αμετάβλητο snapshot με αυτή την οθόνη. Αν είσαι συνδεδεμένος, αποθηκεύεται και στα «Τα Έγγραφά μου» όταν το δημιουργήσεις.</p>
        </div>
        <button type="button" className={styles.primaryAction} disabled={pdfState === "loading"} onClick={onDownloadPdf}>
          {pdfState === "loading" ? "ΔΗΜΙΟΥΡΓΙΑ PDF…" : "ΛΗΨΗ ΑΝΑΛΥΤΙΚΟΥ ΟΔΗΓΟΥ PDF"}
        </button>
        {pdfState === "error" ? <small role="alert">Το PDF δεν δημιουργήθηκε. Δοκίμασε ξανά.</small> : null}
      </div>

      {detailProduct && scenarioRequest ? (
        <BuildStudioProductDetailsOverlay
          product={detailProduct}
          scenarioKey={scenarioKey}
          facts={scenarioRequest.facts}
          areaM2={areaM2}
          onClose={() => setDetailProduct(undefined)}
          onChoose={chooseProductForProject}
        />
      ) : null}

      <div className={styles.resultActions}>
        <button type="button" className={styles.secondaryAction} onClick={onChangeProduct}>ΑΛΛΑΓΗ ΠΡΟΪΟΝΤΟΣ</button>
        <a href="/account/documents" className={styles.secondaryAction}>ΤΑ ΕΓΓΡΑΦΑ ΜΟΥ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
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
  const [selectedManufacturerProductId, setSelectedManufacturerProductId] = useState<string>();
  const [selectedProduct, setSelectedProduct] = useState<BuildStudioCandidate>();
  const [detailProduct, setDetailProduct] = useState<BuildStudioCandidate>();
  const [kitMode, setKitMode] = useState(false);
  const [snapshotId, setSnapshotId] = useState("");
  const [quantity, setQuantity] = useState<QuantityEstimate | null>(null);
  const [finalMode, setFinalMode] = useState(false);
  const [snapshotState, setSnapshotState] = useState<"idle" | "loading" | "error">("idle");
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unsupported" | "error">(
    scenarioRequest ? "loading" : "unsupported"
  );

  const scenarioKey = scenarioRequest?.scenarioKey ?? "";
  const factsJson = JSON.stringify(scenarioRequest?.facts ?? {});

  useEffect(() => {
    setSelectedManufacturerProductId(undefined);
    setSelectedProduct(undefined);
    setDetailProduct(undefined);
    setKitMode(false);
    setSnapshotId("");
    setQuantity(null);
    setFinalMode(false);
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
        manufacturerProductId: selectedManufacturerProductId ?? null
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
  }, [scenarioKey, factsJson, selectedManufacturerProductId]);

  const canChooseProduct = loadState === "ready" && guide && !guide.blocked && !guide.guidanceConflict;
  const selectedProductVerified = Boolean(
    selectedProduct
    && selectedManufacturerProductId
    && selectedProduct.manufacturerProductId === selectedManufacturerProductId
    && selectedProduct.technicalVerificationStatus === "verified"
    && guide
    && guide.quantity.status !== "manufacturer_not_selected"
  );

  function handleProduct(product: BuildStudioCandidate | undefined) {
    setSelectedProduct(product);
    setSnapshotId("");
    setQuantity(null);
    setFinalMode(false);
    setSnapshotState("idle");
  }

  function chooseProductForProject(product: BuildStudioCandidate) {
    setSelectedManufacturerProductId(product.manufacturerProductId);
    handleProduct(product);
    setDetailProduct(undefined);
    setKitMode(true);
  }

  async function openFinalGuide(
    downloadImmediately = false,
    projectKit: readonly (BuildStudioProjectKitLine & { selected: boolean })[] = []
  ) {
    if (!scenarioRequest || !selectedProduct || !selectedManufacturerProductId) return;
    setSnapshotState("loading");
    try {
      const response = await fetch("/api/build-studio/snapshot", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioKey,
          facts: scenarioRequest.facts,
          manufacturerProductId: selectedManufacturerProductId,
          project: {
            title,
            projectType,
            areaM2,
            colour,
            summary,
            selectedProduct: {
              manufacturerProductId: selectedProduct.manufacturerProductId,
              catalogueId: selectedProduct.id,
              title: selectedProduct.title,
              brand: selectedProduct.brand,
              price: selectedProduct.price
            },
            projectKit
          }
        })
      });
      if (!response.ok) throw new Error("snapshot failed");
      const payload = await response.json() as {
        snapshotId?: string;
        customerGuide?: CustomerGuide;
        quantityEstimate?: QuantityEstimate;
      };
      if (!payload.snapshotId || !payload.customerGuide || !payload.quantityEstimate) throw new Error("snapshot incomplete");
      setSnapshotId(payload.snapshotId);
      setGuide(payload.customerGuide);
      setQuantity(payload.quantityEstimate);
      setFinalMode(true);
      setSnapshotState("idle");
      if (downloadImmediately) await downloadPdfForSnapshot(payload.snapshotId);
    } catch {
      setSnapshotState("error");
    }
  }

  async function downloadPdfForSnapshot(targetSnapshotId: string) {
    setPdfState("loading");
    try {
      const response = await fetch(`/api/build-studio/project-guide?snapshotId=${encodeURIComponent(targetSnapshotId)}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error("pdf failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "konta-mou-paint-build-guide.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  async function downloadPdf() {
    if (!snapshotId) return;
    await downloadPdfForSnapshot(snapshotId);
  }

  if (finalMode && guide && selectedProduct && quantity && snapshotId) {
    return <ProjectGuidanceScreen
      eyebrow={eyebrow}
      title={title}
      summary={summary}
      colour={colour}
      guide={guide}
      selectedProduct={selectedProduct}
      quantity={quantity}
      snapshotId={snapshotId}
      pdfState={pdfState}
      onDownloadPdf={() => void downloadPdf()}
      onChangeProduct={() => {
        setFinalMode(false);
        setKitMode(true);
        setSnapshotId("");
      }}
      onRestart={onRestart}
    />;
  }

  if (kitMode && selectedProduct && scenarioRequest) {
    return <BuildStudioProjectKit
      product={selectedProduct}
      scenarioKey={scenarioKey}
      facts={scenarioRequest.facts}
      areaM2={areaM2}
      onBack={() => setKitMode(false)}
      onCreatePdf={(projectKit) => openFinalGuide(true, projectKit)}
    />;
  }

  return (
    <section className={styles.resultScreen}>
      <div className={styles.resultIntro}>
        <span className={styles.kicker}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        {colour ? (
          <div className={styles.resultSwatch}>
            <span style={{ background: colour }} />
            <div><small>ΤΟ ΧΡΩΜΑ ΣΟΥ</small><strong>{colour}</strong></div>
          </div>
        ) : null}
      </div>

      {loadState === "loading" ? (
        <div className={styles.warningPanel} role="status">
          <strong>Ελέγχω την επαληθευμένη τεχνική καθοδήγηση…</strong>
          <p>Οι οδηγίες φορτώνονται από τη βάση τεκμηρίωσης του Paint & Build Studio.</p>
        </div>
      ) : null}

      {loadState === "unsupported" ? (
        <div className={styles.warningPanel}>
          <strong>Η τεχνική καθοδήγηση για αυτόν τον συνδυασμό δεν έχει ακόμη επαληθευτεί.</strong>
          <p>Το Studio σταματά εδώ αντί να εμφανίσει υποθετικές οδηγίες ή προϊόντα.</p>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className={styles.warningPanel}>
          <strong>Η επαληθευμένη τεχνική καθοδήγηση δεν είναι διαθέσιμη αυτή τη στιγμή.</strong>
          <p>Για ασφάλεια δεν εμφανίζουμε μη τεκμηριωμένο fallback.</p>
        </div>
      ) : null}

      {loadState === "ready" && guide?.guidanceConflict ? (
        <div className={styles.warningPanel}>
          <strong>Απαιτείται τεχνικός έλεγχος των οδηγιών.</strong>
          <p>Υπάρχει σύγκρουση μεταξύ πηγών και το Studio δεν την επιλύει σιωπηρά.</p>
        </div>
      ) : null}

      {loadState === "ready" && guide?.blocked ? (
        <>
          <div className={styles.warningPanel}>
            <strong>Μην προχωρήσεις ακόμη σε επιλογή προϊόντος.</strong>
            <p>Έχει ενεργοποιηθεί κανόνας ΚΟΝΤΑ ΜΟΥ που απαιτεί πρώτα έλεγχο ή αποκατάσταση της αιτίας.</p>
          </div>
          <div className={styles.resultCard}>
            <GuideList title="Πριν ξεκινήσεις" items={guide.beforeYouStart} />
            <GuideList title="Προσοχή" items={guide.warnings} />
          </div>
        </>
      ) : null}

      {canChooseProduct ? (
        <BuildStudioProductChooser
          terms={candidateTerms}
          scenarioKey={scenarioKey}
          facts={scenarioRequest?.facts ?? {}}
          selectedCatalogueId={selectedProduct?.id}
          onManufacturerProductChange={setSelectedManufacturerProductId}
          onSelectionChange={handleProduct}
          onDetails={setDetailProduct}
        />
      ) : null}

      {canChooseProduct ? (
        <div className={styles.pdfPanel}>
          <div>
            <span>PROJECT KIT · ΕΠΟΜΕΝΟ ΒΗΜΑ</span>
            <strong>
              {selectedProductVerified && selectedProduct
                ? "Χτίσε το πλήρες καλάθι του έργου."
                : "Διάλεξε προϊόν ή άνοιξε τις λεπτομέρειές του."}
            </strong>
            <p>
              {selectedProductVerified && selectedProduct
                ? `${selectedProduct.brand || "VITEX"} · ${selectedProduct.price}. Στο επόμενο βήμα υπολογίζουμε ποσότητα, προτείνουμε εργαλεία/προστασία και ετοιμάζουμε PDF + καλάθι.`
                : "Με το «Δες λεπτομέρειες» βλέπεις τον τεχνικό λόγο επιλογής και την ποσότητα πριν αποφασίσεις."}
            </p>
          </div>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!selectedProductVerified || !selectedProduct}
            onClick={() => setKitMode(true)}
          >
            {selectedProductVerified ? "ΣΥΝΕΧΕΙΑ ΣΤΟ ΠΛΗΡΕΣ PROJECT KIT" : "ΕΠΙΛΕΞΕ ΠΡΟΪΟΝ"}
          </button>
        </div>
      ) : null}

      <div className={styles.resultActions}>
        <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
    </section>
  );
}
