"use client";

import { useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { closestIllustrativeShades, type RGB } from "../lib/nyxi-color";
type Shade = { name: string; hex: string };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SHADES: Shade[] = [
  { name: "Γαλακτερό ροζ", hex: "#EBC5C9" },
  { name: "Ροζ πούδρας", hex: "#D9A8AE" },
  { name: "Ροζ της πούδρας", hex: "#C88A9D" },
  { name: "Dusty rose", hex: "#B77988" },
  { name: "Nude μπεζ", hex: "#D6AE97" },
  { name: "Καραμέλα", hex: "#B47B61" },
  { name: "Μόκα", hex: "#896052" },
  { name: "Κερασί", hex: "#9A283C" },
  { name: "Κλασικό κόκκινο", hex: "#C92B3F" },
  { name: "Κοραλλί", hex: "#ED796B" },
  { name: "Μπορντό", hex: "#652C40" },
  { name: "Μωβ δαμάσκηνο", hex: "#754E78" },
  { name: "Λεβάντα", hex: "#B5A2D2" },
  { name: "Απαλό λιλά", hex: "#DAC7E6" },
  { name: "Βαθύ μπλε", hex: "#35486C" },
  { name: "Φυστικί", hex: "#A9BA90" },
  { name: "Ελεφαντόδοντο", hex: "#F2E7D8" },
  { name: "Σοκολάτα", hex: "#563F3B" },
];

const hexFromRgb = ({ r, g, b }: RGB) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();

// Keep the 18 demo shades as illustrative directions, never products.
function nearbyShades(color: RGB) {
  return closestIllustrativeShades(color, SHADES, 3);
}

export default function PhotoColorStudio({ onColorPick }: { onColorPick?: (hex: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [color, setColor] = useState<RGB | null>(null);
  const [imageName, setImageName] = useState("");
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);

  async function loadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError("");
    setCopyState("");
    setColor(null);
    setPoint(null);
    setLoaded(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Επίλεξε φωτογραφία JPG, PNG ή WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Η φωτογραφία πρέπει να είναι έως 8 MB.");
      return;
    }
    setLoading(true);
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("canvas_missing");
      const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("canvas_context_missing");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      setImageName(file.name);
      setLoaded(true);
    } catch {
      setError("Δεν ήταν δυνατή η ανάγνωση της φωτογραφίας. Δοκίμασε άλλη εικόνα.");
    } finally {
      bitmap?.close();
      setLoading(false);
    }
  }

  function sampleAt(x: number, y: number) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx || !loaded) return;
    const cx = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
    // A 9x9 neighborhood reduces camera noise and stray highlights.
    const left = Math.max(0, cx - 4), top = Math.max(0, cy - 4);
    const data = ctx.getImageData(left, top, Math.min(9, canvas.width - left), Math.min(9, canvas.height - top)).data;
    let r = 0, g = 0, b = 0, total = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; total++;
    }
    if (!total) return;
    const picked = { r: r / total, g: g / total, b: b / total };
    setColor(picked);
    onColorPick?.(hexFromRgb(picked));
    setPoint({ x: 100 * cx / canvas.width, y: 100 * cy / canvas.height });
    setCopyState("");
  }

  function pickOnPhoto(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    sampleAt((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
  }

  async function copyColor() {
    if (!color) return;
    try {
      await navigator.clipboard.writeText(hexFromRgb(color));
      setCopyState("Ο κωδικός αντιγράφηκε.");
    } catch {
      setCopyState("Δεν ήταν δυνατή η αντιγραφή. Μπορείς να επιλέξεις τον κωδικό.");
    }
  }

  const hex = color ? hexFromRgb(color) : null;
  const suggestions = color ? nearbyShades(color) : [];

  return <section className="panel color-studio" aria-labelledby="color-title">
    <div className="section-heading">
      <div><span className="overline">01 / COLOR STUDIO</span><h2 id="color-title">Βρες το χρώμα σου.</h2><p className="muted">Ανέβασε μια φωτογραφία, άγγιξε το σημείο με την απόχρωση που σε ενδιαφέρει και ανακάλυψε κοντινές χρωματικές κατευθύνσεις.</p></div>
      <span className="privacy-label">◈ Μόνο στη συσκευή σου</span>
    </div>
    <div className="studio-grid">
      <div className="upload-area">
        <label className="upload-trigger" htmlFor="nail-photo"><span className="upload-icon" aria-hidden="true">＋</span><strong>{loaded ? "Επίλεξε άλλη φωτογραφία" : "Πρόσθεσε φωτογραφία"}</strong><span>JPG, PNG ή WebP · έως 8 MB</span></label>
        <input id="nail-photo" className="visually-hidden-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={loadPhoto} aria-describedby="photo-privacy" />
        <p id="photo-privacy" className="microcopy">Η ανάλυση χρώματος γίνεται τοπικά στον browser. Η φωτογραφία δεν μεταφορτώνεται σε διακομιστή.</p>
        {loading && <p role="status" className="muted">Επεξεργασία φωτογραφίας…</p>}
        {error && <p className="notice warning" role="alert">{error}</p>}
        <div className={"photo-stage" + (!loaded ? " photo-stage-empty" : "")}>
          <canvas ref={canvasRef} onPointerDown={pickOnPhoto} className="photo-canvas" style={{ display: loaded ? "block" : "none" }} aria-label="Η φωτογραφία σου. Άγγιξε την περιοχή του χρώματος που σε ενδιαφέρει." />
          {loaded && point && <span className="picked-point" style={{ left: point.x + "%", top: point.y + "%" }} aria-hidden="true" />}
          {!loaded && <div className="photo-placeholder" aria-hidden="true"><span className="placeholder-polish">✦</span><p>Η απόχρωση ξεκινά από εσένα.</p></div>}
        </div>
        {loaded && <div className="photo-actions"><span className="photo-help">Άγγιξε την εικόνα για να επιλέξεις χρώμα.</span><button type="button" className="text-button" onClick={() => { const c = canvasRef.current; if (c) sampleAt(c.width / 2, c.height / 2); }}>Δείγμα από το κέντρο</button></div>}
        {loaded && <span className="file-name" title={imageName}>{imageName}</span>}
      </div>
      <div className="color-output">
        <div className="output-header"><span className="overline">02 / YOUR COLOR</span><span className="output-live">{hex ? "Επιλεγμένο δείγμα" : "Αναμονή δείγματος"}</span></div>
        <div className="sample-preview" style={{ backgroundColor: hex || "#eed9df" }}><span>{hex ? "YOUR SHADE" : "NYXI COLOR"}</span></div>
        <div className="sample-code"><div><span className="microcopy">Χρωματικός κωδικός</span><strong aria-live="polite">{hex || "— — —"}</strong></div><button type="button" className="outline-button" disabled={!hex} onClick={copyColor}>Αντιγραφή</button></div>
        {copyState && <p role="status" className="microcopy">{copyState}</p>}
        <div className="suggestions"><h3>Κοντινές ενδεικτικές αποχρώσεις</h3>
          {suggestions.length ? <div className="shade-list">{suggestions.map((shade) => <div className="shade-item" key={shade.hex}><span className="shade-chip" style={{ backgroundColor: shade.hex }} aria-hidden="true" /><span><strong>{shade.name}</strong><small>{shade.hex}</small></span></div>)}</div> : <p className="muted">Επίλεξε ένα σημείο της φωτογραφίας για να δεις προτάσεις από την ενδεικτική χρωματική παλέτα.</p>}
        </div>
        <p className="color-disclaimer">Οι αποχρώσεις είναι οπτικές προσεγγίσεις, όχι αντιστοιχίες εμπορικών προϊόντων. Ο φωτισμός και η οθόνη μπορούν να επηρεάζουν το αποτέλεσμα.</p>
      </div>
    </div>
  </section>;
}
