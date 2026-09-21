"use client";

import { useEffect, useState } from "react";
import type { BuildGuidanceScenarioRequest } from "../lib/build-guidance-scenario-map";
import { BuildStudioProductChooser } from "./BuildStudioProductChooser";
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
  const [guide, setGuide] = useState<CustomerGuide | null>(null);\n  const [selectedManufacturerProductId, setSelectedManufacturerProductId] = useState<string>();
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unsupported" | "error">(
    scenarioRequest ? "loading" : "unsupported"
  );

  const scenarioKey = scenarioRequest?.scenarioKey ?? "";
  const factsJson = JSON.stringify(scenarioRequest?.facts ?? {});

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
        facts: JSON.parse(factsJson) as Record<string, unknown>
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
          onManufacturerProductChange={setSelectedManufacturerProductId}
        />
      ) : null}

      <div className={styles.resultActions}>
        <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
    </section>
  );
}
