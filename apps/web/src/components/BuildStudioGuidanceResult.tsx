"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildGuidanceScenarioRequest } from "../lib/build-guidance-scenario-map";
import { BuildStudioProductChooser, type BuildStudioCandidate } from "./BuildStudioProductChooser";
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
  quantity: {
    status: "manufacturer_not_selected" | "manufacturer_data_missing" | "manufacturer_data_available";
    explanationEl: string;
  };
};

type ActionState = "idle" | "working" | "saved" | "auth_required" | "error";

function sourceLabel(layer: SourceLayer): string {
  switch (layer) {
    case "GENERAL_GUIDANCE":
      return "Γενική τεχνική καθοδήγηση";
    case "MANUFACTURER_VITEX":
      return "Οδηγίες κατασκευαστή · VITEX";
    case "MANUFACTURER":
      return "Οδηγίες κατασκευαστή";
    default:
      return "Κανόνας ασφάλειας · ΚΟΝΤΑ ΜΟΥ";
  }
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

function actionMessage(state: ActionState): string | undefined {
  if (state === "working") return "Ετοιμάζω το έγγραφο από το επαληθευμένο snapshot…";
  if (state === "saved") return "Ο οδηγός αποθηκεύτηκε στα Έγγραφά σου.";
  if (state === "auth_required") return "Για αποθήκευση στα Έγγραφά σου χρειάζεται σύνδεση στον λογαριασμό σου.";
  if (state === "error") return "Δεν ολοκληρώθηκε η ενέργεια. Δοκίμασε ξανά.";
  return undefined;
}

export function BuildStudioGuidanceResult({
  eyebrow,
  title,
  summary,
  scenarioRequest,
  candidateTerms,
  colour,
  onRestart
}: {
  eyebrow: string;
  title: string;
  summary: string;
  scenarioRequest: BuildGuidanceScenarioRequest | null;
  candidateTerms: readonly string[];
  colour?: string;
  onRestart: () => void;
}) {
  const [guide, setGuide] = useState<CustomerGuide | null>(null);
  const [selectedManufacturerProductId, setSelectedManufacturerProductId] = useState<string>();
  const [selectedProduct, setSelectedProduct] = useState<BuildStudioCandidate>();
  const [finalized, setFinalized] = useState(false);
  const [pdfState, setPdfState] = useState<ActionState>("idle");
  const [saveState, setSaveState] = useState<ActionState>("idle");
  const [savedDocumentId, setSavedDocumentId] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unsupported" | "error">(
    scenarioRequest ? "loading" : "unsupported"
  );

  const scenarioKey = scenarioRequest?.scenarioKey ?? "";
  const factsJson = JSON.stringify(scenarioRequest?.facts ?? {});

  const handleManufacturerProductChange = useCallback((manufacturerProductId: string | undefined) => {
    setSelectedManufacturerProductId(manufacturerProductId);
    setFinalized(false);
    setPdfState("idle");
    setSaveState("idle");
    setSavedDocumentId(undefined);
  }, []);

  const handleProductChange = useCallback((product: BuildStudioCandidate | undefined) => {
    setSelectedProduct(product);
    if (!product) setFinalized(false);
  }, []);

  useEffect(() => {
    setSelectedManufacturerProductId(undefined);
    setSelectedProduct(undefined);
    setFinalized(false);
    setPdfState("idle");
    setSaveState("idle");
    setSavedDocumentId(undefined);
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
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
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

  const canChooseProduct =
    loadState === "ready" &&
    guide !== null &&
    guide.blocked === false &&
    guide.guidanceConflict === false;

  const canFinalize =
    canChooseProduct &&
    selectedProduct !== undefined &&
    selectedManufacturerProductId === selectedProduct.manufacturerProductId;

  function projectGuideRequest() {
    return {
      project: { eyebrow, title, summary, colour },
      scenarioKey,
      facts: scenarioRequest?.facts ?? {},
      manufacturerProductId: selectedManufacturerProductId
    };
  }

  async function downloadPdf() {
    if (!canFinalize) return;
    setPdfState("working");
    try {
      const response = await fetch("/api/build-studio/project-guide/pdf", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/pdf" },
        body: JSON.stringify(projectGuideRequest())
      });
      if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "konta-mou-paint-build-project-guide.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  async function saveDocument() {
    if (!canFinalize) return;
    setSaveState("working");
    try {
      const sessionResponse = await fetch("/api/account/session", { cache: "no-store", headers: { Accept: "application/json" } });
      if (sessionResponse.status === 401) {
        setSaveState("auth_required");
        return;
      }
      if (!sessionResponse.ok) throw new Error("Session unavailable");
      const session = await sessionResponse.json() as { csrfToken?: string };
      if (!session.csrfToken) throw new Error("CSRF token unavailable");

      const response = await fetch("/api/account/documents", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-csrf-token": session.csrfToken
        },
        body: JSON.stringify(projectGuideRequest())
      });
      if (response.status === 401) {
        setSaveState("auth_required");
        return;
      }
      if (!response.ok) throw new Error(`Save request failed: ${response.status}`);
      const payload = await response.json() as { document?: { id?: string } };
      setSavedDocumentId(payload.document?.id);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  if (finalized && guide && selectedProduct && canFinalize) {
    return (
      <section className={styles.resultScreen}>
        <div className={styles.finalIntro}>
          <span className={styles.kicker}>ΤΟ ΠΛΑΝΟ ΤΟΥ ΕΡΓΟΥ ΣΟΥ</span>
          <h1>Όλα όσα χρειάζεσαι, σε μία καθαρή σειρά.</h1>
          <p>
            Αυτό είναι το τελικό snapshot του έργου και της επαληθευμένης επιλογής σου.
            Το PDF δημιουργείται ξανά από τον server με τον ίδιο τεχνικό έλεγχο πριν εκδοθεί.
          </p>
        </div>

        <section className={styles.finalGroup}>
          <div className={styles.finalGroupHeader}>
            <span>01</span>
            <div>
              <small>PROJECT SNAPSHOT</small>
              <h2>ΤΟ ΕΡΓΟ ΣΟΥ</h2>
            </div>
          </div>
          <div className={styles.finalProjectMeta}>
            <div><small>ΛΥΣΗ</small><strong>{title}</strong></div>
            <div><small>ΣΥΝΟΨΗ</small><strong>{summary}</strong></div>
            {colour ? <div><small>ΑΠΟΧΡΩΣΗ</small><strong>{colour}</strong><i style={{ background: colour }} /></div> : null}
          </div>
        </section>

        <section className={styles.finalGroup}>
          <div className={styles.finalGroupHeader}>
            <span>02</span>
            <div>
              <small>VERIFIED PRODUCT</small>
              <h2>ΤΑ ΥΛΙΚΑ ΣΟΥ</h2>
            </div>
          </div>
          <div className={styles.finalMaterialCard}>
            <div>
              <small>{selectedProduct.brand || selectedProduct.categoryLabel || "KONTA MOY"}</small>
              <strong>{selectedProduct.title}</strong>
              <span>Τεχνικά επαληθευμένο για το συγκεκριμένο έργο · {selectedProduct.price}</span>
            </div>
            <a href={selectedProduct.url}>Δες το προϊόν ↗</a>
          </div>
        </section>

        <section className={styles.finalGroup}>
          <div className={styles.finalGroupHeader}>
            <span>03</span>
            <div>
              <small>GENERAL + MANUFACTURER + KONTA MOU</small>
              <h2>ΟΔΗΓΙΕΣ ΓΙΑ ΤΑ ΠΡΟΪΟΝΤΑ ΠΟΥ ΕΠΕΛΕΞΕΣ</h2>
            </div>
          </div>
          <div className={styles.resultCard}>
            <GuideList title="Πριν ξεκινήσεις" items={guide.beforeYouStart} />
            <GuideList title="Προετοιμασία" items={guide.preparation} />
            <GuideList title="Τι χρειάζεσαι" items={guide.whatYouNeed} />
          </div>
          <div className={styles.resultCard}>
            <GuideList title="Βήμα-βήμα" items={guide.stepByStep} />
            <GuideList title="Οδηγίες προϊόντος" items={guide.manufacturerInstructions} />
            <GuideList title="Χρόνοι" items={guide.timings} />
          </div>
          <div className={styles.resultCard}>
            <GuideList title="Τι να αποφύγεις" items={guide.avoid} />
            <GuideList title="Προσοχή" items={guide.warnings} />
            <div className={styles.resultColumn}>
              <h2>Ποσότητα</h2>
              <p className={styles.quantityCopy}>{guide.quantity.explanationEl}</p>
            </div>
          </div>
        </section>

        <div className={styles.finalActionPanel}>
          <div>
            <small>ΚΡΑΤΗΣΕ ΤΟ ΠΛΑΝΟ ΣΟΥ</small>
            <strong>PDF για όλους · ιδιωτική αρχειοθέτηση για συνδεδεμένους χρήστες.</strong>
          </div>
          <div className={styles.resultActions}>
            <button type="button" className={styles.primaryAction} onClick={downloadPdf} disabled={pdfState === "working"}>
              {pdfState === "working" ? "ΔΗΜΙΟΥΡΓΙΑ PDF…" : "ΛΗΨΗ ΑΝΑΛΥΤΙΚΟΥ PDF"}
            </button>
            <button type="button" className={styles.secondaryAction} onClick={saveDocument} disabled={saveState === "working" || saveState === "saved"}>
              {saveState === "saved" ? "ΑΠΟΘΗΚΕΥΤΗΚΕ" : saveState === "working" ? "ΑΠΟΘΗΚΕΥΣΗ…" : "ΑΠΟΘΗΚΕΥΣΗ ΣΤΑ ΕΓΓΡΑΦΑ ΜΟΥ"}
            </button>
          </div>
          {actionMessage(pdfState) ? <p className={styles.actionStatus}>{actionMessage(pdfState)}</p> : null}
          {actionMessage(saveState) ? <p className={styles.actionStatus}>{actionMessage(saveState)}</p> : null}
          {saveState === "auth_required" ? (
            <a className={styles.documentLink} href="/login?next=/paint-and-build-studio">Σύνδεση στον λογαριασμό →</a>
          ) : null}
          {saveState === "saved" ? (
            <a className={styles.documentLink} href={savedDocumentId ? `/account/documents#document-${savedDocumentId}` : "/account/documents"}>
              Άνοιξε τα Έγγραφά μου →
            </a>
          ) : null}
        </div>

        <div className={styles.resultActions}>
          <button type="button" className={styles.secondaryAction} onClick={() => setFinalized(false)}>ΑΛΛΑΓΗ ΠΡΟΪΟΝΤΟΣ</button>
          <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
          <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
        </div>
      </section>
    );
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
          <p>Δεν εμφανίζουμε υποθετικές οδηγίες ή προϊόντα ως κατάλληλα μέχρι να υπάρχει επαρκής τεκμηρίωση.</p>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className={styles.warningPanel}>
          <strong>Η επαληθευμένη τεχνική καθοδήγηση δεν είναι διαθέσιμη αυτή τη στιγμή.</strong>
          <p>Για ασφάλεια δεν εμφανίζουμε τις παλιές γενικές οδηγίες ως υποκατάστατο.</p>
        </div>
      ) : null}

      {loadState === "ready" && guide ? (
        <>
          <div className={styles.resultCard}>
            <GuideList title="Πριν ξεκινήσεις" items={guide.beforeYouStart} />
            <GuideList title="Προετοιμασία" items={guide.preparation} />
            <GuideList title="Τι χρειάζεσαι" items={guide.whatYouNeed} />
          </div>
          <div className={styles.resultCard}>
            <GuideList title="Βήμα-βήμα" items={guide.stepByStep} />
            <GuideList title="Τι να αποφύγεις" items={guide.avoid} />
            <GuideList title="Προσοχή" items={guide.warnings} />
          </div>

          {guide.manufacturerInstructions.length || guide.timings.length ? (
            <div className={styles.resultCard}>
              <GuideList title="Οδηγίες προϊόντος" items={guide.manufacturerInstructions} />
              <GuideList title="Χρόνοι" items={guide.timings} />
              <div className={styles.resultColumn}>
                <h2>Ποσότητα</h2>
                <p className={styles.quantityCopy}>{guide.quantity.explanationEl}</p>
              </div>
            </div>
          ) : (
            <div className={styles.resultCard}>
              <div className={styles.resultColumn}>
                <h2>Ποσότητα</h2>
                <p className={styles.quantityCopy}>{guide.quantity.explanationEl}</p>
              </div>
            </div>
          )}

          {guide.guidanceConflict ? (
            <div className={styles.warningPanel}>
              <strong>Απαιτείται τεχνικός έλεγχος των οδηγιών.</strong>
              <p>Υπάρχει σύγκρουση μεταξύ γενικής καθοδήγησης και ειδικής οδηγίας προϊόντος. Δεν γίνεται αυτόματη συγχώνευση.</p>
            </div>
          ) : null}

          {guide.blocked ? (
            <div className={styles.warningPanel}>
              <strong>Μην προχωρήσεις ακόμη σε επιλογή προϊόντος.</strong>
              <p>Έχει ενεργοποιηθεί κανόνας ΚΟΝΤΑ ΜΟΥ που απαιτεί πρώτα έλεγχο ή αποκατάσταση της αιτίας.</p>
            </div>
          ) : null}
        </>
      ) : null}

      {canChooseProduct ? (
        <BuildStudioProductChooser
          terms={candidateTerms}
          scenarioKey={scenarioKey}
          facts={scenarioRequest?.facts ?? {}}
          selectedManufacturerProductId={selectedManufacturerProductId}
          onManufacturerProductChange={handleManufacturerProductChange}
          onProductChange={handleProductChange}
        />
      ) : null}

      {canFinalize ? (
        <div className={styles.finalizePrompt}>
          <div>
            <small>ΤΟ ΠΡΟΪΟΝ ΕΠΙΒΕΒΑΙΩΘΗΚΕ</small>
            <strong>Δες τώρα τις σημαντικές πληροφορίες, τις οδηγίες και το αναλυτικό PDF του έργου σου.</strong>
          </div>
          <button type="button" className={styles.primaryAction} onClick={() => setFinalized(true)}>
            ΣΥΝΕΧΙΣΕ ΓΙΑ ΣΗΜΑΝΤΙΚΕΣ ΠΛΗΡΟΦΟΡΙΕΣ & ΟΔΗΓΙΕΣ →
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
