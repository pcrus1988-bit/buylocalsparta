"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { VendorDailyBottomNav } from "./VendorDailyBottomNav";

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

function cameraError(cause: unknown): string {
  if (!(cause instanceof DOMException)) return cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η πρόσβαση στην κάμερα.";
  if (cause.name === "NotAllowedError" || cause.name === "SecurityError") {
    return "Η κάμερα δεν επιτρέπεται για το kontamou.site. Πάτησε το εικονίδιο αδειών του browser και επίτρεψε την Κάμερα, έπειτα δοκίμασε ξανά.";
  }
  if (cause.name === "NotFoundError" || cause.name === "OverconstrainedError") return "Δεν βρέθηκε διαθέσιμη κάμερα στη συσκευή.";
  if (cause.name === "NotReadableError") return "Η κάμερα χρησιμοποιείται ήδη από άλλη εφαρμογή ή δεν είναι διαθέσιμη αυτή τη στιγμή.";
  return cause.message || "Δεν ήταν δυνατή η πρόσβαση στην κάμερα.";
}

export function VendorDailyScanner({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "unsupported" | "error">("idle");
  const [permission, setPermission] = useState<"prompt" | "granted" | "denied" | "unknown">("unknown");
  const [message, setMessage] = useState("");

  function stop() {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }

  async function openToken(raw: string) {
    const token = pickupToken(raw);
    if (!token) return;
    stop();
    if (token.startsWith("kmd1.pickup.")) {
      setStatus("starting");
      try {
        const response = await fetch("/api/daily/delivery", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ token })
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Η επιβεβαίωση παραλαβής απέτυχε.");
        setMessage("Η παραλαβή από τον οδηγό επιβεβαιώθηκε.");
        router.push("/daily/orders?category=processing");
      } catch (cause) {
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Η επιβεβαίωση παραλαβής απέτυχε.");
      }
      return;
    }
    router.push(`/daily/pickup?token=${encodeURIComponent(token)}`);
  }

  async function refreshPermission() {
    if (!navigator.permissions?.query) return;
    try {
      const result = await navigator.permissions.query({ name: "camera" as PermissionName });
      setPermission(result.state as "prompt" | "granted" | "denied");
      result.onchange = () => setPermission(result.state as "prompt" | "granted" | "denied");
    } catch {
      setPermission("unknown");
    }
  }

  async function start() {
    setMessage("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setMessage("Η σάρωση κάμερας απαιτεί ασφαλή HTTPS σύνδεση και browser με υποστήριξη κάμερας.");
      return;
    }
    setStatus("starting");
    try {
      const video = videoRef.current;
      if (!video) throw new Error("Δεν είναι διαθέσιμη η προβολή κάμερας.");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        video,
        (result) => {
          if (result) void openToken(result.getText());
        }
      );
      controlsRef.current = controls;
      setPermission("granted");
      setStatus("scanning");
    } catch (cause) {
      stop();
      await refreshPermission();
      setStatus("error");
      setMessage(cameraError(cause));
    }
  }

  useEffect(() => {
    void refreshPermission();
    return () => stop();
  }, []);

  return <main style={{ minHeight: "100dvh", background: "#10120f", color: "white", padding: "18px 16px 110px" }}>
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div><span style={{ display: "block", fontSize: 11, fontWeight: 850, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Scan</strong></div>
        <Link href="/daily/orders?category=ready" style={{ color: "white", textDecoration: "none", border: "1px solid rgba(255,255,255,.22)", borderRadius: 12, padding: "9px 12px", fontWeight: 800 }}>Έτοιμες</Link>
      </header>

      <section style={{ borderRadius: 26, overflow: "hidden", background: "#000", aspectRatio: "4 / 5", maxHeight: "62dvh", position: "relative", display: "grid", placeItems: "center" }}>
        <video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {status !== "scanning" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 30, textAlign: "center", background: "radial-gradient(circle at center, rgba(255,255,255,.06), rgba(0,0,0,.62))" }}>
          <div><div style={{ fontSize: 46, marginBottom: 10 }}>▣</div><strong style={{ display: "block", fontSize: 24, marginBottom: 8 }}>Σάρωση QR παραλαβής</strong><span style={{ opacity: .72 }}>Ο browser θα ζητήσει άδεια για την κάμερα όταν πατήσεις «Άνοιγμα κάμερας».</span></div>
        </div>}
        {status === "scanning" && <div aria-hidden="true" style={{ position: "absolute", width: "64%", aspectRatio: "1", border: "2px solid white", borderRadius: 24, boxShadow: "0 0 0 999px rgba(0,0,0,.24)" }} />}
      </section>

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {permission === "denied" && <div role="alert" style={{ padding: "12px 13px", borderRadius: 14, background: "rgba(217,59,50,.2)", lineHeight: 1.45 }}>
          Η άδεια κάμερας είναι αποκλεισμένη στον browser. Άνοιξε τις άδειες ιστοτόπου για το <strong>kontamou.site</strong> και επίτρεψε την κάμερα.
        </div>}
        {status !== "scanning" ? <button type="button" onClick={() => void start()} disabled={status === "starting"} style={{ minHeight: 56, border: 0, borderRadius: 16, background: "white", color: "#10120f", font: "inherit", fontWeight: 900, cursor: "pointer" }}>{status === "starting" ? "Αίτημα άδειας κάμερας…" : permission === "denied" ? "Δοκιμή ξανά" : "Άνοιγμα κάμερας"}</button> :
          <button type="button" onClick={() => { stop(); setStatus("idle"); }} style={{ minHeight: 52, border: "1px solid rgba(255,255,255,.25)", borderRadius: 16, background: "transparent", color: "white", font: "inherit", fontWeight: 850 }}>Κλείσιμο κάμερας</button>}
        {message && <p role="status" style={{ margin: 0, padding: "11px 13px", borderRadius: 13, background: "rgba(255,255,255,.09)", lineHeight: 1.45 }}>{message}</p>}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void openToken(manual); }} style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,.14)", display: "grid", gap: 9 }}>
        <label htmlFor="daily-pickup-token" style={{ fontWeight: 850 }}>Εναλλακτικά: pickup link / token</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input id="daily-pickup-token" value={manual} onChange={(event) => setManual(event.target.value)} placeholder="Επικόλληση εδώ" autoComplete="off" style={{ minWidth: 0, minHeight: 50, borderRadius: 14, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.08)", color: "white", padding: "0 13px", font: "inherit" }} />
          <button type="submit" disabled={!manual.trim()} style={{ border: 0, borderRadius: 14, padding: "0 17px", font: "inherit", fontWeight: 900 }}>Άνοιγμα</button>
        </div>
      </form>
    </div>
    <VendorDailyBottomNav active="scan" />
  </main>;
}
