"use client";

import { useEffect, useState } from "react";

function applicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

export function VendorDailyPushBridgeClient({ configured, publicKey }: { configured: boolean; publicKey?: string }) {
  const [token, setToken] = useState("");
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">("unavailable");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setToken(params.get("token") ?? "");
    const ok = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    setPermission(ok ? Notification.permission : "unavailable");
  }, []);

  async function activate() {
    setBusy(true); setMessage("");
    try {
      if (!token) throw new Error("Ο σύνδεσμος ενεργοποίησης έχει λήξει. Επέστρεψε στις ρυθμίσεις του Daily και άνοιξέ τον ξανά.");
      if (!configured || !publicKey) throw new Error("Το Web Push δεν είναι διαμορφωμένο στο server.");
      if (!supported) throw new Error("Ο browser αυτής της συσκευής δεν υποστηρίζει Web Push.");
      const result = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") throw new Error("Χρειάζεται να επιτρέψεις τις ειδοποιήσεις σε αυτή την οθόνη για να λειτουργεί το background push.");

      const registration = await navigator.serviceWorker.register("/daily-sw.js", { scope: "/daily/" });
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const json = subscription.toJSON();
      const response = await fetch("/api/daily/push/bridge/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Η εγγραφή της συσκευής απέτυχε.");

      setMessage("Η συσκευή ενεργοποιήθηκε. Επιστροφή στο KONTA MOY Daily…");
      window.setTimeout(() => window.location.replace("https://kontamou.site/daily/notifications/settings?push_bridge=active"), 700);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Η ενεργοποίηση απέτυχε.");
    } finally { setBusy(false); }
  }

  return <main style={{ minHeight: "100dvh", background: "#f6f4ee", color: "#171914", padding: "24px 16px" }}>
    <section style={{ width: "min(100%,620px)", margin: "8vh auto 0", background: "white", border: "1px solid rgba(23,25,20,.1)", borderRadius: 26, padding: "clamp(22px,6vw,38px)", display: "grid", gap: 20 }}>
      <div>
        <span style={{ display: "block", fontSize: 11, fontWeight: 900, letterSpacing: ".14em" }}>KONTA MOY · DAILY</span>
        <h1 style={{ margin: "8px 0 10px", fontSize: 32, letterSpacing: "-.04em" }}>Ενεργοποίηση ειδοποιήσεων</h1>
        <p style={{ margin: 0, lineHeight: 1.55, opacity: .7 }}>Αυτή η ασφαλής εναλλακτική σύνδεση χρησιμοποιείται όταν ο browser έχει μπλοκάρει αυτόματα τις ειδοποιήσεις στο kontamou.site. Η άδεια αφορά μόνο τις λειτουργικές ειδοποιήσεις Daily.</p>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Row label="Web Push" value={configured ? "Διαμορφωμένο" : "Μη διαθέσιμο"} ok={configured} />
        <Row label="Browser" value={supported ? "Υποστηρίζεται" : "Δεν υποστηρίζεται"} ok={supported} />
        <Row label="Άδεια" value={permission === "unavailable" ? "Μη διαθέσιμη" : permission === "granted" ? "Επιτρέπεται" : permission === "denied" ? "Αποκλεισμένη" : "Έτοιμη για αίτημα"} ok={permission === "granted"} />
      </div>

      <button type="button" onClick={() => void activate()} disabled={busy || !configured || !supported} style={{ minHeight: 58, border: 0, borderRadius: 16, background: "#171914", color: "white", font: "inherit", fontWeight: 900, fontSize: 17, opacity: busy || !configured || !supported ? .55 : 1 }}>
        {busy ? "Ενεργοποίηση…" : permission === "granted" ? "Σύνδεση αυτής της συσκευής" : "Να επιτρέπονται ειδοποιήσεις"}
      </button>
      {message && <p role="status" style={{ margin: 0, padding: "13px 15px", borderRadius: 14, background: "#f2f0e9", lineHeight: 1.45 }}>{message}</p>}
      <small style={{ opacity: .55, lineHeight: 1.5 }}>Δεν ζητείται πρόσβαση σε παραγγελίες ή στοιχεία λογαριασμού από αυτή τη σελίδα. Ο σύνδεσμος ενεργοποίησης είναι προσωρινός και περιορίζεται στην εγγραφή Web Push.</small>
    </section>
  </main>;
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 14px", border: "1px solid rgba(23,25,20,.09)", borderRadius: 14 }}><strong>{label}</strong><span style={{ fontWeight: 800, opacity: ok ? 1 : .6 }}>{value}</span></div>;
}
