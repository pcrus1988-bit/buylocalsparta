"use client";

import { useState } from "react";
import NailArTryOn from "./nail-ar-try-on";
import type { ArLook, NailShape, NailFinish, NailLength } from "./nail-ar-geometry";
type Shape = NailShape;
type Finish = NailFinish;
const shades = [
  { name: "Milky Pink", hex: "#E9C8D1" }, { name: "Rose Water", hex: "#DDA0B6" },
  { name: "Soft Nude", hex: "#CF9981" }, { name: "Cherry Crush", hex: "#B52C4E" },
  { name: "Berry", hex: "#85264B" }, { name: "Merlot", hex: "#62273E" },
  { name: "Lilac", hex: "#B8A3D9" }, { name: "Midnight", hex: "#343D69" },
  { name: "Pistachio", hex: "#A8B694" }, { name: "Cloud", hex: "#F7F0EA" },
];
const shapes: { id: Shape; text: string; description: string }[] = [
  { id: "oval", text: "Οβάλ", description: "Απαλή καμπύλη" },
  { id: "almond", text: "Αμυγδαλωτό", description: "Λεπτή κορυφή" },
  { id: "squoval", text: "Squoval", description: "Μαλακές γωνίες" },
  { id: "square", text: "Τετράγωνο", description: "Ευθείες γραμμές" },
];
const finishes: { id: Finish; text: string; caption: string }[] = [
  { id: "gloss", text: "Gloss", caption: "Φωτεινή λάμψη" },
  { id: "soft", text: "Velvet", caption: "Απαλό ματ" },
  { id: "pearl", text: "Pearl", caption: "Περλέ λάμψη" },
  { id: "chrome", text: "Chrome", caption: "Μεταλλικό" },
  { id: "cat-eye", text: "Cat-eye", caption: "Μαγνητική λάμψη" },
];
const sample = (hex: string) => /^#[a-f0-9]{6}$/i.test(hex) ? hex.toUpperCase() : "#E9C8D1";
export default function NailStyleStudio({ sampledShade, active = true }: { sampledShade?: string | null; active?: boolean }) {
  const [shade, setShade] = useState("#B52C4E");
  const [hasPickedCustom, setHasPickedCustom] = useState(false);
  const [shape, setShape] = useState<Shape>("oval");
  const [finish, setFinish] = useState<Finish>("gloss");
  const [length, setLength] = useState<NailLength>("medium");
  const [viewMode, setViewMode] = useState<"preview" | "live" | "photo">("preview");
  const [opacity, setOpacity] = useState(0.9);
  const [message, setMessage] = useState("");
  const finalShade = hasPickedCustom && sampledShade ? sample(sampledShade) : shade;
  const shadeLabel = hasPickedCustom && sampledShade ? "Το χρώμα της φωτογραφίας σου" : shades.find(s => s.hex === shade)?.name || "Custom";
  const shapeLabel = shapes.find(s => s.id === shape)?.text || "Οβάλ";
  const finishLabel = finishes.find(s => s.id === finish)?.text || "Gloss";
  const arLook: ArLook = { hex: finalShade, shape, finish, length, opacity };
  const copyLook = async () => {
    const txt = "NYXI Nail Look — " + shadeLabel + " (" + finalShade + ") · " + shapeLabel + " · " + finishLabel + " · " + (length === "short" ? "Κοντό" : length === "long" ? "Μακρύ" : "Μεσαίο") + " μήκος";
    try { await navigator.clipboard.writeText(txt); setMessage("Η ιδέα αντιγράφηκε."); }
    catch { setMessage(txt); }
  };
  return <section className="panel style-panel" aria-labelledby="style-title">
    <div className="section-heading"><div><span className="overline">NAIL ATELIER / 03</span><h2 id="style-title">Κάθε λεπτομέρεια, <em>δική σου.</em></h2><p className="muted">Σχεδίασε το μανικιούρ σου ή δες το live πάνω στο χέρι σου, με κάμερα και διαδραστικά φινιρίσματα.</p></div><span className="privacy-label">✦ NAIL TRY-ON BETA</span></div>
    <div className="atelier-view-modes" role="group" aria-label="Λειτουργία Nail Atelier">
      <button type="button" aria-pressed={viewMode === "preview"} className={viewMode === "preview" ? "selected" : ""} onClick={() => setViewMode("preview")}>✦ Studio Preview</button>
      <button type="button" aria-pressed={viewMode === "live"} className={viewMode === "live" ? "selected" : ""} onClick={() => setViewMode("live")}>◉ Live Camera AR <span className="ar-beta">NEW</span></button>
      <button type="button" aria-pressed={viewMode === "photo"} className={viewMode === "photo" ? "selected" : ""} onClick={() => setViewMode("photo")}>▧ Photo Try-On</button>
    </div>
    <div className="atelier-grid">
      {viewMode !== "preview" ? <NailArTryOn key={viewMode} look={arLook} mode={viewMode} active={active} /> : <div className={"manicure-preview finish-" + finish + " length-" + length + " shape-" + shape}>
        <div className="preview-topline"><span>YOUR NAIL EDIT</span><span>NYXI. / 001</span></div>
        <div className="hand-art" role="img" aria-label={"Ενδεικτική απεικόνιση πέντε νυχιών: " + shapeLabel + ", " + shadeLabel + ", " + finishLabel}>
          {[0,1,2,3,4].map((i) => <div className={"finger finger-" + i} key={i}><div className="nail-bed"><div className="nail-polish" style={{ backgroundColor: finalShade }} /></div></div>)}
        </div>
        <div className="preview-bottom"><span className="preview-dot" style={{ backgroundColor: finalShade }} /><div><strong>{shadeLabel}</strong><small>{finalShade} · {shapeLabel} · {finishLabel}</small></div><span className="preview-word">made for you.</span></div>
        <p className="visual-note">Ενδεικτική οπτική προεπισκόπηση. Δοκίμασε την Live Camera AR για προσαρμογή στο χέρι σου.</p>
      </div>}
      <div className="atelier-controls">
        <div className="control-group"><div className="control-heading"><h3><span>01</span> Απόχρωση</h3><small>{shadeLabel}</small></div>
          <div className="palette-grid" role="group" aria-label="Επιλογή απόχρωσης">{shades.map(s => <button type="button" key={s.hex} title={s.name} aria-label={s.name + " " + s.hex} aria-pressed={!hasPickedCustom && shade === s.hex} className={"palette-choice" + (!hasPickedCustom && shade === s.hex ? " selected" : "")} style={{ backgroundColor: s.hex }} onClick={() => { setShade(s.hex); setHasPickedCustom(false); }} />)}</div>
          {sampledShade && <button type="button" className={"from-photo" + (hasPickedCustom ? " selected" : "")} onClick={() => setHasPickedCustom(true)}><span className="photo-swatch" style={{ background: sample(sampledShade) }} />Χρώμα από το Color Studio <span aria-hidden="true">↗</span></button>}
        </div>
        <div className="control-group"><div className="control-heading"><h3><span>02</span> Σχήμα</h3><small>{shapeLabel}</small></div><div className="shape-grid">{shapes.map(item => <button key={item.id} type="button" className={"shape-option" + (shape === item.id ? " selected" : "")} aria-pressed={shape === item.id} onClick={() => setShape(item.id)}><span className={"shape-symbol symbol-" + item.id} aria-hidden="true" /><strong>{item.text}</strong><small>{item.description}</small></button>)}</div></div>
        <div className="control-group"><div className="control-heading"><h3><span>03</span> Φινίρισμα</h3><small>{finishLabel}</small></div><div className="finish-grid">{finishes.map(item => <button type="button" key={item.id} className={finish === item.id ? "selected" : ""} aria-pressed={finish === item.id} onClick={() => setFinish(item.id)}><strong>{item.text}</strong><small>{item.caption}</small></button>)}</div></div>
        <div className="control-group"><div className="control-heading"><h3><span>04</span> Μήκος</h3></div><div className="length-grid">{([["short","Κοντό"],["medium","Μεσαίο"],["long","Μακρύ"]] as const).map(([id,label]) => <button type="button" key={id} className={length === id ? "selected" : ""} aria-pressed={length === id} onClick={() => setLength(id)}>{label}</button>)}</div></div>
        {viewMode !== "preview" && <div className="control-group ar-opacity-control"><div className="control-heading"><h3><span>05</span> Κάλυψη βερνικιού</h3><small>{Math.round(opacity * 100)}%</small></div><label htmlFor="nyxi-opacity" className="sr-only">Πυκνότητα επικάλυψης</label><input id="nyxi-opacity" type="range" min="0.45" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /><p className="microcopy">Προσάρμοσε την ένταση του εφέ στο φυσικό φως.</p></div>}
        <button className="primary-action look-copy" type="button" onClick={copyLook}>Αντέγραψε το look σου <span aria-hidden="true">↗</span></button>
        {message && <p className="microcopy" role="status">{message}</p>}
      </div>
    </div>
  </section>;
}
