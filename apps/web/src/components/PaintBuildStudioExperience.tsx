"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  PAINT_MOODS,
  PAINT_SURFACES,
  paintMood,
  paintSurface,
  recommendPaintProject,
  type PaintMoodKey,
  type PaintSurfaceKey
} from "../lib/paint-consultant";
import styles from "./PaintBuildStudioExperience.module.css";

type Step = 1 | 2 | 3;
type ColourMode = "mood" | "exact" | "photo";

const AREA_PRESETS = [
  { value: 12, label: "Μικρό", hint: "≈ 12 m²" },
  { value: 25, label: "Μεσαίο", hint: "≈ 25 m²" },
  { value: 40, label: "Μεγάλο", hint: "≈ 40 m²" },
  { value: 70, label: "Πολύ μεγάλο", hint: "≈ 70 m²" }
] as const;

function packageLabel(sizeL: number): string {
  if (sizeL < 1) return `${Math.round(sizeL * 1000)} ml`;
  return Number.isInteger(sizeL) ? `${sizeL} L` : `${sizeL.toLocaleString("el-GR")} L`;
}

function safeHex(value: string): string {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value.toUpperCase() : "#F4F0E7";
}

export function PaintBuildStudioExperience() {
  const [step, setStep] = useState<Step>(1);
  const [surfaceKey, setSurfaceKey] = useState<PaintSurfaceKey>("interior-wall");
  const [conditionKey, setConditionKey] = useState("sound");
  const [areaM2, setAreaM2] = useState(28);
  const [moodKey, setMoodKey] = useState<PaintMoodKey>("bright");
  const [selectedColour, setSelectedColour] = useState("#F4F0E7");
  const [colourMode, setColourMode] = useState<ColourMode>("mood");
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [photoName, setPhotoName] = useState<string>();
  const [photoError, setPhotoError] = useState<string>();

  const photoCanvasRef = useRef<HTMLCanvasElement>(null);

  const surface = paintSurface(surfaceKey);
  const mood = paintMood(moodKey);
  const condition = surface.conditions.find((item) => item.key === conditionKey) ?? surface.conditions[0];

  const recommendation = useMemo(
    () => recommendPaintProject({
      surfaceKey,
      conditionKey,
      areaM2,
      selectedColour
    }),
    [areaM2, conditionKey, selectedColour, surfaceKey]
  );

  function chooseSurface(nextKey: PaintSurfaceKey) {
    const next = paintSurface(nextKey);
    setSurfaceKey(nextKey);
    setConditionKey(next.conditions[0].key);
    setAreaM2(next.defaultAreaM2);
    if (!next.colourRelevant) {
      setSelectedColour("#F6F6F1");
      setColourMode("mood");
    }
  }

  function chooseMood(nextMood: PaintMoodKey) {
    const next = paintMood(nextMood);
    setMoodKey(nextMood);
    setSelectedColour(next.colours[0]);
  }

  function openPhotoShortcut() {
    chooseSurface("interior-wall");
    setConditionKey("sound");
    setColourMode("photo");
    setStep(2);
    requestAnimationFrame(() => document.getElementById("paint-studio-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function startGuided() {
    setStep(1);
    requestAnimationFrame(() => document.getElementById("paint-studio-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function onPhotoFile(file: File | undefined) {
    setPhotoError(undefined);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Διάλεξε αρχείο εικόνας.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoError("Η εικόνα πρέπει να είναι έως 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setPhotoUrl(reader.result);
      setPhotoName(file.name);
    };
    reader.onerror = () => setPhotoError("Δεν μπορέσαμε να διαβάσουμε αυτή την εικόνα.");
    reader.readAsDataURL(file);
  }

  function preparePhotoCanvas(image: HTMLImageElement) {
    const canvas = photoCanvasRef.current;
    if (!canvas || !image.naturalWidth || !image.naturalHeight) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context?.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  function samplePhotoColour(event: ReactMouseEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const canvas = photoCanvasRef.current;
    if (!canvas || !image.naturalWidth || !image.naturalHeight) return;

    const rect = image.getBoundingClientRect();
    const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const renderedWidth = image.naturalWidth * scale;
    const renderedHeight = image.naturalHeight * scale;
    const cropX = Math.max(0, (renderedWidth - rect.width) / 2);
    const cropY = Math.max(0, (renderedHeight - rect.height) / 2);
    const visibleX = event.clientX - rect.left;
    const visibleY = event.clientY - rect.top;
    const x = Math.min(
      canvas.width - 1,
      Math.max(0, Math.floor((visibleX + cropX) / scale))
    );
    const y = Math.min(
      canvas.height - 1,
      Math.max(0, Math.floor((visibleY + cropY) / scale))
    );
    const data = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(x, y, 1, 1).data;
    if (!data) return;
    const hex = `#${[data[0], data[1], data[2]].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
    setSelectedColour(hex);
  }

  const colourLabel = surface.colourRelevant
    ? selectedColour
    : "Τεχνική λευκή / ανακλαστική λύση";

  return (
    <div className={styles.studio}>
      <section className={styles.hero}>
        <div className={styles.heroWash} aria-hidden="true">
          <i /><i /><i />
        </div>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>KONTA MOY · PAINT & BUILD STUDIO</span>
          <h1>
            Η ΤΕΛΕΙΑ
            <em>ΠΙΝΕΛΙΑ</em>
          </h1>
          <p>
            Πες μας τι βάφεις. Βρες την απόχρωσή σου. Εμείς μετατρέπουμε τις επιλογές σου
            σε ένα απλό σχέδιο έργου με σωστό τύπο προϊόντος και ποσότητα.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primaryAction} onClick={startGuided}>
              Ξεκίνα σε 3 βήματα <span aria-hidden="true">→</span>
            </button>
            <button type="button" className={styles.photoAction} onClick={openPhotoShortcut}>
              <span aria-hidden="true">◎</span> Δείξε μας τον χώρο σου
            </button>
          </div>
          <div className={styles.heroTrust}>
            <span>Χωρίς τεχνικές γνώσεις</span>
            <span>Χωρίς ατελείωτα φίλτρα</span>
            <span>Τεχνικοί κανόνες κάτω από το UI</span>
          </div>
        </div>

        <aside className={styles.heroBoard} aria-label="Παράδειγμα Paint Consultant">
          <div className={styles.boardTop}>
            <span>PROJECT 01</span>
            <b>LIVE CONSULTANT</b>
          </div>
          <div className={styles.boardRoom}>
            <div className={styles.boardWall} style={{ background: selectedColour }} />
            <div className={styles.boardFloor} />
            <span className={styles.boardSofa} />
            <span className={styles.boardTable} />
            <div className={styles.paintStroke} aria-hidden="true" />
          </div>
          <div className={styles.boardMeta}>
            <div>
              <small>ΤΩΡΑ ΕΠΙΛΕΓΜΕΝΟ</small>
              <strong>{surface.shortLabel}</strong>
            </div>
            <div className={styles.boardSwatch} style={{ background: selectedColour }} aria-hidden="true" />
          </div>
        </aside>
      </section>

      <section className={styles.workspace} id="paint-studio-workspace" aria-labelledby="paint-studio-title">
        <div className={styles.workspaceHeading}>
          <div>
            <span className={styles.eyebrow}>PAINT CONSULTANT</span>
            <h2 id="paint-studio-title">Το έργο σου, χωρίς την τεχνική σύγχυση.</h2>
          </div>
          <p>
            Οι ερωτήσεις αλλάζουν ανάλογα με την επιφάνεια. Η τελική πρόταση παραμένει
            συμβατή με τους κανόνες του έργου — όχι με ελεύθερη «μαντεψιά» AI.
          </p>
        </div>

        <nav className={styles.steps} aria-label="Βήματα Paint Consultant">
          {([
            [1, "Το έργο σου"],
            [2, "Το στυλ σου"],
            [3, "Η λύση σου"]
          ] as const).map(([number, label]) => (
            <button
              key={number}
              type="button"
              className={step === number ? styles.stepActive : step > number ? styles.stepDone : ""}
              onClick={() => setStep(number)}
              aria-current={step === number ? "step" : undefined}
            >
              <span>{step > number ? "✓" : number}</span>
              <strong>{label}</strong>
            </button>
          ))}
        </nav>

        {step === 1 ? (
          <div className={styles.panel}>
            <div className={styles.panelIntro}>
              <span>ΒΗΜΑ 01</span>
              <h3>Τι θέλεις να βάψεις;</h3>
              <p>Διάλεξε την επιφάνεια. Θα εμφανίσουμε μόνο τις πληροφορίες που έχουν σημασία γι’ αυτή.</p>
            </div>

            <div className={styles.surfaceGrid}>
              {PAINT_SURFACES.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={surfaceKey === item.key ? styles.surfaceSelected : styles.surfaceCard}
                  onClick={() => chooseSurface(item.key)}
                  aria-pressed={surfaceKey === item.key}
                >
                  <span className={styles.surfaceIcon} aria-hidden="true">{item.icon}</span>
                  <strong>{item.label}</strong>
                  <small>{item.intro}</small>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>

            <div className={styles.contextGrid}>
              <div className={styles.contextBlock}>
                <div className={styles.contextHead}>
                  <span>ΚΑΤΑΣΤΑΣΗ</span>
                  <strong>Πώς είναι τώρα η επιφάνεια;</strong>
                </div>
                <div className={styles.conditionList}>
                  {surface.conditions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={conditionKey === item.key ? styles.conditionSelected : ""}
                      onClick={() => setConditionKey(item.key)}
                    >
                      <span>{conditionKey === item.key ? "●" : "○"}</span>
                      <div><strong>{item.label}</strong><small>{item.hint}</small></div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.contextBlock}>
                <div className={styles.contextHead}>
                  <span>ΜΕΓΕΘΟΣ</span>
                  <strong>Πόση επιφάνεια περίπου;</strong>
                </div>
                <div className={styles.areaPresets}>
                  {AREA_PRESETS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={areaM2 === item.value ? styles.areaSelected : ""}
                      onClick={() => setAreaM2(item.value)}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.hint}</small>
                    </button>
                  ))}
                </div>
                <label className={styles.areaInput}>
                  <span>Ξέρω τα ακριβή m²</span>
                  <div>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      step={1}
                      inputMode="decimal"
                      value={areaM2}
                      onChange={(event) => setAreaM2(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))}
                    />
                    <b>m²</b>
                  </div>
                </label>
              </div>
            </div>

            <div className={styles.panelFooter}>
              <div>
                <small>ΕΠΙΛΟΓΗ</small>
                <strong>{surface.label} · {condition.label} · {areaM2} m²</strong>
              </div>
              <button type="button" className={styles.nextAction} onClick={() => setStep(2)}>
                Συνέχεια στο χρώμα <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className={styles.panel}>
            <div className={styles.panelIntro}>
              <span>ΒΗΜΑ 02</span>
              <h3>{surface.colourRelevant ? "Πώς θέλεις να δείχνει;" : "Τι θέλεις να πετύχεις;"}</h3>
              <p>
                {surface.colourRelevant
                  ? "Ξεκίνα από αίσθηση, ακριβή απόχρωση ή φωτογραφία. Δεν χρειάζεται να ξέρεις κωδικούς χρωμάτων."
                  : "Στην ταράτσα προτεραιότητα έχει το σωστό τεχνικό σύστημα. Η απόχρωση είναι δευτερεύουσα."}
              </p>
            </div>

            {surface.colourRelevant ? (
              <>
                <div className={styles.modeTabs} role="tablist" aria-label="Τρόπος επιλογής χρώματος">
                  <button type="button" role="tab" aria-selected={colourMode === "mood"} onClick={() => setColourMode("mood")}>✨ Πρότεινέ μου</button>
                  <button type="button" role="tab" aria-selected={colourMode === "exact"} onClick={() => setColourMode("exact")}>🎨 Ξέρω το χρώμα</button>
                  <button type="button" role="tab" aria-selected={colourMode === "photo"} onClick={() => setColourMode("photo")}>◎ Από φωτογραφία</button>
                </div>

                {colourMode === "mood" ? (
                  <div className={styles.moodLayout}>
                    <div className={styles.moodGrid}>
                      {PAINT_MOODS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={moodKey === item.key ? styles.moodSelected : styles.moodCard}
                          onClick={() => chooseMood(item.key)}
                        >
                          <div className={styles.moodPalette} aria-hidden="true">
                            {item.colours.map((colour) => <i key={colour} style={{ background: colour }} />)}
                          </div>
                          <strong>{item.label}</strong>
                          <small>{item.hint}</small>
                          <span>{item.paletteName}</span>
                        </button>
                      ))}
                    </div>

                    <aside className={styles.paletteDetail}>
                      <span>ΠΑΛΕΤΑ · {mood.paletteName}</span>
                      <h4>Ποια απόχρωση σε τραβάει;</h4>
                      <div className={styles.paletteChoices}>
                        {mood.colours.map((colour, index) => (
                          <button
                            type="button"
                            key={colour}
                            aria-label={`Επιλογή απόχρωσης ${index + 1}: ${colour}`}
                            aria-pressed={safeHex(selectedColour) === safeHex(colour)}
                            style={{ background: colour }}
                            onClick={() => setSelectedColour(colour)}
                          >
                            {safeHex(selectedColour) === safeHex(colour) ? <span>✓</span> : null}
                          </button>
                        ))}
                      </div>
                      <div className={styles.selectedColour}>
                        <i style={{ background: selectedColour }} />
                        <div><small>ΕΠΙΛΕΓΜΕΝΗ ΑΠΟΧΡΩΣΗ</small><strong>{safeHex(selectedColour)}</strong></div>
                      </div>
                    </aside>
                  </div>
                ) : null}

                {colourMode === "exact" ? (
                  <div className={styles.exactPicker}>
                    <div className={styles.exactColour} style={{ background: selectedColour }}>
                      <span>{safeHex(selectedColour)}</span>
                    </div>
                    <div className={styles.exactCopy}>
                      <span>ΑΚΡΙΒΗΣ ΑΠΟΧΡΩΣΗ</span>
                      <h4>Διάλεξε το χρώμα που έχεις στο μυαλό σου.</h4>
                      <p>Στο επόμενο στάδιο θα μπορούμε να το αντιστοιχίσουμε σε πραγματικές συλλογές και κωδικούς κατασκευαστών.</p>
                      <label>
                        <span>Άνοιξε τον επιλογέα χρώματος</span>
                        <input
                          type="color"
                          value={safeHex(selectedColour)}
                          onChange={(event) => setSelectedColour(event.target.value.toUpperCase())}
                        />
                      </label>
                    </div>
                  </div>
                ) : null}

                {colourMode === "photo" ? (
                  <div className={styles.photoPicker}>
                    <div className={styles.photoStage}>
                      {photoUrl ? (
                        <>
                          <img
                            src={photoUrl}
                            alt="Φωτογραφία αναφοράς για επιλογή χρώματος"
                            onLoad={(event) => preparePhotoCanvas(event.currentTarget)}
                            onClick={samplePhotoColour}
                          />
                          <canvas ref={photoCanvasRef} aria-hidden="true" />
                          <span className={styles.photoHint}>Πάτησε πάνω στο χρώμα που θέλεις.</span>
                        </>
                      ) : (
                        <label className={styles.photoDrop}>
                          <span aria-hidden="true">◎</span>
                          <strong>Ανέβασε φωτογραφία</strong>
                          <small>χώρος · αντικείμενο · ύφασμα · έμπνευση</small>
                          <input type="file" accept="image/*" onChange={(event) => onPhotoFile(event.target.files?.[0])} />
                        </label>
                      )}
                    </div>
                    <div className={styles.photoCopy}>
                      <span>PHOTO TO PAINT · LOCAL PREVIEW</span>
                      <h4>Πάρε ένα χρώμα από αυτό που ήδη αγαπάς.</h4>
                      <p>
                        Η φωτογραφία χρησιμοποιείται εδώ στον browser για να διαλέξεις χρώμα.
                        Η πρώτη έκδοση δεν χρειάζεται να ανεβάσει τη φωτογραφία στον server.
                      </p>
                      {photoUrl ? (
                        <label className={styles.replacePhoto}>
                          Αλλαγή φωτογραφίας
                          <input type="file" accept="image/*" onChange={(event) => onPhotoFile(event.target.files?.[0])} />
                        </label>
                      ) : null}
                      {photoName ? <small className={styles.photoName}>{photoName}</small> : null}
                      {photoError ? <p className={styles.photoError} role="alert">{photoError}</p> : null}
                      <div className={styles.selectedColour}>
                        <i style={{ background: selectedColour }} />
                        <div><small>ΧΡΩΜΑ ΑΠΟ ΦΩΤΟΓΡΑΦΙΑ</small><strong>{safeHex(selectedColour)}</strong></div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.technicalGoal}>
                <div>
                  <span aria-hidden="true">≋</span>
                  <strong>Στεγανότητα πρώτα</strong>
                  <p>Η πρόταση θα βασιστεί στην κατάσταση της ταράτσας, στην κάλυψη και στη συμβατότητα του συστήματος.</p>
                </div>
                <div>
                  <span aria-hidden="true">☀</span>
                  <strong>Ανακλαστικό τελείωμα</strong>
                  <p>Όπου το τεχνικό προϊόν το υποστηρίζει, προτιμάται ανοιχτό / λευκό τελικό φινίρισμα.</p>
                </div>
              </div>
            )}

            <div className={styles.panelFooter}>
              <button type="button" className={styles.backAction} onClick={() => setStep(1)}>← Πίσω</button>
              <div className={styles.footerColour}>
                <i style={{ background: selectedColour }} />
                <span>{colourLabel}</span>
              </div>
              <button type="button" className={styles.nextAction} onClick={() => setStep(3)}>
                Δείξε μου τη λύση <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className={styles.resultPanel}>
            <div className={styles.resultHero}>
              <div className={styles.resultHeadline}>
                <span>ΒΗΜΑ 03 · Η ΠΡΟΤΑΣΗ ΣΟΥ</span>
                <h3>Αυτό χρειάζεσαι.</h3>
                <p>
                  Η πρόταση ξεκινά από την επιφάνεια και το πρόβλημα, όχι από τη μάρκα.
                  Όταν συνδεθούν τα paint SKUs, θα εμφανίζονται όλες οι πραγματικά συμβατές και διαθέσιμες επιλογές —
                  ακόμη κι αν δύο διαφορετικά προϊόντα δίνουν την ίδια ή πολύ κοντινή απόχρωση.
                </p>
              </div>
              <div className={styles.resultColour}>
                <div style={{ background: recommendation.selectedColour }} />
                <small>{surface.colourRelevant ? "ΕΠΙΛΕΓΜΕΝΟ ΧΡΩΜΑ" : "ΤΕΧΝΙΚΟ ΤΕΛΕΙΩΜΑ"}</small>
                <strong>{surface.colourRelevant ? recommendation.selectedColour : "LIGHT / WHITE"}</strong>
              </div>
            </div>

            <div className={styles.resultGrid}>
              <article className={styles.systemCard}>
                <span>01 · ΣΥΣΤΗΜΑ</span>
                <h4>{recommendation.systemName}</h4>
                <div className={styles.systemLine}>
                  <small>Τελικό προϊόν</small>
                  <strong>{recommendation.topcoatLabel}</strong>
                </div>
                <div className={styles.systemLine}>
                  <small>Φινίρισμα</small>
                  <strong>{recommendation.finishLabel}</strong>
                </div>
                <div className={styles.systemLine}>
                  <small>Αστάρι</small>
                  <strong>{recommendation.primerRequired ? recommendation.primerLabel : "Δεν προκύπτει ως υποχρεωτικό από τις επιλογές σου"}</strong>
                </div>
              </article>

              <article className={styles.quantityCard}>
                <span>02 · ΠΟΣΟΤΗΤΑ</span>
                <div className={styles.litreNumber}>
                  <strong>{recommendation.litresNeeded.toLocaleString("el-GR")}</strong>
                  <small>L περίπου</small>
                </div>
                <p>
                  Για {recommendation.areaM2.toLocaleString("el-GR")} m² · {recommendation.coats} χέρια ·
                  {" "}θεωρητική κάλυψη {recommendation.coverageM2PerL.toLocaleString("el-GR")} m²/L ·
                  {" "}{recommendation.wastagePercent}% περιθώριο.
                </p>
                <div className={styles.packagePlan}>
                  {recommendation.packages.map((pack) => (
                    <div key={pack.sizeL}>
                      <strong>{pack.quantity} × {packageLabel(pack.sizeL)}</strong>
                      <small>{(pack.quantity * pack.sizeL).toLocaleString("el-GR")} L</small>
                    </div>
                  ))}
                </div>
                <small className={styles.packageTotal}>Συσκευασμένα: {recommendation.totalPackagedLitres.toLocaleString("el-GR")} L</small>
              </article>

              <article className={styles.prepCard}>
                <span>03 · ΠΡΙΝ ΤΟ ΒΑΨΙΜΟ</span>
                <ol>
                  {recommendation.preparation.map((item) => <li key={item}>{item}</li>)}
                </ol>
              </article>
            </div>

            <div className={styles.multiResultNote}>
              <span>ΠΟΛΛΑ ΑΠΟΤΕΛΕΣΜΑΤΑ, ΟΧΙ ΕΝΑΣ «ΝΙΚΗΤΗΣ»</span>
              <div>
                <strong>Η ίδια απόχρωση μπορεί να έχει περισσότερες από μία σωστές επιλογές.</strong>
                <p>
                  Δεν συγχωνεύουμε προϊόντα επειδή έχουν ίδιο χρώμα. Αν δύο ή περισσότερα χρώματα καλύπτουν το ίδιο
                  τεχνικό σύστημα και την ίδια / κοντινή απόχρωση, θα εμφανίζονται ξεχωριστά ώστε να συγκρίνεις μάρκα,
                  τιμή, διαθεσιμότητα, φινίρισμα και συσκευασία.
                </p>
              </div>
            </div>

            {recommendation.warnings.length ? (
              <div className={styles.warningBox} role="note">
                <span aria-hidden="true">!</span>
                <div>
                  <strong>Σημαντικό πριν ξεκινήσεις</strong>
                  {recommendation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              </div>
            ) : null}

            <div className={styles.whyBlock}>
              <div>
                <span>ΓΙΑΤΙ ΑΥΤΗ Η ΛΥΣΗ</span>
                <h4>{surface.label} · {condition.label}</h4>
              </div>
              <ul>
                {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                <li>Η ποσότητα υπολογίζεται από την επιφάνεια, τα χέρια, τη θεωρητική κάλυψη και ένα μικρό περιθώριο.</li>
              </ul>
            </div>

            <div className={styles.resultActions}>
              <a className={styles.primaryAction} href={recommendation.searchHref}>
                Δες όλες τις συμβατές επιλογές <span aria-hidden="true">→</span>
              </a>
              <a className={styles.secondaryAction} href="/ask-local">Ρώτησε ένα κατάστημα</a>
              <button type="button" className={styles.secondaryAction} onClick={() => setStep(2)}>Άλλαξε χρώμα</button>
              <button type="button" className={styles.textAction} onClick={() => setStep(1)}>Νέο έργο</button>
            </div>

            <div className={styles.engineNote}>
              <span>COMPATIBILITY ENGINE</span>
              <p>
                Το interface είναι απλό, αλλά η τελική αντιστοίχιση είναι κανόνας: επιφάνεια → κατάσταση →
                προεργασία → αστάρι → τελικό σύστημα → ποσότητα. Η μάρκα έρχεται μετά.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
