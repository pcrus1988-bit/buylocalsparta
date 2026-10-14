"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { calibrateNailPose, deriveNails, type ArLook, type Point } from "./nail-ar-geometry";
import { boundsForNail, imagePointToLocal, localPointToImage, validContour, type NailContour, type NailContours } from "./nail-contours";

const NAMES = ["Αντίχειρας", "Δείκτης", "Μέσος", "Παράμεσος", "Μικρό"];
const REQUIRED_POINTS = 8;
const EDIT_SIZE = 440;
type Props = {
  image: ImageBitmap;
  landmarks: Point[];
  look: ArLook;
  contours: NailContours;
  onSave: (finger: number, contour: NailContour) => void;
  onReset: (finger: number) => void;
  onClose: () => void;
};

export default function NailContourEditor({ image, landmarks, look, contours, onSave, onReset, onClose }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [finger, setFinger] = useState(2);
  const [draft, setDraft] = useState<Point[]>([]);
  const [feedback, setFeedback] = useState("");
  const poses = useMemo(() => deriveNails(landmarks, {
    imageWidth: image.width, imageHeight: image.height, width: image.width, height: image.height, mirror: false,
  }, look.length, look.fit, look.placement).map(p => calibrateNailPose(p, look.corrections?.[p.finger])), [
    landmarks, image.width, image.height, look.length, look.fit, look.placement, look.corrections
  ]);
  const pose = poses.find(p => p.finger === finger);
  const crop = pose ? boundsForNail(pose, image.width, image.height) : null;

  useEffect(() => { setDraft([]); setFeedback(""); }, [finger]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !pose || !crop) return;
    canvas.width = EDIT_SIZE;
    canvas.height = EDIT_SIZE;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "#f2e0e6";ctx.fillRect(0, 0, EDIT_SIZE, EDIT_SIZE);
    ctx.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, EDIT_SIZE, EDIT_SIZE);

    const toEditor = (p: Point) => ({
      x: ((p.x - crop.left) / crop.width) * EDIT_SIZE,
      y: ((p.y - crop.top) / crop.height) * EDIT_SIZE,
    });
    const saved = contours[finger];
    const savedImagePoints = saved && validContour(saved) ? saved.map(p => localPointToImage(p, pose)) : [];
    const paintPoints = (points: Point[], stroke: string, fill: string, closed: boolean) => {
      if (!points.length) return;
      ctx.beginPath();
      points.forEach((point, i) => {
        const loc = toEditor(point);
        if (i === 0) ctx.moveTo(loc.x, loc.y);
        else ctx.lineTo(loc.x, loc.y);
      });
      if (closed) ctx.closePath();
      ctx.lineWidth = 3;ctx.strokeStyle = stroke;ctx.stroke();
      if (closed) {ctx.fillStyle = fill;ctx.fill();}
      points.forEach((p, i) => {
        const loc = toEditor(p);
        ctx.beginPath();ctx.arc(loc.x, loc.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#f4cc58" : "#fff";ctx.fill();
        ctx.lineWidth = 2;ctx.strokeStyle = stroke;ctx.stroke();
      });
    };
    paintPoints(savedImagePoints, "#267658", "#68b89627", true);
    paintPoints(draft, "#a23270", "#c94e8924", draft.length === REQUIRED_POINTS);
    if (!savedImagePoints.length && draft.length === 0) {
      const loc = toEditor({ x: pose.x, y: pose.y });
      ctx.beginPath();ctx.arc(loc.x, loc.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";ctx.fill();ctx.strokeStyle = "#ae416e";ctx.lineWidth = 2;ctx.stroke();
    }
  }, [image, pose, crop, draft, finger, contours]);

  function placePoint(event: PointerEvent<HTMLCanvasElement>) {
    if (!pose || !crop || draft.length >= REQUIRED_POINTS) return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const point = { x: crop.left + u * crop.width, y: crop.top + v * crop.height };
    const local = imagePointToLocal(point, pose);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y) || Math.abs(local.x) > 0.9 || Math.abs(local.y) > 0.98) {
      setFeedback("Το σημείο είναι εκτός της αναμενόμενης περιοχής του νυχιού.");
      return;
    }
    setFeedback("");
    setDraft(prev => [...prev, point]);
  }

  function confirm() {
    if (!pose || draft.length !== REQUIRED_POINTS) return;
    const local = draft.map(point => imagePointToLocal(point, pose));
    if (!validContour(local)) {
      setFeedback("Το περίγραμμα διασταυρώνεται ή είναι υπερβολικά μικρό/μεγάλο. Πάτησε «Καθαρισμός» και σχεδίασέ το ξανά.");
      return;
    }
    onSave(finger, local);
    setFeedback("Το περίγραμμα αποθηκεύτηκε μόνο σε αυτή τη συσκευή.");
    setDraft([]);
    const next = NAMES.findIndex((_, index) => index !== finger && !contours[index] && poses.some(p => p.finger === index));
    if (next >= 0) setFinger(next);
  }

  const confirmed = NAMES.filter((_, index) => contours[index] && validContour(contours[index]!)).length;
  return <div className="nyxi-contour-editor">
    <div className="contour-head"><div><span className="overline">PRECISION NAIL FIT</span><h3>Δείξε μας τα πραγματικά όρια.</h3>
      <p>Η φωτογραφία μεγεθύνεται για να χαράξεις το περίγραμμα. Πάτησε <strong>8 σημεία στη σειρά, γύρω από το νύχι</strong> — ξεκίνα από την άκρη και προχώρησε δεξιόστροφα. Το βερνίκι θα περιορίζεται μέσα στο περίγραμμα.</p>
    </div><button type="button" className="ar-secondary" onClick={onClose}>Κλείσιμο ✕</button></div>
    <div className="contour-fingers" role="group" aria-label="Επιλογή νυχιού για χάραξη">
      {NAMES.map((name, i) => <button type="button" key={name} aria-pressed={i === finger} className={finger === i ? "selected" : ""} disabled={!poses.some(p => p.finger === i)} onClick={() => setFinger(i)}>
        {name} {contours[i] && validContour(contours[i]!) ? "✓" : ""}
      </button>)}
    </div>
    {pose && crop ? <><canvas ref={ref} onPointerDown={placePoint} className="contour-zoom" role="img" aria-label={"Μεγεθυμένο νύχι: " + NAMES[finger] + ". Πάτησε 8 σημεία του πραγματικού περιγράμματος."} />
      <div className="contour-meter"><span>{draft.length}/{REQUIRED_POINTS} σημεία</span><span>{confirmed}/5 επιβεβαιωμένα νύχια</span></div>
      <div className="contour-actions">
        <button type="button" className="ar-secondary" onClick={() => { setDraft(points => points.slice(0, -1)); setFeedback(""); }} disabled={!draft.length}>↶ Αναίρεση</button>
        <button type="button" className="ar-secondary" onClick={() => { setDraft([]);setFeedback(""); }}>Καθαρισμός</button>
        <button type="button" className="ar-secondary" disabled={!contours[finger]} onClick={() => onReset(finger)}>Αφαίρεση περιγράμματος</button>
        <button type="button" className="primary-action" disabled={draft.length !== REQUIRED_POINTS} onClick={confirm}>✓ Επιβεβαίωση νυχιού</button>
      </div></> : <p role="status">Το συγκεκριμένο νύχι δεν εντοπίζεται αρκετά καθαρά. Δοκίμασε φωτογραφία με περισσότερο φως.</p>}
    {feedback && <p role="status" className="contour-feedback">{feedback}</p>}
    <p className="microcopy">Πρόκειται για χειροκίνητα επιβεβαιωμένο περίγραμμα, όχι αυτόματη ανίχνευση της πλάκας νυχιού. Στο live mode ακολουθεί την κίνηση του αντίστοιχου δαχτύλου· μεγάλες αλλαγές γωνίας μπορεί να απαιτούν νέα βαθμονόμηση.</p>
    <button type="button" className="contour-done" onClick={onClose}>Εφαρμογή {confirmed} επιβεβαιωμένων περιγραμμάτων →</button>
  </div>;
}
