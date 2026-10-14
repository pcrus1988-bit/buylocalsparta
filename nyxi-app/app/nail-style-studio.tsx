"use client";

import { useState } from "react";
import NailArTryOn from "./nail-ar-try-on";
import type { ArLook, NailShape, NailFinish, NailLength, NailCorrection } from "./nail-ar-geometry";
import { AVAILABLE_BRANDS, AVAILABLE_POLISHES, findBrandPolish } from "./brand-polishes";
import { brandMaterial, creativeMaterial } from "./nail-material-renderer";
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
  const [polishMode, setPolishMode] = useState<"brand" | "creative">("brand");
  const [selectedBrand, setSelectedBrand] = useState("OPI");
  const [selectedPolishId, setSelectedPolishId] = useState("opi-nl-bubble-bath");
  const [shade, setShade] = useState("#B52C4E");
  const [hasPickedCustom, setHasPickedCustom] = useState(false);
  const [shape, setShape] = useState<Shape>("oval");
  const [finish, setFinish] = useState<Finish>("gloss");
  const [length, setLength] = useState<NailLength>("medium");
  const [viewMode, setViewMode] = useState<"preview" | "live" | "photo">("preview");
  const [opacity, setOpacity] = useState(0.9);
  const [fit, setFit] = useState(1);
  const [placement, setPlacement] = useState(0);
  const [selectedFinger, setSelectedFinger] = useState(2);
  const [corrections, setCorrections] = useState<Partial<Record<number, NailCorrection>>>({});
  const fingerNames = ["Αντίχειρας", "Δείκτης", "Μέσος", "Παράμεσος", "Μικρό"];
  const fingerCorrection = corrections[selectedFinger] ?? { lateral: 0, axial: 0, width: 1 };
  const adjustFinger = (field: keyof NailCorrection, value: number) => setCorrections(prev => ({
    ...prev, [selectedFinger]: { ...(prev[selectedFinger] ?? { lateral: 0, axial: 0, width: 1 }), [field]: value },
  }));
  const [message, setMessage] = useState("");
  const profile = polishMode === "brand" ? findBrandPolish(selectedPolishId) : null;
  const finalShade = profile ? profile.approximateHex : hasPickedCustom && sampledShade ? sample(sampledShade) : shade;
  const shadeLabel = profile ? profile.brand + " · " + profile.shadeName :
    hasPickedCustom && sampledShade ? "Το χρώμα της φωτογραφίας σου" : shades.find(s => s.hex === shade)?.name || "Custom";
  const shapeLabel = shapes.find(s => s.id === shape)?.text || "Οβάλ";
  const finishLabel = profile ? profile.material === "cream" ? "Κλασικό λαμπερό" : profile.material === "sheer" ? "Ημιδιάφανο" : profile.material :
    finishes.find(s => s.id === finish)?.text || "Gloss";
  const arLook: ArLook = { hex: finalShade, shape, finish, length, opacity, fit, placement,
    material: profile ? brandMaterial(profile) : creativeMaterial(finish, opacity), corrections };
  const cyclePolish = () => {
    if (profile) {
      const next = AVAILABLE_POLISHES[(AVAILABLE_POLISHES.findIndex(p => p.id === profile.id) + 1) % AVAILABLE_POLISHES.length];
      setSelectedBrand(next.brand);
      setSelectedPolishId(next.id);
    } else {
      setHasPickedCustom(false);
      setShade(prev => shades[(shades.findIndex(s => s.hex === prev) + 1) % shades.length].hex);
    }
  };
  const copyLook = async () => {
    const txt = "NYXI Nail Look — " + shadeLabel + " (" + finalShade + ")" + (profile ? " · εκτιμώμενο χρώμα, μη βαθμονομημένο" : "") + " · " + shapeLabel + " · " + finishLabel + " · " + (length === "short" ? "Κοντό" : length === "long" ? "Μακρύ" : "Μεσαίο") + " μήκος";
    try { await navigator.clipboard.writeText(txt); setMessage("Η ιδέα αντιγράφηκε."); }
    catch { setMessage(txt); }
  };
  return <section className="panel style-panel" aria-labelledby="style-title">
    <div className="section-heading"><div><span className="overline">NAIL ATELIER / 03</span><h2 id="style-title">Κάθε λεπτομέρεια, <em>δική σου.</em></h2><p className="muted">Σχεδίασε το μανικιούρ σου ή δες το live πάνω στο χέρι σου, με κάμερα και διαδραστικά φινιρίσματα.</p></div><span className="privacy-label">✦ NAIL TRY-ON BETA</span></div>
    <div className="atelier-realism-modes" role="group" aria-label="Πηγή βερνικιού">
      <button type="button" aria-pressed={polishMode === "brand"} className={polishMode === "brand" ? "selected" : ""} onClick={() => setPolishMode("brand")}>✧ Brand-referenced</button>
      <button type="button" aria-pressed={polishMode === "creative"} className={polishMode === "creative" ? "selected" : ""} onClick={() => setPolishMode("creative")}>✦ Creative Studio</button>
    </div>
    <div className="atelier-view-modes" role="group" aria-label="Λειτουργία Nail Atelier">
      <button type="button" aria-pressed={viewMode === "preview"} className={viewMode === "preview" ? "selected" : ""} onClick={() => setViewMode("preview")}>✦ Studio Preview</button>
      <button type="button" aria-pressed={viewMode === "live"} className={viewMode === "live" ? "selected" : ""} onClick={() => setViewMode("live")}>◉ Live Camera AR <span className="ar-beta">NEW</span></button>
      <button type="button" aria-pressed={viewMode === "photo"} className={viewMode === "photo" ? "selected" : ""} onClick={() => setViewMode("photo")}>▧ Photo Try-On</button>
    </div>
    <div className="atelier-grid">
      {viewMode !== "preview" ? <NailArTryOn key={viewMode} look={arLook} mode={viewMode} active={active}
        onNextShade={cyclePolish}
        branded={polishMode === "brand"}
        onNextShape={() => setShape(prev => shapes[(shapes.findIndex(s => s.id === prev) + 1) % shapes.length].id)}
        onNextFinish={() => { if (polishMode === "creative") setFinish(prev => finishes[(finishes.findIndex(f => f.id === prev) + 1) % finishes.length].id); }} /> : <div className={"manicure-preview finish-" + (profile ? "gloss" : finish) + " length-" + length + " shape-" + shape}>
        <div className="preview-topline"><span>YOUR NAIL EDIT</span><span>NYXI. / 001</span></div>
        <div className="hand-art" role="img" aria-label={"Ενδεικτική απεικόνιση πέντε νυχιών: " + shapeLabel + ", " + shadeLabel + ", " + finishLabel}>
          {[0,1,2,3,4].map((i) => <div className={"finger finger-" + i} key={i}><div className="nail-bed"><div className="nail-polish" style={{ backgroundColor: finalShade, opacity: profile ? Math.max(.34, profile.coverage) : 1 }} /></div></div>)}
        </div>
        <div className="preview-bottom"><span className="preview-dot" style={{ backgroundColor: finalShade }} /><div><strong>{shadeLabel}</strong><small>{finalShade} · {shapeLabel} · {finishLabel}</small></div><span className="preview-word">made for you.</span></div>
        <p className="visual-note">{profile ? "Προϊόν με τεκμηριωμένο φινίρισμα και μη βαθμονομημένη ψηφιακή απόχρωση." : "Δημιουργικό αποτέλεσμα. Δεν αντιστοιχεί υποχρεωτικά σε εμπορικό προϊόν."}</p>
      </div>}
      <div className="atelier-controls">
        {polishMode === "brand" && <div className="brand-polish-controls" aria-label="Επιλογή πραγματικού προϊόντος">
          <span className="overline">SOURCE-REFERENCED POLISH</span>
          <label htmlFor="nyxi-brand">Μάρκα</label>
          <select id="nyxi-brand" value={selectedBrand} onChange={event => {
            const chosen = event.target.value;
            setSelectedBrand(chosen);
            const first = AVAILABLE_POLISHES.find(p => p.brand === chosen);
            if (first) setSelectedPolishId(first.id);
          }}>{AVAILABLE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <label htmlFor="nyxi-shade">Σειρά και απόχρωση</label>
          <select id="nyxi-shade" value={selectedPolishId} onChange={event => setSelectedPolishId(event.target.value)}>
            {AVAILABLE_POLISHES.filter(p => p.brand === selectedBrand).map(p => <option key={p.id} value={p.id}>{p.collection} · {p.shadeName}</option>)}
          </select>
          {profile && <div className="brand-evidence">
            <div className="brand-evidence-swatch" style={{ background: profile.approximateHex }} aria-hidden="true"/>
            <div><strong>{profile.shadeName}</strong><p>{profile.notes}</p>
              <a href={profile.evidence.sourceUrl} rel="noopener noreferrer" target="_blank">Επίσημη πηγή ↗</a>
            </div>
          </div>}
          <p className="brand-trust-note">Η απόχρωση της οθόνης είναι <strong>ενδεικτική εκτίμηση</strong>, όχι μετρημένο χρώμα του προϊόντος. Η ονομασία και το είδος φινιρίσματος προέρχονται από επίσημη πηγή. Δεν προσθέτουμε ανύπαρκτα εφέ.</p>
        </div>}

        {polishMode === "creative" && <div className="control-group"><div className="control-heading"><h3><span>01</span> Απόχρωση</h3><small>{shadeLabel}</small></div>
          <div className="palette-grid" role="group" aria-label="Επιλογή απόχρωσης">{shades.map(s => <button type="button" key={s.hex} title={s.name} aria-label={s.name + " " + s.hex} aria-pressed={!hasPickedCustom && shade === s.hex} className={"palette-choice" + (!hasPickedCustom && shade === s.hex ? " selected" : "")} style={{ backgroundColor: s.hex }} onClick={() => { setShade(s.hex); setHasPickedCustom(false); }} />)}</div>
          {sampledShade && <button type="button" className={"from-photo" + (hasPickedCustom ? " selected" : "")} onClick={() => setHasPickedCustom(true)}><span className="photo-swatch" style={{ background: sample(sampledShade) }} />Χρώμα από το Color Studio <span aria-hidden="true">↗</span></button>}
        </div>}
        <div className="control-group"><div className="control-heading"><h3><span>02</span> Σχήμα</h3><small>{shapeLabel}</small></div><div className="shape-grid">{shapes.map(item => <button key={item.id} type="button" className={"shape-option" + (shape === item.id ? " selected" : "")} aria-pressed={shape === item.id} onClick={() => setShape(item.id)}><span className={"shape-symbol symbol-" + item.id} aria-hidden="true" /><strong>{item.text}</strong><small>{item.description}</small></button>)}</div></div>
        {polishMode === "creative" && <div className="control-group"><div className="control-heading"><h3><span>03</span> Φινίρισμα</h3><small>{finishLabel}</small></div><div className="finish-grid">{finishes.map(item => <button type="button" key={item.id} className={finish === item.id ? "selected" : ""} aria-pressed={finish === item.id} onClick={() => setFinish(item.id)}><strong>{item.text}</strong><small>{item.caption}</small></button>)}</div></div>}
        <div className="control-group"><div className="control-heading"><h3><span>04</span> Μήκος</h3></div><div className="length-grid">{([["short","Κοντό"],["medium","Μεσαίο"],["long","Μακρύ"]] as const).map(([id,label]) => <button type="button" key={id} className={length === id ? "selected" : ""} aria-pressed={length === id} onClick={() => setLength(id)}>{label}</button>)}</div></div>
        {viewMode !== "preview" && polishMode === "creative" && <div className="control-group ar-opacity-control"><div className="control-heading"><h3><span>05</span> Κάλυψη βερνικιού</h3><small>{Math.round(opacity * 100)}%</small></div><label htmlFor="nyxi-opacity" className="sr-only">Πυκνότητα επικάλυψης</label><input id="nyxi-opacity" type="range" min="0.45" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} /><p className="microcopy">Προσάρμοσε την ένταση του εφέ στο φυσικό φως.</p></div>}
        {viewMode !== "preview" && <div className="control-group ar-calibration"><div className="control-heading"><h3><span>06</span> Προσαρμογή στα νύχια σου</h3></div>
          <label htmlFor="nyxi-nail-width">Πλάτος <span>{Math.round(fit * 100)}%</span></label>
          <input id="nyxi-nail-width" type="range" min="0.75" max="1.25" step="0.05" value={fit} onChange={e => setFit(Number(e.target.value))} />
          <label htmlFor="nyxi-nail-shift">Θέση πάνω στο νύχι <span>{placement === 0 ? "Κέντρο" : placement > 0 ? "Προς τη βάση" : "Προς την άκρη"}</span></label>
          <input id="nyxi-nail-shift" type="range" min="-0.2" max="0.2" step="0.05" value={placement} onChange={e => setPlacement(Number(e.target.value))} />
          <p className="microcopy">Η ακριβής επιφάνεια του νυχιού δεν αναγνωρίζεται ακόμη αυτόματα. Ρύθμισε την εφαρμογή για πιο φυσικό αποτέλεσμα.</p>
          <button type="button" className="ar-calibration-reset" onClick={() => { setFit(1); setPlacement(0); }}>Επαναφορά προσαρμογής</button>
        </div>}
        {viewMode !== "preview" && <div className="control-group ar-finger-adjust">
          <div className="control-heading"><h3><span>07</span> Ακριβής διόρθωση ανά νύχι</h3></div>
          <p className="microcopy">Αν κάποιο νύχι δεν ευθυγραμμίζεται σωστά, ρύθμισέ το ξεχωριστά. Οι αλλαγές ακολουθούν την κίνησή του.</p>
          <div className="finger-selector" role="group" aria-label="Επιλογή δαχτύλου">
            {fingerNames.map((name, index) => <button type="button" key={name} aria-pressed={selectedFinger === index} className={selectedFinger === index ? "selected" : ""} onClick={() => setSelectedFinger(index)}>{name}</button>)}
          </div>
          <label htmlFor="nyxi-finger-width">Πλάτος <span>{Math.round(fingerCorrection.width * 100)}%</span></label>
          <input id="nyxi-finger-width" type="range" min="0.7" max="1.3" step="0.05" value={fingerCorrection.width} onChange={event => adjustFinger("width", Number(event.target.value))}/>
          <label htmlFor="nyxi-finger-x">Οριζόντια θέση <span>{Math.round(fingerCorrection.lateral * 100)}%</span></label>
          <input id="nyxi-finger-x" type="range" min="-0.3" max="0.3" step="0.03" value={fingerCorrection.lateral} onChange={event => adjustFinger("lateral", Number(event.target.value))}/>
          <label htmlFor="nyxi-finger-y">Κατακόρυφη θέση <span>{Math.round(fingerCorrection.axial * 100)}%</span></label>
          <input id="nyxi-finger-y" type="range" min="-0.2" max="0.2" step="0.02" value={fingerCorrection.axial} onChange={event => adjustFinger("axial", Number(event.target.value))}/>
          <button type="button" className="ar-calibration-reset" onClick={() => setCorrections(prev => { const next = { ...prev }; delete next[selectedFinger]; return next; })}>Επαναφορά δαχτύλου</button>
        </div>}
        <button className="primary-action look-copy" type="button" onClick={copyLook}>Αντέγραψε το look σου <span aria-hidden="true">↗</span></button>
        {message && <p className="microcopy" role="status">{message}</p>}
      </div>
    </div>
  </section>;
}
