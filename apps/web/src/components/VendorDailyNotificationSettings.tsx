"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Support = "checking" | "supported" | "unsupported";

export function VendorDailyNotificationSettings({ deliveryReady }: { deliveryReady: boolean }) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">("unavailable");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupport(supported ? "supported" : "unsupported");
    setPermission(supported ? Notification.permission : "unavailable");
  }, []);

  async function prepareDevice() {
    if (support !== "supported") return;
    setBusy(true);
    setMessage("");
    try {
      await navigator.serviceWorker.register("/daily-sw.js", { scope: "/daily/" });
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setMessage(deliveryReady
          ? "Οι ειδοποιήσεις επιτρέπονται σε αυτή τη συσκευή."
          : "Η συσκευή είναι έτοιμη για ειδοποιήσεις. Η ασφαλής αποστολή Web Push δεν έχει ενεργοποιηθεί ακόμη σε αυτό το περιβάλλον.");
      } else if (result === "denied") {
        setMessage("Οι ειδοποιήσεις έχουν αποκλειστεί από το browser/τη συσκευή. Μπορείς να αλλάξεις την άδεια από τις ρυθμίσεις του browser.");
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η προετοιμασία ειδοποιήσεων σε αυτή τη συσκευή.");
    } finally {
      setBusy(false);
    }
  }

  return <main style={{ minHeight: "100dvh", background: "#f6f4ee", padding: "18px 16px 42px" }}>
    <div style={{ width: "min(100%, 720px)", margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
        <div><span style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".15em" }}>KONTA MOY</span><strong style={{ fontSize: 20 }}>Daily · Alerts</strong></div>
        <Link href="/daily" style={{ color: "inherit", textDecoration: "none", border: "1px solid rgba(23,25,20,.16)", borderRadius: 12, padding: "9px 12px", fontWeight: 800 }}>Πίσω</Link>
      </header>

      <section style={{ background: "white", border: "1px solid rgba(23,25,20,.09)", borderRadius: 24, padding: "clamp(20px,5vw,34px)", display: "grid", gap: 22 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".13em", textTransform: "uppercase", opacity: .55 }}>Phone notifications</span>
          <h1 style={{ margin: "5px 0 9px", fontSize: 32, letterSpacing: "-.04em" }}>Ειδοποιήσεις για ό,τι χρειάζεται ενέργεια</h1>
          <p style={{ margin: 0, opacity: .68, lineHeight: 1.55 }}>Το Daily θα χρησιμοποιεί ειδοποιήσεις συσκευής μόνο για σημαντικά λειτουργικά γεγονότα: νέα παραγγελία, νέο Ask Local, προειδοποίηση SLA και κρίσιμη καθυστέρηση.</p>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          <Status label="Υποστήριξη browser" value={support === "checking" ? "Έλεγχος…" : support === "supported" ? "Υποστηρίζεται" : "Δεν υποστηρίζεται"} ok={support === "supported"} />
          <Status label="Άδεια ειδοποιήσεων" value={permission === "unavailable" ? "Μη διαθέσιμη" : permission === "granted" ? "Επιτρέπεται" : permission === "denied" ? "Αποκλεισμένη" : "Δεν ζητήθηκε"} ok={permission === "granted"} />
          <Status label="Background Web Push" value={deliveryReady ? "Ενεργό" : "Δεν έχει ενεργοποιηθεί ακόμη"} ok={deliveryReady} />
        </div>

        {!deliveryReady && <div style={{ padding: "13px 15px", borderRadius: 15, background: "#f2f0e9", lineHeight: 1.5 }}><strong>Η σελίδα αυτή δεν προσποιείται ότι το push είναι ήδη έτοιμο.</strong><br /><span style={{ opacity: .7 }}>Το backend delivery adapter και η αποθήκευση της ασφαλούς συνδρομής συσκευής πρέπει να ενεργοποιηθούν πριν το Daily θεωρηθεί production-ready για ειδοποιήσεις με κλειστή εφαρμογή.</span></div>}

        <button type="button" onClick={() => void prepareDevice()} disabled={busy || support !== "supported"} style={{ minHeight: 54, border: 0, borderRadius: 15, background: "#171914", color: "white", font: "inherit", fontWeight: 850, cursor: support === "supported" ? "pointer" : "not-allowed", opacity: support === "supported" ? 1 : .5 }}>{busy ? "Προετοιμασία…" : permission === "granted" ? "Επανέλεγχος συσκευής" : "Προετοιμασία ειδοποιήσεων"}</button>
        {message && <p role="status" style={{ margin: 0, padding: "12px 14px", borderRadius: 13, background: "#f2f0e9", lineHeight: 1.45 }}>{message}</p>}

        <small style={{ opacity: .55, lineHeight: 1.5 }}>Η άδεια ζητείται μόνο μετά από δικό σου πάτημα. Δεν εμφανίζεται αυτόματο browser prompt κατά την είσοδο στο Daily.</small>
      </section>
    </div>
  </main>;
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "12px 14px", border: "1px solid rgba(23,25,20,.08)", borderRadius: 14 }}><strong style={{ fontSize: 14 }}>{label}</strong><span style={{ fontSize: 13, fontWeight: 800, opacity: ok ? 1 : .58 }}>{value}</span></div>;
}
