"use client";

import { useEffect, useState } from "react";
import styles from "./TryOnGenerationOverlay.module.css";

type Phase = "photo" | "scan" | "compose" | "reveal";

function ShirtIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M33 18 18 28 8 45l14 8 8-11v38h36V42l8 11 14-8-10-17-15-10-8 8H41l-8-8Z" /></svg>;
}
function DressIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M38 13h20l5 17-9 11 19 39H23l19-39-9-11 5-17Zm4 5-3 10 9 8 9-8-3-10H42Z" /></svg>;
}
function JacketIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="m35 16-17 11-8 24 14 5 8-17v42h32V39l8 17 14-5-8-24-17-11-7 10H42l-7-10Zm7 17h12v48H42V33Z" /></svg>;
}
function TrousersIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M31 14h34l-3 66H48l-3-39-4 39H27l4-66Zm4 7-1 11h28l-1-11H35Z" /></svg>;
}
function SkirtIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M33 18h30l3 10-10 52H40L30 28l3-10Zm3 8 2 8h20l2-8H36Z" /></svg>;
}
function HoodieIcon() {
  return <svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 10c10 0 17 7 18 17l13 8 9 20-14 7-8-14v32H30V48l-8 14-14-7 9-20 13-8c1-10 8-17 18-17Zm0 8c-6 0-10 4-10 10l10 8 10-8c0-6-4-10-10-10Z" /></svg>;
}

const phaseCopy: Record<Phase, { kicker: string; title: string; detail: string }> = {
  photo: {
    kicker: "KONTA MOY · TRY ON ME",
    title: "Ετοιμάζουμε τη φωτογραφία σου",
    detail: "Η φωτογραφία σου είναι η βάση της προεπισκόπησης."
  },
  scan: {
    kicker: "AI FITTING SCAN",
    title: "Αναλύουμε τη στάση και τη σιλουέτα",
    detail: "Εντοπίζουμε τα σημεία που χρειάζονται για τη σωστή οπτική τοποθέτηση."
  },
  compose: {
    kicker: "VIRTUAL WARDROBE",
    title: "Συνθέτουμε το νέο look",
    detail: "Το FASHN δημιουργεί τώρα την προεπισκόπηση του ρούχου πάνω σου."
  },
  reveal: {
    kicker: "TRY ON COMPLETE",
    title: "Το look σου είναι έτοιμο",
    detail: "Μπορείς να το κρατήσεις, να το συγκρίνεις ή να δοκιμάσεις άλλο."
  }
};

export function TryOnGenerationOverlay({
  modelImage,
  resultImage,
  productTitle
}: {
  modelImage: string;
  resultImage?: string;
  productTitle: string;
}) {
  const [phase, setPhase] = useState<Phase>("photo");

  useEffect(() => {
    if (resultImage) {
      setPhase("reveal");
      return;
    }
    setPhase("photo");
    const scanTimer = window.setTimeout(() => setPhase("scan"), 700);
    const composeTimer = window.setTimeout(() => setPhase("compose"), 1850);
    return () => {
      window.clearTimeout(scanTimer);
      window.clearTimeout(composeTimer);
    };
  }, [resultImage]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const copy = phaseCopy[phase];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Δημιουργία Try On προεπισκόπησης">
      <div className={styles.ambient} aria-hidden="true">
        <span /><span /><span /><span />
      </div>

      <div className={styles.stage}>
        <div className={styles.copy} aria-live="polite">
          <span className={styles.kicker}>{copy.kicker}</span>
          <h2>{copy.title}</h2>
          <p>{copy.detail}</p>
        </div>

        <div className={styles.visual}>
          <div className={styles.halo} aria-hidden="true" />
          <div className={styles.photoFrame}>
            <img
              className={resultImage ? styles.modelImageFaded : styles.modelImage}
              src={modelImage}
              alt="Η φωτογραφία μου για Try On Me"
            />
            {resultImage ? (
              <img
                className={styles.resultImage}
                src={resultImage}
                alt={`Try On αποτέλεσμα · ${productTitle}`}
              />
            ) : null}

            {phase === "scan" || phase === "compose" ? (
              <div className={styles.scanner} aria-hidden="true">
                <div className={styles.scanGrid} />
                <div className={styles.scanLine} />
                <span className={styles.markerA} />
                <span className={styles.markerB} />
                <span className={styles.markerC} />
                <span className={styles.markerD} />
              </div>
            ) : null}

            {phase === "reveal" ? <div className={styles.revealSweep} aria-hidden="true" /> : null}
          </div>

          {phase === "compose" ? (
            <div className={styles.wardrobe} aria-hidden="true">
              <span className={`${styles.garment} ${styles.garmentA}`}><ShirtIcon /></span>
              <span className={`${styles.garment} ${styles.garmentB}`}><DressIcon /></span>
              <span className={`${styles.garment} ${styles.garmentC}`}><JacketIcon /></span>
              <span className={`${styles.garment} ${styles.garmentD}`}><TrousersIcon /></span>
              <span className={`${styles.garment} ${styles.garmentE}`}><SkirtIcon /></span>
              <span className={`${styles.garment} ${styles.garmentF}`}><HoodieIcon /></span>
            </div>
          ) : null}

          <div className={styles.orbit} aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.progressDots} aria-hidden="true">
            <span className={phase === "photo" ? styles.active : ""} />
            <span className={phase === "scan" ? styles.active : ""} />
            <span className={phase === "compose" ? styles.active : ""} />
            <span className={phase === "reveal" ? styles.active : ""} />
          </div>
          <span>{phase === "reveal" ? "Έτοιμο" : "Μην κλείσεις τη σελίδα · δημιουργούμε το look σου"}</span>
        </div>
      </div>
    </div>
  );
}
