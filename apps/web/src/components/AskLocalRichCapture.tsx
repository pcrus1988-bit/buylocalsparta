"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => { detect(source: ImageBitmap): Promise<readonly { rawValue?: string }[]> };

const MAX_IMAGE_DATA_URL = 260_000;
const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

async function compressedReferenceImage(file: File): Promise<{ dataUrl: string; bitmap: ImageBitmap }> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("Χρησιμοποίησε εικόνα JPG, PNG ή WebP.");
  const source = await createImageBitmap(file);
  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) { source.close(); throw new Error("Δεν μπορέσαμε να επεξεργαστούμε τη φωτογραφία."); }
  context.drawImage(source, 0, 0, width, height);
  let quality = 0.76;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_IMAGE_DATA_URL && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL) { source.close(); throw new Error("Η φωτογραφία παραμένει πολύ μεγάλη. Δοκίμασε πιο κοντινή λήψη."); }
  return { dataUrl, bitmap: source };
}

export function AskLocalRichCapture() {
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [notice, setNotice] = useState("");
  const captureSource = useMemo(() => {
    const active = [voiceTranscript ? "voice" : "", barcode ? "barcode" : "", imageDataUrl ? "photo" : ""].filter(Boolean);
    return active.length > 1 ? "mixed" : active[0] || "text";
  }, [barcode, imageDataUrl, voiceTranscript]);

  function startVoice() {
    setNotice("");
    const browser = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Speech = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Speech) { setNotice("Η φωνητική καταγραφή δεν υποστηρίζεται από αυτόν τον browser. Μπορείς να γράψεις κανονικά το αίτημά σου."); return; }
    const recognition = new Speech();
    recognition.lang = "el-GR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setVoiceTranscript((current) => current ? `${current} ${transcript}`.slice(0, 1200) : transcript.slice(0, 1200));
    };
    recognition.onerror = () => setNotice("Δεν ακούσαμε καθαρά. Δοκίμασε ξανά ή γράψε την περιγραφή.");
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }

  async function capturePhoto(file?: File) {
    if (!file) return;
    setNotice("");
    try {
      const { dataUrl, bitmap } = await compressedReferenceImage(file);
      setImageDataUrl(dataUrl);
      const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (Detector) {
        try {
          const detected = await new Detector({ formats: BARCODE_FORMATS }).detect(bitmap);
          const rawValue = detected.find((item) => item.rawValue?.trim())?.rawValue?.trim();
          if (rawValue) { setBarcode(rawValue.slice(0, 64)); setNotice(`Εντοπίστηκε κωδικός ${rawValue}. Έλεγξέ τον πριν την αποστολή.`); }
        } catch { /* Photo remains useful even when barcode detection fails. */ }
      }
      bitmap.close();
    } catch (error) {
      setImageDataUrl("");
      setNotice(error instanceof Error ? error.message : "Η φωτογραφία δεν μπόρεσε να προστεθεί.");
    }
  }

  return <fieldset className="ask-local-full workspace-tool-panel">
    <legend><strong>Δείξε μας τι ψάχνεις</strong></legend>
    <p className="workspace-inline-note">Προαιρετικά: μίλησε, φωτογράφισε το αντικείμενο/ανταλλακτικό ή σκάναρε τον κωδικό. Η φωτογραφία μένει μέσα στο ιδιωτικό Ask Local αίτημα και δεν δημοσιεύεται.</p>
    <div className="workspace-inline-actions">
      <button className="button button-secondary" type="button" onClick={startVoice} disabled={listening}>{listening ? "Ακούω…" : "🎤 Μίλησε"}</button>
      <label className="button button-secondary" htmlFor="ask-local-reference-photo">📷 Φωτογραφία / barcode</label>
      <input id="ask-local-reference-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void capturePhoto(event.target.files?.[0])} hidden />
    </div>
    {voiceTranscript ? <label className="ask-local-full"><span>Φωνητική σημείωση</span><textarea name="voiceTranscript" value={voiceTranscript} onChange={(event) => setVoiceTranscript(event.target.value.slice(0, 1200))} maxLength={1200} /></label> : <input type="hidden" name="voiceTranscript" value="" />}
    <label><span>Barcode / EAN / μοντέλο</span><input name="barcode" value={barcode} onChange={(event) => setBarcode(event.target.value.slice(0, 64))} maxLength={64} inputMode="text" autoComplete="off" placeholder="π.χ. 5201234567890" /></label>
    {imageDataUrl ? <div className="ask-local-context"><Image src={imageDataUrl} alt="Φωτογραφία αναφοράς Ask Local" width={240} height={180} unoptimized /><button type="button" className="text-link" onClick={() => setImageDataUrl("")}>Αφαίρεση φωτογραφίας</button></div> : null}
    {notice ? <div className="workspace-inline-note" role="status">{notice}</div> : null}
    <input type="hidden" name="referenceImageDataUrl" value={imageDataUrl} />
    <input type="hidden" name="captureSource" value={captureSource} />
  </fieldset>;
}
