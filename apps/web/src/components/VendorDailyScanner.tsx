"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type BarcodeResult = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<BarcodeResult[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function pickupToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.origin);
    const token = url.searchParams.get("token");
    return token?.trim() ?? trimmed;
  } catch {
    return trimmed;
  }
}

export function VendorDailyScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "unsupported" | "error">("idle");
  const [message, setMessage] = useState("");

  function stop() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function openToken(raw: string) {
    const token = pickupToken(raw);
    if (!token) return;
    stop();
    router.push(`/daily/pickup?token=${encodeURIComponent(token)}`);
  }

  async function start() {
    setMessage("");
    const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage("Η αυτόματη σάρωση QR δεν υποστηρίζεται από αυτό το browser. Μπορείς να επικολλήσεις το pickup link ή token παρακάτω.");
      return;
    }
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Δεν είναι διαθέσιμη η κάμερα.");
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ["qr_code"] });
      setStatus("scanning");
      timerRef.current = window.setInterval(() => {
        void detector.detect(video).then((results) => {
          const raw = results[0]?.rawValue;
          if (raw) openToken(raw);
        }).catch(() => undefined);
      }, 450);
    } catch (cause) {
      stop();
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η πρόσβαση στην κάμερα.");
    }
  }

  useEffect(() => stop, []);

  return <main style={{ minHeight: "100dvh", background: "#10120f", color: "white", padding: "18px 16px 96px" }}>
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div><span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Scan</strong></div>
        <Link href="/daily" style={{ color: "white", textDecoration: "none", border: "1px solid rgba(255,255,255,.22)", borderRadius: 12, padding: "9px 12px", fontWeight: 750 }}>Πίσω</Link>
      </header>

      <section style={{ borderRadius: 26, overflow: "hidden", background: "#000", aspectRatio: "4 / 5", maxHeight: "62dvh", position: "relative", display: "grid", placeItems: "center" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {status !== "scanning" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 30, textAlign: "center", background: "radial-gradient(circle at center, rgba(255,255,255,.06), rgba(0,0,0,.55))" }}>
          <div><div style={{ fontSize: 46, marginBottom: 10 }}>▣</div><strong style={{ display: "block", fontSize: 24, marginBottom: 8 }}>Σάρωση QR παραλαβής</strong><span style={{ opacity: .7 }}>Η σάρωση ανοίγει μόνο την επιβεβαίωση. Η παράδοση δεν ολοκληρώνεται χωρίς δεύτερο πάτημα.</span></div>
        </div>}
        {status === "scanning" && <div aria-hidden="true" style={{ position: "absolute", width: "64%", aspectRatio: "1", border: "2px solid white", borderRadius: 24, boxShadow: "0 0 0 999px rgba(0,0,0,.22)" }} />}
      </section>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {status !== "scanning" ? <button type="button" onClick={() => void start()} disabled={status === "starting"} style={{ minHeight: 54, border: 0, borderRadius: 16, background: "white", color: "#10120f", font: "inherit", fontWeight: 850, cursor: "pointer" }}>{status === "starting" ? "Άνοιγμα κάμερας…" : "Άνοιγμα κάμερας"}</button> : <button type="button" onClick={() => { stop(); setStatus("idle"); }} style={{ minHeight: 50, border: "1px solid rgba(255,255,255,.25)", borderRadius: 16, background: "transparent", color: "white", font: "inherit", fontWeight: 800 }}>Κλείσιμο κάμερας</button>}
        {message && <p role="status" style={{ margin: 0, padding: "11px 13px", borderRadius: 13, background: "rgba(255,255,255,.09)", lineHeight: 1.45 }}>{message}</p>}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); openToken(manual); }} style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.14)", display: "grid", gap: 9 }}>
        <label htmlFor="daily-pickup-token" style={{ fontWeight: 800 }}>Εναλλακτικά: pickup link / token</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input id="daily-pickup-token" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Επικόλληση εδώ" autoComplete="off" style={{ minWidth: 0, minHeight: 50, borderRadius: 14, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "white", padding: "0 13px", font: "inherit" }} />
          <button type="submit" disabled={!manual.trim()} style={{ border: 0, borderRadius: 14, padding: "0 17px", font: "inherit", fontWeight: 850 }}>Άνοιγμα</button>
        </div>
      </form>
    </div>
  </main>;
}
