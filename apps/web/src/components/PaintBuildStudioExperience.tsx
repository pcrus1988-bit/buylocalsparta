"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ColorStudioSelector, type ColorStudioShadeCandidate } from "./ColorStudioSelector";
import { BuildStudioProductChooser } from "./BuildStudioProductChooser";
import {
  BUILD_MODULES,
  INSULATION_GOALS,
  INSULATION_LOCATIONS,
  REPAIR_ISSUES,
  REPAIR_SEVERITIES,
  WATERPROOF_LOCATIONS,
  WATERPROOF_PROBLEMS,
  recommendInsulation,
  recommendRepair,
  recommendWaterproofing,
  type BuildChoice,
  type BuildModuleKey,
  type BuildProjectRecommendation
} from "../lib/build-consultant";
import {
  PAINT_MOODS,
  PAINT_SURFACES,
  paintSurface,
  recommendPaintProject,
  type PaintSurfaceKey
} from "../lib/paint-consultant";
import styles from "./PaintBuildStudioExperience.module.css";

type StudioScreen =
  | "hub"
  | "paint-surface"
  | "paint-condition"
  | "paint-area"
  | "paint-color"
  | "paint-result"
  | "waterproof-location"
  | "waterproof-problem"
  | "waterproof-area"
  | "waterproof-result"
  | "insulation-location"
  | "insulation-goal"
  | "insulation-area"
  | "insulation-result"
  | "repair-issue"
  | "repair-severity"
  | "repair-area"
  | "repair-result";

const AREA_PRESETS = [
  { value: 8, label: "Μικρό", hint: "≈ 8 m²" },
  { value: 20, label: "Μεσαίο", hint: "≈ 20 m²" },
  { value: 40, label: "Μεγάλο", hint: "≈ 40 m²" },
  { value: 80, label: "Πολύ μεγάλο", hint: "≈ 80 m²" }
] as const;

const PAINT_SHADE_CANDIDATES: readonly ColorStudioShadeCandidate[] = PAINT_MOODS.flatMap((mood) =>
  mood.colours.map((hex, index) => ({
    id: `${mood.key}-${index + 1}`,
    label: `${mood.paletteName} ${index + 1}`,
    hex
  }))
);

const PAINT_SURFACE_CHOICES = PAINT_SURFACES.filter((surface) => surface.key !== "roof");

const PREVIOUS_SCREEN: Partial<Record<StudioScreen, StudioScreen>> = {
  "paint-surface": "hub",
  "paint-condition": "paint-surface",
  "paint-area": "paint-condition",
  "paint-color": "paint-area",
  "paint-result": "paint-color",
  "waterproof-location": "hub",
  "waterproof-problem": "waterproof-location",
  "waterproof-area": "waterproof-problem",
  "waterproof-result": "waterproof-area",
  "insulation-location": "hub",
  "insulation-goal": "insulation-location",
  "insulation-area": "insulation-goal",
  "insulation-result": "insulation-area",
  "repair-issue": "hub",
  "repair-severity": "repair-issue",
  "repair-area": "repair-severity",
  "repair-result": "repair-area"
};

const MODULE_SCREEN_COUNT: Record<BuildModuleKey, number> = {
  paint: 5,
  waterproofing: 4,
  insulation: 4,
  repair: 4
};

const SCREEN_STEP: Partial<Record<StudioScreen, number>> = {
  "paint-surface": 1,
  "paint-condition": 2,
  "paint-area": 3,
  "paint-color": 4,
  "paint-result": 5,
  "waterproof-location": 1,
  "waterproof-problem": 2,
  "waterproof-area": 3,
  "waterproof-result": 4,
  "insulation-location": 1,
  "insulation-goal": 2,
  "insulation-area": 3,
  "insulation-result": 4,
  "repair-issue": 1,
  "repair-severity": 2,
  "repair-area": 3,
  "repair-result": 4
};

function firstScreen(module: BuildModuleKey): StudioScreen {
  if (module === "paint") return "paint-surface";
  if (module === "waterproofing") return "waterproof-location";
  if (module === "insulation") return "insulation-location";
  return "repair-issue";
}

