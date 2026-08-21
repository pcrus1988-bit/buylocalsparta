"use client";

import { useEffect, useRef, useState } from "react";

type DetectedBarcode = Readonly<{ rawValue?: string }>;
type BarcodeDetectorInstance = Readonly<{ detect(source: HTMLVideoElement): Promise<readonly DetectedBarcode[]> }>;
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

function pickupToken(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    const token = url.searchParams.get("token")?.trim();
    if (token) return token;
  } catch {
    // A pickup token may also be encoded directly instead of as a URL.
  }
  if (/^[A-Za-z0-9._~-]{16,512}$/.test(raw)) return raw;
  return null;
}

export function VendorPickupScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }

  useEffect(() => () => stop(), []);

  async function start() {
    setMessage("");
    const Detector = window.BarcodeDetector;
    if (!Detector) {
      setMessage("Ο ενσωματωμένος σαρωτής δεν υποστηρίζεται από αυτόν τον browser. Σκάναρε το QR με την κανονική κάμερα του κινητού· ο σύνδεσμος θα ανοίξει αυτόματα αυτή τη σελίδα.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Η κάμερα δεν είναι διαθέσιμη σε αυτόν τον browser. Χρησιμοποίησε την κανονική εφαρμογή κάμερας του κινητού για να σαρώσεις το QR.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new Detector({ formats: ["qr_code"] });

      const scan = async () => {
        const currentVideo = videoRef.current;
        if (!currentVideo || !streamRef.current) return;
        try {
          const codes = await detector.detect(currentVideo);
          for (const code of codes) {
            const token = code.rawValue ? pickupToken(code.rawValue) : null;
            if (!token) continue;
            stop();
            window.location.assign(`/vendor/pickup/scan?token=${encodeURIComponent(token)}`);
            return;
          }
        } catch {
          // Transient frame detection errors are expected while the camera warms up.
        }
        frameRef.current = requestAnimationFrame(() => void scan());
      };
      frameRef.current = requestAnimationFrame(() => void scan());
    } catch (cause) {
      stop();
      const name = cause instanceof DOMException ? cause.name : "";
      setMessage(name === "NotAllowedError"
        ? "Δεν δόθηκε άδεια κάμερας. Επίτρεψε την κάμερα από τις ρυθμίσεις του browser ή σκάναρε το QR με την κανονική κάμερα του κινητού."
        : "Δεν μπορέσαμε να ανοίξουμε την κάμερα. Μπορείς πάντα να σαρώσεις το QR με την κανονική κάμερα του κινητού.");
    }
  }

  return <div className="vendor-pickup-scanner">
    <div className={`vendor-pickup-camera${scanning ? " is-active" : ""}`}>
      <video ref={videoRef} playsInline muted aria-label="Κάμερα σάρωσης QR" />
      {scanning ? <div className="vendor-pickup-target" aria-hidden="true" /> : <div className="vendor-pickup-camera-placeholder" aria-hidden="true">QR</div>}
    </div>
    <div className="workspace-action-buttons">
      {!scanning ? <button className="button" type="button" onClick={() => void start()}>Άνοιγμα κάμερας</button> : <button className="button button-secondary" type="button" onClick={stop}>Κλείσιμο κάμερας</button>}
    </div>
    {message ? <p className="workspace-inline-note" role="status">{message}</p> : null}
  </div>;
}
