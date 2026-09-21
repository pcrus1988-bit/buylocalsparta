"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuildGuidanceScenarioRequest } from "../lib/build-guidance-scenario-map";
import { BuildStudioProductChooser } from "./BuildStudioProductChooser";
import styles from "./PaintBuildStudioExperience.module.css";

type GuidanceItem = Readonly<{
  key: string;
  sourceLayer: "GENERAL_GUIDANCE" | "MANUFACTURER_VITEX" | "MANUFACTURER" | "KONTA_MOU_RULE";
  textEl: string;
  severity?: string;
  requirement?: string;
  quantityBasis?: string;
  customerCanReplace?: boolean;
}>;

type CustomerGuide = Readonly<{
  status: "ready" | "blocked" | "review_required" | "guidance_partial" | "scenario_not_found";
  blocked: boolean;
  guidanceConflict: boolean;
  beforeYouStart: readonly GuidanceItem[];
  preparation: readonly GuidanceItem[];
  whatYouNeed: readonly GuidanceItem[];
  stepByStep: readonly GuidanceItem[];
  manufacturerInstructions: readonly GuidanceItem[];
  timings: readonly GuidanceItem[];
  avoid: readonly GuidanceItem[];
  warnings: readonly GuidanceItem[];
  quantity: Readonly<{
    status: "manufacturer_not_selected" | "manufacturer_data_missing" | "manufacturer_data_available";
    explanationEl: string;
  }>;
}>;

function sourceLabel(layer: GuidanceItem["sourceLayer"]): string {
  if (layer === "GENERAL_GUIDANCE") return "Γενική τεχνική καθοδήγηση";
  if (layer === "MANUFACTURER_VITEX") return "Οδηγίες κατασκευαστή · VITEX";
  if (layer === "MANUFACTURER") return "Οδηγίες κατασκευαστή";
  return "Κανόνας ασφάλειας · ΚΟΝΤΑ ΜΟΥ";
}

function GuidanceColumn({
  number,
  title,
  items
}: {
  number: string;
  title: string;
  items: readonly GuidanceItem[];
}) {
  if (!items.length) return null;
  return (
    <div className={styles.resultColumn}>
      <span>{number}</span>
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
  const [guide, setGuide] = useState<CustomerGuide>();
  const [state, setState] = useState<"loading" | "ready" | "unsupported" | "error">(
    scenarioRequest ? "loading" : "unsupported"
  );

  const requestKey = useMemo(
    () => scenarioRequest ? JSON.stringify(scenarioRequest) : "",
    [scenarioRequest]
  );

  useEffect(() => {
    if (!scenarioRequest) {
      setGuide(undefined);
      setState("unsupported");
      return;
    }

    const controller = new AbortController();
    setGuide(undefined);
    setState("loading");

    void fetch("/api/build-studio/guidance", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        scenarioKey: scenarioRequest.scenarioKey,
        facts: scenarioRequest.facts
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`build-studio guidance: ${response.status}`);
        return response.json() as Promise<{ customerGuide?: CustomerGuide }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload.customerGuide) throw new Error("missing customer guide");
        setGuide(payload.customerGuide);
        setState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGuide(undefined);
        setState("error");
      });

    return () => controller.abort();
  }, [requestKey]);

  const selectionAllowed = state === "ready" && guide && !guide.blocked && !guide.guidanceConflict;

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

      {state === "loading" ? (
        <div className={styles.warningPanel} role="status">
          <strong>Ελέγχω την επαληθευμένη τεχνική καθοδήγηση…</strong>
          <p>Οι οδηγίες φορτώνονται από τη βάση τεκμηρίωσης του Paint & Build Studio.</p>
        </div>
      ) : null}

      {state === "unsupported" ? (
        <div className={styles.warningPanel}>
          <strong>Η τεχνική καθοδήγηση για αυτόν τον συνδυασμό δεν έχει ακόμη επαληθευτεί.</strong>
          <p>Δεν θα εμφανίσουμε υποθετικές οδηγίες ή προϊόντα ως κατάλληλα μέχρι να υπάρχει επαρκής τεκμηρίωση.</p>
        </div>
      ) : null}

      {state === "error" ? (
        <div className={styles.warningPanel}>
          <strong>Η επαληθευμένη τεχνική καθοδήγηση δεν είναι διαθέσιμη αυτή τη στιγμή.</strong>
          <p>Για ασφάλεια δεν εμφανίζουμε τις παλιές γενικές οδηγίες ως υποκατάστατο.</p>
        </div>
      ) : null}

      {state === "ready" && guide ? (
        <>
          <div className={styles.resultCard}>
            <GuidanceColumn number="01" title="Πριν ξεκινήσεις" items={guide.beforeYouStart} />
            <GuidanceColumn number="02" title="Προετοιμασία" items={guide.preparation} />
            <GuidanceColumn number="03" title="Τι χρειάζεσαι" items={guide.whatYouNeed} />
          </div>

          <div className={styles.resultCard}>
            <GuidanceColumn number="04" title="Βήμα-βήμα" items={guide.stepByStep} />
            <GuidanceColumn number="05" title="Τι να αποφύγεις" items={guide.avoid} />
            <GuidanceColumn number="06" title="Προσοχή" items={guide.warnings} />
          </div>

          {guide.manufacturerInstructions.length || guide.timings.length ? (
            <div className={styles.resultCard}>
              <GuidanceColumn number="07" title="Οδηγίες προϊόντος" items={guide.manufacturerInstructions} />
              <GuidanceColumn number="08" title="Χρόνοι" items={guide.timings} />
              <div className={styles.resultColumn}>
                <span>09</span>
                <h2>Ποσότητα</h2>
                <p className={styles.quantityCopy}>{guide.quantity.explanationEl}</p>
              </div>
            </div>
          ) : (
            <div className={styles.resultCard}>
              <div className={styles.resultColumn}>
                <span>07</span>
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

      {selectionAllowed ? <BuildStudioProductChooser terms={candidateTerms} /> : null}

      <div className={styles.resultActions}>
        <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
    </section>
  );
}