function moduleFromScreen(screen: StudioScreen): BuildModuleKey | undefined {
  if (screen.startsWith("paint-")) return "paint";
  if (screen.startsWith("waterproof-")) return "waterproofing";
  if (screen.startsWith("insulation-")) return "insulation";
  if (screen.startsWith("repair-")) return "repair";
  return undefined;
}

function selectedChoiceLabel(choices: readonly BuildChoice[], key: string): string {
  return choices.find((choice) => choice.key === key)?.label ?? key;
}

export function PaintBuildStudioExperience() {
  const [screen, setScreen] = useState<StudioScreen>("hub");

  const [paintSurfaceKey, setPaintSurfaceKey] = useState<PaintSurfaceKey>("interior-wall");
  const [paintConditionKey, setPaintConditionKey] = useState("sound");
  const [paintArea, setPaintArea] = useState(28);
  const [paintColour, setPaintColour] = useState("#C4A68C");

  const [waterproofLocation, setWaterproofLocation] = useState("roof");
  const [waterproofProblem, setWaterproofProblem] = useState("maintenance");
  const [waterproofArea, setWaterproofArea] = useState(40);

  const [insulationLocation, setInsulationLocation] = useState("facade");
  const [insulationGoal, setInsulationGoal] = useState("both");
  const [insulationArea, setInsulationArea] = useState(60);

  const [repairIssue, setRepairIssue] = useState("hairline");
  const [repairSeverity, setRepairSeverity] = useState("local");
  const [repairArea, setRepairArea] = useState(10);

  const activeModuleKey = moduleFromScreen(screen);
  const activeModule = BUILD_MODULES.find((module) => module.key === activeModuleKey);
  const step = SCREEN_STEP[screen];
  const totalSteps = activeModuleKey ? MODULE_SCREEN_COUNT[activeModuleKey] : undefined;

  const paintSurfaceDefinition = paintSurface(paintSurfaceKey);
  const paintCondition = paintSurfaceDefinition.conditions.find((condition) => condition.key === paintConditionKey)
    ?? paintSurfaceDefinition.conditions[0];

  const paintRecommendation = useMemo(() => recommendPaintProject({
    surfaceKey: paintSurfaceKey,
    conditionKey: paintConditionKey,
    areaM2: paintArea,
    selectedColour: paintColour
  }), [paintArea, paintColour, paintConditionKey, paintSurfaceKey]);

  const waterproofRecommendation = useMemo(() => recommendWaterproofing({
    location: waterproofLocation,
    problem: waterproofProblem,
    areaM2: waterproofArea
  }), [waterproofArea, waterproofLocation, waterproofProblem]);

  const insulationRecommendation = useMemo(() => recommendInsulation({
    location: insulationLocation,
    goal: insulationGoal,
    areaM2: insulationArea
  }), [insulationArea, insulationGoal, insulationLocation]);

  const repairRecommendation = useMemo(() => recommendRepair({
    issue: repairIssue,
    severity: repairSeverity,
    areaM2: repairArea
  }), [repairArea, repairIssue, repairSeverity]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    const request = () => {
      if (document.fullscreenElement) return;
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };

    // Best effort on arrival. Browsers normally reject this without user activation,
    // so the first touch/click/key inside the Studio retries synchronously.
    request();
    const activate = () => request();
    document.addEventListener("pointerdown", activate, { capture: true, once: true });
    document.addEventListener("keydown", activate, { capture: true, once: true });

    return () => {
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, []);

  function requestNativeFullscreen() {
    if (typeof document === "undefined" || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  function chooseModule(module: BuildModuleKey) {
    requestNativeFullscreen();
    setScreen(firstScreen(module));
  }

  function goBack() {
    const previous = PREVIOUS_SCREEN[screen];
    if (previous) setScreen(previous);
  }

  function goHub() {
    setScreen("hub");
  }

  function exitStudio() {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }

  function choosePaintSurface(key: PaintSurfaceKey) {
    const surface = paintSurface(key);
    setPaintSurfaceKey(key);
    setPaintConditionKey(surface.conditions[0].key);
    setPaintArea(surface.defaultAreaM2);
    setScreen("paint-condition");
  }

  return (
    <div
      className={`${styles.fullscreenStudio} ${screen === "hub" ? styles.hubMode : ""}`}
      role="application"
      aria-label="KONTA MOY Paint & Build Studio"
    >
      <header className={styles.studioHeader}>
        <button type="button" className={styles.brandButton} onClick={goHub} aria-label="Paint & Build Studio αρχική">
          <span>KONTA MOY</span>
          <strong>PAINT & BUILD STUDIO</strong>
        </button>

        {screen !== "hub" && activeModule ? (
          <div className={styles.headerProject}>
            <span>{activeModule.eyebrow}</span>
            <strong>{activeModule.subtitle}</strong>
          </div>
        ) : (
          <div className={styles.headerProject}>
            <span>PROJECT FIRST</span>
            <strong>Πες μας τι θέλεις να κάνεις</strong>
          </div>
        )}

        <div className={styles.headerActions}>
          {screen !== "hub" ? (
            <button type="button" className={styles.headerBack} onClick={goBack} aria-label="Πίσω">
              ←
            </button>
          ) : null}
          <button type="button" className={styles.exitButton} onClick={exitStudio} aria-label="Έξοδος από το Studio">
            ×
          </button>
        </div>
      </header>

      {screen !== "hub" && step && totalSteps ? (
        <div className={styles.progressShell}>
          <div className={styles.progressMeta}>
            <span>{String(step).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}</span>
            <strong>{activeModule?.title}</strong>
          </div>
          <div className={styles.progressTrack}>
            <span style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
        </div>
      ) : null}

      <main className={styles.screenViewport}>
        {screen === "hub" ? (
          <section className={styles.hubScreen}>
            <div className={styles.hubIntro}>
              <span className={styles.kicker}>BUILD STUDIO · BETA</span>
              <h1>Τι θέλεις<br /><em>να φτιάξεις;</em></h1>
              <p>
                Μην ψάχνεις προϊόντα ένα-ένα. Ξεκίνα από το έργο σου και το ΚΟΝΤΑ ΜΟΥ θα σε οδηγήσει
                στη σωστή κατηγορία υλικών, βήμα-βήμα.
              </p>
            </div>

            <div className={styles.moduleGrid}>
              {BUILD_MODULES.map((module) => (
                <button
                  type="button"
                  key={module.key}
                  className={styles.moduleCard}
                  onClick={() => chooseModule(module.key)}
                >
                  <span className={styles.moduleIcon} aria-hidden="true">{module.icon}</span>
                  <small>{module.eyebrow}</small>
                  <h2>{module.title}</h2>
                  <strong>{module.subtitle}</strong>
                  <p>{module.description}</p>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {screen === "paint-surface" ? (
          <ChoiceScreen
            kicker="Η ΤΕΛΕΙΑ ΠΙΝΕΛΙΑ · 01"
            title="Τι θέλεις να βάψεις;"
            body="Μία επιλογή μόνο. Μετά θα ρωτήσουμε μόνο ό,τι έχει σημασία για αυτή την επιφάνεια."
          >
            <div className={styles.choiceGrid}>
              {PAINT_SURFACE_CHOICES.map((surface) => (
                <button key={surface.key} type="button" className={styles.choiceCard} onClick={() => choosePaintSurface(surface.key)}>
                  <span aria-hidden="true">{surface.icon}</span>
                  <strong>{surface.label}</strong>
                  <small>{surface.intro}</small>
                  <i>→</i>
                </button>
              ))}
            </div>
          </ChoiceScreen>
        ) : null}

        {screen === "paint-condition" ? (
          <ChoiceScreen
            kicker={paintSurfaceDefinition.label}
            title="Πώς είναι τώρα η επιφάνεια;"
            body="Αυτό καθορίζει την προεργασία, το αστάρι και το τελικό σύστημα."
          >
            <div className={styles.choiceStack}>
              {paintSurfaceDefinition.conditions.map((condition) => (
                <button
                  key={condition.key}
                  type="button"
                  className={styles.choiceRow}
                  onClick={() => {
                    setPaintConditionKey(condition.key);
                    setScreen("paint-area");
                  }}
                >
                  <span className={styles.radioDot} aria-hidden="true">○</span>
                  <div><strong>{condition.label}</strong><small>{condition.hint}</small></div>
                  <i>→</i>
                </button>
              ))}
            </div>
          </ChoiceScreen>
        ) : null}

        {screen === "paint-area" ? (
          <AreaScreen
            title="Πόση επιφάνεια περίπου;"
            body="Δεν χρειάζεται να είναι τέλειο. Μπορείς να γράψεις τα ακριβή m² αν τα γνωρίζεις."
            area={paintArea}
            onArea={setPaintArea}
            onContinue={() => setScreen(paintSurfaceDefinition.colourRelevant ? "paint-color" : "paint-result")}
          />
        ) : null}

        {screen === "paint-color" ? (
          <section className={styles.colorScreen}>
            <div className={styles.colorIntro}>
              <span className={styles.kicker}>COLOR STUDIO · SHARED ENGINE</span>
              <h1>Βρες την απόχρωσή σου.</h1>
              <p>
                Είναι το ίδιο Color Studio interface: picker, φωτογραφία, ακριβές σημείο ή περιοχή,
                παραλλαγές και κοντινές αποχρώσεις.
              </p>
            </div>
            <div className={styles.colorSelectorWrap}>
              <ColorStudioSelector
                value={paintColour}
                onChange={setPaintColour}
                onConfirm={() => setScreen("paint-result")}
                shadeCandidates={PAINT_SHADE_CANDIDATES}
                photoKicker="PHOTO TO PAINT · PRIVATE"
                photoTitle="Πάρε το χρώμα από τον χώρο σου."
                photoBody="Διάλεξε χρώμα από τοίχο, ύφασμα, έπιπλο ή οποιαδήποτε έμπνευση."
              />
            </div>
          </section>
        ) : null}

        {screen === "paint-result" ? (
          <ResultScreen
            eyebrow="Η ΤΕΛΕΙΑ ΠΙΝΕΛΙΑ · Η ΛΥΣΗ ΣΟΥ"
            title={paintRecommendation.systemName}
            summary={`${paintSurfaceDefinition.label} · ${paintCondition.label} · ${paintArea} m²`}
            layers={[
              ...(paintRecommendation.primerRequired && paintRecommendation.primerLabel
                ? [paintRecommendation.primerLabel]
                : []),
              paintRecommendation.topcoatLabel
            ]}
            preparation={paintRecommendation.preparation}
            warnings={paintRecommendation.warnings}
            quantity={paintRecommendation.quantityNote}
            candidateTerms={[
              paintRecommendation.topcoatLabel,
              ...paintRecommendation.catalogueTags
            ]}
            colour={paintColour}
            onRestart={goHub}
          />
        ) : null}

        {screen === "waterproof-location" ? (
          <ChoiceScreen kicker="ΣΤΕΓΑΝΟΠΟΙΗΣΗ · 01" title="Πού εμφανίζεται το πρόβλημα;" body="Ξεκινάμε από το σημείο, όχι από το προϊόν.">
            <BuildChoices
              choices={WATERPROOF_LOCATIONS}
              onChoose={(key) => {
                setWaterproofLocation(key);
                setScreen("waterproof-problem");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "waterproof-problem" ? (
          <ChoiceScreen
            kicker={selectedChoiceLabel(WATERPROOF_LOCATIONS, waterproofLocation)}
            title="Τι συμβαίνει;"
            body="Το σύστημα αλλάζει ανάλογα με την αιτία και την κατάσταση της επιφάνειας."
          >
            <BuildChoices
              choices={WATERPROOF_PROBLEMS}
              onChoose={(key) => {
                setWaterproofProblem(key);
                setScreen("waterproof-area");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "waterproof-area" ? (
          <AreaScreen
            title="Πόση επιφάνεια αφορά;"
            body="Θα χρησιμοποιηθεί για το project summary και αργότερα για ακριβή κατανάλωση ανά προϊόν."
            area={waterproofArea}
            onArea={setWaterproofArea}
            onContinue={() => setScreen("waterproof-result")}
          />
        ) : null}

        {screen === "waterproof-result" ? (
          <BuildResult
            eyebrow="ΣΤΕΓΑΝΟΠΟΙΗΣΗ · Η ΛΥΣΗ ΣΟΥ"
            recommendation={waterproofRecommendation}
            context={`${selectedChoiceLabel(WATERPROOF_LOCATIONS, waterproofLocation)} · ${selectedChoiceLabel(WATERPROOF_PROBLEMS, waterproofProblem)}`}
            onRestart={goHub}
          />
        ) : null}

        {screen === "insulation-location" ? (
          <ChoiceScreen kicker="ΘΕΡΜΟΜΟΝΩΣΗ · 01" title="Πού θέλεις να μονώσεις;" body="Η θέση της μόνωσης αλλάζει ολόκληρη τη δομή του συστήματος.">
            <BuildChoices
              choices={INSULATION_LOCATIONS}
              onChoose={(key) => {
                setInsulationLocation(key);
                setScreen("insulation-goal");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "insulation-goal" ? (
          <ChoiceScreen
            kicker={selectedChoiceLabel(INSULATION_LOCATIONS, insulationLocation)}
            title="Τι θέλεις να βελτιώσεις;"
            body="Η απάντηση βοηθά το Studio να τονίσει τις σωστές τεχνικές απαιτήσεις."
          >
            <BuildChoices
              choices={INSULATION_GOALS}
              onChoose={(key) => {
                setInsulationGoal(key);
                setScreen("insulation-area");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "insulation-area" ? (
          <AreaScreen
            title="Πόση επιφάνεια αφορά;"
            body="Το πάχος της μόνωσης θα προστεθεί αργότερα όταν συνδεθούν πλήρη τεχνικά συστήματα."
            area={insulationArea}
            onArea={setInsulationArea}
            onContinue={() => setScreen("insulation-result")}
          />
        ) : null}

        {screen === "insulation-result" ? (
          <BuildResult
            eyebrow="ΘΕΡΜΟΜΟΝΩΣΗ · Η ΛΥΣΗ ΣΟΥ"
            recommendation={insulationRecommendation}
            context={`${selectedChoiceLabel(INSULATION_LOCATIONS, insulationLocation)} · ${selectedChoiceLabel(INSULATION_GOALS, insulationGoal)}`}
            onRestart={goHub}
          />
        ) : null}

        {screen === "repair-issue" ? (
          <ChoiceScreen kicker="ΕΠΙΣΚΕΥΗ ΤΟΙΧΟΥ · 01" title="Τι βλέπεις στον τοίχο;" body="Διάλεξε το πρόβλημα που μοιάζει περισσότερο με αυτό που έχεις μπροστά σου.">
            <BuildChoices
              choices={REPAIR_ISSUES}
              onChoose={(key) => {
                setRepairIssue(key);
                setScreen("repair-severity");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "repair-severity" ? (
          <ChoiceScreen
            kicker={selectedChoiceLabel(REPAIR_ISSUES, repairIssue)}
            title="Πόσο εκτεταμένη είναι η φθορά;"
            body="Αυτό μας βοηθά να ξεχωρίσουμε μια απλή τοπική επισκευή από έργο που θέλει τεχνικό έλεγχο."
          >
            <BuildChoices
              choices={REPAIR_SEVERITIES}
              onChoose={(key) => {
                setRepairSeverity(key);
                setScreen("repair-area");
              }}
            />
          </ChoiceScreen>
        ) : null}

        {screen === "repair-area" ? (
          <AreaScreen
            title="Πόση επιφάνεια περίπου;"
            body="Αν είναι μόνο μια μικρή τοπική ζημιά, κράτησε τη μικρότερη επιλογή."
            area={repairArea}
            onArea={setRepairArea}
            onContinue={() => setScreen("repair-result")}
          />
        ) : null}

        {screen === "repair-result" ? (
          <BuildResult
            eyebrow="ΕΠΙΣΚΕΥΗ ΤΟΙΧΟΥ · Η ΛΥΣΗ ΣΟΥ"
            recommendation={repairRecommendation}
            context={`${selectedChoiceLabel(REPAIR_ISSUES, repairIssue)} · ${selectedChoiceLabel(REPAIR_SEVERITIES, repairSeverity)}`}
            onRestart={goHub}
          />
        ) : null}
      </main>
    </div>
  );
}

function ChoiceScreen({
  kicker,
  title,
  body,
  children
}: {
  kicker: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.decisionScreen}>
      <div className={styles.decisionIntro}>
        <span className={styles.kicker}>{kicker}</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      <div className={styles.decisionCard}>{children}</div>
    </section>
  );
}

function BuildChoices({
  choices,
  onChoose
}: {
  choices: readonly BuildChoice[];
  onChoose: (key: string) => void;
}) {
  return (
    <div className={styles.choiceGrid}>
      {choices.map((choice) => (
        <button key={choice.key} type="button" className={styles.choiceCard} onClick={() => onChoose(choice.key)}>
          <span aria-hidden="true">{choice.icon ?? "•"}</span>
          <strong>{choice.label}</strong>
          <small>{choice.hint}</small>
          <i>→</i>
        </button>
      ))}
    </div>
  );
}

function AreaScreen({
  title,
  body,
  area,
  onArea,
  onContinue
}: {
  title: string;
  body: string;
  area: number;
  onArea: (area: number) => void;
  onContinue: () => void;
}) {
  return (
    <ChoiceScreen kicker="ΜΕΓΕΘΟΣ ΕΡΓΟΥ" title={title} body={body}>
      <div className={styles.areaCard}>
        <div className={styles.areaPresets}>
          {AREA_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={area === preset.value ? styles.areaSelected : ""}
              onClick={() => onArea(preset.value)}
            >
              <strong>{preset.label}</strong>
              <small>{preset.hint}</small>
            </button>
          ))}
        </div>

        <label className={styles.areaExact}>
          <span>ΑΚΡΙΒΗ m²</span>
          <div>
            <input
              type="number"
              min={1}
              max={1000}
              inputMode="decimal"
              value={area}
              onChange={(event) => onArea(Math.max(1, Math.min(1000, Number(event.target.value) || 1)))}
            />
            <strong>m²</strong>
          </div>
        </label>

        <button type="button" className={styles.continueButton} onClick={onContinue}>
          ΣΥΝΕΧΕΙΑ <span aria-hidden="true">→</span>
        </button>
      </div>
    </ChoiceScreen>
  );
}

function ResultScreen({
  eyebrow,
  title,
  summary,
  layers,
  preparation,
  warnings,
  quantity,
  candidateTerms,
  colour,
  onRestart
}: {
  eyebrow: string;
  title: string;
  summary: string;
  layers: readonly string[];
  preparation: readonly string[];
  warnings: readonly string[];
  quantity: string;
  candidateTerms: readonly string[];
  colour?: string;
  onRestart: () => void;
}) {
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

      <div className={styles.resultCard}>
        <ResultColumn number="01" title="Σύστημα" items={layers} />
        <ResultColumn number="02" title="Προεργασία" items={preparation} />
        <div className={styles.resultColumn}>
          <span>03</span>
          <h2>Ποσότητα</h2>
          <p className={styles.quantityCopy}>{quantity}</p>
        </div>
      </div>

      {warnings.length ? (
        <div className={styles.warningPanel}>
          <strong>Σημαντικό πριν ξεκινήσεις</strong>
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      <BuildStudioProductChooser terms={candidateTerms} />

      <div className={styles.resultActions}>
        <a href="/ask-local" className={styles.secondaryAction}>ΡΩΤΗΣΕ ΕΝΑ ΚΑΤΑΣΤΗΜΑ</a>
        <button type="button" className={styles.secondaryAction} onClick={onRestart}>ΝΕΟ ΕΡΓΟ</button>
      </div>
    </section>
  );
}

function BuildResult({
  eyebrow,
  recommendation,
  context,
  onRestart
}: {
  eyebrow: string;
  recommendation: BuildProjectRecommendation;
  context: string;
  onRestart: () => void;
}) {
  return (
    <ResultScreen
      eyebrow={eyebrow}
      title={recommendation.title}
      summary={`${context} · ${recommendation.areaM2} m² — ${recommendation.summary}`}
      layers={recommendation.layers}
      preparation={recommendation.preparation}
      warnings={recommendation.warnings}
      quantity={recommendation.quantityNote}
      candidateTerms={recommendation.catalogueTags}
      onRestart={onRestart}
    />
  );
}

function ResultColumn({
  number,
  title,
  items
}: {
  number: string;
  title: string;
  items: readonly string[];
}) {
  return (
    <div className={styles.resultColumn}>
      <span>{number}</span>
      <h2>{title}</h2>
      <ol>
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>Δεν απαιτείται επιπλέον βήμα.</li>}
      </ol>
    </div>
  );
}
