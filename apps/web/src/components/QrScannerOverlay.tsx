"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./DeliveryOperations.module.css";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

export function QrScannerOverlay({ onScan, onClose }: { onScan(value: string): void; onClose(): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let closed = false;
    async function start() {
      const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!DetectorClass || !navigator.mediaDevices?.getUserMedia) { setError("Η αυτόματη σάρωση QR δεν υποστηρίζεται από αυτόν τον browser. Χρησιμοποίησε τη χειροκίνητη εισαγωγή."); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (closed) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current; if (!video) return; video.srcObject = stream; await video.play();
        const detector = new DetectorClass({ formats: ["qr_code"] });
        const tick = async () => { if (closed || !videoRef.current) return; try { const codes = await detector.detect(videoRef.current); const value = codes.find((item) => item.rawValue)?.rawValue?.trim(); if (value) { onScan(value); return; } } catch {} frameRef.current = requestAnimationFrame(() => void tick()); };
        void tick();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η πρόσβαση στην κάμερα."); }
    }
    void start();
    return () => { closed = true; if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); streamRef.current?.getTracks().forEach((track) => track.stop()); };
  }, [onScan]);
  return <div className={styles.scanner}><div className={styles.scannerHeader}><strong>Σάρωση QR</strong><button className={styles.buttonSecondary} type="button" onClick={onClose}>Κλείσιμο</button></div>{error ? <div className={`${styles.notice} ${styles.error}`}>{error}</div> : <video ref={videoRef} playsInline muted />}<div className={styles.scannerFooter}><span>Κράτησε το QR μέσα στο κάδρο.</span></div></div>;
}
