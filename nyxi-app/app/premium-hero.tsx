"use client";

import { useState, type CSSProperties } from "react";

type Experience = "color" | "care" | "style";
type Palette = { name: string; mood: string; code: string; color: string; tint: string };
const palettes: Palette[] = [
  { name: "CHERRY NOIR", mood: "Bold / Magnetic", code: "01", color: "#8C173B", tint: "#9d3e58" },
  { name: "ROSE SILK", mood: "Soft / Intimate", code: "02", color: "#D49AA7", tint: "#e3b5bc" },
  { name: "ESPRESSO", mood: "Warm / Effortless", code: "03", color: "#563C3C", tint: "#896760" },
  { name: "IRIS HAZE", mood: "Playful / Unexpected", code: "04", color: "#9986C0", tint: "#beb0d4" },
  { name: "ALMOND MILK", mood: "Quiet / Refined", code: "05", color: "#E4CDBD", tint: "#ecd8c9" }
];

const photo = "https://images.unsplash.com/photo-1638668518908-7014917e4507?auto=format&fit=crop&w=1600&q=85";

export default function PremiumHero({ onOpen, onPalettePick }: {
  onOpen: (experience: Experience) => void;
  onPalettePick?: (shade: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const active = palettes[selected];
  const colors = {
    "--mood-color": active.color,
    "--mood-tint": active.tint
  } as CSSProperties;

  function chooseShade(index: number) {
    setSelected(index);
    onPalettePick?.(palettes[index].color);
  }

  function tryShade() {
    onPalettePick?.(active.color);
    onOpen("style");
  }

  return (
    <section className="nyxi-theatre" aria-labelledby="hero-title" style={colors}>
      <div className="nyxi-theatre-photo" aria-hidden="true">
        <picture>
          <source media="(max-width: 640px)" srcSet="https://images.unsplash.com/photo-1638668518908-7014917e4507?auto=format&fit=crop&w=960&q=82" />
          <img src={photo} alt="" loading="eager" decoding="async" fetchPriority="high" />
        </picture>
      </div>
      <div className="nyxi-theatre-grade" aria-hidden="true" />

      <div className="nyxi-theatre-meta">
        <span>NYXI <span aria-hidden="true">✳</span> THE INTERACTIVE EDIT</span>
        <span>EXPERIENCE Nº 001 / 2026</span>
      </div>

      <div className="nyxi-theatre-main">
        <div className="nyxi-theatre-story">
          <p className="nyxi-theatre-kicker"><span aria-hidden="true">↗</span> NOT JUST NAILS. AN EXPRESSION.</p>
          <h1 id="hero-title">Το χρώμα<br />είναι <em>δικό σου.</em></h1>
          <p className="nyxi-theatre-description">Διάλεξε αυτό που σε εκφράζει. Παίξε με τις αποχρώσεις. Δες το επόμενο look σου να παίρνει μορφή — εδώ, τώρα.</p>
          <div className="nyxi-theatre-story-actions">
            <button type="button" className="nyxi-theatre-photo-cta" onClick={() => onOpen("color")}>
              Εξερεύνησε το χρώμα από φωτογραφία <span aria-hidden="true">↗</span>
            </button>
            <button type="button" className="nyxi-theatre-care-link" onClick={() => onOpen("care")}>Η δική σου φροντίδα <span aria-hidden="true">↗</span></button>
          </div>
          <p className="nyxi-theatre-footnote">REAL INTERACTIONS. YOUR OWN CREATIVE DIRECTION.</p>
        </div>

        <div className="nyxi-theatre-instrument" aria-label="Διαδραστικό δείγμα χρώματος">
          <div className="nyxi-instrument-topline">
            <span>THE SHADE ROOM</span><span aria-live="polite">{active.code} / 05</span>
          </div>
          <div className="nyxi-instrument-art" aria-label={"Ενδεικτικό ψηφιακό χρωματικό δείγμα: " + active.name}>
            <div className="nyxi-instrument-halo" aria-hidden="true" />
            <div className="nyxi-lacquer-sculpture" aria-hidden="true">
              <span className="nyxi-lacquer-highlight"/>
              <span className="nyxi-lacquer-edge"/>
            </div>
            <span className="nyxi-instrument-mark">N.</span>
            <span className="nyxi-instrument-sidenote">DIGITAL COLOR STUDY<br />NOT A PRODUCT MATCH</span>
          </div>
          <div className="nyxi-instrument-info">
            <div>
              <span className="nyxi-instrument-caption">CURRENT COLOR STORY</span>
              <strong aria-live="polite">{active.name}</strong>
              <span className="nyxi-instrument-mood">{active.mood}</span>
            </div>
            <span className="nyxi-instrument-hex" aria-live="polite">{active.color}</span>
          </div>
          <div className="nyxi-instrument-palettes" role="group" aria-label="Δοκίμασε μια χρωματική κατεύθυνση">
            {palettes.map((item, index) => <button key={item.code} type="button"
              className={"nyxi-palette-choice" + (selected === index ? " selected" : "")}
              aria-label={item.name + ", " + item.color} aria-pressed={selected === index}
              onClick={() => chooseShade(index)}>
              <span className="nyxi-palette-dot" style={{ background: item.color }} />
              <span className="nyxi-palette-caption">{item.code}</span>
            </button>)}
          </div>
          <button className="nyxi-instrument-cta" type="button" onClick={tryShade}>Δοκίμασε αυτή την απόχρωση στο Atelier <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <div className="nyxi-theatre-bottomline">
        <span>01 / CHOOSE THE MOOD</span><span>02 / CREATE YOUR LOOK</span><span>03 / TRY IT YOUR WAY</span>
      </div>
      <a className="nyxi-theatre-photo-credit" href="https://unsplash.com/photos/a-pair-of-hands-with-red-nail-polish-against-a-white-wall-mVsnJ3J46S8" target="_blank" rel="noopener noreferrer">Photo: Bansah Photography / Unsplash</a>
    </section>
  );
}
